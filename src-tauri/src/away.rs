//! Opt-in, app-running away replies. Durable reservation precedes every send.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
};
pub const MARKER: &str = "[TAUT automatic away reply]";
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Config {
    pub enabled: bool,
    pub message: String,
    pub groups: bool,
    pub channels: bool,
    pub start: i64,
    pub end: Option<i64>,
    pub period: String,
    pub ledger: HashMap<String, String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub config: Config,
    pub notice: String,
    pub reserved: usize,
    pub sent: usize,
}
pub struct Manager {
    pub root: Option<PathBuf>,
    pub own: Option<String>,
    pub config: Config,
    pub notice: String,
    pub generation: u64,
    pub last_scan: Option<i64>,
    pub seen: HashSet<String>,
    pub channels: Vec<(String, String)>,
    pub last_sends: Vec<i64>,
}
impl Manager {
    pub fn new(root: Option<PathBuf>) -> Self {
        Self {
            root,
            own: None,
            config: Config::default(),
            notice: String::new(),
            generation: 0,
            last_scan: None,
            seen: HashSet::new(),
            channels: vec![],
            last_sends: vec![],
        }
    }
    fn path(&self) -> Result<PathBuf, String> {
        Ok(self
            .root
            .as_ref()
            .ok_or("Away-reply storage unavailable; replies are blocked.")?
            .join(format!(
                "away-{}-{}.json",
                crate::TENANT,
                self.own.as_deref().ok_or("Sign in first")?
            )))
    }
    pub fn persist(&self) -> Result<(), String> {
        use std::io::Write;
        let path = self.path()?;
        let parent = path.parent().ok_or("Invalid away storage")?;
        std::fs::create_dir_all(parent).map_err(|_| "Cannot create away-reply storage")?;
        let temp = parent.join(format!(".away-{}.tmp", crate::random_urlsafe()));
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let result = (|| {
            let mut file = options
                .open(&temp)
                .map_err(|_| "Cannot reserve away reply")?;
            file.write_all(
                &serde_json::to_vec(&self.config).map_err(|_| "Cannot encode away settings")?,
            )
            .map_err(|_| "Cannot save away settings")?;
            file.sync_all().map_err(|_| "Cannot sync away settings")?;
            std::fs::rename(&temp, &path).map_err(|_| "Cannot replace away settings")?;
            std::fs::File::open(parent)
                .and_then(|f| f.sync_all())
                .map_err(|_| "Cannot confirm away storage")?;
            Ok(())
        })();
        if result.is_err() {
            let _ = std::fs::remove_file(temp);
        }
        result
    }
    pub fn account(&mut self, own: &str) {
        if self.own.as_deref() == Some(own) {
            return;
        }
        self.suspend();
        self.own = Some(own.to_owned());
        self.config = Config::default();
        self.notice.clear();
        if let Ok(path) = self.path() {
            match std::fs::read(path) {
                Ok(bytes) => match serde_json::from_slice::<Config>(&bytes) {
                    Ok(c)
                        if c.ledger.len() <= 5000
                            && c.message.len() <= 3000
                            && (!c.enabled
                                || (!c.period.is_empty()
                                    && !c.message.trim().is_empty()
                                    && !c.message.contains(MARKER))) =>
                    {
                        self.config = c
                    }
                    _ => {
                        self.notice =
                            "Away settings could not be read. Replies are disabled.".into()
                    }
                },
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(_) => {
                    self.notice = "Away settings could not be read. Replies are disabled.".into()
                }
            }
        }
    }
    pub fn suspend(&mut self) {
        self.generation = self.generation.wrapping_add(1);
        self.own = None;
        self.last_scan = None;
        self.seen.clear();
        self.channels.clear();
        self.last_sends.clear();
    }
    pub fn status(&self) -> Status {
        Status {
            config: Config {
                ledger: HashMap::new(),
                ..self.config.clone()
            },
            notice: self.notice.clone(),
            reserved: self
                .config
                .ledger
                .values()
                .filter(|v| v.as_str() != "sent")
                .count(),
            sent: self
                .config
                .ledger
                .values()
                .filter(|v| v.as_str() == "sent")
                .count(),
        }
    }
    pub fn configure(&mut self, mut c: Config, now: i64) -> Result<Status, String> {
        if c.message.trim().is_empty() && c.enabled {
            return Err("Write an away message before enabling replies.".into());
        }
        if c.message.len() > 3000
            || c.message.contains(MARKER)
            || c.enabled && c.end.is_some_and(|end| end <= c.start.max(now))
        {
            return Err(
                "Use at most 3000 bytes and an end time after the start and current time.".into(),
            );
        }
        c.message = c.message.trim().to_owned();
        if c.enabled && !self.config.enabled {
            c.period = crate::random_urlsafe();
            c.start = c.start.max(now);
            c.ledger.clear();
        } else {
            c.period = self.config.period.clone();
            c.ledger = self.config.ledger.clone();
            if c.enabled {
                c.start = self.config.start;
            }
        }
        let old = self.config.clone();
        self.config = c;
        if let Err(e) = self.persist() {
            self.config = old;
            return Err(e);
        }
        self.generation = self.generation.wrapping_add(1);
        self.last_scan = None;
        self.seen.clear();
        self.notice.clear();
        Ok(self.status())
    }
    pub fn active(&self, now: i64) -> bool {
        self.own.is_some()
            && self.config.enabled
            && now >= self.config.start
            && self.config.end.is_none_or(|end| now < end)
    }
    pub fn reserve(&mut self, sender: &str, now: i64) -> Result<bool, String> {
        if self.config.ledger.contains_key(sender) {
            return Ok(false);
        }
        if self.config.ledger.len() >= 5000 {
            return Err(
                "Away reply limit reached; disable replies and start a new period when ready."
                    .into(),
            );
        }
        self.last_sends.retain(|t| now - *t < 60000);
        if self.last_sends.len() >= 5 {
            return Err("Away replies rate limited. No further replies this cycle.".into());
        }
        self.config.ledger.insert(sender.into(), "reserved".into());
        if let Err(e) = self.persist() {
            self.notice = e.clone();
            return Err(e);
        }
        self.last_sends.push(now);
        Ok(true)
    }
    pub fn finish(&mut self, sender: &str, confirmed: bool) {
        self.config.ledger.insert(
            sender.into(),
            if confirmed { "sent" } else { "uncertain" }.into(),
        );
        if let Err(e) = self.persist() {
            self.notice = e;
        } else if !confirmed {
            self.notice="An away reply was not confirmed. It will not be sent again automatically; check Teams.".into();
        }
    }
}
pub fn created(message: &Value) -> Option<i64> {
    message["createdDateTime"]
        .as_str()
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|d| d.timestamp_millis())
}
pub fn eligible(message: &Value, own: &str, after: i64, now: i64) -> Option<String> {
    let sender = message["from"]["user"]["id"].as_str()?;
    let timestamp = created(message)?;
    if !crate::presence::guid(sender)
        || sender.eq_ignore_ascii_case(own)
        || message["from"]["application"].is_object()
        || message["messageType"].as_str() != Some("message")
        || message["deletedDateTime"].is_string()
        || message["isDeleted"].as_bool() == Some(true)
        || timestamp <= after
        || timestamp > now + 5000
        || message["body"]["content"]
            .as_str()
            .unwrap_or("")
            .contains(MARKER)
        || message["from"]["user"]["userIdentityType"]
            .as_str()
            .is_some_and(|t| !["aadUser", "onPremiseAadUser"].contains(&t))
    {
        return None;
    }
    if message["lastEditedDateTime"].is_string() {
        return None;
    }
    Some(sender.to_lowercase())
}
pub fn text(config: &Config) -> String {
    format!("{MARKER}\n{}", config.message)
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    const ME: &str = "11111111-1111-1111-1111-111111111111";
    const OTHER: &str = "22222222-2222-2222-2222-222222222222";
    fn manager() -> Manager {
        let path = std::env::temp_dir().join(format!("taut-away-test-{}", crate::random_urlsafe()));
        let mut m = Manager::new(Some(path));
        m.account(ME);
        m
    }
    #[test]
    fn reservation_survives_crash_restart_and_message_changes() {
        let mut m = manager();
        m.configure(
            Config {
                enabled: true,
                message: "Away".into(),
                ..Config::default()
            },
            100,
        )
        .unwrap();
        let period = m.config.period.clone();
        assert!(m.reserve(OTHER, 101).unwrap());
        let mut restored = Manager::new(m.root.clone());
        restored.account(ME);
        assert!(!restored.reserve(OTHER, 102).unwrap());
        let mut c = restored.config.clone();
        c.message = "New wording".into();
        restored.configure(c, 103).unwrap();
        assert_eq!(restored.config.period, period);
        assert!(!restored.reserve(OTHER, 104).unwrap());
        let mut c = restored.config.clone();
        c.enabled = false;
        restored.configure(c, 105).unwrap();
        let mut c = restored.config.clone();
        c.enabled = true;
        restored.configure(c, 106).unwrap();
        assert_ne!(restored.config.period, period);
        assert!(restored.reserve(OTHER, 107).unwrap());
        std::fs::remove_dir_all(m.root.unwrap()).unwrap();
    }
    #[test]
    fn historical_own_edits_bots_and_automatic_replies_never_qualify() {
        let now = 1760000000000i64;
        let mut msg = json!({"createdDateTime":chrono::DateTime::from_timestamp_millis(now).unwrap().to_rfc3339(),"messageType":"message","from":{"user":{"id":OTHER}},"body":{"content":"hello"}});
        assert_eq!(eligible(&msg, ME, now - 1, now), Some(OTHER.into()));
        assert!(eligible(&msg, ME, now, now).is_none());
        msg["lastEditedDateTime"] = json!("edited");
        assert!(eligible(&msg, ME, now - 1, now).is_none());
        msg.as_object_mut().unwrap().remove("lastEditedDateTime");
        msg["from"]["application"] = json!({"id":"bot"});
        assert!(eligible(&msg, ME, now - 1, now).is_none());
        msg["from"].as_object_mut().unwrap().remove("application");
        msg["body"]["content"] = json!(MARKER);
        assert!(eligible(&msg, ME, now - 1, now).is_none());
    }
    #[test]
    fn no_storage_means_no_send() {
        let mut m = Manager::new(None);
        m.own = Some(ME.into());
        assert!(m.reserve(OTHER, 1).is_err());
        assert!(m.config.ledger.contains_key(OTHER));
    }
}
#[cfg(test)]
mod isolation_tests {
    use super::*;
    #[test]
    fn settings_and_ledger_are_account_scoped_and_expired_period_can_be_disabled() {
        let root =
            std::env::temp_dir().join(format!("taut-away-isolation-{}", crate::random_urlsafe()));
        let mut m = Manager::new(Some(root.clone()));
        m.account("11111111-1111-1111-1111-111111111111");
        m.configure(
            Config {
                enabled: true,
                message: "Away".into(),
                end: Some(200),
                ..Default::default()
            },
            100,
        )
        .unwrap();
        m.reserve("sender", 101).unwrap();
        let mut c = m.config.clone();
        c.enabled = false;
        m.configure(c, 300).unwrap();
        m.account("22222222-2222-2222-2222-222222222222");
        assert!(!m.config.enabled);
        assert!(m.config.ledger.is_empty());
        m.account("11111111-1111-1111-1111-111111111111");
        assert!(!m.config.enabled);
        assert!(m.config.ledger.contains_key("sender"));
        assert!(m.last_scan.is_none());
        std::fs::remove_dir_all(root).unwrap();
    }
}
