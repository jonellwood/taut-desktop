//! Explicit membership changes. A complete, freshly read roster is required.
use crate::deletion::{own_id, read, Request};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    pub team_id: String,
    pub channel_id: Option<String>,
    pub own_id: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Roster {
    pub rows: Vec<Value>,
    pub kind: String,
    pub can_manage: bool,
    pub reason: String,
}
fn enc(s: &str) -> Result<String, String> {
    if s.is_empty()
        || s.len() > 512
        || s.chars().any(|c| c.is_control() || "/\\?#".contains(c))
        || [".", ".."].contains(&s)
    {
        return Err("Invalid membership destination".into());
    }
    Ok(percent_encoding::utf8_percent_encode(s, percent_encoding::NON_ALPHANUMERIC).to_string())
}
fn opaque(value: &str) -> Result<String, String> {
    if value.is_empty()
        || value.len() > 1024
        || [".", ".."].contains(&value)
        || value.chars().any(char::is_control)
    {
        return Err("Invalid membership identifier".into());
    }
    Ok(
        percent_encoding::utf8_percent_encode(value, percent_encoding::NON_ALPHANUMERIC)
            .to_string(),
    )
}
fn complete(path: &str, request: &mut Request<'_>) -> Result<Vec<Value>, String> {
    let mut next = path.to_owned();
    let mut seen = std::collections::HashSet::new();
    let mut rows = vec![];
    loop {
        if !seen.insert(next.clone()) || seen.len() > 100 {
            return Err("Cannot verify a complete membership roster.".into());
        }
        let value = read(&next, request)?;
        rows.extend(
            value["value"]
                .as_array()
                .ok_or("Invalid membership roster")?
                .iter()
                .cloned(),
        );
        let Some(link) = value["@odata.nextLink"].as_str() else {
            break;
        };
        let u = url::Url::parse(link).map_err(|_| "Invalid membership continuation")?;
        if u.scheme() != "https"
            || u.host_str() != Some("graph.microsoft.com")
            || u.path() != format!("/v1.0{path}")
            || !u.username().is_empty()
            || u.password().is_some()
            || u.fragment().is_some()
            || u.port_or_known_default() != Some(443)
            || u.query_pairs()
                .any(|(k, _)| !["$skiptoken", "$skip", "$top"].contains(&k.as_ref()))
        {
            return Err("Unsafe membership continuation".into());
        }
        next = format!(
            "{path}{}",
            u.query().map(|q| format!("?{q}")).unwrap_or_default()
        );
    }
    let mut ids = std::collections::HashSet::new();
    if rows.iter().any(|r| {
        !r["id"].is_string()
            || !r["userId"].is_string()
            || !r["roles"].is_array()
            || !ids.insert(r["id"].as_str().unwrap().to_owned())
    }) {
        return Err("Incomplete or duplicate membership records.".into());
    }
    Ok(rows)
}
fn owner(row: &Value) -> bool {
    row["roles"]
        .as_array()
        .is_some_and(|roles| roles.iter().any(|r| r.as_str() == Some("owner")))
}
fn route(t: &Target, request: &mut Request<'_>) -> Result<(String, String, bool), String> {
    if !crate::presence::guid(&t.own_id) || !own_id(request)?.eq_ignore_ascii_case(&t.own_id) {
        return Err("Account changed; reopen membership settings.".into());
    }
    let team = enc(&t.team_id)?;
    let metadata = read(&format!("/teams/{team}"), request)?;
    if metadata["id"].as_str() != Some(t.team_id.as_str()) {
        return Err("Team identity was not verified.".into());
    }
    let archived = metadata["isArchived"].as_bool().unwrap_or(true);
    if let Some(id) = &t.channel_id {
        let channel = enc(id)?;
        let value = read(&format!("/teams/{team}/channels/{channel}"), request)?;
        if value["id"].as_str() != Some(id.as_str()) {
            return Err("Channel identity was not verified.".into());
        }
        let kind = value["membershipType"]
            .as_str()
            .ok_or("Channel type unavailable")?;
        if !["standard", "private", "shared"].contains(&kind) {
            return Err("Unsupported channel type".into());
        }
        if kind != "standard" {
            return Ok((
                format!("/teams/{team}/channels/{channel}/members"),
                kind.into(),
                archived || value["isArchived"].as_bool() == Some(true),
            ));
        }
    }
    Ok((
        format!("/teams/{team}/members"),
        "standard".into(),
        archived,
    ))
}
pub fn roster(
    t: &Target,
    team_read: bool,
    team_write: bool,
    channel_write: bool,
    request: &mut Request<'_>,
) -> Result<Roster, String> {
    let (path, kind, archived) = route(t, request)?;
    if kind == "standard" && !team_read {
        return Err("TeamMember.Read.All consent and a fresh sign-in are required.".into());
    }
    if kind != "standard" && !channel_write {
        return Err("ChannelMember.ReadWrite.All consent and a fresh sign-in are required.".into());
    }
    let rows = complete(&path, request)?;
    let owns = rows.iter().any(|r| {
        r["userId"]
            .as_str()
            .is_some_and(|id| id.eq_ignore_ascii_case(&t.own_id))
            && owner(r)
    });
    let can_manage = owns
        && !archived
        && if kind == "standard" {
            team_write
        } else {
            channel_write
        };
    let reason = if archived {
        "Archived destinations are read-only."
    } else if !owns {
        "Only a current owner can manage other members here."
    } else if !can_manage {
        "Membership write consent and a fresh sign-in are required."
    } else if kind == "standard" {
        "Changes affect the entire team and its standard channels. Owner-role changes are not supported."
    } else {
        "Only direct members are managed here. Inherited shared access stays at its source; owner-role changes are not supported."
    };
    Ok(Roster {
        rows,
        kind,
        can_manage,
        reason: reason.into(),
    })
}
pub fn change(
    t: &Target,
    action: &str,
    user_id: &str,
    member_id: &str,
    team_read: bool,
    team_write: bool,
    channel_write: bool,
    request: &mut Request<'_>,
) -> Result<Value, String> {
    if !["add", "remove"].contains(&action) || !crate::presence::guid(user_id) {
        return Err("Choose an identifiable coworker.".into());
    }
    let roster = roster(t, team_read, team_write, channel_write, request)?;
    let leaving = action == "remove" && user_id.eq_ignore_ascii_case(&t.own_id);
    if !roster.can_manage && !leaving {
        return Err(roster.reason);
    }
    let (path, kind, archived) = route(t, request)?;
    if archived
        || !(if kind == "standard" {
            team_write
        } else {
            channel_write
        })
    {
        return Err("Membership changes are unavailable.".into());
    }
    let existing = roster.rows.iter().find(|r| {
        r["userId"]
            .as_str()
            .is_some_and(|id| id.eq_ignore_ascii_case(user_id))
    });
    let (method, destination, body) = if action == "add" {
        if existing.is_some() {
            return Err("This coworker already has direct membership.".into());
        }
        let person = read(
            &format!("/users/{user_id}?$select=id,userPrincipalName"),
            request,
        )?;
        if !crate::presence::directory_coworker(&person, user_id) {
            return Err(
                "Only verified internal coworkers can be added in TAUT. Use Teams for guests."
                    .into(),
            );
        }
        if kind == "private" {
            let parent = complete(&format!("/teams/{}/members", enc(&t.team_id)?), request)?;
            if !parent.iter().any(|r| r["userId"].as_str() == Some(user_id)) {
                return Err(
                    "Add this coworker to the parent team before its private channel.".into(),
                );
            }
        }
        (
            Method::POST,
            path,
            Some(
                json!({"@odata.type":"#microsoft.graph.aadUserConversationMember","roles":[],"user@odata.bind":format!("https://graph.microsoft.com/v1.0/users('{user_id}')")}),
            ),
        )
    } else {
        let row = existing.ok_or("This member is no longer in the direct roster.")?;
        if row["id"].as_str() != Some(member_id)
            || row["@microsoft.graph.originalSourceMembershipUrl"].is_string()
            || owner(row)
            || row["roles"]
                .as_array()
                .is_some_and(|a| a.iter().any(|v| v.as_str() != Some("guest")))
        {
            return Err(
                "Owner, inherited or changed membership cannot be removed here. Use Teams.".into(),
            );
        }
        (
            Method::DELETE,
            format!("{path}/{}", opaque(member_id)?),
            None,
        )
    };
    match request(method, &destination, body) {
        Ok(r) if r.status == 201 || r.status == 204 => Ok(json!({"status":"confirmed"})),
        _ => Ok(
            json!({"status":"uncertain","error":"Membership change was not confirmed. Refresh the roster or check Teams before another action. TAUT will not repeat it automatically."}),
        ),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::groups::Reply;
    const ME: &str = "11111111-1111-1111-1111-111111111111";
    const OTHER: &str = "22222222-2222-2222-2222-222222222222";
    fn target() -> Target {
        Target {
            team_id: "team".into(),
            channel_id: Some("channel".into()),
            own_id: ME.into(),
        }
    }
    fn response(path: &str, kind: &str, owns: bool) -> Value {
        if path.starts_with("/me?") {
            json!({"id":ME})
        } else if path == "/teams/team" {
            json!({"id":"team","isArchived":false})
        } else if path == "/teams/team/channels/channel" {
            json!({"id":"channel","membershipType":kind,"isArchived":false})
        } else if path.starts_with("/users/") {
            json!({"id":OTHER,"userPrincipalName":"coworker@example.com"})
        } else {
            json!({"value":[{"id":"owner","userId":ME,"roles":if owns{vec!["owner"]}else{vec![]}},{"id":"target","userId":OTHER,"roles":[]}]})
        }
    }
    #[test]
    fn standard_remove_routes_to_parent_team_and_no_write_retry() {
        let mut writes = vec![];
        let r = change(
            &target(),
            "remove",
            OTHER,
            "target",
            true,
            true,
            true,
            &mut |m, p, _| {
                if m == Method::GET {
                    Ok(Reply {
                        status: 200,
                        body: response(p, "standard", true),
                    })
                } else {
                    writes.push(p.to_owned());
                    Err("timeout".into())
                }
            },
        )
        .unwrap();
        assert_eq!(r["status"], "uncertain");
        assert_eq!(writes, vec!["/teams/team/members/target"]);
    }
    #[test]
    fn non_owner_cannot_remove_others_and_owners_cannot_be_removed() {
        for (owns, user, member) in [(false, OTHER, "target"), (true, ME, "owner")] {
            let r = change(
                &target(),
                "remove",
                user,
                member,
                true,
                true,
                true,
                &mut |m, p, _| {
                    assert_eq!(m, Method::GET);
                    Ok(Reply {
                        status: 200,
                        body: response(p, "private", owns),
                    })
                },
            );
            assert!(r.is_err());
        }
    }
    #[test]
    fn private_and_shared_remove_route_to_direct_channel_members() {
        for kind in ["private", "shared"] {
            let mut writes = 0;
            let r = change(
                &target(),
                "remove",
                OTHER,
                "target",
                true,
                true,
                true,
                &mut |m, p, _| {
                    if m == Method::GET {
                        Ok(Reply {
                            status: 200,
                            body: response(p, kind, true),
                        })
                    } else {
                        writes += 1;
                        assert_eq!(p, "/teams/team/channels/channel/members/target");
                        Ok(Reply {
                            status: 204,
                            body: Value::Null,
                        })
                    }
                },
            )
            .unwrap();
            assert_eq!(writes, 1);
            assert_eq!(r["status"], "confirmed");
        }
    }
    #[test]
    fn incomplete_rosters_and_foreign_continuations_block_writes() {
        for link in [
            "https://evil.invalid/v1.0/teams/team/members?$skiptoken=x",
            "https://graph.microsoft.com/v1.0/teams/other/members?$skiptoken=x",
        ] {
            assert!(roster(&target(), true, true, true, &mut |m, p, _| {
                assert_eq!(m, Method::GET);
                let mut v = response(p, "standard", true);
                if p.ends_with("/members") {
                    v["@odata.nextLink"] = json!(link);
                }
                Ok(Reply {
                    status: 200,
                    body: v,
                })
            })
            .is_err());
        }
    }
    #[test]
    fn inherited_members_are_not_removable() {
        assert!(change(
            &target(),
            "remove",
            OTHER,
            "target",
            true,
            true,
            true,
            &mut |m, p, _| {
                assert_eq!(m, Method::GET);
                let mut v = response(p, "shared", true);
                if p.ends_with("/members") {
                    v["value"][1]["@microsoft.graph.originalSourceMembershipUrl"] =
                        json!("https://example.invalid/source");
                }
                Ok(Reply {
                    status: 200,
                    body: v,
                })
            }
        )
        .is_err());
    }
}
#[cfg(test)]
mod add_tests {
    use super::*;
    use crate::groups::Reply;
    const ME: &str = "11111111-1111-1111-1111-111111111111";
    const OTHER: &str = "22222222-2222-2222-2222-222222222222";
    #[test]
    fn add_is_explicit_and_uses_directory_id_not_freeform_bind_url() {
        let t = Target {
            team_id: "team".into(),
            channel_id: None,
            own_id: ME.into(),
        };
        let mut writes = 0;
        let r = change(
            &t,
            "add",
            OTHER,
            "",
            true,
            true,
            false,
            &mut |method, path, body| {
                if method == Method::POST {
                    writes += 1;
                    assert_eq!(path, "/teams/team/members");
                    assert_eq!(
                        body.unwrap()["user@odata.bind"],
                        format!("https://graph.microsoft.com/v1.0/users('{OTHER}')")
                    );
                    return Ok(Reply {
                        status: 201,
                        body: json!({"id":"new"}),
                    });
                }
                Ok(Reply {
                    status: 200,
                    body: if path.starts_with("/me?") {
                        json!({"id":ME})
                    } else if path.starts_with("/users/") {
                        json!({"id":OTHER,"userPrincipalName":"coworker@example.com"})
                    } else if path.ends_with("/members") {
                        json!({"value":[{"id":"owner","userId":ME,"roles":["owner"]}]})
                    } else {
                        json!({"id":"team","isArchived":false})
                    },
                })
            },
        )
        .unwrap();
        assert_eq!(writes, 1);
        assert_eq!(r["status"], "confirmed");
    }
    #[test]
    fn basic_profile_verification_rejects_guest_style_and_mismatched_users() {
        assert!(!crate::presence::directory_coworker(
            &json!({"id":OTHER,"userPrincipalName":"person_example.com#EXT#@tenant.onmicrosoft.com"}),
            OTHER
        ));
        assert!(!crate::presence::directory_coworker(
            &json!({"id":ME,"userPrincipalName":"a@example.com"}),
            OTHER
        ));
        assert!(crate::presence::directory_coworker(
            &json!({"id":OTHER,"userPrincipalName":"a@example.com"}),
            OTHER
        ));
        assert_eq!(opaque("opaque/id=").unwrap(), "opaque%2Fid%3D");
    }
}
