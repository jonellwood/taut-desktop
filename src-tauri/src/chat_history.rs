//! Read-only continuations must stay within the selected chat's message list.
pub fn path(chat:&str,next:Option<&str>)->Result<String,String>{
 if chat.is_empty()||chat.len()>512||chat.chars().any(char::is_control){return Err("Invalid chat identifier".into());}
 let encoded:String=url::form_urlencoded::byte_serialize(chat.as_bytes()).collect();
 let base=format!("/chats/{encoded}/messages");
 let Some(link)=next else{return Ok(format!("{base}?$top=50&$orderby=createdDateTime%20desc"));};
 if link.len()>16000{return Err("Invalid history continuation".into());}
 let u=url::Url::parse(link).map_err(|_|"Invalid history continuation")?;
 let decoded=percent_encoding::percent_decode_str(u.path()).decode_utf8().map_err(|_|"Invalid history continuation")?;
 if u.scheme()!="https"||u.host_str()!=Some("graph.microsoft.com")||!u.username().is_empty()||u.password().is_some()||u.port().is_some()||u.fragment().is_some()||decoded!=format!("/v1.0/chats/{chat}/messages"){return Err("Invalid history continuation".into());}
 Ok(format!("{base}{}",u.query().map(|q|format!("?{q}")).unwrap_or_default()))
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn continuation_is_encoded_and_bound_to_chat(){let p=path("19:test@thread.v2",None).unwrap();assert!(p.starts_with("/chats/19%3Atest%40thread.v2/messages?"));assert_eq!(path("19:test@thread.v2",Some("https://graph.microsoft.com/v1.0/chats/19%3Atest%40thread.v2/messages?$skiptoken=opaque%2Btoken")).unwrap(),"/chats/19%3Atest%40thread.v2/messages?$skiptoken=opaque%2Btoken");}
 #[test]fn rejects_foreign_links_before_any_request(){for u in ["https://evil.test/v1.0/chats/a/messages","https://graph.microsoft.com/v1.0/chats/b/messages","https://graph.microsoft.com/v1.0/me","http://graph.microsoft.com/v1.0/chats/a/messages","https://user@graph.microsoft.com/v1.0/chats/a/messages","https://graph.microsoft.com/v1.0/chats/a/messages#fragment"]{assert!(path("a",Some(u)).is_err(),"{u}");}}
}
