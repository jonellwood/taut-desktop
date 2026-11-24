//! Read-only Outlook reminders. Persist reservations before OS delivery so a
//! refresh/restart or an uncertain OS result cannot duplicate a banner.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};
#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Saved {
    enabled: bool,
    delivered: BTreeMap<String, i64>,
    #[serde(default = "default_corner")]
    corner: String,
    #[serde(default)]
    compact: bool,
    #[serde(default)]
    cards: BTreeMap<String, CardPending>,
}
fn default_corner() -> String {
    "bottom-right".into()
}
#[derive(Clone, Serialize, Deserialize)]
pub struct CardPending {
    pub own: String,
    pub id: String,
    pub start: i64,
    pub fire: i64,
    pub wake: i64,
}
#[derive(Serialize)]
pub struct Status {
    pub enabled: bool,
    pub error: Option<String>,
    pub last_check: Option<i64>,
    pub last_request: Option<i64>,
    pub summary: String,
    pub corner: String,
    pub compact: bool,
}
pub struct Manager {
    saved: Saved,
    path: Option<PathBuf>,
    pub error: Option<String>,
    pub last_check: Option<i64>,
    pub last_request: Option<i64>,
    pub summary: String,
    preview_until: Option<i64>,
    card_session: String,
    card_events: BTreeMap<String, (Value, i64)>,
    valid: bool,
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
            last_check: None,
            last_request: None,
            summary: "Waiting for the next reminder check.".into(),
            preview_until: None,
            card_session: String::new(),
            card_events: BTreeMap::new(),
            valid,
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
            compact: self.saved.compact,
            enabled: self.saved.enabled && self.valid,
            error: self.error.clone(),
            last_check: self.last_check,
            last_request: self.last_request,
            summary: self.summary.clone(),
            corner: if self.saved.corner.is_empty() {
                default_corner()
            } else {
                self.saved.corner.clone()
            },
        }
    }
    pub fn configure(&mut self, enabled: bool) -> Result<Status, String> {
        let mut next = self.saved.clone();
        next.enabled = enabled;
        self.save(&next)?;
        self.saved = next;
        self.error = None;
        if !enabled {
            self.saved.cards.clear();
            self.card_events.clear();
            self.save(&self.saved)?;
            self.pending = None;
        }
        Ok(self.status())
    }
    pub fn compact(&mut self, compact: bool) -> Result<Status, String> {
        let mut next = self.saved.clone();
        next.compact = compact;
        self.save(&next)?;
        self.saved = next;
        Ok(self.status())
    }
    pub fn corner(&mut self, corner: &str) -> Result<Status, String> {
        if !["top-left", "top-right", "bottom-left", "bottom-right"].contains(&corner) {
            return Err("Choose a valid reminder corner".into());
        }
        let mut next = self.saved.clone();
        next.corner = corner.into();
        self.save(&next)?;
        self.saved = next;
        Ok(self.status())
    }
    pub fn bind_cards(&mut self, session: &str) {
        if self.card_session != session {
            self.card_events.clear();
            self.card_session = session.into();
        }
    }
    pub fn queue_card(
        &mut self,
        own: &str,
        session: &str,
        item: &Candidate,
        event: Value,
        now: i64,
    ) -> Result<bool, String> {
        if !self.status().enabled {
            return Err("Calendar reminders are off".into());
        }
        self.bind_cards(session);
        let key = key(own, item);
        if self.saved.delivered.contains_key(&key) {
            return Ok(false);
        }
        let mut next = self.saved.clone();
        if next.cards.len() >= 128 {
            return Err("Too many reminders. Dismiss older reminders first.".into());
        }
        next.cards.insert(
            key.clone(),
            CardPending {
                own: own.into(),
                id: item.id.clone(),
                start: item.start,
                fire: item.fire,
                wake: now,
            },
        );
        next.delivered.retain(|_, expires| *expires > now);
        if next.delivered.len() >= 10000 {
            return Err("Calendar reminder history is full".into());
        }
        next.delivered.insert(key.clone(), item.start + 86400000);
        if let Err(error) = self.save(&next) {
            self.valid = false;
            self.error = Some(error.clone());
            return Err(error);
        }

        self.saved = next;
        self.card_events.insert(key, (event, now));
        Ok(true)
    }
    pub fn pending_cards(&self, own: &str) -> Vec<(String, CardPending)> {
        self.saved
            .cards
            .iter()
            .filter(|(_, p)| p.own == own)
            .map(|(k, p)| (k.clone(), p.clone()))
            .collect()
    }
    pub fn update_card(&mut self, key: &str, event: Option<Value>, now: i64) -> Result<(), String> {
        if let Some(event) = event {
            self.card_events.insert(key.into(), (event, now));
            Ok(())
        } else {
            self.remove_card(key)
        }
    }
    fn remove_card(&mut self, key: &str) -> Result<(), String> {
        let mut next = self.saved.clone();
        next.cards.remove(key);
        self.save(&next)?;
        self.saved = next;
        self.card_events.remove(key);
        Ok(())
    }
    pub fn card_target(&self, key: &str, own: &str, session: &str) -> Result<CardPending, String> {
        if !self.status().enabled || self.card_session != session {
            return Err("Reminder session changed".into());
        }
        self.saved
            .cards
            .get(key)
            .filter(|p| p.own == own)
            .cloned()
            .ok_or("This reminder is no longer available".into())
    }
    pub fn card_action(
        &mut self,
        key: &str,
        own: &str,
        session: &str,
        action: &str,
        now: i64,
    ) -> Result<(), String> {
        let target = self.card_target(key, own, session)?;
        match action {
            "dismiss" => self.remove_card(key),
            "snooze" => {
                let mut next = self.saved.clone();
                next.cards.get_mut(key).unwrap().wake = now + 300000;
                self.save(&next)?;
                self.saved = next;
                Ok(())
            }
            "open" => {
                self.remove_card(key)?;
                self.pending = Some((session.into(), own.into(), target.id));
                Ok(())
            }
            _ => Err("Unknown reminder action".into()),
        }
    }
    pub fn preview(&mut self, now:i64) { self.preview_until=Some(now+60000); }
    pub fn dismiss_preview(&mut self) { self.preview_until=None; }
    pub fn preview_view(&self, now:i64)->Option<Value> {
        let until=self.preview_until.filter(|until|*until>now)?;
        Some(serde_json::json!({"key":"preview","preview":true,"title":"Your next meeting","start":until+14*60000,"allDay":false,"room":"Sample meeting · No calendar event created","canJoin":true}))
    }
    pub fn card_views(&mut self, own: &str, session: &str, now: i64) -> Vec<Value> {
        self.bind_cards(session);
        if !self.status().enabled {
            return vec![];
        }
        let mut cards:Vec<Value>=self.saved.cards.iter().filter(|(_,p)|p.own==own&&p.wake<=now).filter_map(|(key,p)|{let(event,checked)=self.card_events.get(key)?;if now-checked>90000{return None;}Some(serde_json::json!({"key":key,"title":event["subject"].as_str().unwrap_or("Untitled meeting"),"start":p.start,"allDay":event["isAllDay"]==true,"room":event["location"]["displayName"].as_str().unwrap_or(""),"canJoin":join_url(event).is_some()}))}).collect();
        cards.sort_by_key(|card| card["start"].as_i64().unwrap_or(i64::MAX));
        cards
    }
    pub fn seen(&self, own: &str, item: &Candidate) -> bool {
        self.saved.delivered.contains_key(&key(own, item))
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
pub fn instant(value: &Value) -> Option<i64> {
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
pub fn join_url(event: &Value) -> Option<String> {
    if event["isOnlineMeeting"] != true
        || event["isCancelled"] == true
        || event["onlineMeetingProvider"] != "teamsForBusiness"
    {
        return None;
    }
    let raw = event["onlineMeeting"]["joinUrl"].as_str()?;
    if raw.len() > 8192 {
        return None;
    }
    let u = url::Url::parse(raw).ok()?;
    (u.scheme() == "https"
        && u.username().is_empty()
        && u.password().is_none()
        && u.port().is_none()
        && u.fragment().is_none()
        && [
            "teams.microsoft.com",
            "teams.cloud.microsoft",
            "gov.teams.microsoft.us",
            "dod.teams.microsoft.us",
            "teams.microsoft.us",
        ]
        .contains(&u.host_str()?)
        && ["/l/meetup-join/", "/meet/"]
            .iter()
            .any(|prefix| u.path().starts_with(prefix) && u.path().len() > prefix.len()))
    .then(|| u.to_string())
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
        assert!(m.queue_card("a", "s", &item(), event(), NOW).unwrap());
        let k = key("a", &item());
        assert!(m.card_target(&k, "a", "other").is_err());
        assert!(m.card_target(&k, "b", "s").is_err());
        let mut m = Manager::load(Some(p.clone()));
        assert!(!m.queue_card("a", "new", &item(), event(), NOW).unwrap());
        assert!(m.queue_card("b", "new", &item(), event(), NOW).unwrap());
        let mut moved = item();
        moved.start += 86400000;
        moved.fire += 86400000;
        assert!(m.queue_card("a", "s", &moved, event(), NOW).unwrap());
        m.configure(false).unwrap();
        assert!(m.card_target(&k, "a", "s").is_err());
        let _ = std::fs::remove_dir_all(p.parent().unwrap());
    }
    #[test]
    fn corrupt_or_unwritable_storage_cannot_deliver() {
        let p = path();
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, "broken").unwrap();
        let mut m = Manager::load(Some(p.clone()));
        assert!(m.configure(true).is_err());
        assert!(m.queue_card("a", "s", &item(), event(), NOW).is_err());
        let _ = std::fs::remove_dir_all(p.parent().unwrap());
        let mut m = Manager::load(None);
        assert!(m.configure(true).is_err());
    }
    #[test]
    fn storage_failure_pauses_delivery_without_retry_and_does_not_store_titles() {
        let p = path();
        let mut m = Manager::load(Some(p.clone()));
        m.configure(true).unwrap();
        m.queue_card("private-account", "s", &item(), event(), NOW)
            .unwrap();
        let data = std::fs::read_to_string(&p).unwrap();
        assert!(!data.contains("Meeting"));
        assert!(!data.contains("subject"));
        std::fs::remove_file(&p).unwrap();
        std::fs::create_dir(&p).unwrap();
        let mut next = item();
        next.fire += 1;
        assert!(m.queue_card("a", "s", &next, event(), NOW).is_err());
        assert!(!m.status().enabled);
        assert!(m.status().error.is_some());
        assert!(m.queue_card("a", "s", &next, event(), NOW).is_err());
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

#[cfg(test)]
pub fn placement(
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale: f64,
    corner: &str,
    count: usize,
) -> (i32, i32, u32, u32) {
    placement_with_layout(x,y,width,height,scale,corner,count,false)
}
pub fn placement_with_layout(x:i32,y:i32,width:u32,height:u32,scale:f64,corner:&str,count:usize,compact:bool)->(i32,i32,u32,u32){
    let aw = width as f64;
    let ah = height as f64;
    let margin = (16.0 * scale).min(aw / 4.0).min(ah / 4.0);
    let w = (400.0 * scale).min(aw - 2.0 * margin).max(1.0);
    let h = ((if compact {100.0 + 195.0 * count as f64} else {150.0 + 260.0 * count as f64}).min(500.0) * scale)
        .min(ah - 2.0 * margin)
        .max(1.0);
    let px = x as f64
        + if corner.ends_with("right") {
            aw - w - margin
        } else {
            margin
        };
    let py = y as f64
        + if corner.starts_with("bottom") {
            ah - h - margin
        } else {
            margin
        };
    (px.round() as i32, py.round() as i32, w as u32, h as u32)
}
#[cfg(test)]
mod card_tests {
    use super::*;
    use serde_json::json;
    fn path() -> PathBuf {
        std::env::temp_dir()
            .join(format!("taut-cards-test-{}", crate::random_urlsafe()))
            .join("reminders.json")
    }
    fn event() -> Value {
        json!({"subject":"Planning","start":{"dateTime":"2026-11-23T15:30:00Z"},"end":{"dateTime":"2026-11-23T16:30:00Z"},"isCancelled":false})
    }
    #[test]
    fn snooze_survives_restart_but_requires_fresh_read_and_same_account() {
        let p = path();
        let mut m = Manager::load(Some(p.clone()));
        m.configure(true).unwrap();
        let item = Candidate {
            id: "event".into(),
            start: 900000,
            fire: 0,
        };
        m.queue_card("a", "s", &item, event(), 0).unwrap();
        let key = key("a", &item);
        assert_eq!(m.card_views("a", "s", 0).len(), 1);
        assert!(m.card_action(&key, "b", "s", "snooze", 0).is_err());
        m.card_action(&key, "a", "s", "snooze", 0).unwrap();
        assert!(m.card_views("a", "s", 299999).is_empty());
        let mut m = Manager::load(Some(p.clone()));
        assert!(m.card_views("a", "new", 300000).is_empty());
        assert_eq!(m.pending_cards("a")[0].1.wake, 300000);
        assert!(m.pending_cards("b").is_empty());
        m.update_card(&key, Some(event()), 300000).unwrap();
        assert_eq!(m.card_views("a", "new", 300000).len(), 1);
        m.card_action(&key, "a", "new", "open", 300000).unwrap();
        assert_eq!(m.pending.as_ref().unwrap().2, "event");
        assert!(m.pending_cards("a").is_empty());
        assert!(m.seen("a", &item));
        let _ = std::fs::remove_dir_all(p.parent().unwrap());
    }
    #[test]
    fn cancelled_or_changed_cards_are_removed_and_disabled_reminders_clear_queue() {
        let p = path();
        let mut m = Manager::load(Some(p.clone()));
        m.configure(true).unwrap();
        let item = Candidate {
            id: "event".into(),
            start: 900000,
            fire: 0,
        };
        m.queue_card("a", "s", &item, event(), 0).unwrap();
        let k = key("a", &item);
        m.update_card(&k, None, 1).unwrap();
        assert!(m.card_views("a", "s", 1).is_empty());
        m.queue_card("b", "s", &item, event(), 0).unwrap();
        m.configure(false).unwrap();
        assert!(m.pending_cards("a").is_empty());
        assert!(m.card_action(&k, "a", "s", "open", 0).is_err());
        let _ = std::fs::remove_dir_all(p.parent().unwrap());
    }
    #[test]
    fn preview_is_temporary_local_and_does_not_touch_saved_reminders() {
        let p=path();let mut m=Manager::load(Some(p.clone()));m.configure(true).unwrap();
        let before=std::fs::read(&p).unwrap();m.preview(1000);
        assert_eq!(m.preview_view(1000).unwrap()["preview"],true);
        assert!(m.preview_view(61000).is_none());assert_eq!(before,std::fs::read(&p).unwrap());
        assert!(Manager::load(Some(p.clone())).preview_view(1001).is_none());
        m.preview(2000);m.dismiss_preview();assert!(m.preview_view(2001).is_none());
        let _=std::fs::remove_dir_all(p.parent().unwrap());
    }
    #[test]
    fn compact_preference_defaults_and_persists_without_changing_reminder_state() {
        let p=path();let mut m=Manager::load(Some(p.clone()));
        assert!(!m.status().compact);m.configure(true).unwrap();m.corner("top-left").unwrap();
        m.compact(true).unwrap();let restored=Manager::load(Some(p.clone()));
        assert!(restored.status().compact);assert!(restored.status().enabled);assert_eq!(restored.status().corner,"top-left");
        let mut legacy:Value=serde_json::from_slice(&std::fs::read(&p).unwrap()).unwrap();legacy.as_object_mut().unwrap().remove("compact");std::fs::write(&p,serde_json::to_vec(&legacy).unwrap()).unwrap();
        let restored=Manager::load(Some(p.clone()));assert!(!restored.status().compact);assert!(restored.status().enabled);
        let _=std::fs::remove_dir_all(p.parent().unwrap());
    }
    #[test]
    fn compact_window_is_smaller_and_stays_inside_work_area() {
        for corner in ["top-left","top-right","bottom-left","bottom-right"] {
            let full=placement_with_layout(-1920,40,1920,1600,2.0,corner,1,false);
            let compact=placement_with_layout(-1920,40,1920,1600,2.0,corner,1,true);
            assert!(compact.3<full.3);assert_eq!(compact.2,full.2);
            assert!(compact.0>=-1920&&compact.1>=40);assert!(compact.0+compact.2 as i32<=0&&compact.1+compact.3 as i32<=1640);
        }
    }
    #[test]
    fn position_is_persisted_and_invalid_values_do_not_change_it() {
        let p = path();
        let mut m = Manager::load(Some(p.clone()));
        assert_eq!(m.status().corner, "bottom-right");
        m.corner("top-left").unwrap();
        assert!(m.corner("center").is_err());
        assert_eq!(Manager::load(Some(p.clone())).status().corner, "top-left");
        let _ = std::fs::remove_dir_all(p.parent().unwrap());
    }
    #[test]
    fn placement_stays_in_work_area_on_scaled_negative_origin_monitors() {
        for corner in ["top-left", "top-right", "bottom-left", "bottom-right"] {
            let (x, y, w, h) = placement(-1920, 40, 1920, 1600, 2.0, corner, 3);
            assert!(x >= -1920 && y >= 40);
            assert!(x + w as i32 <= 0 && y + h as i32 <= 1640);
            assert_eq!(corner.ends_with("right"), x > -1800);
            assert_eq!(corner.starts_with("bottom"), y > 72);
        }
    }
    #[test]
    fn join_only_uses_recorded_teams_hosts_and_paths() {
        let mut e = event();
        e["isOnlineMeeting"] = json!(true);
        e["onlineMeetingProvider"] = json!("teamsForBusiness");
        for url in [
            "https://evil.test/meet/a",
            "javascript:alert(1)",
            "https://teams.microsoft.com.evil.test/meet/a",
            "https://user@teams.microsoft.com/meet/a",
            "https://teams.microsoft.com/meet/a#bad",
        ] {
            e["onlineMeeting"] = json!({"joinUrl":url});
            assert!(join_url(&e).is_none());
        }
        e["onlineMeeting"] = json!({"joinUrl":"https://teams.microsoft.com/meet/a"});
        assert!(join_url(&e).is_some());
        e["isCancelled"] = json!(true);
        assert!(join_url(&e).is_none());
    }
}
