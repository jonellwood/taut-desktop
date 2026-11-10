//! Explicit new-mail sends. No draft creation or retries on the server.
use serde::Deserialize;
use base64::{engine::general_purpose::STANDARD,Engine as _};
use serde_json::{json,Value};
#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Attachment{pub id:String,pub name:String,pub size:usize,pub content_type:String,pub inline:bool,pub content_bytes:String}
#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Draft{#[serde(default)]pub attachments:Vec<Attachment>,pub to:Vec<String>,pub cc:Vec<String>,pub bcc:Vec<String>,pub subject:String,pub content:String,pub content_type:String,pub attempt_id:String,#[serde(default)]pub action:Option<String>,#[serde(default)]pub source_id:Option<String>}
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
 if d.attachments.len()>5{return Err("Attach up to 5 files.".into());}
 let mut total=0usize;let mut ids=std::collections::HashSet::new();let mut attachments=Vec::new();
 for file in &d.attachments{
  if file.id.len()!=36||!file.id.chars().enumerate().all(|(i,c)|if [8,13,18,23].contains(&i){c=='-'}else{c.is_ascii_hexdigit()})||!ids.insert(&file.id)||file.name.trim().is_empty()||file.name.len()>720||file.name.chars().any(|c|c.is_control()||"/\\".contains(c)){return Err("Invalid email attachment name or identifier.".into());}
  if file.size==0||file.size>2*1024*1024||file.content_bytes.len()>(2*1024*1024usize).div_ceil(3)*4{return Err("Email files must total 2 MB or less.".into());}
  let bytes=STANDARD.decode(&file.content_bytes).map_err(|_|"Could not decode email attachment")?;total+=bytes.len();
  if bytes.len()!=file.size||total>2*1024*1024{return Err("Email attachment size does not match, or files exceed 2 MB.".into());}
  let mime=&file.content_type;
  if mime.len()>100||mime.split('/').count()!=2||!mime.chars().all(|c|c.is_ascii_alphanumeric()||"/!#$&^_.+-".contains(c)){return Err("Invalid attachment content type.".into());}
  if file.inline&&(!["image/png","image/jpeg","image/gif","image/webp"].contains(&mime.as_str())||d.content_type!="HTML"||!d.content.contains(&format!("src=\"cid:taut-{}\"",file.id))){return Err("Inline image must be placed in the HTML message.".into());}
  let mut attachment=json!({"@odata.type":"#microsoft.graph.fileAttachment","name":file.name,"contentType":mime,"contentBytes":file.content_bytes,"isInline":file.inline});
  if file.inline{attachment["contentId"]=json!(format!("taut-{}",file.id));}attachments.push(attachment);
 }
 let recipients=|list:&Vec<String>|list.iter().map(|address|json!({"emailAddress":{"address":address}})).collect::<Vec<_>>();
 let mut result=json!({"message":{"subject":d.subject.trim(),"body":{"contentType":d.content_type,"content":d.content},"toRecipients":recipients(&d.to),"ccRecipients":recipients(&d.cc),"bccRecipients":recipients(&d.bcc)},"saveToSentItems":true});
 if !attachments.is_empty(){result["message"]["attachments"]=json!(attachments);}
 if serde_json::to_vec(&result).map_err(|_|"Invalid email")?.len()>3_800_000{return Err("Email request is too large.".into());}
 Ok(result)
}
pub fn send(d:&Draft,permitted:bool,request:&mut dyn FnMut(Value)->Result<u16,String>)->Result<Value,String>{
 if !permitted{return Err("Sending email needs delegated Mail.Send consent and a fresh sign-in.".into());}
 let mut body=payload(d)?;if d.action.is_some(){body=json!({"message":body["message"].take()});}
 // Once a request is attempted, all non-202 outcomes conservatively require review.
 Ok(match request(body){Ok(202)=>json!({"status":"accepted"}),Ok(code)=>json!({"status":"uncertain","error":format!("Sending was not confirmed (HTTP {code}). Check Sent in Outlook before trying again.")}),Err(_)=>json!({"status":"uncertain","error":"The sending result is uncertain. Check Sent in Outlook before trying again."})})
}
#[cfg(test)]mod tests{
 use super::*;
 fn draft()->Draft{Draft{attachments:vec![],to:vec!["alex@example.test".into()],cc:vec![],bcc:vec!["copy@example.test".into()],subject:"Project".into(),content:"Hello".into(),content_type:"Text".into(),attempt_id:"12345678-1234-1234-1234-123456789abc".into(),action:None,source_id:None}}
 #[test]fn files_are_only_sent_in_the_explicit_payload(){let mut d=draft();d.content_type="HTML".into();d.content="<img src=\"cid:taut-12345678-1234-1234-1234-123456789abc\">".into();d.attachments.push(Attachment{id:"12345678-1234-1234-1234-123456789abc".into(),name:"photo.png".into(),size:3,content_type:"image/png".into(),inline:true,content_bytes:STANDARD.encode([1,2,3])});for action in [None,Some("reply"),Some("replyAll"),Some("forward")]{d.action=action.map(str::to_owned);d.source_id=action.map(|_|"original".into());send(&d,true,&mut|body|{let f=&body["message"]["attachments"][0];assert_eq!(f["contentBytes"],"AQID");assert_eq!(f["contentId"],"taut-12345678-1234-1234-1234-123456789abc");assert_eq!(f["isInline"],true);Ok(202)}).unwrap();}d.attachments[0].size=4;let mut n=0;assert!(send(&d,true,&mut |_|{n+=1;Ok(202)}).is_err());assert_eq!(n,0);d.attachments[0].size=3;d.content="missing image".into();assert!(payload(&d).is_err());}
 #[test]fn validates_before_request(){let mut n=0;let mut r=|_:Value|{n+=1;Ok(202)};assert!(send(&draft(),false,&mut r).is_err());for bad in ["bad", "a@example.test\r\nBcc:x@example.test", "a@.test"]{let mut d=draft();d.to=vec![bad.into()];assert!(send(&d,true,&mut r).is_err());}let mut d=draft();d.cc=d.to.clone();assert!(send(&d,true,&mut r).is_err());assert_eq!(n,0);}
 #[test]fn accepted_is_not_delivery_and_keeps_bcc_and_sent_copy(){let result=send(&draft(),true,&mut|body|{assert_eq!(body["saveToSentItems"],true);assert_eq!(body["message"]["bccRecipients"][0]["emailAddress"]["address"],"copy@example.test");Ok(202)}).unwrap();assert_eq!(result["status"],"accepted");}
 #[test]fn ambiguous_results_never_retry(){let mut n=0;let result=send(&draft(),true,&mut |_|{n+=1;Err("timeout".into())}).unwrap();assert_eq!(n,1);assert_eq!(result["status"],"uncertain");}
 #[test]fn responses_use_encoded_source_action_and_explicit_reviewed_payload(){for action in ["reply","replyAll","forward"]{let mut d=draft();d.action=Some(action.into());d.source_id=Some("source+id=".into());assert_eq!(route(&d).unwrap(),format!("/me/messages/source%2Bid%3D/{action}"));let result=send(&d,true,&mut |body|{assert!(body.get("saveToSentItems").is_none());assert_eq!(body["message"]["body"]["content"],"Hello");assert_eq!(body["message"]["toRecipients"][0]["emailAddress"]["address"],"alex@example.test");Ok(202)}).unwrap();assert_eq!(result["status"],"accepted");}let mut d=draft();d.action=Some("delete".into());assert!(payload(&d).is_err());d.action=Some("reply".into());assert!(payload(&d).is_err());}
}
