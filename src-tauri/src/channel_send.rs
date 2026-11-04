//! Explicit channel sends with read-only preflight and no write retries.
use crate::deletion::{own_id, Request};
use reqwest::Method;
use serde::Deserialize;
use serde_json::{json, Value};
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Target {pub team_id:String,pub channel_id:String,pub message_id:Option<String>,pub own_id:String,pub text:String}
fn segment(value:&str)->Result<String,String>{
 if value.is_empty()||value.len()>512||value=="."||value==".."||value.starts_with("pending:")||value.chars().any(|c|c.is_control()||"/\\?#".contains(c)){return Err("Invalid channel destination.".into());}
 Ok(percent_encoding::utf8_percent_encode(value,percent_encoding::NON_ALPHANUMERIC).to_string())
}
fn read(path:&str,request:&mut Request<'_>)->Result<Value,String>{
 let result=request(Method::GET,path,None)?;
 if result.status!=200{return Err(format!("Channel send preflight failed (HTTP {}). No message was sent.",result.status));}
 Ok(result.body)
}
pub fn send(permitted:bool,target:Target,request:&mut Request<'_>)->Result<Value,String>{
 if !permitted{return Err("ChannelMessage.Send permission is missing. Grant consent and sign in again.".into());}
 let team=segment(&target.team_id)?;let channel=segment(&target.channel_id)?;
 let parent=target.message_id.as_deref().map(segment).transpose()?;
 if target.text.trim().is_empty()||target.text.chars().count()>4000{return Err("Enter a message of up to 4000 characters.".into());}
 if !own_id(request)?.eq_ignore_ascii_case(&target.own_id){return Err("Account changed. Reopen this channel.".into());}
 let team_path=format!("/teams/{team}");
 let metadata=read(&team_path,request)?;
 if metadata["id"].as_str()!=Some(&target.team_id)||metadata["isArchived"].as_bool()==Some(true){return Err("Team is archived or could not be verified.".into());}
 let base=format!("{team_path}/channels/{channel}");
 let metadata=read(&base,request)?;
 if metadata["id"].as_str()!=Some(&target.channel_id)||metadata["isArchived"].as_bool()==Some(true){return Err("Channel is archived or could not be verified.".into());}
 let path=if let Some(parent)=parent{
   let original=read(&format!("{base}/messages/{parent}"),request)?;
   if original["id"].as_str()!=target.message_id.as_deref()||!original["deletedDateTime"].is_null()||original["messageType"].as_str()!=Some("message"){return Err("The original post is unavailable for replies.".into());}
   format!("{base}/messages/{parent}/replies")
 }else{format!("{base}/messages")};
 let result=request(Method::POST,&path,Some(json!({"body":{"contentType":"text","content":target.text.trim()}})));
 match result{
   Ok(reply) if reply.status==201 && reply.body["id"].as_str().map(|id|segment(id).is_ok()).unwrap_or(false)
     && reply.body["from"]["user"]["id"].as_str().map(|id|id.eq_ignore_ascii_case(&target.own_id)).unwrap_or(true)
     && reply.body["replyToId"].as_str().map(|id|Some(id)==target.message_id.as_deref()).unwrap_or(true)
     =>Ok(json!({"status":"sent","message":reply.body})),
   Ok(reply) if (400..500).contains(&reply.status)&&reply.status!=408=>Ok(json!({"status":"rejected","error":format!("Channel message rejected (HTTP {}). Draft saved.",reply.status)})),
   _=>Ok(json!({"status":"uncertain","error":"Delivery was not confirmed. Check Teams before another attempt. Draft saved."}))
 }
}

#[cfg(test)]
mod tests{
 use super::*;
 use crate::groups::Reply;
 const OWN:&str="00000000-0000-0000-0000-000000000001";
 fn target(reply:bool)->Target{Target{team_id:"host-team".into(),channel_id:"19:channel@thread.tacv2".into(),message_id:reply.then(||"root".into()),own_id:OWN.into(),text:"  <code> & text  ".into()}}
 fn preflight(path:&str)->Value{
   if path.starts_with("/me?"){json!({"id":OWN})}
   else if path.ends_with("/messages/root"){json!({"id":"root","messageType":"message"})}
   else if path.contains("/channels/"){json!({"id":"19:channel@thread.tacv2","isArchived":false})}
   else{json!({"id":"host-team","isArchived":false})}
 }
 #[test]
 fn explicit_post_and_reply_use_host_and_plain_text(){
   for reply in [false,true]{
     let mut posts=0;
     let result=send(true,target(reply),&mut |method,path,body|{
       if method==Method::GET{return Ok(Reply{status:200,body:preflight(path)});}
       assert_eq!(method,Method::POST);posts+=1;
       assert_eq!(path,format!("/teams/host%2Dteam/channels/19%3Achannel%40thread%2Etacv2/messages{}",if reply{"/root/replies"}else{""}));
       assert_eq!(body,Some(json!({"body":{"contentType":"text","content":"<code> & text"}})));
       Ok(Reply{status:201,body:json!({"id":"new","replyToId":if reply{Some("root")}else{None},"from":{"user":{"id":OWN}}})})
     }).unwrap();
     assert_eq!(posts,1);assert_eq!(result["status"],"sent");
   }
 }
 #[test]
 fn invalid_or_unapproved_input_never_requests(){
   assert!(send(false,target(false),&mut |_,_,_|panic!("No HTTP")).is_err());
   for (field,value) in [("team","pending:user"),("channel","bad/id"),("root","../root"),("text","  "),("text",&"a".repeat(4001))]{
     let mut t=target(true);match field{"team"=>t.team_id=value.into(),"channel"=>t.channel_id=value.into(),"root"=>t.message_id=Some(value.into()),_=>t.text=value.into()};
     assert!(send(true,t,&mut |_,_,_|panic!("No HTTP")).is_err());
   }
 }
 #[test]
 fn account_archive_identity_and_deleted_guards_never_post(){
   for scenario in ["account","team","channel","deleted","activity","wrong-parent","denied"]{
     assert!(send(true,target(true),&mut |method,path,_|{
       assert_eq!(method,Method::GET);let mut body=preflight(path);
       if scenario=="account"&&path.starts_with("/me?"){body["id"]=json!("00000000-0000-0000-0000-000000000002");}
       if scenario=="team"&&path=="/teams/host%2Dteam"{body["isArchived"]=json!(true);}
       if scenario=="channel"&&path.ends_with("tacv2"){body["isArchived"]=json!(true);}
       if path.ends_with("/messages/root"){
         if scenario=="deleted"{body["deletedDateTime"]=json!("now");}
         if scenario=="activity"{body["messageType"]=json!("systemEventMessage");}
         if scenario=="wrong-parent"{body["id"]=json!("wrong");}
       }
       Ok(Reply{status:if scenario=="denied"{403}else{200},body})
     }).is_err(),"{scenario}");
   }
 }
 #[test]
 fn ambiguous_results_are_never_retried(){
   for status in [0,201,408,500,403,429]{
     let mut posts=0;
     let result=send(true,target(false),&mut |method,path,_|{
       if method==Method::GET{return Ok(Reply{status:200,body:preflight(path)});}
       posts+=1;if status==0{return Err("Network failed".into());}
       Ok(Reply{status,body:Value::Null})
     }).unwrap();
     assert_eq!(posts,1);assert_eq!(result["status"],if status==403||status==429{"rejected"}else{"uncertain"});
   }
 }
 #[test]
 fn mismatched_confirmation_is_uncertain(){
   for body in [json!({"id":"new","from":{"user":{"id":"someone-else"}}}),json!({"id":"new","replyToId":"wrong"})]{
     let result=send(true,target(true),&mut |method,path,_|Ok(Reply{status:if method==Method::GET{200}else{201},body:if method==Method::GET{preflight(path)}else{body.clone()}})).unwrap();
     assert_eq!(result["status"],"uncertain");
   }
 }
}
