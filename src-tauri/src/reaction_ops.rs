//! Explicit self-only reaction changes with injected Graph requests.
use crate::deletion::{own_id, read, valid_chat, Request};
use reqwest::Method;
use serde_json::{json, Value};
fn enc(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}
fn unicode(kind: &str) -> Option<String> {
    let known = match kind {
        "like" => Some("👍"),
        "heart" => Some("❤️"),
        "laugh" => Some("😆"),
        "surprised" => Some("😮"),
        "sad" => Some("😢"),
        "angry" => Some("😠"),
        _ => None,
    };
    known.map(str::to_owned).or_else(|| {
        (!kind.is_ascii()
            && kind.len() <= 128
            && !kind
                .chars()
                .any(|c| c.is_control() || c.is_ascii_alphabetic() || "<>/\\\"'".contains(c)))
        .then(|| kind.to_owned())
    })
}
fn valid_new(emoji: &str) -> bool {
    serde_json::from_str::<Value>(include_str!("../../src/lib/emoji-catalog.json"))
        .ok()
        .and_then(|v| {
            v.as_array()
                .map(|rows| rows.iter().any(|row| row["emoji"].as_str() == Some(emoji)))
        })
        .unwrap_or(false)
}
fn message(chat: &str, id: &str, request: &mut Request<'_>) -> Result<(String, Value), String> {
    valid_chat(chat)?;
    if id.is_empty() || id.len() > 512 || id.chars().any(char::is_control) {
        return Err("Invalid message identifier".into());
    }
    let own = own_id(request)?;
    let value = read(
        &format!("/chats/{}/messages/{}", enc(chat), enc(id)),
        request,
    )?;
    if value["id"].as_str() != Some(id)
        || value["chatId"].as_str().map(|s| s != chat).unwrap_or(false)
    {
        return Err("The message did not match the selected conversation".into());
    }
    if value["messageType"].as_str() != Some("message")
        || value["deletedDateTime"]
            .as_str()
            .map(|s| !s.is_empty())
            .unwrap_or(false)
    {
        return Err("Reactions are only available on normal, undeleted messages".into());
    }
    Ok((own, value))
}
fn own_types(value: &Value, own: &str) -> Vec<String> {
    value["reactions"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|r| {
            r["user"]["user"]["id"]
                .as_str()
                .map(|id| id.eq_ignore_ascii_case(own))
                .unwrap_or(false)
        })
        .filter_map(|r| r["reactionType"].as_str().and_then(unicode))
        .collect()
}
pub fn status(chat: &str, id: &str, request: &mut Request<'_>) -> Result<Vec<String>, String> {
    let (own, value) = message(chat, id, request)?;
    Ok(own_types(&value, &own))
}
pub fn change(
    permitted: bool,
    chat: &str,
    id: &str,
    emoji: &str,
    remove: bool,
    request: &mut Request<'_>,
) -> Result<(), String> {
    if !permitted {
        return Err(
            "Changing reactions needs delegated Chat.ReadWrite. Sign in again after consent."
                .into(),
        );
    }
    if (!remove && !valid_new(emoji)) || (remove && unicode(emoji).as_deref() != Some(emoji)) {
        return Err("Choose a supported Unicode emoji".into());
    }
    let (own, value) = message(chat, id, request)?;
    let has = own_types(&value, &own).iter().any(|kind| kind == emoji);
    if has != remove {
        return Ok(());
    } // Already present for set, or absent for unset.
    let action = if remove {
        "unsetReaction"
    } else {
        "setReaction"
    };
    let reply = request(
        Method::POST,
        &format!("/chats/{}/messages/{}/{action}", enc(chat), enc(id)),
        Some(json!({"reactionType":emoji})),
    )
    .map_err(|_| {
        "Reaction change was not confirmed. Refresh reaction status before explicitly retrying."
            .to_owned()
    })?;
    if reply.status != 204 {
        return Err(format!("Reaction change was not confirmed (HTTP {}). Refresh reaction status before explicitly retrying.",reply.status));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::groups::Reply;
    const ME: &str = "11111111-1111-1111-1111-111111111111";
    fn msg(reactions: Value) -> Value {
        json!({"id":"123","chatId":"chat","messageType":"message","deletedDateTime":null,"reactions":reactions})
    }
    fn row(kind: &str, id: &str) -> Value {
        json!({"reactionType":kind,"user":{"user":{"id":id}}})
    }
    fn response(body: Value) -> Result<Reply, String> {
        Ok(Reply { status: 200, body })
    }
    #[test]
    fn permission_invalid_emoji_and_pending_chat_prevent_requests() {
        let mut request = |_, _: &str, _| panic!("No Graph request");
        assert!(change(false, "chat", "123", "👍", false, &mut request).is_err());
        for kind in ["like", "custom", "<script>", "", "not an emoji"] {
            assert!(change(true, "chat", "123", kind, false, &mut request).is_err());
        }
        assert!(change(true, "pending:user", "123", "👍", false, &mut request).is_err());
    }
    #[test]
    fn explicit_add_posts_catalog_unicode_without_selecting_a_target_user() {
        let mut posts = 0;
        change(
            true,
            "chat",
            "123",
            "👍",
            false,
            &mut |method, path, body| {
                if method == Method::GET {
                    return response(if path == "/me?$select=id" {
                        json!({"id":ME})
                    } else {
                        assert_eq!(path, "/chats/chat/messages/123");
                        msg(json!([]))
                    });
                }
                posts += 1;
                assert_eq!(method, Method::POST);
                assert_eq!(path, "/chats/chat/messages/123/setReaction");
                assert_eq!(body, Some(json!({"reactionType":"👍"})));
                Ok(Reply {
                    status: 204,
                    body: Value::Null,
                })
            },
        )
        .unwrap();
        assert_eq!(posts, 1);
    }
    #[test]
    fn remove_normalizes_legacy_own_reaction_and_never_unsets_someone_elses() {
        for own in [false, true] {
            let mut posts = 0;
            change(
                true,
                "chat",
                "123",
                "👍",
                true,
                &mut |method, path, body| {
                    if method == Method::GET {
                        return response(if path == "/me?$select=id" {
                            json!({"id":ME})
                        } else {
                            msg(json!([row("like", if own { ME } else { "someone-else" })]))
                        });
                    }
                    posts += 1;
                    assert_eq!(path, "/chats/chat/messages/123/unsetReaction");
                    assert_eq!(body, Some(json!({"reactionType":"👍"})));
                    Ok(Reply {
                        status: 204,
                        body: Value::Null,
                    })
                },
            )
            .unwrap();
            assert_eq!(posts, usize::from(own));
        }
    }
    #[test]
    fn already_set_reaction_is_read_only_and_does_not_unset_other_own_reactions() {
        change(
            true,
            "chat",
            "123",
            "👍",
            false,
            &mut |method, path, _| {
                assert_eq!(method, Method::GET);
                response(if path == "/me?$select=id" {
                    json!({"id":ME})
                } else {
                    msg(json!([row("like", ME), row("heart", ME)]))
                })
            },
        )
        .unwrap();
    }
    #[test]
    fn deleted_system_and_mismatched_messages_prevent_posts() {
        for field in ["deletedDateTime", "messageType", "id", "chatId"] {
            let mut value = msg(json!([]));
            value[field] = json!(if field == "deletedDateTime" {
                "2026-01-01T00:00:00Z"
            } else {
                "wrong"
            });
            assert!(change(
                true,
                "chat",
                "123",
                "👍",
                false,
                &mut |method, path, _| {
                    assert_eq!(method, Method::GET);
                    response(if path == "/me?$select=id" {
                        json!({"id":ME})
                    } else {
                        value.clone()
                    })
                }
            )
            .is_err());
        }
    }
    #[test]
    fn failures_and_timeouts_make_exactly_one_attempt() {
        for status in [200, 202, 403, 429, 500, 0] {
            let mut posts = 0;
            let error = change(
                true,
                "chat",
                "123",
                "👍",
                false,
                &mut |method, path, _| {
                    if method == Method::GET {
                        return response(if path == "/me?$select=id" {
                            json!({"id":ME})
                        } else {
                            msg(json!([]))
                        });
                    }
                    posts += 1;
                    if status == 0 {
                        Err("secret response".into())
                    } else {
                        Ok(Reply {
                            status,
                            body: Value::Null,
                        })
                    }
                },
            )
            .unwrap_err();
            assert_eq!(posts, 1);
            assert!(error.contains("not confirmed"));
            assert!(!error.contains("secret response"));
        }
    }
    #[test]
    fn refresh_status_is_read_only_and_exposes_only_own_standard_unicode() {
        let result = status("chat", "123", &mut |method, path, _| {
            assert_eq!(method, Method::GET);
            response(if path == "/me?$select=id" {
                json!({"id":ME})
            } else {
                msg(json!([
                    row("like", ME),
                    row("👍🏽", ME),
                    row("custom", ME),
                    row("heart", "other")
                ]))
            })
        })
        .unwrap();
        assert_eq!(result, vec!["👍", "👍🏽"]);
    }
    #[test]
    fn every_picker_entry_is_an_accepted_set_reaction() {
        let value: Value =
            serde_json::from_str(include_str!("../../src/lib/emoji-catalog.json")).unwrap();
        assert!(value.as_array().unwrap().len() > 50);
        for entry in value.as_array().unwrap() {
            let emoji = entry["emoji"].as_str().unwrap();
            assert!(valid_new(emoji));
            assert_eq!(unicode(emoji).as_deref(), Some(emoji));
        }
    }
}
