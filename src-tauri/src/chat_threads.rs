//! Fetches a quoted chat message without changing read state or creating messages.
use crate::deletion::{valid_chat, Request};
use reqwest::Method;
use serde_json::Value;
fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 512
        && value != "."
        && value != ".."
        && !value.chars().any(|c| c.is_control() || "/\\?#".contains(c))
}
pub fn quoted_parent(
    chat: &str,
    message: &str,
    request: &mut Request<'_>,
) -> Result<Value, String> {
    valid_chat(chat)?;
    if !valid_id(chat) || !valid_id(message) {
        return Err("Invalid quoted message identity".into());
    }
    let enc = |s: &str| {
        percent_encoding::utf8_percent_encode(s, percent_encoding::NON_ALPHANUMERIC).to_string()
    };
    let response = request(
        Method::GET,
        &format!("/chats/{}/messages/{}", enc(chat), enc(message)),
        None,
    )?;
    if response.status != 200 {
        return Err(format!(
            "Quoted message unavailable (HTTP {}).",
            response.status
        ));
    }
    if response.body["id"].as_str() != Some(message)
        || response.body["chatId"]
            .as_str()
            .map(|id| id != chat)
            .unwrap_or(false)
    {
        return Err("Quoted message identity could not be verified".into());
    }
    Ok(response.body)
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::groups::Reply;
    use serde_json::json;
    #[test]
    fn invalid_targets_never_make_requests() {
        for (chat, id) in [
            ("pending:user", "m"),
            ("empty", "m"),
            ("chat", ""),
            ("chat", "../other"),
            ("bad/chat", "m"),
            ("chat", "bad\n"),
        ] {
            assert!(quoted_parent(chat, id, &mut |_, _, _| panic!("No HTTP")).is_err());
        }
    }
    #[test]
    fn fetch_is_only_get_and_ids_are_encoded() {
        let result = quoted_parent("19:chat@thread.v2", "123", &mut |method, path, body| {
            assert_eq!(method, Method::GET);
            assert_eq!(path, "/chats/19%3Achat%40thread%2Ev2/messages/123");
            assert!(body.is_none());
            Ok(Reply {
                status: 200,
                body: json!({"id":"123","chatId":"19:chat@thread.v2"}),
            })
        })
        .unwrap();
        assert_eq!(result["id"], "123");
    }
    #[test]
    fn wrong_parent_or_chat_is_rejected() {
        for body in [json!({"id":"other"}), json!({"id":"m","chatId":"other"})] {
            assert!(quoted_parent("chat", "m", &mut |_, _, _| Ok(Reply {
                status: 200,
                body: body.clone()
            }))
            .is_err());
        }
    }
    #[test]
    fn errors_are_not_retried_or_replaced_with_a_saved_preview() {
        let mut count = 0;
        assert!(quoted_parent("chat", "m", &mut |_, _, _| {
            count += 1;
            Ok(Reply {
                status: 404,
                body: Value::Null,
            })
        })
        .is_err());
        assert_eq!(count, 1);
    }
    #[test]
    fn deleted_parent_is_returned_for_safe_rendering() {
        let result = quoted_parent("chat", "m", &mut |_, _, _| {
            Ok(Reply {
                status: 200,
                body: json!({"id":"m","deletedDateTime":"2026-11-04"}),
            })
        })
        .unwrap();
        assert!(result["deletedDateTime"].is_string());
    }
}
