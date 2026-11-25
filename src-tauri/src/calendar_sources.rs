//! Read-only mailbox, explicitly selected person, and joined Teams calendar discovery.
use serde_json::{json, Value};
type Request<'a> = dyn FnMut(&str) -> Result<(u16, Value), String> + 'a;
fn id(raw: &str) -> Result<String, String> {
    if raw.is_empty()
        || raw.len() > 2048
        || raw.chars().any(|c| c.is_control() || "/\\?#".contains(c))
        || matches!(raw, "." | "..")
    {
        return Err("Invalid calendar identifier".into());
    }
    Ok(percent_encoding::utf8_percent_encode(raw, percent_encoding::NON_ALPHANUMERIC).to_string())
}
fn continuation(raw: &str, path: &str) -> Result<String, String> {
    let u = url::Url::parse(raw).map_err(|_| "Invalid calendar continuation")?;
    if u.scheme() != "https"
        || u.host_str() != Some("graph.microsoft.com")
        || !u.username().is_empty()
        || u.password().is_some()
        || u.port().is_some()
        || u.fragment().is_some()
        || percent_encoding::percent_decode_str(u.path())
            .decode_utf8()
            .ok()
            .as_deref()
            != percent_encoding::percent_decode_str(&format!("/v1.0{path}"))
                .decode_utf8()
                .ok()
                .as_deref()
    {
        return Err("Calendar continuation does not match its source".into());
    }
    Ok(format!("{path}?{}", u.query().unwrap_or("")))
}
const META: &str =
    "id,name,owner,isDefaultCalendar,isSharedWithMe,canViewPrivateItems,canEdit,color";
pub fn sources(
    next: Option<&str>,
    permitted: bool,
    request: &mut Request<'_>,
) -> Result<Value, String> {
    if !permitted {
        return Err("Reconnect to read calendars.".into());
    }
    let path = if let Some(n) = next {
        continuation(n, "/me/calendars")?
    } else {
        format!("/me/calendars?$select={META}&$top=100")
    };
    let (status, v) = request(&path)?;
    if status != 200 {
        return Err(format!(
            "Calendars unavailable (HTTP {status}). Your calendar is still available."
        ));
    }
    let rows = v["value"]
        .as_array()
        .filter(|a| a.len() <= 1000)
        .ok_or("Invalid calendar list")?;
    let rows:Vec<Value>=rows.iter().filter(|r|r["id"].as_str().is_some_and(|s|id(s).is_ok())).map(|r|json!({"id":r["id"],"name":r["name"],"owner":r["owner"],"isDefaultCalendar":r["isDefaultCalendar"],"isSharedWithMe":r["isSharedWithMe"],"canViewPrivateItems":r["canViewPrivateItems"],"color":r["color"]})).collect();
    let next = v["@odata.nextLink"].as_str();
    if let Some(n) = next {
        continuation(n, "/me/calendars")?;
    }
    Ok(json!({"value":rows,"next":next}))
}
fn directory_id(raw: &str) -> Result<&str, String> {
    if raw.len() != 36
        || !raw.bytes().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                b == b'-'
            } else {
                b.is_ascii_hexdigit()
            }
        })
    {
        return Err("Invalid directory identifier".into());
    }
    Ok(raw)
}

/// Bounded membership discovery. IDs originate in Graph, never a guessed group path.
pub fn groups(permitted: bool, request: &mut Request<'_>) -> Result<Value, String> {
    if !permitted {
        return Err("Reconnect to discover Teams calendars.".into());
    }
    let mut route = "/me/joinedTeams".to_string();
    let mut rows = std::collections::BTreeMap::new();
    let mut visited = std::collections::HashSet::new();
    for _ in 0..10 {
        if !visited.insert(route.clone()) {
            return Err("Repeated Teams calendar page".into());
        }
        let (status, v) = request(&route)?;
        if status != 200 {
            return Err(format!("Teams calendar list unavailable (HTTP {status})."));
        }
        let items = v["value"]
            .as_array()
            .filter(|a| a.len() <= 1000)
            .ok_or("Invalid Teams calendar list")?;
        for item in items {
            if let Some(gid) = item["id"].as_str().filter(|s| directory_id(s).is_ok()) {
                rows.insert(gid.to_string(),json!({"id":format!("group:{gid}"),"name":item["displayName"],"kind":"group","owner":{"name":"Microsoft 365 group"}}));
            }
        }
        if rows.len() > 1000 {
            return Err("Too many Teams calendars".into());
        }
        match v["@odata.nextLink"].as_str() {
            Some(n) => route = continuation(n, "/me/joinedTeams")?,
            None => return Ok(json!({"value":rows.into_values().collect::<Vec<_>>()})),
        }
    }
    Err("Teams calendar list exceeded its page limit. Try again later.".into())
}

/// Resolves one explicitly selected directory person; never creates a share.
pub fn person(user: &str, permitted: bool, request: &mut Request<'_>) -> Result<Value, String> {
    if !permitted {
        return Err(
            "Reconnect after Calendars.Read.Shared consent to add a person's calendar.".into(),
        );
    }
    let user = directory_id(user)?;
    let (status, profile) = request(&format!(
        "/users/{user}?$select=id,displayName,userPrincipalName"
    ))?;
    if status != 200 || profile["id"].as_str() != Some(user) {
        return Err("Person unavailable. Search again.".into());
    }
    let (status, meta) = request(&format!("/users/{user}/calendar?$select={META}"))?;
    if status != 200 {
        return Err(format!("Calendar unavailable (HTTP {status}). It must already be shared with you; no sharing request was sent."));
    }
    if meta["id"].as_str().is_none() {
        return Err("Invalid shared calendar".into());
    }
    Ok(
        json!({"id":format!("person:{user}"),"name":profile["displayName"],"kind":"person","isSharedWithMe":true,"owner":{"name":profile["displayName"],"address":profile["userPrincipalName"]}}),
    )
}

#[cfg(test)]
pub fn page(
    calendar: &str,
    start: &str,
    end: &str,
    next: Option<&str>,
    permitted: bool,
    request: &mut Request<'_>,
) -> Result<Value, String> {
    if !permitted {
        return Err("Reconnect to read calendars.".into());
    }
    routed_page(calendar, start, end, next, permitted, false, false, request)
}
pub fn routed_page(
    calendar: &str,
    start: &str,
    end: &str,
    next: Option<&str>,
    permitted: bool,
    shared: bool,
    teams: bool,
    request: &mut Request<'_>,
) -> Result<Value, String> {
    if !permitted {
        return Err("Reconnect to read calendars.".into());
    }
    let (root, expected) = if let Some(user) = calendar.strip_prefix("person:") {
        if !shared {
            return Err(
                "Reconnect after Calendars.Read.Shared consent to read people's calendars.".into(),
            );
        }
        let user = directory_id(user)?;
        (format!("/users/{user}/calendar"), None)
    } else if let Some(group) = calendar.strip_prefix("group:") {
        let group = directory_id(group)?;
        let list = groups(teams, request)?;
        if !list["value"]
            .as_array()
            .is_some_and(|rows| rows.iter().any(|s| s["id"].as_str() == Some(calendar)))
        {
            return Err(
                "This group is no longer in your joined Teams. No availability is inferred.".into(),
            );
        }
        (format!("/groups/{group}"), None)
    } else {
        (format!("/me/calendars/{}", id(calendar)?), Some(calendar))
    };
    let a = chrono::DateTime::parse_from_rfc3339(start).map_err(|_| "Invalid start time")?;
    let b = chrono::DateTime::parse_from_rfc3339(end).map_err(|_| "Invalid end time")?;
    if b <= a || (b - a).num_seconds() > 32 * 86400 {
        return Err("Choose a range of at most 32 days".into());
    }
    let path = format!("{root}/calendarView");
    let route = if let Some(n) = next {
        continuation(n, &path)?
    } else {
        let q = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("startDateTime", start)
            .append_pair("endDateTime", end)
            .append_pair("$orderby", "start/dateTime")
            .append_pair("$top", "100")
            .finish();
        format!("{path}?{q}")
    };
    // Verify current rights from this mailbox before returning any event details.
    let (status, meta) = if calendar.starts_with("group:") {
        (200, json!({"canViewPrivateItems":false}))
    } else {
        request(&format!("{root}?$select={META}"))?
    };
    if status != 200
        || expected.is_some_and(|value| meta["id"].as_str() != Some(value))
        || (!calendar.starts_with("group:") && meta["id"].as_str().is_none())
    {
        return Err(format!(
            "This calendar is unavailable (HTTP {status}). Access may have changed."
        ));
    }
    let (status, v) = request(&route)?;
    if status != 200 {
        return Err(format!("Calendar events unavailable (HTTP {status}). No availability is inferred from this error."));
    }
    let rows = v["value"]
        .as_array()
        .filter(|a| a.len() <= 1000)
        .ok_or("Invalid calendar events")?;
    let rows: Vec<Value> = rows
        .iter()
        .filter_map(|r| {
            if r["id"].as_str().is_none()
                || r["start"]["dateTime"].as_str().is_none()
                || r["end"]["dateTime"].as_str().is_none()
            {
                return None;
            }
            let private = r["sensitivity"] == "private" && meta["canViewPrivateItems"] != true;
            let mut out = json!({});
            let fields = if private {
                vec!["id", "start", "end", "isAllDay", "showAs", "isCancelled"]
            } else {
                vec![
                    "id",
                    "subject",
                    "start",
                    "end",
                    "isAllDay",
                    "showAs",
                    "isCancelled",
                    "organizer",
                    "location",
                    "attendees",
                    "bodyPreview",
                    "webLink",
                    "type",
                    "isOnlineMeeting",
                    "onlineMeeting",
                    "sensitivity",
                ]
            };
            for field in fields {
                if let Some(value) = r.get(field) {
                    out[field] = value.clone();
                }
            }
            if private {
                out["subject"] = json!("Busy");
                out["availabilityOnly"] = json!(true);
            }
            Some(out)
        })
        .collect();
    let next = v["@odata.nextLink"].as_str();
    if let Some(n) = next {
        continuation(n, &path)?;
    }
    Ok(json!({"value":rows,"next":next}))
}
#[cfg(test)]
mod tests {
    use super::*;
    const USER: &str = "22222222-2222-2222-2222-222222222222";
    #[test]
    fn person_consent_and_verified_identity_are_required() {
        assert!(person(USER, false, &mut |_| panic!()).is_err());
        assert!(person("../me", true, &mut |_| panic!()).is_err());
        assert!(person(USER, true, &mut |_| Ok((200, json!({"id":"different"})))).is_err());
        let mut calls = Vec::new();
        let result = person(USER, true, &mut |p| {
            calls.push(p.to_string());
            if p.contains("?$select=id,displayName") {
                Ok((
                    200,
                    json!({"id":USER,"displayName":"Coworker","userPrincipalName":"coworker@example.test"}),
                ))
            } else {
                Ok((403, Value::Null))
            }
        });
        assert!(result.unwrap_err().contains("no sharing request was sent"));
        assert_eq!(calls.len(), 2);
    }
    #[test]
    fn person_pages_are_scoped_and_private_events_redacted() {
        let source = format!("person:{USER}");
        assert!(routed_page(
            &source,
            "2026-11-25T00:00:00Z",
            "2026-11-26T00:00:00Z",
            None,
            true,
            false,
            true,
            &mut |_| panic!()
        )
        .is_err());
        let mut calls = Vec::new();
        let result=routed_page(&source,"2026-11-25T00:00:00Z","2026-11-26T00:00:00Z",None,true,true,true,&mut |p|{calls.push(p.to_string());if p.contains("/calendar?"){Ok((200,json!({"id":"owner-calendar","canViewPrivateItems":false})))}else{Ok((200,json!({"value":[{"id":"private","sensitivity":"private","subject":"secret","bodyPreview":"secret","start":{"dateTime":"2026-11-25T10:00:00"},"end":{"dateTime":"2026-11-25T11:00:00"}}]})))}}).unwrap();
        assert_eq!(result["value"][0]["subject"], "Busy");
        assert!(result["value"][0].get("bodyPreview").is_none());
        assert!(calls
            .iter()
            .all(|p| p.starts_with(&format!("/users/{USER}/calendar"))));
        assert!(routed_page(
            &source,
            "2026-11-25T00:00:00Z",
            "2026-11-26T00:00:00Z",
            Some("https://graph.microsoft.com/v1.0/me/calendarView?$skip=1"),
            true,
            true,
            true,
            &mut |_| panic!()
        )
        .is_err());
    }
    #[test]
    fn group_membership_is_verified_and_continuations_are_bounded() {
        assert!(groups(false, &mut |_| panic!()).is_err());
        assert!(groups(true, &mut |_| Ok((
            200,
            json!({"value":[],"@odata.nextLink":"https://evil.test/"})
        )))
        .is_err());
        let source = format!("group:{USER}");
        let mut calls = Vec::new();
        assert!(routed_page(
            &source,
            "2026-11-25T00:00:00Z",
            "2026-11-26T00:00:00Z",
            None,
            true,
            false,
            true,
            &mut |p| {
                calls.push(p.to_string());
                Ok((200, json!({"value":[]})))
            }
        )
        .is_err());
        assert_eq!(calls, vec!["/me/joinedTeams"]);
        calls.clear();
        let result = routed_page(
            &source,
            "2026-11-25T00:00:00Z",
            "2026-11-26T00:00:00Z",
            None,
            true,
            false,
            true,
            &mut |p| {
                calls.push(p.to_string());
                if p == "/me/joinedTeams" {
                    Ok((200, json!({"value":[{"id":USER,"displayName":"IT Team"}]})))
                } else {
                    Ok((200, json!({"value":[]})))
                }
            },
        )
        .unwrap();
        assert_eq!(result["value"], json!([]));
        assert!(calls[1].starts_with(&format!("/groups/{USER}/calendarView?")));
    }
    #[test]
    fn read_only_list_strips_write_metadata() {
        let v = sources(None, true, &mut |p| {
            assert!(p.starts_with("/me/calendars?"));
            Ok((
                200,
                json!({"value":[{"id":"x","name":"Shared","canEdit":true}]}),
            ))
        })
        .unwrap();
        assert!(v["value"][0].get("canEdit").is_none());
    }
    #[test]
    fn continuation_and_ranges_fail_before_reads() {
        for n in [
            "https://evil.test/v1.0/me/calendars",
            "https://graph.microsoft.com/v1.0/users/other/calendars",
            "https://graph.microsoft.com/v1.0/me/calendars/other/calendarView",
        ] {
            assert!(sources(Some(n), true, &mut |_| panic!()).is_err());
        }
        assert!(page("x", "bad", "bad", None, true, &mut |_| panic!()).is_err());
        assert!(sources(None, false, &mut |_| panic!()).is_err());
    }
    #[test]
    fn encoded_continuations_and_denial_are_explicit() {
        assert!(continuation(
            "https://graph.microsoft.com/v1.0/me/calendars/a=/calendarView?$skip=100",
            "/me/calendars/a%3D/calendarView"
        )
        .is_ok());
        assert!(page(
            "../other",
            "2026-11-25T00:00:00Z",
            "2026-11-26T00:00:00Z",
            None,
            true,
            &mut |_| panic!()
        )
        .is_err());
        let mut calls = 0;
        let result = page(
            "x",
            "2026-11-25T00:00:00Z",
            "2026-11-26T00:00:00Z",
            None,
            true,
            &mut |_| {
                calls += 1;
                Ok((403, Value::Null))
            },
        );
        assert!(result.is_err());
        assert_eq!(calls, 1);
    }
    #[test]
    fn private_events_are_redacted_and_paging_is_source_bound() {
        let v=page("x","2026-11-25T00:00:00Z","2026-11-26T00:00:00Z",None,true,&mut |p|Ok((200,if p.contains("calendarView"){json!({"value":[{"id":"secret","sensitivity":"private","subject":"Secret","bodyPreview":"Secret text","attendees":[{}],"start":{"dateTime":"2026-11-25T09:00:00"},"end":{"dateTime":"2026-11-25T10:00:00"}}]})}else{json!({"id":"x","canViewPrivateItems":false})}))).unwrap();
        assert_eq!(v["value"][0]["subject"], "Busy");
        assert!(v["value"][0].get("bodyPreview").is_none());
        assert!(continuation(
            "https://graph.microsoft.com/v1.0/me/calendars/y/calendarView?$skip=1",
            "/me/calendars/x/calendarView"
        )
        .is_err());
    }
}
