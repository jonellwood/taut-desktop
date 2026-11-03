//! User-triggered message deletion/restoration and self-only chat visibility.
//! No administrative shared-thread deletion is implemented here.
pub use crate::groups::Reply;
use reqwest::Method;
use serde_json::{json, Value};
pub type Request<'a> = dyn FnMut(Method, &str, Option<Value>) -> Result<Reply, String> + 'a;
fn enc(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}
pub(crate) fn valid_chat(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 512
        || id.starts_with("pending:")
        || id == "empty"
        || id.chars().any(char::is_control)
    {
        return Err("Choose an existing Teams conversation".into());
    }
    Ok(())
}
pub(crate) fn read(path: &str, request: &mut Request<'_>) -> Result<Value, String> {
    let reply = request(Method::GET, path, None)?;
    if reply.status != 200 {
        return Err(format!(
            "Could not verify the current state (HTTP {}). No change was attempted.",
            reply.status
        ));
    }
    Ok(reply.body)
}
pub(crate) fn own_id(request: &mut Request<'_>) -> Result<String, String> {
    let me = read("/me?$select=id", request)?;
    me["id"]
        .as_str()
        .filter(|s| {
            s.len() == 36
                && s.chars().enumerate().all(|(i, c)| {
                    if [8, 13, 18, 23].contains(&i) {
                        c == '-'
                    } else {
                        c.is_ascii_hexdigit()
                    }
                })
        })
        .map(str::to_owned)
        .ok_or("Cannot verify your signed-in identity".into())
}
fn verified_message(
    chat: &str,
    message: &str,
    request: &mut Request<'_>,
) -> Result<(String, bool), String> {
    valid_chat(chat)?;
    if message.is_empty() || message.len() > 512 || message.chars().any(char::is_control) {
        return Err("Invalid message identifier".into());
    }
    let own = own_id(request)?;
    let value = read(
        &format!("/chats/{}/messages/{}", enc(chat), enc(message)),
        request,
    )?;
    if value["id"].as_str() != Some(message)
        || value["chatId"]
            .as_str()
            .map(|id| id != chat)
            .unwrap_or(false)
    {
        return Err("The message did not match the selected conversation".into());
    }
    if value["messageType"].as_str() != Some("message") {
        return Err("System activity cannot be deleted or restored with message controls".into());
    }
    if !value["from"]["user"]["id"]
        .as_str()
        .map(|id| id.eq_ignore_ascii_case(&own))
        .unwrap_or(false)
    {
        return Err(
            "TAUT only deletes or restores messages you sent. Ownership could not be verified."
                .into(),
        );
    }
    let deleted = value["deletedDateTime"]
        .as_str()
        .map(|s| !s.is_empty())
        .unwrap_or(false);
    Ok((own, deleted))
}
pub fn message_status(
    chat: &str,
    message: &str,
    request: &mut Request<'_>,
) -> Result<bool, String> {
    Ok(verified_message(chat, message, request)?.1)
}
pub fn change_message(
    permitted: bool,
    chat: &str,
    message: &str,
    restore: bool,
    request: &mut Request<'_>,
) -> Result<(), String> {
    if !permitted {
        return Err("Message deletion and restoration need delegated Chat.ReadWrite permission. Sign in again after consent.".into());
    }
    let (own, deleted) = verified_message(chat, message, request)?;
    if deleted != restore {
        return Ok(());
    } // Already in the requested state: never repeat the write.
    let action = if restore { "restoration" } else { "deletion" };
    let method = if restore {
        "undoSoftDelete"
    } else {
        "softDelete"
    };
    let reply=request(Method::POST,&format!("/users/{}/chats/{}/messages/{}/{method}",enc(&own),enc(chat),enc(message)),None)
  .map_err(|_|format!("Message {action} was not confirmed. It may already have happened. Refresh status and check Teams before explicitly retrying."))?;
    if reply.status != 204 {
        let detail=match reply.status {
            411=>"The server requires a Content-Length header; this is a request-format error.",
            401=>"Your sign-in may have expired.",
            403=>"Permissions or tenant policy may prevent this action.",
            _=>"Microsoft 365 did not confirm this action.",
        };
        return Err(format!("Message {action} was not confirmed (HTTP {}). {detail} Refresh status before retrying.",reply.status));
    }
    Ok(())
}
pub fn visibility_status(chat: &str, request: &mut Request<'_>) -> Result<bool, String> {
    valid_chat(chat)?;
    let mut path = "/me/chats?$top=50&$select=id,viewpoint".to_owned();
    for _ in 0..10 {
        let value = read(&path, request)?;
        let rows = value["value"]
            .as_array()
            .ok_or("Chat visibility response was incomplete")?;
        if let Some(row) = rows.iter().find(|v| v["id"].as_str() == Some(chat)) {
            return row["viewpoint"]["isHidden"].as_bool().ok_or("Microsoft 365 did not report visibility for this chat. Check Teams before retrying.".into());
        }
        let Some(next) = value["@odata.nextLink"].as_str() else {
            break;
        };
        let url = url::Url::parse(next).map_err(|_| "Invalid chat-list continuation")?;
        if url.scheme() != "https"
            || url.host_str() != Some("graph.microsoft.com")
            || url.port().is_some()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.path() != "/v1.0/me/chats"
        {
            return Err("Unsupported chat-list continuation".into());
        }
        path = format!("/me/chats?{}", url.query().unwrap_or(""));
    }
    Err("This chat's visibility could not be verified. Check Teams before retrying.".into())
}
pub fn set_visibility(
    permitted: bool,
    chat: &str,
    hidden: bool,
    tenant: &str,
    request: &mut Request<'_>,
) -> Result<(), String> {
    if !permitted {
        return Err("Hiding or unhiding chats needs delegated Chat.ReadWrite permission. Sign in again after consent.".into());
    }
    valid_chat(chat)?;
    let own = own_id(request)?;
    let current = read(
        &format!("/chats/{}?$select=id,chatType", enc(chat)),
        request,
    )?;
    if current["id"].as_str() != Some(chat)
        || !matches!(
            current["chatType"].as_str(),
            Some("oneOnOne" | "group" | "meeting")
        )
    {
        return Err("Cannot verify the selected chat".into());
    }
    let method = if hidden {
        "hideForUser"
    } else {
        "unhideForUser"
    };
    let reply=request(Method::POST,&format!("/chats/{}/{method}",enc(chat)),Some(json!({"user":{"id":own,"tenantId":tenant}})))
  .map_err(|_|"Chat visibility change was not confirmed. Refresh status and check Teams before explicitly retrying.".to_owned())?;
    if reply.status != 204 {
        return Err(format!(
            "Chat visibility change was not confirmed (HTTP {}). Refresh status before retrying.",
            reply.status
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    const ME: &str = "11111111-1111-1111-1111-111111111111";
    fn msg(deleted: bool) -> Value {
        json!({"id":"123","chatId":"chat","messageType":"message","from":{"user":{"id":ME}},"deletedDateTime":if deleted {Some("2026-01-01T00:00:00Z")}else{None}})
    }
    fn reply(body: Value) -> Result<Reply, String> {
        Ok(Reply { status: 200, body })
    }
    #[test]
    fn missing_permission_and_pending_chat_never_request() {
        let mut request = |_, _: &str, _| panic!("No HTTP allowed");
        assert!(change_message(false, "chat", "123", false, &mut request).is_err());
        assert!(change_message(true, "pending:person", "123", false, &mut request).is_err());
        assert!(set_visibility(false, "chat", true, "tenant", &mut request).is_err());
        assert!(set_visibility(true, "empty", true, "tenant", &mut request).is_err());
    }
    #[test]
    fn verifies_ownership_before_exact_delete_and_restore_posts() {
        for restore in [false, true] {
            let mut posts = 0;
            change_message(true, "chat", "123", restore, &mut |method, path, body| {
                if method == Method::GET {
                    return reply(if path == "/me?$select=id" {
                        json!({"id":ME})
                    } else {
                        assert_eq!(path, "/chats/chat/messages/123");
                        msg(restore)
                    });
                }
                posts += 1;
                assert_eq!(method, Method::POST);
                assert_eq!(
                    path,
                    format!(
                        "/users/{ME}/chats/chat/messages/123/{}",
                        if restore {
                            "undoSoftDelete"
                        } else {
                            "softDelete"
                        }
                    )
                );
                assert!(body.is_none());
                Ok(Reply {
                    status: 204,
                    body: Value::Null,
                })
            })
            .unwrap();
            assert_eq!(posts, 1);
        }
    }
    #[test]
    fn other_people_system_events_and_mismatches_never_write() {
        let mut other = msg(false);
        other["from"]["user"]["id"] = json!("22222222-2222-2222-2222-222222222222");
        let mut system = msg(false);
        system["messageType"] = json!("systemEventMessage");
        let mut wrong_chat = msg(false);
        wrong_chat["chatId"] = json!("elsewhere");
        let mut wrong_message = msg(false);
        wrong_message["id"] = json!("456");
        let mut no_author = msg(true);
        no_author["from"] = Value::Null;
        for value in [other, system, wrong_chat, wrong_message, no_author] {
            assert!(
                change_message(true, "chat", "123", false, &mut |method, path, _| {
                    assert_eq!(method, Method::GET);
                    reply(if path == "/me?$select=id" {
                        json!({"id":ME})
                    } else {
                        value.clone()
                    })
                })
                .is_err()
            );
        }
    }
    #[test]
    fn already_in_requested_state_skips_write() {
        for restore in [false, true] {
            change_message(true, "chat", "123", restore, &mut |method, path, _| {
                assert_eq!(method, Method::GET);
                reply(if path == "/me?$select=id" {
                    json!({"id":ME})
                } else {
                    msg(!restore)
                })
            })
            .unwrap();
        }
    }
    #[test]
    fn unconfirmed_message_writes_are_not_retried() {
        for status in [200, 202, 403, 411, 429, 500, 0] {
            let mut writes = 0;
            let error = change_message(true, "chat", "123", false, &mut |method, path, _| {
                if method == Method::GET {
                    return reply(if path == "/me?$select=id" {
                        json!({"id":ME})
                    } else {
                        msg(false)
                    });
                }
                writes += 1;
                if status == 0 {
                    Err("timeout secret-response".into())
                } else {
                    Ok(Reply {
                        status,
                        body: Value::Null,
                    })
                }
            })
            .unwrap_err();
            assert_eq!(writes, 1);
            assert!(error.contains("not confirmed"));
            if status==411 {assert!(error.contains("request-format error"));assert!(!error.contains("policy"));}
            assert!(!error.contains("secret-response"));
        }
    }
    #[test]
    fn hide_and_unhide_target_server_verified_self_only() {
        for hidden in [false, true] {
            let mut writes = 0;
            set_visibility(true, "chat", hidden, "tenant", &mut |method, path, body| {
                if method == Method::GET {
                    return reply(if path == "/me?$select=id" {
                        json!({"id":ME})
                    } else {
                        assert_eq!(path, "/chats/chat?$select=id,chatType");
                        json!({"id":"chat","chatType":"group"})
                    });
                }
                writes += 1;
                assert_eq!(method, Method::POST);
                assert_eq!(
                    path,
                    format!(
                        "/chats/chat/{}",
                        if hidden {
                            "hideForUser"
                        } else {
                            "unhideForUser"
                        }
                    )
                );
                assert_eq!(body, Some(json!({"user":{"id":ME,"tenantId":"tenant"}})));
                Ok(Reply {
                    status: 204,
                    body: Value::Null,
                })
            })
            .unwrap();
            assert_eq!(writes, 1);
        }
    }
    #[test]
    fn invalid_chat_or_identity_prevents_visibility_write() {
        for invalid_identity in [false, true] {
            assert!(
                set_visibility(true, "chat", true, "tenant", &mut |method, path, _| {
                    assert_eq!(method, Method::GET);
                    reply(if path == "/me?$select=id" {
                        json!({"id":if invalid_identity {"invalid"}else{ME}})
                    } else {
                        json!({"id":"another","chatType":"group"})
                    })
                })
                .is_err()
            );
        }
    }
    #[test]
    fn status_checks_are_read_only_and_visibility_paginates() {
        assert!(message_status("chat", "123", &mut |method, path, _| {
            assert_eq!(method, Method::GET);
            reply(if path == "/me?$select=id" {
                json!({"id":ME})
            } else {
                msg(true)
            })
        })
        .unwrap());
        let mut reads = 0;
        assert!(visibility_status("chat",&mut |method,path,body| {
            reads+=1;assert_eq!(method,Method::GET);assert!(body.is_none());
            reply(if reads==1 {json!({"value":[],"@odata.nextLink":"https://graph.microsoft.com/v1.0/me/chats?$skiptoken=test"})}else{assert_eq!(path,"/me/chats?$skiptoken=test");json!({"value":[{"id":"chat","viewpoint":{"isHidden":true}}]})})
        }).unwrap());
        assert_eq!(reads, 2);
    }
    #[test]
    fn visibility_continuations_are_bounded_and_cannot_exfiltrate_tokens() {
        for next in [
            "https://evil.example/v1.0/me/chats",
            "https://graph.microsoft.com/v1.0/users",
            "http://graph.microsoft.com/v1.0/me/chats",
            "https://user:password@graph.microsoft.com/v1.0/me/chats",
        ] {
            let mut reads = 0;
            assert!(visibility_status("chat", &mut |_, _, _| {
                reads += 1;
                reply(json!({"value":[],"@odata.nextLink":next}))
            })
            .is_err());
            assert_eq!(reads, 1);
        }
        let mut reads = 0;
        assert!(visibility_status("chat",&mut |_,_,_|{reads+=1;reply(json!({"value":[],"@odata.nextLink":"https://graph.microsoft.com/v1.0/me/chats?$skiptoken=loop"}))}).is_err());
        assert_eq!(reads, 10);
    }
    #[test]
    fn visibility_missing_viewpoint_is_not_assumed_visible() {
        assert!(visibility_status("chat", &mut |_, _, _| reply(
            json!({"value":[{"id":"chat"}]})
        ))
        .is_err());
    }
    #[test]
    fn failed_visibility_write_is_not_retried() {
        let mut writes = 0;
        assert!(
            set_visibility(true, "chat", true, "tenant", &mut |method, path, _| {
                if method == Method::GET {
                    return reply(if path == "/me?$select=id" {
                        json!({"id":ME})
                    } else {
                        json!({"id":"chat","chatType":"group"})
                    });
                }
                writes += 1;
                Ok(Reply {
                    status: 403,
                    body: Value::Null,
                })
            })
            .is_err()
        );
        assert_eq!(writes, 1);
    }
}
