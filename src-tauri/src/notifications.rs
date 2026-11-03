//! Notification eligibility is independent of UI rendering. No tokens or message
//! bodies are persisted, and tests inject delivery rather than calling the OS.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet, VecDeque},
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
#[derive(Clone, Copy, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub enabled: bool,
    pub show_names: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub enabled: bool,
    pub show_names: bool,
    pub error: Option<String>,
}
#[derive(Clone)]
pub struct Notice {
    pub id: i32,
    pub body: String,
}
#[derive(Default)]
pub struct Tracker {
    pub own: Option<String>,
    pub generation: u64,
    pub session: String,
    pub active_chat: Option<String>,
    pub at_latest: bool,
    seeded: bool,
    not_before: i64,
    heads: HashMap<String, i64>,
    latest_ids: HashMap<String, String>,
    seen: HashSet<(String, String)>,
    order: VecDeque<(String, String)>,
    next_id: i32,
    tickets: HashMap<i32, String>,
    pub pending_open: Option<String>,
}
pub fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis().min(i64::MAX as u128) as i64)
        .unwrap_or(0)
}
fn timestamp(value: &Value) -> Option<i64> {
    value
        .as_str()
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|d| d.timestamp_millis())
}
fn safe_text(value: &str) -> String {
    value
        .chars()
        .filter(|c| !c.is_control())
        .take(100)
        .collect()
}
impl Tracker {
    pub fn reset(&mut self) {
        let generation = self.generation.wrapping_add(1);
        *self = Self::default();
        self.generation = generation;
        self.session = crate::random_urlsafe();
        self.not_before = now();
    }
    pub fn account(&mut self, id: &str) {
        if self.own.as_deref() != Some(id) {
            self.reset();
            self.own = Some(id.to_owned());
        }
    }
    pub fn baseline(&mut self) {
        self.seeded = false;
        self.not_before = now();
        self.heads.clear();
        self.latest_ids.clear();
        self.seen.clear();
        self.order.clear();
        self.tickets.clear();
        self.pending_open = None;
    }
    pub fn click(&mut self, id: i32) -> Option<String> {
        let chat = self.tickets.get(&id)?.clone();
        self.pending_open = Some(chat.clone());
        Some(chat)
    }
    pub fn observe(&mut self, value: &Value, settings: Settings, focused: bool) -> Vec<Notice> {
        let Some(rows) = value["value"].as_array() else {
            return vec![];
        };
        let Some(own) = self.own.clone() else {
            return vec![];
        };
        let initial = !self.seeded;
        let mut notices = Vec::new();
        for chat in rows {
            let Some(chat_id) = chat["id"]
                .as_str()
                .filter(|s| !s.is_empty() && s.len() <= 512)
            else {
                continue;
            };
            let preview = &chat["lastMessagePreview"];
            let Some(id) = preview["id"]
                .as_str()
                .filter(|s| !s.is_empty() && s.len() <= 512)
            else {
                continue;
            };
            let Some(created) = timestamp(&preview["createdDateTime"]) else {
                continue;
            };
            let previous = self.heads.get(chat_id).copied();
            if self.latest_ids.get(chat_id).map(String::as_str) == Some(id) {
                continue;
            }
            if previous.map(|time| created >= time).unwrap_or(true) {
                self.latest_ids.insert(chat_id.into(), id.into());
            }
            self.heads
                .entry(chat_id.into())
                .and_modify(|t| *t = (*t).max(created))
                .or_insert(created);
            let key = (chat_id.to_owned(), id.to_owned());
            if !self.seen.insert(key.clone()) {
                continue;
            }
            self.order.push_back(key);
            if self.order.len() > 2048 {
                if let Some(old) = self.order.pop_front() {
                    self.seen.remove(&old);
                }
            }
            let sender = preview["from"]["user"]["id"].as_str();
            let read = timestamp(&chat["viewpoint"]["lastMessageReadDateTime"]);
            if initial
                || !settings.enabled
                || created < self.not_before
                || previous.map(|t| created < t).unwrap_or(false)
                || preview["messageType"].as_str() != Some("message")
                || preview["isDeleted"].as_bool() == Some(true)
                || sender
                    .map(|id| id.eq_ignore_ascii_case(&own))
                    .unwrap_or(true)
                || chat["viewpoint"]["isHidden"].as_bool() == Some(true)
                || read.map(|r| created <= r).unwrap_or(false)
                || (focused && self.at_latest && self.active_chat.as_deref() == Some(chat_id))
            {
                continue;
            }
            self.next_id = self.next_id.checked_add(1).unwrap_or(1);
            let body = if settings.show_names {
                let topic = chat["topic"]
                    .as_str()
                    .map(str::trim)
                    .filter(|s| !s.is_empty());
                let names = chat["members"].as_array().map(|members| {
                    members
                        .iter()
                        .filter(|m| {
                            !m["userId"]
                                .as_str()
                                .map(|id| id.eq_ignore_ascii_case(&own))
                                .unwrap_or(false)
                        })
                        .filter_map(|m| m["displayName"].as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                });
                let name = safe_text(topic.or(names.as_deref()).unwrap_or("a conversation"));
                format!(
                    "New message in {}",
                    if name.is_empty() {
                        "a conversation"
                    } else {
                        &name
                    }
                )
            } else {
                "You have a new chat message.".into()
            };
            self.tickets.insert(self.next_id, chat_id.into());
            if self.tickets.len() > 256 {
                self.tickets
                    .retain(|id, _| *id > self.next_id.saturating_sub(256));
            }
            notices.push(Notice {
                id: self.next_id,
                body,
            });
        }
        self.seeded = true;
        notices
    }
}
pub struct Manager {
    pub settings: Settings,
    pub tracker: Tracker,
    pub error: Option<String>,
    path: Option<PathBuf>,
}
#[derive(Clone)]
pub struct State(pub Arc<Mutex<Manager>>);
impl Manager {
    pub fn load(path: Option<PathBuf>) -> Self {
        let (settings, error) = match path.as_ref() {
            Some(path) => match std::fs::read(path) {
                Ok(data) => match serde_json::from_slice(&data) {
                    Ok(settings) => (settings, None),
                    Err(_) => (
                        Settings::default(),
                        Some(
                            "Notification preferences could not be read. Notifications are off."
                                .into(),
                        ),
                    ),
                },
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => (Settings::default(), None),
                Err(_) => (
                    Settings::default(),
                    Some("Notification preferences are unavailable. Notifications are off.".into()),
                ),
            },
            None => (
                Settings::default(),
                Some("Notification preference storage is unavailable.".into()),
            ),
        };
        Self {
            settings,
            tracker: Tracker::default(),
            error,
            path,
        }
    }
    pub fn status(&self) -> Status {
        Status {
            enabled: self.settings.enabled,
            show_names: self.settings.show_names,
            error: self.error.clone(),
        }
    }
    pub fn configure(&mut self, settings: Settings) -> Result<Status, String> {
        let path = self
            .path
            .as_ref()
            .ok_or("Notification preferences cannot be saved")?;
        let parent = path
            .parent()
            .ok_or("Notification preference path unavailable")?;
        std::fs::create_dir_all(parent).map_err(|_| "Notification preferences cannot be saved")?;
        let temp = path.with_extension("tmp");
        let bytes = serde_json::to_vec(&settings)
            .map_err(|_| "Notification preferences cannot be saved")?;
        std::fs::write(&temp, bytes)
            .and_then(|_| std::fs::rename(&temp, path))
            .map_err(|_| "Notification preferences cannot be saved")?;
        if settings.enabled != self.settings.enabled {
            self.tracker.baseline();
        }
        self.settings = settings;
        self.error = None;
        Ok(self.status())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn snapshot(id: &str, time: &str) -> Value {
        json!({"value":[{"id":"chat","topic":"Test group","members":[{"userId":"other","displayName":"Other person"}],"lastMessagePreview":{"id":id,"messageType":"message","createdDateTime":time,"from":{"user":{"id":"other"}},"body":{"content":"PRIVATE MESSAGE MUST NEVER BE INCLUDED"}},"viewpoint":{"isHidden":false,"lastMessageReadDateTime":"2026-01-01T00:00:00Z"}}]})
    }
    const BEFORE: &str = "2026-01-01T00:00:00Z";
    const NEW: &str = "2099-01-01T00:00:00Z";
    fn enabled() -> Settings {
        Settings {
            enabled: true,
            show_names: false,
        }
    }
    fn tracker() -> Tracker {
        let mut tracker = Tracker::default();
        tracker.account("me");
        tracker.observe(&snapshot("baseline", BEFORE), enabled(), false);
        tracker
    }
    #[test]
    fn initial_unread_history_never_notifies() {
        let mut tracker = Tracker::default();
        tracker.account("me");
        assert!(tracker
            .observe(&snapshot("history", NEW), enabled(), false)
            .is_empty());
    }
    #[test]
    fn fresh_incoming_notifies_once_without_message_content() {
        let mut tracker = tracker();
        let first = tracker.observe(&snapshot("new", NEW), enabled(), false);
        assert_eq!(first.len(), 1);
        assert_eq!(first[0].body, "You have a new chat message.");
        assert!(!first[0].body.contains("PRIVATE"));
        assert!(tracker
            .observe(&snapshot("new", NEW), enabled(), false)
            .is_empty());
    }
    #[test]
    fn reaction_edits_unread_toggles_and_deletes_do_not_notify() {
        let mut tracker = tracker();
        let mut value = snapshot("baseline", BEFORE);
        value["value"][0]["viewpoint"]["lastMessageReadDateTime"] = json!("0001-01-01T00:00:00Z");
        value["value"][0]["lastMessagePreview"]["body"]["content"] = json!("Edited body");
        assert!(tracker.observe(&value, enabled(), false).is_empty());
        value["value"][0]["lastMessagePreview"]["isDeleted"] = json!(true);
        assert!(tracker.observe(&value, enabled(), false).is_empty());
    }
    #[test]
    fn own_system_hidden_deleted_and_already_read_are_silent() {
        for kind in [
            "own",
            "system",
            "hidden",
            "deleted",
            "read",
            "unknown sender",
        ] {
            let mut tracker = tracker();
            let mut value = snapshot("new", NEW);
            match kind {
                "own" => {
                    value["value"][0]["lastMessagePreview"]["from"]["user"]["id"] = json!("ME")
                }
                "system" => {
                    value["value"][0]["lastMessagePreview"]["messageType"] =
                        json!("systemEventMessage")
                }
                "hidden" => value["value"][0]["viewpoint"]["isHidden"] = json!(true),
                "deleted" => value["value"][0]["lastMessagePreview"]["isDeleted"] = json!(true),
                "read" => value["value"][0]["viewpoint"]["lastMessageReadDateTime"] = json!(NEW),
                _ => value["value"][0]["lastMessagePreview"]["from"] = Value::Null,
            }
            assert!(
                tracker.observe(&value, enabled(), false).is_empty(),
                "{kind}"
            );
        }
    }
    #[test]
    fn reading_focused_chat_suppresses_alert_but_other_chat_or_background_does_not() {
        let mut tracker = tracker();
        tracker.active_chat = Some("chat".into());
        tracker.at_latest = true;
        assert!(tracker
            .observe(&snapshot("reading", NEW), enabled(), true)
            .is_empty());
        let mut newer = snapshot("background", "2099-01-01T00:00:01Z");
        assert_eq!(tracker.observe(&newer, enabled(), false).len(), 1);
        tracker.active_chat = Some("different".into());
        newer["value"][0]["lastMessagePreview"]["id"] = json!("other");
        newer["value"][0]["lastMessagePreview"]["createdDateTime"] = json!("2099-01-01T00:00:02Z");
        assert_eq!(tracker.observe(&newer, enabled(), true).len(), 1);
    }
    #[test]
    fn reader_scrolled_up_can_receive_alert() {
        let mut tracker = tracker();
        tracker.active_chat = Some("chat".into());
        tracker.at_latest = false;
        assert_eq!(
            tracker
                .observe(&snapshot("new", NEW), enabled(), true)
                .len(),
            1
        );
    }
    #[test]
    fn disabled_notifications_do_not_replay_after_enabling_baseline() {
        let mut tracker = tracker();
        assert!(tracker
            .observe(&snapshot("off", NEW), Settings::default(), false)
            .is_empty());
        tracker.baseline();
        assert!(tracker
            .observe(&snapshot("off", NEW), enabled(), false)
            .is_empty());
        assert_eq!(
            tracker
                .observe(&snapshot("on", "2099-01-01T00:00:01Z"), enabled(), false)
                .len(),
            1
        );
    }
    #[test]
    fn old_or_reordered_chats_do_not_alert() {
        let mut tracker = tracker();
        assert!(tracker
            .observe(&snapshot("old", "2025-01-01T00:00:00Z"), enabled(), false)
            .is_empty());
        tracker.observe(&snapshot("new", NEW), enabled(), false);
        assert!(tracker
            .observe(
                &snapshot("earlier", "2098-01-01T00:00:00Z"),
                enabled(),
                false
            )
            .is_empty());
    }
    #[test]
    fn newly_discovered_incoming_chat_after_baseline_can_notify() {
        let mut tracker = tracker();
        let mut value = snapshot("new", NEW);
        value["value"][0]["id"] = json!("new-chat");
        assert_eq!(tracker.observe(&value, enabled(), false).len(), 1);
    }
    #[test]
    fn optional_names_are_bounded_and_never_include_message_text() {
        let mut tracker = tracker();
        let mut value = snapshot("new", NEW);
        value["value"][0]["topic"] = json!("X\n".repeat(200));
        let notices = tracker.observe(
            &value,
            Settings {
                enabled: true,
                show_names: true,
            },
            false,
        );
        assert_eq!(notices[0].body.chars().count(), 115);
        assert!(!notices[0].body.contains('\n'));
        assert!(!notices[0].body.contains("PRIVATE"));
    }
    #[test]
    fn signout_and_account_changes_clear_baselines_and_old_click_targets() {
        let mut tracker = tracker();
        let notice = tracker
            .observe(&snapshot("new", NEW), enabled(), false)
            .pop()
            .unwrap();
        let session = tracker.session.clone();
        assert_eq!(tracker.click(notice.id).as_deref(), Some("chat"));
        tracker.reset();
        assert!(tracker.own.is_none());
        assert!(tracker.pending_open.is_none());
        assert!(tracker.click(notice.id).is_none());
        assert_ne!(session, tracker.session);
        tracker.account("another");
        assert!(tracker
            .observe(&snapshot("history", NEW), enabled(), false)
            .is_empty());
    }
    #[test]
    fn invalid_snapshots_do_not_create_candidates() {
        let mut tracker = tracker();
        for value in [
            Value::Null,
            json!({}),
            json!({"value":[{"id":"chat"}]}),
            snapshot("bad", "not-a-date"),
        ] {
            assert!(tracker.observe(&value, enabled(), false).is_empty());
        }
    }
    #[test]
    fn nonsecret_preferences_persist_and_corruption_disables_notifications() {
        let dir = std::env::temp_dir().join(format!(
            "taut-notifications-test-{}",
            crate::random_urlsafe()
        ));
        let path = dir.join("preferences.json");
        let mut manager = Manager::load(Some(path.clone()));
        assert!(!manager.settings.enabled);
        manager
            .configure(Settings {
                enabled: true,
                show_names: true,
            })
            .unwrap();
        let bytes = std::fs::read_to_string(&path).unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(&bytes).unwrap(),
            json!({"enabled":true,"showNames":true})
        );
        assert!(Manager::load(Some(path.clone())).settings.enabled);
        std::fs::write(&path, "invalid").unwrap();
        let manager = Manager::load(Some(path));
        assert!(!manager.settings.enabled);
        assert!(manager.error.is_some());
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn unavailable_storage_keeps_notifications_off_and_reports_failure() {
        let mut manager = Manager::load(None);
        assert!(manager.configure(enabled()).is_err());
        assert!(!manager.settings.enabled);
    }
}
