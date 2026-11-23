//! Read-only Outlook reminders. Persist reservations before OS delivery so a
//! refresh/restart or an uncertain OS result cannot duplicate a banner.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashMap},
    path::PathBuf,
    sync::{Arc, Mutex},
};
#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Saved {
    enabled: bool,
    delivered: BTreeMap<String, i64>,
}
#[derive(Serialize)]
pub struct Status {
    pub enabled: bool,
    pub error: Option<String>,
    pub last_check: Option<i64>,
    pub last_request: Option<i64>,
    pub summary: String,
}
pub struct Manager {
    saved: Saved,
    path: Option<PathBuf>,
    pub error: Option<String>,
    pub last_check: Option<i64>,
    pub last_request: Option<i64>,
    pub summary: String,
    valid: bool,
    tickets: HashMap<i32, (String, String, String)>,
    sequence: i32,
    pub pending: Option<(String, String, String)>,
}
#[derive(Clone)]
pub struct State(pub Arc<Mutex<Manager>>);
impl Manager {
    pub fn load(path: Option<PathBuf>) -> Self {
        let loaded = path
            .as_ref()
            .ok_or(())
            .and_then(|p| match std::fs::read(p) {
                Ok(b) => serde_json::from_slice::<Saved>(&b).map_err(|_| ()),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Saved::default()),
                Err(_) => Err(()),
            });
        let valid = loaded.is_ok();
        Self {
            saved: loaded.unwrap_or_default(),
            path,
            error: (!valid)
                .then(|| "Calendar reminder storage is unavailable. Reminders are paused.".into()),
            last_check: None, last_request: None, summary: "Waiting for the next reminder check.".into(),
            valid,
            tickets: HashMap::new(),
            sequence: 0,
            pending: None,
        }
    }
    fn save(&self, saved: &Saved) -> Result<(), String> {
        if !self.valid {
            return Err("Calendar reminder storage is unavailable".into());
        }
        let path = self
            .path
            .as_ref()
            .ok_or("Calendar reminder storage unavailable")?;
        let parent = path.parent().ok_or("Reminder storage unavailable")?;
        std::fs::create_dir_all(parent).map_err(|_| "Cannot save Calendar reminders")?;
        let temp = parent.join(format!("reminders-{}.tmp", crate::random_urlsafe()));
        let result = (|| {
            use std::io::Write;
            let mut f = std::fs::OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&temp)
                .map_err(|_| "Cannot save Calendar reminders")?;
            f.write_all(
                &serde_json::to_vec(saved).map_err(|_| "Cannot encode Calendar reminders")?,
            )
            .map_err(|_| "Cannot save Calendar reminders")?;
            f.sync_all().map_err(|_| "Cannot save Calendar reminders")?;
            crate::durable_file::replace(&temp, path)
                .map_err(|_| "Cannot confirm Calendar reminder storage")
        })();
        let _ = std::fs::remove_file(temp);
        result.map_err(String::from)
    }
    pub fn status(&self) -> Status {
        Status {
            enabled: self.saved.enabled && self.valid,
            error: self.error.clone(),
            last_check: self.last_check, last_request: self.last_request, summary: self.summary.clone(),
        }
    }
    pub fn configure(&mut self, enabled: bool) -> Result<Status, String> {
        let mut next = self.saved.clone();
        next.enabled = enabled;
        self.save(&next)?;
        self.saved = next;
        self.error = None;
        if !enabled {
            self.tickets.clear();
            self.pending = None;
        }
        Ok(self.status())
    }
    pub fn seen(&self, own: &str, item: &Candidate) -> bool {
        self.saved.delivered.contains_key(&key(own, item))
    }
    pub fn reserve(
        &mut self,
        own: &str,
        session: &str,
        item: &Candidate,
        now: i64,
    ) -> Result<Option<i32>, String> {
        if !self.status().enabled {
            return Ok(None);
        }
        let key = key(own, item);
        if self.saved.delivered.contains_key(&key) {
            return Ok(None);
        }
        let mut next = self.saved.clone();
        next.delivered.retain(|_, expires| *expires > now);
        if next.delivered.len() >= 10000 {
            return Err("Calendar reminder history is full. Reminders are paused.".into());
        }
        next.delivered.insert(key, item.start + 86400000);
        if let Err(error) = self.save(&next) {
            self.valid = false;
            self.error = Some(error.clone());
            return Err(error);
        }
        self.saved = next;
        self.sequence = self.sequence.wrapping_add(1).max(1);
        let id = -self.sequence;
        self.tickets
            .insert(id, (session.into(), own.into(), item.id.clone()));
        if self.tickets.len() > 256 {
            self.tickets.retain(|id, _| *id <= -self.sequence + 255);
        }
        Ok(Some(id))
    }
    pub fn click(&mut self, id: i32, session: &str, own: &str) -> bool {
        if !self.status().enabled {
            return false;
        }
        if let Some((s, o, event)) = self.tickets.get(&id) {
            if s == session && o == own {
                self.pending = Some((session.into(), own.into(), event.clone()));
                return true;
            }
        }
        false
    }
}
fn key(own: &str, item: &Candidate) -> String {
    format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&(own, &item.id, item.start, item.fire)).unwrap())
    )
}
#[derive(Debug)]
pub struct Candidate {
    pub id: String,
    pub start: i64,
    pub fire: i64,
}
fn instant(value: &Value) -> Option<i64> {
    let raw = value["dateTime"].as_str()?;
    if let Ok(t) = chrono::DateTime::parse_from_rfc3339(raw) {
        return Some(t.timestamp_millis());
    }
    if value["timeZone"] != "UTC" {
        return None;
    }
    chrono::DateTime::parse_from_rfc3339(&format!("{raw}Z"))
        .ok()
        .map(|t| t.timestamp_millis())
}
fn candidate(value: &Value, now: i64) -> Option<Candidate> {
    let id = value["eventId"].as_str()?;
    if id.is_empty() || id.len() > 2048 || id.chars().any(char::is_control) {
        return None;
    }
    let start = instant(&value["eventStartTime"])?;
    let fire = instant(&value["reminderFireTime"])?;
    (start >= now - 120000 && fire <= now && fire >= now - 120000 && fire <= start).then(|| {
        Candidate {
            id: id.into(),
            start,
            fire,
        }
    })
}
pub fn candidates(
    now: i64,
    permitted: bool,
    own: &str,
    request: &mut dyn FnMut(&str) -> Result<(u16, Value), String>,
) -> Result<Vec<Candidate>, String> {
    if !permitted {
        return Err(
            "Calendar reminders need Calendar read permission. Reconnect Microsoft 365.".into(),
        );
    }
    let (status, me) = request("/me?$select=id")?;
    if status != 200 || me["id"] != own {
        return Err("Calendar reminder account could not be verified.".into());
    }
    let date = |ms| {
        chrono::DateTime::from_timestamp_millis(ms)
            .unwrap()
            .format("%Y-%m-%dT%H:%M:%SZ")
            .to_string()
    };
    let path = format!(
        "/me/reminderView(startDateTime='{}',endDateTime='{}')",
        date(now - 120000),
        date(now + 31 * 86400000)
    );
    let (status, value) = request(&path)?;
    if status != 200 {
        return Err(format!("Calendar reminder refresh failed (HTTP {status})."));
    }
    if value["@odata.nextLink"].is_string() {
        return Err("Calendar reminder response was incomplete; reminders paused.".into());
    }
    let rows = value["value"]
        .as_array()
        .ok_or("Invalid Calendar reminder response")?;
    if rows.len() > 1000 {
        return Err("Calendar reminder response is too large".into());
    }
    Ok(rows.iter().filter_map(|v| candidate(v, now)).collect())
}
pub fn verified(
    item: &Candidate,
    request: &mut dyn FnMut(&str) -> Result<(u16, Value), String>,
) -> Option<Value> {
    let event = crate::calendar::event(&item.id, request).ok()?;
    if event["isCancelled"] != false
        || event["isReminderOn"] != true
        || event["responseStatus"]["response"] == "declined"
        || event["type"] == "seriesMaster"
        || instant(&event["start"])? != item.start
    {
        return None;
    }
    let minutes = event["reminderMinutesBeforeStart"].as_i64()?;
    if !(0..=525600).contains(&minutes) || item.fire < item.start - minutes * 60000 {
        return None;
    }
    Some(event)
}
pub fn banner(event: &Value) -> String {
    let title = event["subject"]
        .as_str()
        .unwrap_or("Upcoming meeting")
        .chars()
        .filter(|c| !c.is_control())
        .take(120)
        .collect::<String>();
    let title = if title.trim().is_empty() {
        "Untitled event"
    } else {
        title.trim()
    };
    if event["isAllDay"] == true {
        return format!("{title} · All day");
    }
    let ms = instant(&event["start"]).unwrap_or(0);
    let utc = chrono::DateTime::from_timestamp_millis(ms).unwrap();
    let time = utc
        .with_timezone(&chrono::Local)
        .format("%b %e, %I:%M %p %Z")
        .to_string();
    format!("{title} · {time}")
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    const NOW: i64 = 1795435200000;
    fn item() -> Candidate {
        Candidate {
            id: "event".into(),
            start: NOW + 900000,
            fire: NOW,
        }
    }
    fn event() -> Value {
        json!({"id":"event","isCancelled":false,"isReminderOn":true,"reminderMinutesBeforeStart":15,"start":{"dateTime":chrono::DateTime::from_timestamp_millis(NOW+900000).unwrap().to_rfc3339(),"timeZone":"UTC"},"subject":"Meeting","responseStatus":{"response":"accepted"}})
    }
    fn path() -> PathBuf {
        std::env::temp_dir()
            .join(format!("taut-reminder-test-{}", crate::random_urlsafe()))
            .join("reminders.json")
    }
    #[test]
    fn durable_dedup_and_account_and_occurrence_isolation() {
        let p = path();
        let mut m = Manager::load(Some(p.clone()));
        assert!(!m.status().enabled);
        m.configure(true).unwrap();
        let id = m.reserve("a", "s", &item(), NOW).unwrap().unwrap();
        assert!(!m.click(id, "other", "a"));
        assert!(!m.click(id, "s", "b"));
        assert!(m.click(id, "s", "a"));
        let mut m = Manager::load(Some(p.clone()));
        assert!(m
            .reserve("a", "newsession", &item(), NOW)
            .unwrap()
            .is_none());
        assert!(m
            .reserve("b", "newsession", &item(), NOW)
            .unwrap()
            .is_some());
        let mut moved = item();
        moved.start += 86400000;
        moved.fire += 86400000;
        assert!(m.reserve("a", "s", &moved, NOW).unwrap().is_some());
        m.configure(false).unwrap();
        assert!(!m.click(id, "s", "a"));
        let _ = std::fs::remove_dir_all(p.parent().unwrap());
    }
    #[test]
    fn corrupt_or_unwritable_storage_cannot_deliver() {
        let p = path();
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, "broken").unwrap();
        let mut m = Manager::load(Some(p.clone()));
        assert!(m.configure(true).is_err());
        assert!(m.reserve("a", "s", &item(), NOW).unwrap().is_none());
        let _ = std::fs::remove_dir_all(p.parent().unwrap());
        let mut m = Manager::load(None);
        assert!(m.configure(true).is_err());
    }
    #[test]
    fn storage_failure_pauses_delivery_without_retry_and_does_not_store_titles() {
        let p = path();
        let mut m = Manager::load(Some(p.clone()));
        m.configure(true).unwrap();
        m.reserve("private-account", "s", &item(), NOW).unwrap();
        let data = std::fs::read_to_string(&p).unwrap();
        assert!(!data.contains("private-account"));
        assert!(!data.contains("event"));
        std::fs::remove_file(&p).unwrap();
        std::fs::create_dir(&p).unwrap();
        let mut next = item();
        next.fire += 1;
        assert!(m.reserve("a", "s", &next, NOW).is_err());
        assert!(!m.status().enabled);
        assert!(m.status().error.is_some());
        assert!(m.reserve("a", "s", &next, NOW).unwrap().is_none());
        let _ = std::fs::remove_dir_all(p.parent().unwrap());
    }
    #[test]
    fn valid_feed_filters_due_reminders_and_uses_only_read_routes() {
        let mut paths = vec![];
        let result=candidates(NOW,true,"a",&mut |p|{paths.push(p.to_string());Ok((200,if p.starts_with("/me?"){json!({"id":"a"})}else{json!({"value":[{"eventId":"event","eventStartTime":{"dateTime":chrono::DateTime::from_timestamp_millis(NOW+900000).unwrap().to_rfc3339()},"reminderFireTime":{"dateTime":chrono::DateTime::from_timestamp_millis(NOW).unwrap().to_rfc3339()}}]})}))}).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].start, item().start);
        assert!(paths[1].contains("endDateTime="));
    }
    #[test]
    fn candidate_window_skips_sleep_backlog_and_future_and_past_events() {
        for (fire, start, ok) in [
            (NOW, NOW + 1, true),
            (NOW - 119999, NOW + 1, true),
            (NOW - 120001, NOW + 1, false),
            (NOW + 1, NOW + 100, false),
            (NOW - 120001, NOW - 120001, false),
        ] {
            let v = json!({"eventId":"e","eventStartTime":{"dateTime":chrono::DateTime::from_timestamp_millis(start).unwrap().to_rfc3339()},"reminderFireTime":{"dateTime":chrono::DateTime::from_timestamp_millis(fire).unwrap().to_rfc3339()}});
            assert_eq!(candidate(&v, NOW).is_some(), ok);
        }
    }
    #[test]
    fn cancelled_rescheduled_disabled_declined_and_changed_reminders_are_skipped() {
        for (field, value) in [
            ("isCancelled", json!(true)),
            ("isReminderOn", json!(false)),
            ("start", json!({"dateTime":"2099-01-01T00:00:00Z"})),
            ("responseStatus", json!({"response":"declined"})),
            ("reminderMinutesBeforeStart", json!(5)),
        ] {
            let mut e = event();
            e[field] = value;
            assert!(verified(&item(), &mut |_| Ok((200, e.clone()))).is_none());
        }
        assert!(verified(&item(), &mut |_| Ok((200, event()))).is_some());
        assert!(verified(&item(), &mut |_| Ok((404, Value::Null))).is_none());
    }
    #[test]
    fn reads_only_verified_account_and_fails_closed_on_incomplete_feed() {
        assert!(candidates(NOW, false, "a", &mut |_| panic!()).is_err());
        assert!(candidates(NOW, true, "a", &mut |_| Ok((200, json!({"id":"b"})))).is_err());
        let mut paths = vec![];
        let result = candidates(NOW, true, "a", &mut |p| {
            paths.push(p.to_string());
            Ok((
                200,
                if p.starts_with("/me?") {
                    json!({"id":"a"})
                } else {
                    json!({"value":[],"@odata.nextLink":"https://evil.test"})
                },
            ))
        });
        assert!(result.is_err());
        assert_eq!(paths.len(), 2);
        assert!(paths[1].starts_with("/me/reminderView("));
    }
}
