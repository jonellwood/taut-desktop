//! Explicit new-mail sends. No draft creation or retries on the server.
use serde::Deserialize;
use serde_json::{json,Value};
#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Draft{pub to:Vec<String>,pub cc:Vec<String>,pub bcc:Vec<String>,pub subject:String,pub content:String,pub content_type:String,pub attempt_id:String,#[serde(default)]pub action:Option<String>,#[serde(default)]pub source_id:Option<String>}
pub fn route(d:&Draft)->Result<String,String>{
 match (&d.action,&d.source_id){(None,None)=>Ok("/me/sendMail".into()),(Some(action),Some(id)) if ["reply","replyAll","forward"].contains(&action.as_str())&&!id.is_empty()&&id.len()<=2048&&id!="."&&id!=".."&&!id.chars().any(|c|c.is_control()||"/\\?#".contains(c))=>Ok(format!("/me/messages/{}/{}",percent_encoding::utf8_percent_encode(id,percent_encoding::NON_ALPHANUMERIC),action)),_=>Err("Invalid reply or forward source".into())}
}
pub fn payload(d:&Draft)->Result<Value,String>{
 route(d)?;
 if d.attempt_id.len()<16||d.attempt_id.len()>100||!d.attempt_id.chars().all(|c|c.is_ascii_alphanumeric()||c=='-'){return Err("Invalid send attempt".into());}
 if d.to.is_empty()||d.to.len()+d.cc.len()+d.bcc.len()>100{return Err("Choose at least one To recipient, with at most 100 recipients total.".into());}
 let mut seen=std::collections::HashSet::new();
 for address in d.to.iter().chain(&d.cc).chain(&d.bcc){
  let parts:Vec<_>=address.split('@').collect();
  if address.len()>254||parts.len()!=2||parts[0].is_empty()||!parts[1].contains('.')||parts[1].starts_with('.')||parts[1].ends_with('.')||!address.chars().all(|c|c.is_ascii_alphanumeric()||".!#$%&'*+-/=?^_`{|}~@".contains(c)) {return Err("Check each recipient's full email address.".into());}
  if !seen.insert(address.to_ascii_lowercase()){return Err("A recipient appears more than once. Remove duplicates before sending.".into());}
 }
 if d.subject.trim().is_empty()||d.subject.len()>1000||d.subject.chars().any(char::is_control){return Err("Add a subject of at most 1,000 bytes.".into());}
 if d.content.trim().is_empty()||d.content.len()>200_000||!["Text","HTML"].contains(&d.content_type.as_str()){return Err("Add a message within the 200 KB limit.".into());}
 let recipients=|list:&Vec<String>|list.iter().map(|address|json!({"emailAddress":{"address":address}})).collect::<Vec<_>>();
 Ok(json!({"message":{"subject":d.subject.trim(),"body":{"contentType":d.content_type,"content":d.content},"toRecipients":recipients(&d.to),"ccRecipients":recipients(&d.cc),"bccRecipients":recipients(&d.bcc)},"saveToSentItems":true}))
}
pub fn send(d:&Draft,permitted:bool,request:&mut dyn FnMut(Value)->Result<u16,String>)->Result<Value,String>{
 if !permitted{return Err("Sending email needs delegated Mail.Send consent and a fresh sign-in.".into());}
 let mut body=payload(d)?;if d.action.is_some(){body=json!({"message":body["message"].take()});}
 // Once a request is attempted, all non-202 outcomes conservatively require review.
 Ok(match request(body){Ok(202)=>json!({"status":"accepted"}),Ok(code)=>json!({"status":"uncertain","error":format!("Sending was not confirmed (HTTP {code}). Check Sent in Outlook before trying again.")}),Err(_)=>json!({"status":"uncertain","error":"The sending result is uncertain. Check Sent in Outlook before trying again."})})
}
#[cfg(test)]mod tests{
 use super::*;
 fn draft()->Draft{Draft{to:vec!["alex@example.test".into()],cc:vec![],bcc:vec!["copy@example.test".into()],subject:"Project".into(),content:"Hello".into(),content_type:"Text".into(),attempt_id:"12345678-1234-1234-1234-123456789abc".into(),action:None,source_id:None}}
 #[test]fn validates_before_request(){let mut n=0;let mut r=|_:Value|{n+=1;Ok(202)};assert!(send(&draft(),false,&mut r).is_err());for bad in ["bad", "a@example.test\r\nBcc:x@example.test", "a@.test"]{let mut d=draft();d.to=vec![bad.into()];assert!(send(&d,true,&mut r).is_err());}let mut d=draft();d.cc=d.to.clone();assert!(send(&d,true,&mut r).is_err());assert_eq!(n,0);}
 #[test]fn accepted_is_not_delivery_and_keeps_bcc_and_sent_copy(){let result=send(&draft(),true,&mut|body|{assert_eq!(body["saveToSentItems"],true);assert_eq!(body["message"]["bccRecipients"][0]["emailAddress"]["address"],"copy@example.test");Ok(202)}).unwrap();assert_eq!(result["status"],"accepted");}
 #[test]fn ambiguous_results_never_retry(){let mut n=0;let result=send(&draft(),true,&mut |_|{n+=1;Err("timeout".into())}).unwrap();assert_eq!(n,1);assert_eq!(result["status"],"uncertain");}
 #[test]fn responses_use_encoded_source_action_and_explicit_reviewed_payload(){for action in ["reply","replyAll","forward"]{let mut d=draft();d.action=Some(action.into());d.source_id=Some("source+id=".into());assert_eq!(route(&d).unwrap(),format!("/me/messages/source%2Bid%3D/{action}"));let result=send(&d,true,&mut |body|{assert!(body.get("saveToSentItems").is_none());assert_eq!(body["message"]["body"]["content"],"Hello");assert_eq!(body["message"]["toRecipients"][0]["emailAddress"]["address"],"alex@example.test");Ok(202)}).unwrap();assert_eq!(result["status"],"accepted");}let mut d=draft();d.action=Some("delete".into());assert!(payload(&d).is_err());d.action=Some("reply".into());assert!(payload(&d).is_err());}
}
