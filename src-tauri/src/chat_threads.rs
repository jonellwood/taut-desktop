//! Reads quote context and sends explicit, preflight-checked quoted chat replies.
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

/// Preflight errors occur before POST; every ambiguous POST result keeps the draft.
#[cfg(test)]
pub fn send_quote(permitted:bool,chat:&str,parent:&str,own:&str,text:&str,request:&mut Request<'_>)->Result<Value,String>{send_formatted_quote(permitted,chat,parent,own,text,false,request)}
pub fn send_formatted_quote(permitted: bool, chat: &str, parent: &str, own: &str, text: &str, formatted:bool, request: &mut Request<'_>) -> Result<Value,String> {
    if !permitted { return Err("ChatMessage.Send permission is missing. Sign in again.".into()); }
    valid_chat(chat)?;
    if !valid_id(chat) || !valid_id(parent) || text.trim().is_empty() {return Err("Choose a message and enter a nonempty reply.".into());}
    let body=crate::compose_format::body(text,formatted,false)?;
    if !crate::deletion::own_id(request)?.eq_ignore_ascii_case(own) {return Err("Account changed. Reopen the conversation.".into());}
    let original=quoted_parent(chat,parent,request)?;
    if !original["deletedDateTime"].is_null() || original["messageType"].as_str().map(|t|t!="message").unwrap_or(false) {return Err("This message can no longer be quoted.".into());}
    let original_chat=chat;
    let chat=percent_encoding::utf8_percent_encode(chat,percent_encoding::NON_ALPHANUMERIC).to_string();
    let result=request(Method::POST,&format!("/chats/{chat}/messages/replyWithQuote"),Some(serde_json::json!({"messageIds":[parent],"replyMessage":{"body":body}})));
    let uncertain=||serde_json::json!({"status":"uncertain","error":"Delivery was not confirmed. Check Teams before enabling another attempt. Your draft is saved."});
    match result {
        Ok(reply) if reply.status==201 && reply.body["id"].as_str().map(valid_id).unwrap_or(false) && reply.body["chatId"].as_str().map(|id|id==original_chat).unwrap_or(true) && reply.body["from"]["user"]["id"].as_str().map(|id|id.eq_ignore_ascii_case(own)).unwrap_or(true) => Ok(serde_json::json!({"status":"sent","message":reply.body})),
        Ok(reply) if (400..500).contains(&reply.status) && reply.status!=408 => Ok(serde_json::json!({"status":"rejected","error":format!("Reply was rejected (HTTP {}). Your draft is saved.",reply.status)})),
        _=>Ok(uncertain()),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::groups::Reply;
    use serde_json::json;

    const OWN:&str="00000000-0000-0000-0000-000000000001";
    #[test]
    fn formatted_quote_is_safe_and_blank_code_never_requests(){
      let mut writes=0;send_formatted_quote(true,"chat","m",OWN,"**Hello** <x>",true,&mut |method,path,body|{
       if method==Method::GET{return Ok(Reply{status:200,body:if path.starts_with("/me?"){json!({"id":OWN})}else{json!({"id":"m","messageType":"message"})}});}
       writes+=1;let payload=body.unwrap();assert_eq!(payload["replyMessage"]["body"]["contentType"],"html");assert_eq!(payload["replyMessage"]["body"]["content"],"<p><strong>Hello</strong> &lt;x&gt;</p>");Ok(Reply{status:201,body:json!({"id":"sent"})})
      }).unwrap();assert_eq!(writes,1);
      assert!(send_formatted_quote(true,"chat","m",OWN,"```\n \n```",true,&mut |_,_,_|panic!("No requests")).is_err());
    }
    #[test]
    fn quote_preflight_never_writes_on_invalid_input_or_account() {
      for (permission,chat,parent,text) in [(false,"chat","m","reply"),(true,"pending:user","m","reply"),(true,"chat","m"," "), (true,"chat","bad/id","reply")] {
        assert!(send_quote(permission,chat,parent,OWN,text,&mut |_,_,_|panic!("No request")).is_err());
      }
      assert!(send_quote(true,"chat","m","other","reply",&mut |method,_,_|{assert_eq!(method,Method::GET);Ok(Reply{status:200,body:json!({"id":OWN})})}).is_err());
    }
    #[test]
    fn quote_send_is_one_post_with_plain_text_and_encoded_chat() {
      let mut posts=0;
      let result=send_quote(true,"19:chat@thread.v2","m",OWN,"  <code> & reply  ",&mut |method,path,body|{
        if method==Method::GET {return Ok(Reply{status:200,body:if path.starts_with("/me?"){json!({"id":OWN})}else{json!({"id":"m","messageType":"message"})}});}
        posts+=1;assert_eq!(path,"/chats/19%3Achat%40thread%2Ev2/messages/replyWithQuote");
        assert_eq!(body.unwrap(),json!({"messageIds":["m"],"replyMessage":{"body":{"contentType":"text","content":"<code> & reply"}}}));
        Ok(Reply{status:201,body:json!({"id":"sent"})})
      }).unwrap();
      assert_eq!(posts,1);assert_eq!(result["status"],"sent");
    }
    #[test]
    fn deleted_parent_prevents_post() {
      assert!(send_quote(true,"chat","m",OWN,"reply",&mut |method,path,_|{
        assert_eq!(method,Method::GET);Ok(Reply{status:200,body:if path.starts_with("/me?"){json!({"id":OWN})}else{json!({"id":"m","deletedDateTime":"now"})}})
      }).is_err());
    }
    #[test]
    fn ambiguous_deliveries_never_retry() {
      for status in [0,201,408,500,403] {
        let mut posts=0;
        let result=send_quote(true,"chat","m",OWN,"reply",&mut |method,path,_|{
          if method==Method::GET{return Ok(Reply{status:200,body:if path.starts_with("/me?"){json!({"id":OWN})}else{json!({"id":"m"})}});}
          posts+=1;if status==0 {return Err("Network error".into());}
          Ok(Reply{status,body:Value::Null})
        }).unwrap();
        assert_eq!(posts,1);assert_eq!(result["status"],if status==403{"rejected"}else{"uncertain"});
      }
    }
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
