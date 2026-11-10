//! Delegated presence; all transport is injected for offline testing.
use crate::deletion::{own_id, Request};
use reqwest::Method;
use serde_json::{json, Value};
pub fn guid(s: &str) -> bool {
    s.len() == 36
        && s.bytes().enumerate().all(|(i, c)| {
            if [8, 13, 18, 23].contains(&i) {
                c == b'-'
            } else {
                c.is_ascii_hexdigit()
            }
        })
}
// Basic delegated profile access exposes UPN, not userType. Do not require broader directory read.
pub fn directory_coworker(value: &Value, id: &str) -> bool {
    value["id"]
        .as_str()
        .is_some_and(|returned| returned.eq_ignore_ascii_case(id))
        && value["userPrincipalName"]
            .as_str()
            .is_some_and(|upn| upn.contains('@') && !upn.to_ascii_lowercase().contains("#ext#"))
}
pub fn lookup(ids: &[String], permitted: bool, request: &mut Request<'_>) -> Result<Value, String> {
    if !permitted {
        return Err("Presence.Read.All needs consent and a fresh sign-in.".into());
    }
    if ids.is_empty() || ids.len() > 650 || ids.iter().any(|s| !guid(s)) {
        return Err("Invalid presence identifiers.".into());
    }
    // This POST only reads presence, and never sets it.
    let reply = request(
        Method::POST,
        "/communications/getPresencesByUserId",
        Some(json!({"ids":ids})),
    )?;
    if reply.status != 200 {
        return Err(format!("Presence unavailable (HTTP {}).", reply.status));
    }
    let rows = reply.body["value"]
        .as_array()
        .ok_or("Invalid presence response")?;
    Ok(
        json!({"value":rows.iter().filter(|r|r["id"].as_str().is_some_and(|id|ids.iter().any(|s|s.eq_ignore_ascii_case(id)))).map(|r|json!({"id":r["id"],"availability":r["availability"],"activity":r["activity"]})).collect::<Vec<_>>()}),
    )
}
pub fn set(
    expected: &str,
    status: &str,
    minutes: u32,
    permitted: bool,
    request: &mut Request<'_>,
) -> Result<Value, String> {
    if !permitted {
        return Err("Presence.ReadWrite needs consent and a fresh sign-in.".into());
    }
    if !guid(expected) || ![15, 30, 60, 120, 240].contains(&minutes) {
        return Err("Choose a supported status duration.".into());
    }
    let (availability, activity) = match status {
        "available" => ("Available", "Available"),
        "busy" => ("Busy", "Busy"),
        "dnd" => ("DoNotDisturb", "DoNotDisturb"),
        "away" => ("Away", "Away"),
        "brb" => ("BeRightBack", "BeRightBack"),
        "offline" => ("Offline", "OffWork"),
        "automatic" => ("", ""),
        _ => return Err("Unsupported presence state.".into()),
    };
    let own = own_id(request)?;
    if !own.eq_ignore_ascii_case(expected) {
        return Err("Account changed; reopen status settings.".into());
    }
    let (path, payload) = if status == "automatic" {
        (
            format!("/users/{own}/presence/clearUserPreferredPresence"),
            json!({}),
        )
    } else {
        (
            format!("/users/{own}/presence/setUserPreferredPresence"),
            json!({"availability":availability,"activity":activity,"expirationDuration":format!("PT{minutes}M")}),
        )
    };
    match request(Method::POST, &path, Some(payload)) {
        Ok(r) if r.status == 200 || r.status == 204 => Ok(json!({"status":"confirmed"})),
        _ => Ok(
            json!({"status":"uncertain","error":"Status change was not confirmed. Refresh presence or check Teams; TAUT will not repeat it automatically."}),
        ),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::groups::Reply;
    const ME: &str = "11111111-1111-1111-1111-111111111111";
    #[test]
    fn presence_reads_are_bounded_and_do_not_write() {
        let mut calls = vec![];
        let value = lookup(&[ME.into()], true, &mut |m, p, b| {
            calls.push((m, p.to_owned(), b));
            Ok(Reply {
                status: 200,
                body: json!({"value":[{"id":ME,"availability":"Busy"},{"id":"other"}]}),
            })
        })
        .unwrap();
        assert_eq!(value["value"].as_array().unwrap().len(), 1);
        assert_eq!(calls[0].1, "/communications/getPresencesByUserId");
        assert!(lookup(&["bad".into()], true, &mut |_, _, _| panic!()).is_err());
        assert!(lookup(&[ME.into()], false, &mut |_, _, _| panic!()).is_err());
    }
    #[test]
    fn set_verifies_identity_and_never_retries() {
        let mut writes = 0;
        let v = set(ME, "dnd", 60, true, &mut |m, _, b| {
            if m == Method::GET {
                Ok(Reply {
                    status: 200,
                    body: json!({"id":ME}),
                })
            } else {
                writes += 1;
                assert_eq!(b.unwrap()["activity"], "DoNotDisturb");
                Err("timeout".into())
            }
        })
        .unwrap();
        assert_eq!(writes, 1);
        assert_eq!(v["status"], "uncertain");
        assert!(set(ME, "invalid", 60, true, &mut |_, _, _| panic!()).is_err());
    }
}
