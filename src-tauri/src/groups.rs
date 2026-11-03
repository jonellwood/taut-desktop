//! Group operations use an injected Graph boundary. No selection calls these writes.
use reqwest::Method;
use serde_json::{json, Value};
use std::collections::HashSet;

pub struct Reply {
    pub status: u16,
    pub body: Value,
}
pub type Request<'a> = dyn FnMut(Method, &str, Option<Value>) -> Result<Reply, String> + 'a;
fn enc(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}
fn guid(id: &str) -> bool {
    id.len() == 36
        && id.chars().enumerate().all(|(i, c)| {
            if [8, 13, 18, 23].contains(&i) {
                c == '-'
            } else {
                c.is_ascii_hexdigit()
            }
        })
}
fn read(path: &str, request: &mut Request<'_>) -> Result<Value, String> {
    let reply = request(Method::GET, path, None)?;
    if reply.status != 200 {
        return Err(format!(
            "Group lookup returned HTTP {}. No membership change was attempted.",
            reply.status
        ));
    }
    Ok(reply.body)
}
fn own_id(request: &mut Request<'_>) -> Result<String, String> {
    let me = read("/me?$select=id", request)?;
    me["id"]
        .as_str()
        .filter(|id| guid(id))
        .map(str::to_owned)
        .ok_or("Cannot verify your signed-in identity".into())
}
fn user(id: &str, request: &mut Request<'_>) -> Result<String, String> {
    let user = read(
        &format!("/users/{}?$select=id,userPrincipalName", enc(id)),
        request,
    )?;
    let resolved = user["id"]
        .as_str()
        .filter(|s| s.eq_ignore_ascii_case(id))
        .ok_or("Could not verify the selected coworker")?;
    if user["userPrincipalName"]
        .as_str()
        .unwrap_or("")
        .to_lowercase()
        .contains("#ext#")
    {
        return Err("Guest invitations are not supported in TAUT group management yet. Use Teams for this participant.".into());
    }
    Ok(resolved.to_owned())
}
pub fn create(
    recipients: &[String],
    topic: &str,
    first_message: &str,
    expected_own_id: &str,
    request: &mut Request<'_>,
) -> Result<Value, String> {
    if first_message.trim().is_empty() || first_message.trim().chars().count() > 4000 {
        return Err("Write a first message of 1–4000 characters before creating the group".into());
    }
    let topic = topic.trim();
    if topic.chars().count() > 250 || topic.contains(':') || topic.chars().any(char::is_control) {
        return Err(
            "Group name must be at most 250 characters without colons or control characters".into(),
        );
    }
    if !(2..=19).contains(&recipients.len()) || !guid(expected_own_id) {
        return Err("Choose 2–19 other coworkers for a group".into());
    }
    let mut unique = HashSet::new();
    for id in recipients {
        if !guid(id)
            || id.eq_ignore_ascii_case(expected_own_id)
            || !unique.insert(id.to_lowercase())
        {
            return Err("Choose distinct coworkers other than yourself".into());
        }
    }
    let own = own_id(request)?;
    if !own.eq_ignore_ascii_case(expected_own_id) {
        return Err("Signed-in identity changed; reopen the group draft".into());
    }
    let mut ids = vec![own];
    for id in recipients {
        ids.push(user(id, request)?);
    }
    let mut payload = json!({"chatType":"group","members":ids.iter().map(|id|json!({
        "@odata.type":"#microsoft.graph.aadUserConversationMember","roles":["owner"],
        "user@odata.bind":format!("https://graph.microsoft.com/v1.0/users('{id}')")
    })).collect::<Vec<_>>()});
    if !topic.is_empty() {
        payload["topic"] = json!(topic);
    }
    let reply=request(Method::POST,"/chats",Some(payload))
        .map_err(|_|"Group creation was not confirmed. It may already exist. Check Teams and refresh before explicitly trying again.".to_owned())?;
    if reply.status != 201
        || reply.body["id"]
            .as_str()
            .filter(|id| !id.is_empty())
            .is_none()
    {
        return Err(format!("Group creation was not confirmed (HTTP {}). Check Teams and refresh before another creation attempt.",reply.status));
    }
    Ok(reply.body)
}
fn current_group(chat_id: &str, request: &mut Request<'_>) -> Result<Value, String> {
    if chat_id.is_empty() || chat_id.len() > 512 || chat_id.starts_with("pending:") {
        return Err("Choose an existing group chat".into());
    }
    let chat = read(
        &format!("/chats/{}?$select=id,chatType", enc(chat_id)),
        request,
    )?;
    if chat["chatType"].as_str() != Some("group") {
        return Err("Membership changes are only supported for group chats".into());
    }
    let own = own_id(request)?;
    let members = read(&format!("/chats/{}/members", enc(chat_id)), request)?;
    if members.get("@odata.nextLink").is_some() {
        return Err("The member list is incomplete. Use Teams to manage this group.".into());
    }
    let rows = members["value"]
        .as_array()
        .ok_or("Cannot verify group members")?;
    if !rows.iter().any(|m| {
        m["userId"]
            .as_str()
            .map(|id| id.eq_ignore_ascii_case(&own))
            .unwrap_or(false)
    }) {
        return Err("You are no longer a member of this group".into());
    }
    Ok(members)
}
pub fn add(
    permitted: bool,
    chat_id: &str,
    recipient: &str,
    history: &str,
    request: &mut Request<'_>,
) -> Result<(), String> {
    if !permitted {
        return Err("Member management needs delegated ChatMember.ReadWrite permission. Sign in again after approval and consent.".into());
    }
    if !guid(recipient) || !["none", "all"].contains(&history) {
        return Err("Choose a coworker and a conversation history option".into());
    }
    let members = current_group(chat_id, request)?;
    if members["value"].as_array().unwrap().iter().any(|m| {
        m["userId"]
            .as_str()
            .map(|id| id.eq_ignore_ascii_case(recipient))
            .unwrap_or(false)
    }) {
        return Ok(());
    }
    if members["value"].as_array().unwrap().len() >= 20 {
        return Err("TAUT currently supports groups with up to 20 members".into());
    }
    let recipient = user(recipient, request)?;
    let mut body = json!({"@odata.type":"#microsoft.graph.aadUserConversationMember","roles":["owner"],
        "user@odata.bind":format!("https://graph.microsoft.com/v1.0/users('{recipient}')")});
    // Microsoft documents omission as sharing no history, and year 0001 as all history.
    if history == "all" {
        body["visibleHistoryStartDateTime"] = json!("0001-01-01T00:00:00Z");
    }
    let reply = request(
        Method::POST,
        &format!("/chats/{}/members", enc(chat_id)),
        Some(body),
    )
    .map_err(|_| {
        "Adding the member was not confirmed. Refresh members and check Teams before retrying."
            .to_owned()
    })?;
    // Graph returns 201 with a Location header; an empty body is valid.
    if reply.status != 201 {
        return Err(format!(
            "Adding the member was not confirmed (HTTP {}). Refresh members before trying again.",
            reply.status
        ));
    }
    Ok(())
}
pub fn remove(
    permitted: bool,
    chat_id: &str,
    membership_id: &str,
    request: &mut Request<'_>,
) -> Result<(), String> {
    if !permitted {
        return Err("Member management needs delegated ChatMember.ReadWrite permission. Sign in again after approval and consent.".into());
    }
    if membership_id.is_empty()
        || membership_id.len() > 2048
        || membership_id.chars().any(char::is_control)
    {
        return Err("Invalid membership identifier".into());
    }
    let members = current_group(chat_id, request)?;
    if !members["value"]
        .as_array()
        .unwrap()
        .iter()
        .any(|m| m["id"].as_str() == Some(membership_id))
    {
        return Err("That membership is no longer in the group. Refresh members.".into());
    }
    // Membership IDs are opaque Graph strings, not Entra user IDs.
    let reply = request(
        Method::DELETE,
        &format!("/chats/{}/members/{}", enc(chat_id), enc(membership_id)),
        None,
    )
    .map_err(|_| {
        "Removal was not confirmed. Refresh members or check Teams before retrying.".to_owned()
    })?;
    if reply.status != 204 {
        return Err(format!(
            "Removal was not confirmed (HTTP {}). Refresh members or check Teams before retrying.",
            reply.status
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    const ME: &str = "11111111-1111-1111-1111-111111111111";
    const A: &str = "22222222-2222-2222-2222-222222222222";
    const B: &str = "33333333-3333-3333-3333-333333333333";
    const C: &str = "44444444-4444-4444-4444-444444444444";
    const MEMBER: &str = "opaque:/+=membership";
    struct Graph {
        calls: Vec<(Method, String, Option<Value>)>,
        chat_type: &'static str,
        paged: bool,
        fail_write: bool,
        missing_id: bool,
        guest: bool,
        own_present: bool,
    }
    impl Default for Graph {
        fn default() -> Self {
            Self {
                calls: vec![],
                chat_type: "group",
                paged: false,
                fail_write: false,
                missing_id: false,
                guest: false,
                own_present: true,
            }
        }
    }
    impl Graph {
        fn request(&mut self, m: Method, p: &str, b: Option<Value>) -> Result<Reply, String> {
            self.calls.push((m.clone(), p.to_owned(), b));
            if m == Method::POST || m == Method::DELETE {
                if self.fail_write {
                    return Err("timeout".into());
                }
                return Ok(Reply {
                    status: if m == Method::DELETE { 204 } else { 201 },
                    body: if p == "/chats" && !self.missing_id {
                        json!({"id":"created","chatType":"group"})
                    } else {
                        Value::Null
                    },
                });
            }
            let body = if p == "/me?$select=id" {
                json!({"id":ME})
            } else if p.starts_with("/users/") {
                let id = p
                    .strip_prefix("/users/")
                    .unwrap()
                    .split('?')
                    .next()
                    .unwrap();
                json!({"id":id,"userPrincipalName":if self.guest {"guest#EXT#@example.com"} else {"coworker@example.com"}})
            } else if p.contains("?$select=id,chatType") {
                json!({"id":"chat","chatType":self.chat_type})
            } else if p.ends_with("/members") {
                let mut rows = vec![
                    json!({"id":MEMBER,"userId":A}),
                    json!({"id":"member-b","userId":B}),
                ];
                if self.own_present {
                    rows.push(json!({"id":"self-member","userId":ME}));
                }
                let mut value = json!({"value":rows});
                if self.paged {
                    value["@odata.nextLink"] = json!("next");
                }
                value
            } else {
                panic!("unexpected {m} {p}")
            };
            Ok(Reply { status: 200, body })
        }
        fn writes(&self) -> usize {
            self.calls.iter().filter(|c| c.0 != Method::GET).count()
        }
    }
    #[test]
    fn invalid_group_inputs_never_reach_graph() {
        for recipients in [
            vec![],
            vec![A.into()],
            vec![A.into(), A.into()],
            vec![A.into(), ME.into()],
            vec!["invalid".into(), B.into()],
        ] {
            assert!(create(&recipients, "Team", "Hi", ME, &mut |_, _, _| panic!()).is_err());
        }
        for text in ["".to_owned(), " ".into(), "x".repeat(4001)] {
            assert!(create(
                &[A.into(), B.into()],
                "Team",
                &text,
                ME,
                &mut |_, _, _| panic!()
            )
            .is_err());
        }
        assert!(create(
            &[A.into(), B.into()],
            "Bad:name",
            "Hi",
            ME,
            &mut |_, _, _| panic!()
        )
        .is_err());
    }
    #[test]
    fn group_payload_includes_self_and_verified_distinct_members_without_message() {
        let mut g = Graph::default();
        let result = create(&[A.into(), B.into()], " Team ", "Hi", ME, &mut |m, p, b| {
            g.request(m, p, b)
        })
        .unwrap();
        assert_eq!(result["id"], "created");
        assert_eq!(g.writes(), 1);
        let body = g.calls.last().unwrap().2.as_ref().unwrap();
        assert_eq!(body["chatType"], "group");
        assert_eq!(body["topic"], "Team");
        assert_eq!(body["members"].as_array().unwrap().len(), 3);
        assert!(body.get("body").is_none());
        assert!(body["members"][0]["user@odata.bind"]
            .as_str()
            .unwrap()
            .contains(ME));
    }
    #[test]
    fn group_creation_failure_is_never_automatically_retried() {
        for missing_id in [false, true] {
            let mut g = Graph {
                fail_write: !missing_id,
                missing_id,
                ..Default::default()
            };
            assert!(create(&[A.into(), B.into()], "", "Hi", ME, &mut |m, p, b| g
                .request(m, p, b))
            .is_err());
            assert_eq!(g.writes(), 1);
        }
    }
    #[test]
    fn permission_guards_make_zero_requests() {
        assert!(add(false, "chat", C, "none", &mut |_, _, _| panic!()).is_err());
        assert!(remove(false, "chat", MEMBER, &mut |_, _, _| panic!()).is_err());
    }
    #[test]
    fn add_accepts_empty_201_and_shares_history_only_when_selected() {
        for history in ["none", "all"] {
            let mut g = Graph::default();
            add(true, "chat", C, history, &mut |m, p, b| g.request(m, p, b)).unwrap();
            assert_eq!(g.writes(), 1);
            let body = g.calls.last().unwrap().2.as_ref().unwrap();
            assert_eq!(
                body.get("visibleHistoryStartDateTime")
                    .and_then(Value::as_str),
                if history == "all" {
                    Some("0001-01-01T00:00:00Z")
                } else {
                    None
                }
            );
            assert!(body["user@odata.bind"].as_str().unwrap().contains(C));
        }
    }
    #[test]
    fn adding_an_existing_member_is_read_only() {
        let mut g = Graph::default();
        add(true, "chat", A, "none", &mut |m, p, b| g.request(m, p, b)).unwrap();
        assert_eq!(g.writes(), 0);
    }
    #[test]
    fn removal_uses_opaque_membership_id_and_leave_uses_the_same_endpoint() {
        for membership in [MEMBER, "self-member"] {
            let mut g = Graph::default();
            remove(true, "chat", membership, &mut |m, p, b| g.request(m, p, b)).unwrap();
            let last = g.calls.last().unwrap();
            assert_eq!(last.0, Method::DELETE);
            assert_eq!(last.1, format!("/chats/chat/members/{}", enc(membership)));
            assert!(last.2.is_none());
        }
    }
    #[test]
    fn wrong_chat_missing_self_incomplete_members_and_unknown_membership_never_write() {
        for mut g in [
            Graph {
                chat_type: "oneOnOne",
                ..Default::default()
            },
            Graph {
                paged: true,
                ..Default::default()
            },
            Graph {
                own_present: false,
                ..Default::default()
            },
        ] {
            assert!(add(true, "chat", C, "none", &mut |m, p, b| g.request(m, p, b)).is_err());
            assert_eq!(g.writes(), 0);
            assert!(remove(true, "chat", MEMBER, &mut |m, p, b| g.request(m, p, b)).is_err());
            assert_eq!(g.writes(), 0);
        }
        let mut g = Graph::default();
        assert!(remove(true, "chat", "wrong", &mut |m, p, b| g.request(m, p, b)).is_err());
        assert_eq!(g.writes(), 0);
    }
    #[test]
    fn ambiguous_membership_changes_are_never_retried() {
        let mut g = Graph {
            fail_write: true,
            ..Default::default()
        };
        assert!(add(true, "chat", C, "none", &mut |m, p, b| g.request(m, p, b)).is_err());
        assert_eq!(g.writes(), 1);
        assert!(remove(true, "chat", MEMBER, &mut |m, p, b| g.request(m, p, b)).is_err());
        assert_eq!(g.writes(), 2);
    }
    #[test]
    fn unsupported_guest_is_rejected_before_mutation() {
        let mut g = Graph {
            guest: true,
            ..Default::default()
        };
        assert!(create(&[A.into(), B.into()], "", "Hi", ME, &mut |m, p, b| g
            .request(m, p, b))
        .is_err());
        assert_eq!(g.writes(), 0);
        assert!(add(true, "chat", C, "none", &mut |m, p, b| g.request(m, p, b)).is_err());
        assert_eq!(g.writes(), 0);
    }
}
