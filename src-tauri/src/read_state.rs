//! Marks only the signed-in user's selected, fully loaded conversation as read.
use crate::deletion::{own_id, read, valid_chat, Request};
use reqwest::Method;
use serde_json::json;
fn enc(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}
pub fn mark_read(
    permitted: bool,
    chat: &str,
    seen: &str,
    tenant: &str,
    request: &mut Request<'_>,
) -> Result<bool, String> {
    if !permitted {
        return Err("Synchronizing read status needs delegated Chat.ReadWrite. Sign in again after consent.".into());
    }
    valid_chat(chat)?;
    if seen.is_empty() || seen.len() > 512 || seen.chars().any(char::is_control) {
        return Err("Invalid viewed message".into());
    }
    let own = own_id(request)?;
    // This Graph action marks the whole chat to the current latest message. Avoid
    // doing so if the message the UI actually displayed is already out of date.
    let latest = read(
        &format!(
            "/chats/{}/messages?$top=1&$orderby=createdDateTime%20desc",
            enc(chat)
        ),
        request,
    )?;
    let rows = latest["value"]
        .as_array()
        .ok_or("Latest message could not be verified. Refresh before retrying.")?;
    let Some(last) = rows.first() else {
        return Ok(false);
    };
    if last["id"].as_str() != Some(seen) || last["messageType"].as_str() != Some("message") {
        return Ok(false);
    }
    let reply = request(
        Method::POST,
        &format!("/chats/{}/markChatReadForUser", enc(chat)),
        Some(json!({"user":{"id":own,"tenantId":tenant}})),
    )
    .map_err(|_| "Read status was not confirmed. Refresh before explicitly retrying.".to_owned())?;
    if reply.status != 204 {
        return Err(format!(
            "Read status was not confirmed (HTTP {}). Refresh before explicitly retrying.",
            reply.status
        ));
    }
    Ok(true)
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::groups::Reply;
    use serde_json::Value;
    const ME: &str = "11111111-1111-1111-1111-111111111111";
    fn response(body: Value) -> Result<Reply, String> {
        Ok(Reply { status: 200, body })
    }
    #[test]
    fn invalid_inputs_or_missing_permission_make_no_requests() {
        let mut request = |_, _: &str, _| panic!("No Graph requests");
        assert!(mark_read(false, "chat", "message", "tenant", &mut request).is_err());
        assert!(mark_read(true, "pending:user", "message", "tenant", &mut request).is_err());
        assert!(mark_read(true, "chat", "", "tenant", &mut request).is_err());
    }
    #[test]
    fn mark_read_verifies_latest_message_and_posts_only_server_verified_self() {
        let mut writes = 0;
        assert!(mark_read(
            true,
            "chat",
            "latest",
            "tenant",
            &mut |method, path, body| {
                if method == Method::GET {
                    return response(if path == "/me?$select=id" {
                        json!({"id":ME})
                    } else {
                        assert_eq!(
                            path,
                            "/chats/chat/messages?$top=1&$orderby=createdDateTime%20desc"
                        );
                        json!({"value":[{"id":"latest","messageType":"message"}]})
                    });
                }
                writes += 1;
                assert_eq!(method, Method::POST);
                assert_eq!(path, "/chats/chat/markChatReadForUser");
                assert_eq!(body, Some(json!({"user":{"id":ME,"tenantId":"tenant"}})));
                Ok(Reply {
                    status: 204,
                    body: Value::Null,
                })
            }
        )
        .unwrap());
        assert_eq!(writes, 1);
    }
    #[test]
    fn newer_or_system_message_prevents_whole_chat_mark_read() {
        for last in [
            json!({"id":"newer","messageType":"message"}),
            json!({"id":"latest","messageType":"systemEventMessage"}),
        ] {
            assert!(
                !mark_read(true, "chat", "latest", "tenant", &mut |method, path, _| {
                    assert_eq!(method, Method::GET);
                    response(if path == "/me?$select=id" {
                        json!({"id":ME})
                    } else {
                        json!({"value":[last.clone()]})
                    })
                })
                .unwrap()
            );
        }
    }
    #[test]
    fn unconfirmed_write_never_retries_or_claims_success() {
        for status in [200, 202, 401, 403, 411, 429, 500] {
            let mut writes = 0;
            assert!(
                mark_read(true, "chat", "latest", "tenant", &mut |method, path, _| {
                    if method == Method::GET {
                        return response(if path == "/me?$select=id" {
                            json!({"id":ME})
                        } else {
                            json!({"value":[{"id":"latest","messageType":"message"}]})
                        });
                    }
                    writes += 1;
                    Ok(Reply {
                        status,
                        body: Value::Null,
                    })
                })
                .is_err()
            );
            assert_eq!(writes, 1);
        }
    }
}
