//! Read-only Teams collections. Every continuation stays on the selected resource.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use url::Url;
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Collection {
    Joined,
    Associated,
    Channels,
    Shared,
    Posts,
    Replies,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Query {
    pub collection: Collection,
    pub team_id: Option<String>,
    pub channel_id: Option<String>,
    pub message_id: Option<String>,
    pub next: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Permissions {
    pub teams: bool,
    pub channels: bool,
    pub messages: bool,
}
impl Permissions {
    pub fn from_scopes(scopes: &str) -> Self {
        let has = |name: &str| {
            scopes
                .split_whitespace()
                .any(|s| s.eq_ignore_ascii_case(name))
        };
        Self {
            teams: has("Team.ReadBasic.All"),
            channels: has("Channel.ReadBasic.All"),
            messages: has("ChannelMessage.Read.All"),
        }
    }
}
fn id(value: Option<&str>) -> Result<&str, String> {
    value
        .filter(|s| {
            !s.is_empty()
                && s.len() <= 512
                && *s != "."
                && *s != ".."
                && !s.chars().any(|c| c.is_control() || "/\\?#".contains(c))
        })
        .ok_or_else(|| "Invalid Teams resource identifier".into())
}
fn enc(value: &str) -> String {
    percent_encoding::utf8_percent_encode(value, percent_encoding::NON_ALPHANUMERIC).to_string()
}

fn decode(value: &str) -> Result<String, String> {
    let bytes = value.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let part = value.get(i + 1..i + 3).ok_or("Invalid Graph path")?;
            out.push(u8::from_str_radix(part, 16).map_err(|_| "Invalid Graph path")?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|_| "Invalid Graph path".into())
}
fn continuation(value: &str, expected: &str) -> Result<String, String> {
    if value.len() > 16384 || value.chars().any(char::is_control) || !value.starts_with("https://")
    {
        return Err("Invalid Graph continuation".into());
    }
    let url = Url::parse(value).map_err(|_| "Invalid Graph continuation")?;
    if url.scheme() != "https"
        || url.host_str() != Some("graph.microsoft.com")
        || url.port_or_known_default() != Some(443)
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || decode(url.path())? != decode(&format!("/v1.0{expected}"))?
    {
        return Err("Graph continuation does not match the selected Teams resource".into());
    }
    if url.query_pairs().any(|(key, _)| {
        !["$skiptoken", "$skip", "$top", "$select", "$filter"].contains(&key.as_ref())
    }) {
        return Err("Unsupported Graph continuation query".into());
    }
    Ok(format!(
        "{}{}",
        url.path()
            .strip_prefix("/v1.0")
            .ok_or("Invalid Graph version")?,
        url.query().map(|q| format!("?{q}")).unwrap_or_default()
    ))
}
fn route(query: &Query, permissions: &Permissions) -> Result<(String, String), String> {
    use Collection::*;
    let allowed = match query.collection {
        Joined | Associated => permissions.teams,
        Channels | Shared => permissions.channels,
        Posts | Replies => permissions.messages,
    };
    if !allowed {
        return Err("Teams access needs the approved delegated read permissions. Grant consent and sign in again.".into());
    }
    if matches!(query.collection, Joined) {
        return Ok(("/me/joinedTeams".into(), String::new()));
    }
    if matches!(query.collection, Associated) {
        return Ok(("/me/teamwork/associatedTeams".into(), String::new()));
    }
    let team = enc(id(query.team_id.as_deref())?);
    if matches!(query.collection, Channels | Shared) {
        let path = format!(
            "/teams/{team}/{}",
            if matches!(query.collection, Shared) {
                "allChannels"
            } else {
                "channels"
            }
        );
        // Omitting expensive email/moderation fields; @odata.id carries shared-channel host identity.
        return Ok((
            path,
            "?$select=id,displayName,description,membershipType,tenantId,isArchived".into(),
        ));
    }
    let channel = enc(id(query.channel_id.as_deref())?);
    let root = format!("/teams/{team}/channels/{channel}/messages");
    if matches!(query.collection, Posts) {
        return Ok((root, "?$top=50".into()));
    }
    Ok((
        format!("{root}/{}/replies", enc(id(query.message_id.as_deref())?)),
        "?$top=50".into(),
    ))
}
fn host_team(row: &Value, fallback: &str, require_host: bool) -> Option<String> {
    let Some(address) = row["@odata.id"].as_str() else {
        return (!require_host).then(|| fallback.to_owned());
    };
    let url = Url::parse(address).ok()?;
    if url.scheme() != "https"
        || url.host_str() != Some("graph.microsoft.com")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.port_or_known_default() != Some(443)
    {
        return None;
    }
    let parts = url.path_segments()?.collect::<Vec<_>>();
    let team_pos = if parts.len() == 5 && parts[0] == "v1.0" {
        1
    } else if parts.len() == 7 && parts[0] == "v1.0" && parts[1] == "tenants" {
        3
    } else {
        return None;
    };
    if parts[team_pos] != "teams" || parts[team_pos + 2] != "channels" {
        return None;
    }
    if decode(parts[team_pos + 3]).ok()?.as_str() != row["id"].as_str()? {
        return None;
    }
    let host = decode(parts[team_pos + 1]).ok()?;
    id(Some(&host)).ok()?;
    Some(host)
}
pub fn page(
    query: &Query,
    permissions: &Permissions,
    read: &mut impl FnMut(&str) -> Result<(u16, Value), String>,
) -> Result<Value, String> {
    let (path, params) = route(query, permissions)?;
    let target = match query.next.as_deref() {
        Some(next) => continuation(next, &path)?,
        None => format!("{path}{params}"),
    };
    let (status, body) = read(&target).map_err(|_| {
        "Teams could not be loaded. Check your connection and try Refresh.".to_owned()
    })?;
    match status {
        200 => {}
        401 => return Err("Teams sign-in expired. Reconnect to Microsoft 365.".into()),
        403 => {
            return Err(
                "Access denied (HTTP 403). Check consent and your channel membership.".into(),
            )
        }
        404 => return Err("This team, channel or thread is unavailable (HTTP 404).".into()),
        429 => {
            return Err("Microsoft is limiting requests (HTTP 429). Wait before refreshing.".into())
        }
        _ => return Err(format!("Teams read returned HTTP {status}. Try Refresh.")),
    }
    let mut rows = body["value"]
        .as_array()
        .ok_or("Invalid Teams collection response")?
        .clone();
    if rows.len() > 1000 {
        return Err("Teams response exceeded the page limit".into());
    }
    if matches!(query.collection, Collection::Channels | Collection::Shared) {
        let fallback = query.team_id.as_deref().unwrap_or("");
        for row in &mut rows {
            let host = host_team(
                row,
                fallback,
                matches!(query.collection, Collection::Shared) || row["membershipType"] == "shared",
            );
            if let Some(object) = row.as_object_mut() {
                object.insert(
                    "hostTeamId".into(),
                    host.map(Value::String).unwrap_or(Value::Null),
                );
            }
        }
    }
    let next = match body.get("@odata.nextLink") {
        Some(Value::String(next)) => {
            let normalized = continuation(next, &path)?;
            if normalized == target {
                return Err("Repeated Graph continuation; refresh this list.".into());
            }
            Some(next.clone())
        }
        Some(Value::Null) | None => None,
        _ => return Err("Invalid Graph continuation".into()),
    };
    Ok(json!({"value":rows,"next":next}))
}
#[cfg(test)]
mod tests {
    use super::*;
    fn permissions() -> Permissions {
        Permissions::from_scopes("Team.ReadBasic.All Channel.ReadBasic.All ChannelMessage.Read.All")
    }
    fn query(collection: Collection) -> Query {
        Query {
            collection,
            team_id: Some("team".into()),
            channel_id: Some("19:channel@thread.tacv2".into()),
            message_id: Some("post".into()),
            next: None,
        }
    }
    #[test]
    fn scopes_are_actual_and_independent() {
        let p = Permissions::from_scopes("Chat.Read Chat.ReadWrite");
        assert!(!p.teams && !p.channels && !p.messages);
        let p = Permissions::from_scopes("team.readbasic.all");
        assert!(p.teams && !p.messages);
    }
    #[test]
    fn every_collection_is_read_only_and_routes_correctly() {
        for (kind, end) in [
            (Collection::Joined, "joinedTeams"),
            (Collection::Associated, "associatedTeams"),
            (Collection::Channels, "channels"),
            (Collection::Shared, "allChannels"),
            (Collection::Posts, "messages"),
            (Collection::Replies, "replies"),
        ] {
            let mut seen = vec![];
            page(&query(kind), &permissions(), &mut |p| {
                seen.push(p.to_owned());
                Ok((200, json!({"value":[]})))
            })
            .unwrap();
            assert_eq!(seen.len(), 1);
            assert!(seen[0].split('?').next().unwrap().ends_with(end));
        }
    }
    #[test]
    fn denied_permissions_and_invalid_ids_never_request() {
        assert!(page(
            &query(Collection::Posts),
            &Permissions::from_scopes(""),
            &mut |_| panic!("No HTTP")
        )
        .is_err());
        for bad in ["", "../bad", "bad\\id", "bad?x", "bad\n", ".", ".."] {
            let mut q = query(Collection::Posts);
            q.team_id = Some(bad.into());
            assert!(page(&q, &permissions(), &mut |_| panic!("No HTTP")).is_err());
        }
    }
    #[test]
    fn ids_are_encoded_not_interpolated() {
        let mut q = query(Collection::Replies);
        q.message_id = Some("post & spaces".into());
        page(&q, &permissions(), &mut |p| {
            assert!(p.contains("19%3Achannel%40thread%2Etacv2"));
            assert!(p.contains("post%20%26%20spaces"));
            Ok((200, json!({"value":[]})))
        })
        .unwrap();
    }
    #[test]
    fn unsafe_continuations_never_request() {
        for bad in [
            "https://evil.test/v1.0/me/joinedTeams",
            "http://graph.microsoft.com/v1.0/me/joinedTeams",
            "https://graph.microsoft.com:444/v1.0/me/joinedTeams",
            "https://u@graph.microsoft.com/v1.0/me/joinedTeams",
            "https://graph.microsoft.com/beta/me/joinedTeams",
            "https://graph.microsoft.com/v1.0/users",
            "https://graph.microsoft.com/v1.0/me/joinedTeams#secret",
            "https://graph.microsoft.com/v1.0/me/joinedTeams?$expand=members",
        ] {
            let mut q = query(Collection::Joined);
            q.next = Some(bad.into());
            assert!(page(&q, &permissions(), &mut |_| panic!("No HTTP")).is_err());
        }
    }
    #[test]
    fn pagination_is_resource_bound_and_cycles_rejected() {
        let next = "https://graph.microsoft.com/v1.0/me/joinedTeams?$skiptoken=next";
        let mut q = query(Collection::Joined);
        q.next = Some(next.into());
        let v = page(&q, &permissions(), &mut |p| {
            assert_eq!(p, "/me/joinedTeams?$skiptoken=next");
            Ok((200, json!({"value":[{"id":"t"}]})))
        })
        .unwrap();
        assert_eq!(v["value"][0]["id"], "t");
        assert!(page(&q, &permissions(), &mut |_| Ok((
            200,
            json!({"value":[],"@odata.nextLink":next})
        )))
        .is_err());
        let mut q = query(Collection::Replies);
        q.next=Some("https://graph.microsoft.com/v1.0/teams/team/channels/other/messages/post/replies?$skiptoken=x".into());
        assert!(page(&q, &permissions(), &mut |_| panic!("No HTTP")).is_err());
    }
    #[test]
    fn shared_channels_use_the_host_team_and_fail_closed_without_identity() {
        let q = query(Collection::Shared);
        let v=page(&q,&permissions(),&mut |_|Ok((200,json!({"value":[
            {"id":"chan","membershipType":"shared","@odata.id":"https://graph.microsoft.com/v1.0/tenants/tenant/teams/host/channels/chan"},
            {"id":"missing","membershipType":"shared"},
            {"id":"chan","@odata.id":"https://evil.test/v1.0/teams/host/channels/chan"}
        ]})))).unwrap();
        assert_eq!(v["value"][0]["hostTeamId"], "host");
        assert!(v["value"][1]["hostTeamId"].is_null());
        assert!(v["value"][2]["hostTeamId"].is_null());
    }
    #[test]
    fn ordinary_channels_fall_back_to_their_listing_team() {
        let v = page(&query(Collection::Channels), &permissions(), &mut |_| {
            Ok((
                200,
                json!({"value":[{"id":"chan","membershipType":"standard"}]}),
            ))
        })
        .unwrap();
        assert_eq!(v["value"][0]["hostTeamId"], "team");
    }
    #[test]
    fn failures_are_not_empty_success_or_automatically_retried() {
        for status in [401, 403, 404, 429, 500] {
            let mut count = 0;
            let err = page(&query(Collection::Joined), &permissions(), &mut |_| {
                count += 1;
                Ok((status, Value::Null))
            })
            .unwrap_err();
            assert!(err.contains(&status.to_string()) || status == 401);
            assert_eq!(count, 1);
        }
    }
}
