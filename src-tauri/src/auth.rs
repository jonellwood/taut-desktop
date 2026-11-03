//! Session lifecycle. Tests inject both credential storage and OAuth exchange.
//! Secrets never appear in serializable UI status or error strings.
use serde_json::Value;
use std::time::{Duration, Instant};

pub trait Vault {
    fn load(&mut self) -> Result<Option<String>, ()>;
    fn save(&mut self, refresh: &str) -> Result<(), ()>;
    fn delete(&mut self) -> Result<(), ()>;
}
#[derive(Clone, Copy)]
pub enum ExchangeError {
    Reauthenticate,
    Unavailable,
    InvalidResponse,
}
impl ExchangeError {
    pub fn message(self) -> &'static str {
        match self {
            Self::Reauthenticate => "Microsoft requires a fresh sign-in. Please sign in again.",
            Self::Unavailable => {
                "Microsoft sign-in is unavailable. Check your connection and try again."
            }
            Self::InvalidResponse => {
                "Microsoft returned an invalid sign-in response. Please try again."
            }
        }
    }
}
pub type Exchange<'a> = dyn FnMut(&str) -> Result<Value, ExchangeError> + 'a;
pub struct Token {
    pub access: String,
    refresh: Option<String>,
    pub scopes: String,
    expires_at: Instant,
}
impl Token {
    fn parse(value: Value, previous: Option<&Token>) -> Result<Self, String> {
        let access = value["access_token"]
            .as_str()
            .filter(|s| !s.is_empty())
            .ok_or("Missing access token")?
            .to_owned();
        let refresh = value["refresh_token"]
            .as_str()
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
            .or_else(|| previous.and_then(|t| t.refresh.clone()));
        let scopes = value["scope"]
            .as_str()
            .map(str::to_owned)
            .unwrap_or_else(|| previous.map(|t| t.scopes.clone()).unwrap_or_default());
        let ttl = value["expires_in"].as_u64().unwrap_or(3600).min(86400);
        Ok(Self {
            access,
            refresh,
            scopes,
            expires_at: Instant::now() + Duration::from_secs(ttl.saturating_sub(90).max(1)),
        })
    }
}
#[derive(Default)]
pub struct Session {
    pub token: Option<Token>,
    epoch: u64,
    saved: bool,
    notice: Option<String>,
}
#[derive(serde::Serialize)]
pub struct Status {
    pub restored: bool,
    pub saved: bool,
    pub notice: Option<String>,
}
impl Session {
    pub fn status(&self) -> Status {
        Status {
            restored: self.token.is_some(),
            saved: self.saved,
            notice: self.notice.clone(),
        }
    }
    pub fn begin_login(&mut self) -> u64 {
        self.epoch = self.epoch.wrapping_add(1);
        self.token = None;
        self.epoch
    }
    fn persist(&mut self, vault: &mut dyn Vault) {
        let result = if let Some(refresh) = self.token.as_ref().and_then(|t| t.refresh.as_deref()) {
            vault.save(refresh)
        } else {
            vault.delete()
        };
        self.saved = result.is_ok()
            && self
                .token
                .as_ref()
                .and_then(|t| t.refresh.as_ref())
                .is_some();
        self.notice = if result.is_err() {
            Some("Connected for this session, but Keychain could not save or update your sign-in. A previously saved sign-in may still remain. Unlock or allow access to Keychain; another sign-in may be needed after restarting.".into())
        } else if !self.saved {
            Some("Connected for this session. Microsoft did not provide a refresh token, so another sign-in is needed after restarting.".into())
        } else {
            None
        };
    }
    pub fn accept_login(
        &mut self,
        epoch: u64,
        value: Value,
        vault: &mut dyn Vault,
    ) -> Result<(), String> {
        if epoch != self.epoch {
            return Err("Sign-in was cancelled by a newer session change".into());
        }
        self.token = Some(Token::parse(value, None)?);
        self.persist(vault);
        Ok(())
    }
    #[cfg(test)]
    pub fn set_test_token(&mut self, value: Value) -> Result<(), String> {
        self.token = Some(Token::parse(value, None)?);
        Ok(())
    }
    fn refresh(
        &mut self,
        refresh: &str,
        vault: &mut dyn Vault,
        exchange: &mut Exchange<'_>,
    ) -> Result<(), String> {
        match exchange(refresh) {
            Ok(mut value) => {
                if value["refresh_token"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .is_none()
                {
                    value["refresh_token"] = Value::String(refresh.into());
                }
                let token = Token::parse(value, self.token.as_ref())?;
                self.token = Some(token);
                self.persist(vault);
                Ok(())
            }
            Err(ExchangeError::Reauthenticate) => {
                self.token = None;
                self.saved = false;
                let removed = vault.delete().is_ok();
                self.notice = Some(if removed {
                    ExchangeError::Reauthenticate.message().into()
                } else {
                    "Microsoft requires a fresh sign-in. Keychain cleanup failed; unlock Keychain and clear the saved sign-in in Preferences.".into()
                });
                Err(self.notice.clone().unwrap())
            }
            Err(error) => Err(error.message().into()),
        }
    }
    pub fn restore(
        &mut self,
        vault: &mut dyn Vault,
        exchange: &mut Exchange<'_>,
    ) -> Result<Status, String> {
        if self.token.is_some() {
            return Ok(self.status());
        }
        let refresh = match vault.load() {
            Ok(Some(value)) if !value.is_empty() && value.len() <= 65536 => value,
            Ok(None) => {
                self.saved = false;
                self.notice = None;
                return Ok(self.status());
            }
            Ok(Some(_)) => {
                let removed = vault.delete().is_ok();
                self.notice=Some(if removed {"The saved sign-in was invalid. Please sign in again."}else{"The saved sign-in was invalid and could not be removed. Clear the saved sign-in in Preferences."}.into());
                return Ok(self.status());
            }
            Err(()) => {
                self.notice=Some("Saved sign-in could not be read from Keychain. Unlock or allow Keychain access, or sign in for this session.".into());
                return Ok(self.status());
            }
        };
        self.saved = true;
        if let Err(error) = self.refresh(&refresh, vault, exchange) {
            // Network failures preserve the saved refresh token for the next startup/retry.
            if self.notice.is_none() {
                self.notice=Some(format!("{error} Your saved sign-in has been kept; use Retry saved sign-in or sign in manually."));
            }
        }
        Ok(self.status())
    }
    pub fn access(
        &mut self,
        vault: &mut dyn Vault,
        exchange: &mut Exchange<'_>,
    ) -> Result<String, String> {
        let token = self.token.as_ref().ok_or("Not signed in")?;
        if Instant::now() < token.expires_at {
            return Ok(token.access.clone());
        }
        let refresh = token
            .refresh
            .clone()
            .ok_or("Session expired; sign in again")?;
        self.refresh(&refresh, vault, exchange)?;
        Ok(self.token.as_ref().ok_or("Not signed in")?.access.clone())
    }
    pub fn logout(&mut self, vault: &mut dyn Vault) -> Result<(), String> {
        self.epoch = self.epoch.wrapping_add(1);
        self.token = None;
        self.saved = false;
        self.notice = None;
        vault.delete().map_err(|()|"Signed out of this session, but the saved sign-in could not be removed from Keychain. It may restore on next launch. Unlock Keychain and use Clear saved sign-in in Preferences to retry.".into())
    }
}

pub struct Keychain;
const SERVICE: &str = "app.taut.desktop.microsoft365";
fn account() -> String {
    format!("{}:{}", crate::TENANT, crate::CLIENT_ID)
}
#[cfg(target_os = "macos")]
impl Vault for Keychain {
    fn load(&mut self) -> Result<Option<String>, ()> {
        match security_framework::passwords::get_generic_password(SERVICE, &account()) {
            Ok(bytes) => String::from_utf8(bytes).map(Some).map_err(|_| ()),
            Err(error) if error.code() == -25300 => Ok(None), // errSecItemNotFound
            Err(_) => Err(()),
        }
    }
    fn save(&mut self, refresh: &str) -> Result<(), ()> {
        security_framework::passwords::set_generic_password(SERVICE, &account(), refresh.as_bytes())
            .map_err(|_| ())
    }
    fn delete(&mut self) -> Result<(), ()> {
        match security_framework::passwords::delete_generic_password(SERVICE, &account()) {
            Ok(()) => Ok(()),
            Err(error) if error.code() == -25300 => Ok(()),
            Err(_) => Err(()),
        }
    }
}
#[cfg(not(target_os = "macos"))]
impl Vault for Keychain {
    fn load(&mut self) -> Result<Option<String>, ()> {
        Err(())
    }
    fn save(&mut self, _: &str) -> Result<(), ()> {
        Err(())
    }
    fn delete(&mut self) -> Result<(), ()> {
        Err(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[derive(Default)]
    struct FakeVault {
        value: Option<String>,
        read_fail: bool,
        save_fail: bool,
        delete_fail: bool,
        saves: usize,
        deletes: usize,
    }
    impl Vault for FakeVault {
        fn load(&mut self) -> Result<Option<String>, ()> {
            if self.read_fail {
                Err(())
            } else {
                Ok(self.value.clone())
            }
        }
        fn save(&mut self, value: &str) -> Result<(), ()> {
            self.saves += 1;
            if self.save_fail {
                Err(())
            } else {
                self.value = Some(value.into());
                Ok(())
            }
        }
        fn delete(&mut self) -> Result<(), ()> {
            self.deletes += 1;
            if self.delete_fail {
                Err(())
            } else {
                self.value = None;
                Ok(())
            }
        }
    }
    fn token(refresh: Option<&str>) -> Value {
        let mut value = json!({"access_token":"fake-access-secret","scope":"User.Read Chat.Read","expires_in":3600});
        if let Some(refresh) = refresh {
            value["refresh_token"] = json!(refresh);
        }
        value
    }
    #[test]
    fn interactive_login_saves_only_refresh_token_and_status_is_secret_free() {
        let mut session = Session::default();
        let mut vault = FakeVault::default();
        let epoch = session.begin_login();
        session
            .accept_login(epoch, token(Some("fake-refresh-secret")), &mut vault)
            .unwrap();
        assert_eq!(vault.value.as_deref(), Some("fake-refresh-secret"));
        assert!(session.status().saved);
        let status = serde_json::to_string(&session.status()).unwrap();
        assert!(!status.contains("secret"));
        assert!(!status.contains("Chat.Read"));
        assert_eq!(
            session
                .access(&mut vault, &mut |_| panic!(
                    "Valid access token must not refresh"
                ))
                .unwrap(),
            "fake-access-secret"
        );
    }
    #[test]
    fn startup_without_saved_token_never_exchanges() {
        let status = Session::default()
            .restore(&mut FakeVault::default(), &mut |_| panic!("No OAuth"))
            .unwrap();
        assert!(!status.restored);
        assert!(!status.saved);
        assert!(status.notice.is_none());
    }
    #[test]
    fn startup_restores_and_rotates_saved_refresh_token() {
        let mut vault = FakeVault {
            value: Some("old-refresh".into()),
            ..Default::default()
        };
        let mut session = Session::default();
        let status = session
            .restore(&mut vault, &mut |refresh| {
                assert_eq!(refresh, "old-refresh");
                Ok(token(Some("rotated-refresh")))
            })
            .unwrap();
        assert!(status.restored && status.saved);
        assert_eq!(vault.value.as_deref(), Some("rotated-refresh"));
        assert_eq!(vault.saves, 1);
    }
    #[test]
    fn omitted_refresh_token_is_retained_but_missing_startup_scopes_are_not_invented() {
        let mut vault = FakeVault {
            value: Some("old-refresh".into()),
            ..Default::default()
        };
        let mut session = Session::default();
        session
            .restore(&mut vault, &mut |_| {
                Ok(json!({"access_token":"new-access"}))
            })
            .unwrap();
        assert_eq!(vault.value.as_deref(), Some("old-refresh"));
        assert_eq!(session.token.as_ref().unwrap().scopes, "");
    }
    #[test]
    fn expired_access_refreshes_once_and_persists_rotation() {
        let mut session = Session::default();
        session.set_test_token(token(Some("first"))).unwrap();
        session.token.as_mut().unwrap().expires_at = Instant::now();
        let mut vault = FakeVault::default();
        let mut calls = 0;
        let mut exchange = |_: &str| {
            calls += 1;
            Ok(token(Some("next")))
        };
        session.access(&mut vault, &mut exchange).unwrap();
        session.access(&mut vault, &mut exchange).unwrap();
        assert_eq!(calls, 1);
        assert_eq!(vault.value.as_deref(), Some("next"));
    }
    #[test]
    fn expired_or_revoked_grant_removes_saved_token_and_requires_login() {
        let mut vault = FakeVault {
            value: Some("revoked".into()),
            ..Default::default()
        };
        let mut session = Session::default();
        let status = session
            .restore(&mut vault, &mut |_| Err(ExchangeError::Reauthenticate))
            .unwrap();
        assert!(!status.restored && !status.saved);
        assert!(vault.value.is_none());
        assert!(status.notice.unwrap().contains("fresh sign-in"));
        assert!(session.access(&mut vault, &mut |_| panic!()).is_err());
    }
    #[test]
    fn temporary_oauth_failure_keeps_saved_credentials_without_retrying() {
        let mut vault = FakeVault {
            value: Some("keep-refresh".into()),
            ..Default::default()
        };
        let mut calls = 0;
        let status = Session::default()
            .restore(&mut vault, &mut |_| {
                calls += 1;
                Err(ExchangeError::Unavailable)
            })
            .unwrap();
        assert!(!status.restored && status.saved);
        assert_eq!(calls, 1);
        assert_eq!(vault.deletes, 0);
        assert_eq!(vault.value.as_deref(), Some("keep-refresh"));
    }
    #[test]
    fn keychain_denial_and_save_failure_never_fall_back_to_plaintext() {
        let mut vault = FakeVault {
            read_fail: true,
            ..Default::default()
        };
        let mut session = Session::default();
        let status = session
            .restore(&mut vault, &mut |_| panic!("No OAuth without credentials"))
            .unwrap();
        assert!(!status.restored);
        assert!(status.notice.is_some());
        vault.save_fail = true;
        let epoch = session.begin_login();
        session
            .accept_login(epoch, token(Some("private-refresh")), &mut vault)
            .unwrap();
        assert!(session.status().restored && !session.status().saved);
        assert!(session.status().notice.unwrap().contains("Keychain"));
        assert!(vault.value.is_none());
    }
    #[test]
    fn malformed_oauth_response_does_not_overwrite_saved_credential() {
        let mut vault = FakeVault {
            value: Some("keep".into()),
            ..Default::default()
        };
        let status = Session::default()
            .restore(&mut vault, &mut |_| {
                Ok(json!({"unexpected":"private-response"}))
            })
            .unwrap();
        assert!(!status.restored);
        assert_eq!(vault.value.as_deref(), Some("keep"));
        assert_eq!(vault.saves, 0);
        assert!(!status.notice.unwrap().contains("private-response"));
    }
    #[test]
    fn logout_clears_memory_and_keychain_and_invalidates_delayed_interactive_login() {
        let mut vault = FakeVault::default();
        let mut session = Session::default();
        let epoch = session.begin_login();
        session
            .accept_login(epoch, token(Some("saved")), &mut vault)
            .unwrap();
        session.logout(&mut vault).unwrap();
        assert!(session.token.is_none() && vault.value.is_none());
        assert!(session
            .accept_login(epoch, token(Some("late")), &mut vault)
            .is_err());
        assert!(vault.value.is_none());
    }
    #[test]
    fn logout_failure_still_clears_memory_and_reports_saved_credential_may_remain() {
        let mut vault = FakeVault {
            value: Some("saved".into()),
            delete_fail: true,
            ..Default::default()
        };
        let mut session = Session::default();
        session.set_test_token(token(Some("saved"))).unwrap();
        let error = session.logout(&mut vault).unwrap_err();
        assert!(session.token.is_none());
        assert!(error.contains("may restore"));
        assert!(!error.contains("fake-access-secret"));
    }
    #[test]
    fn new_login_without_refresh_removes_previous_account_saved_credential() {
        let mut vault = FakeVault {
            value: Some("previous-account".into()),
            ..Default::default()
        };
        let mut session = Session::default();
        let epoch = session.begin_login();
        session
            .accept_login(epoch, token(None), &mut vault)
            .unwrap();
        assert!(vault.value.is_none());
        assert!(!session.status().saved);
        assert!(session.status().notice.is_some());
    }
    #[test]
    fn saved_credentials_are_namespaced_to_app_tenant_and_client() {
        assert_eq!(SERVICE, "app.taut.desktop.microsoft365");
        assert_eq!(account(), format!("{}:{}", crate::TENANT, crate::CLIENT_ID));
    }
    #[test]
    fn serialized_refresh_cannot_repopulate_credentials_after_logout() {
        use std::sync::{mpsc, Arc, Mutex};
        let session = Arc::new(Mutex::new(Session::default()));
        let vault = Arc::new(Mutex::new(FakeVault::default()));
        session
            .lock()
            .unwrap()
            .set_test_token(token(Some("refresh")))
            .unwrap();
        session.lock().unwrap().token.as_mut().unwrap().expires_at = Instant::now();
        let (entered_tx, entered_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let refresh_session = session.clone();
        let refresh_vault = vault.clone();
        let worker = std::thread::spawn(move || {
            refresh_session
                .lock()
                .unwrap()
                .access(&mut *refresh_vault.lock().unwrap(), &mut |_| {
                    entered_tx.send(()).unwrap();
                    release_rx.recv().unwrap();
                    Ok(token(Some("rotated")))
                })
                .unwrap()
        });
        entered_rx.recv().unwrap();
        let logout_session = session.clone();
        let logout_vault = vault.clone();
        let logout = std::thread::spawn(move || {
            logout_session
                .lock()
                .unwrap()
                .logout(&mut *logout_vault.lock().unwrap())
                .unwrap()
        });
        release_tx.send(()).unwrap();
        worker.join().unwrap();
        logout.join().unwrap();
        assert!(session.lock().unwrap().token.is_none());
        assert!(vault.lock().unwrap().value.is_none());
    }
}
