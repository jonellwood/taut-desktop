//! Read-only review followed by a single-use explicit share-and-send plan.
use serde::Deserialize;
use serde_json::{json,Value};
use reqwest::Method;
use std::{collections::{HashMap,HashSet},sync::{Mutex,OnceLock},time::{Instant,Duration}};
use crate::groups::Request;
#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Input{pub items:Vec<crate::files_delete::Item>,pub channel:String,pub chat_id:Option<String>,pub recipients:Vec<String>,pub subject:String,pub message:String}
struct File{id:String,name:String,folder:bool,tag:String,url:String}
struct Person{id:String,name:String,email:String}
struct Plan{own:String,drive:String,files:Vec<File>,people:Vec<Person>,channel:String,chat:Option<String>,subject:String,message:String,created:Instant}
static PLANS:OnceLock<Mutex<HashMap<String,Plan>>>=OnceLock::new();
fn plans()->&'static Mutex<HashMap<String,Plan>>{PLANS.get_or_init(||Mutex::new(HashMap::new()))}
fn enc(s:&str)->Result<String,String>{crate::files::segment(s)}
fn get(p:&str,r:&mut Request<'_>)->Result<Value,String>{let reply=r(Method::GET,p,None)?;if reply.status!=200{return Err(format!("Sharing review unavailable (HTTP {}).",reply.status));}Ok(reply.body)}
fn account(own:&str,r:&mut Request<'_>)->Result<(),String>{if get("/me?$select=id",r)?["id"].as_str()!=Some(own){return Err("Account changed. Reopen sharing.".into());}Ok(())}
fn chat_people(chat:&str,r:&mut Request<'_>)->Result<Vec<String>,String>{crate::attachments::members(chat,&mut|m,p,b,_|{let reply=r(m,p,b)?;Ok(crate::attachments::Reply{status:reply.status,body:reply.body})})}
fn permissions(path:&str,r:&mut Request<'_>)->Result<Vec<Value>,String>{let v=get(&format!("{path}/permissions"),r)?;if v["@odata.nextLink"].is_string(){return Err("This item's access list is too large to review here. Use OneDrive sharing.".into());}Ok(v["value"].as_array().ok_or("Access list unavailable")?.clone())}
fn missing(rows:&[Value],people:&[Person])->Vec<String>{people.iter().filter(|p|!crate::attachments::confirms_recipients(rows,&[p.id.clone()])).map(|p|p.id.clone()).collect()}
fn escape(s:&str)->String{s.replace('&',"&amp;").replace('<',"&lt;").replace('>',"&gt;").replace('"',"&quot;").replace('\'',"&#39;")}
pub fn prepare(own:&str,input:Input,files_permission:bool,send_permission:bool,r:&mut Request<'_>)->Result<Value,String>{
 if !files_permission||!send_permission{return Err("Sharing requires existing Files.ReadWrite and the selected sending permission. Sign in again if needed.".into());}
 if input.items.is_empty()||input.items.len()>5||input.message.len()>8000||input.subject.trim().is_empty()||input.subject.len()>200||input.subject.chars().any(char::is_control){return Err("Select 1–5 items, add a subject (up to 200 bytes), and keep the message under 8 KB.".into());}
 account(own,r)?;
 let ids=match input.channel.as_str(){"chat"=>{if !input.recipients.is_empty(){return Err("Choose chat members through the existing conversation.".into());}chat_people(input.chat_id.as_deref().ok_or("Choose an existing chat")?,r)?},"email"=>{if input.chat_id.is_some(){return Err("Invalid email destination".into());}input.recipients.clone()},_=>return Err("Choose Email or Chat".into())};
 if ids.is_empty()||ids.len()>25{return Err("Choose 1–25 coworkers.".into());}let mut seen=HashSet::new();let mut people=vec![];
 for id in ids{if id.eq_ignore_ascii_case(own)||!seen.insert(id.to_lowercase()){return Err("Choose other coworkers without duplicates.".into());}let user=get(&format!("/users/{}?$select=id,displayName,mail,userPrincipalName,userType",enc(&id)?),r)?;
 if user["id"].as_str()!=Some(&id)||user["userType"].as_str()!=Some("Member"){return Err("This version supports verified coworkers in your organization. Use OneDrive for guests.".into());}
 let email=user["mail"].as_str().filter(|s|!s.is_empty()).or(user["userPrincipalName"].as_str()).ok_or("Coworker email unavailable")?.to_string();people.push(Person{id,name:user["displayName"].as_str().unwrap_or(&email).to_string(),email});}
 let drive=get("/me/drive?$select=id",r)?["id"].as_str().ok_or("OneDrive unavailable")?.to_string();let mut files=vec![];let mut review=vec![];seen.clear();
 for item in input.items{if !seen.insert(item.id.clone()){return Err("Duplicate item selected".into());}let path=format!("/drives/{}/items/{}",enc(&drive)?,enc(&item.id)?);let v=get(&path,r)?;
 if v["id"].as_str()!=Some(&item.id)||v["name"].as_str()!=Some(&item.name)||v["folder"].is_object()!=item.folder||v["remoteItem"].is_object()||v["root"].is_object(){return Err("An item changed or is a shared shortcut. Refresh Files and review again.".into());}
 let tag=v["eTag"].as_str().filter(|s|!s.is_empty()).ok_or("Item version unavailable")?.to_string();let url=crate::files::web_url(v["webUrl"].as_str().ok_or("Item link unavailable")?).ok_or("Unsupported OneDrive link")?;
 let rows=permissions(&path,r)?;let grant=missing(&rows,&people);review.push(json!({"name":item.name,"folder":item.folder,"newAccess":people.iter().filter(|p|grant.contains(&p.id)).map(|p|p.name.clone()).collect::<Vec<_>>()}));files.push(File{id:item.id,name:item.name,folder:item.folder,tag,url});}
 // Validate email addressing before any permission write, using the same mail payload rules.
 let plan=Plan{own:own.into(),drive,files,people,channel:input.channel,chat:input.chat_id,subject:input.subject.trim().into(),message:input.message,created:Instant::now()};if plan.channel=="email"{mail_payload(&plan)?;}
 let id=format!("{:032x}",rand::random::<u128>());let value=json!({"planId":id,"files":review,"recipients":plan.people.iter().map(|p|json!({"name":p.name,"email":p.email})).collect::<Vec<_>>(),"channel":plan.channel,"subject":plan.subject,"message":plan.message});
 let mut store=plans().lock().map_err(|_|"Sharing state unavailable")?;store.retain(|_,p|p.created.elapsed()<Duration::from_secs(600));if store.len()>=20{return Err("Close older sharing reviews and try again shortly.".into());}store.insert(id,plan);Ok(value)
}
fn content(plan:&Plan)->String{let mut body=format!("<p>{}</p>",escape(&plan.message).replace('\n',"<br>"));for file in &plan.files{body.push_str(&format!("<p><a href=\"{}\">{}</a>{}</p>",escape(&file.url),escape(&file.name),if file.folder{" (folder)"}else{""}));}body}
fn mail_payload(plan:&Plan)->Result<Value,String>{crate::mail_send::payload(&crate::mail_send::Draft{attachments:vec![],to:plan.people.iter().map(|p|p.email.clone()).collect(),cc:vec![],bcc:vec![],subject:plan.subject.clone(),content:content(plan),content_type:"HTML".into(),attempt_id:"taut-files-share-reviewed-send".into(),action:None,source_id:None})}
pub fn send(own:&str,id:&str,permitted:bool,email_permitted:bool,chat_permitted:bool,r:&mut Request<'_>)->Result<Value,String>{
 if !permitted{return Err("Sharing permission unavailable. Sign in and review again.".into());}
 let plan={let mut store=plans().lock().map_err(|_|"Sharing state unavailable")?;if !store.get(id).is_some_and(|p|p.own==own){return Err("Sharing review is unavailable or was already attempted. Check OneDrive and your sent messages before reviewing again.".into());}store.remove(id).unwrap()};
 if !(if plan.channel=="email"{email_permitted}else{chat_permitted}){return Err("Sending permission changed. Sign in and review again.".into());}
 if plan.created.elapsed()>Duration::from_secs(600){return Err("Sharing review expired. Review again.".into());}
 // Single-use plan is consumed before any write; network loss cannot replay it.
 let mut access_attempted=false;let mut delivery_attempted=false;
 let result=(||->Result<Value,String>{account(own,r)?;
 if let Some(chat)=&plan.chat{let mut expected=plan.people.iter().map(|p|p.id.to_lowercase()).collect::<Vec<_>>();expected.sort();if chat_people(chat,r)?!=expected{return Err("Chat membership changed. No message was sent. Review again.".into());}}
 for file in &plan.files{let v=get(&format!("/drives/{}/items/{}",enc(&plan.drive)?,enc(&file.id)?),r)?;if v["eTag"].as_str()!=Some(&file.tag)||v["name"].as_str()!=Some(&file.name)||v["remoteItem"].is_object()||v["root"].is_object(){return Err("An item changed since review. No message was sent. Review again.".into());}}
 for file in &plan.files{account(own,r)?;let path=format!("/drives/{}/items/{}",enc(&plan.drive)?,enc(&file.id)?);let grant=missing(&permissions(&path,r)?,&plan.people);if !grant.is_empty(){access_attempted=true;let reply=r(Method::POST,&format!("{path}/invite"),Some(json!({"recipients":grant.iter().map(|id|json!({"objectId":id})).collect::<Vec<_>>(),"requireSignIn":true,"sendInvitation":false,"retainInheritedPermissions":true,"roles":["read"]})))?;if ![200,207].contains(&reply.status)||reply.body["value"].as_array().is_some_and(|rows|rows.iter().any(|p|p.get("error").is_some())){return Err("Access was not confirmed for every recipient. No message was sent.".into());}}
 if !missing(&permissions(&path,r)?,&plan.people).is_empty(){return Err("Access for every recipient could not be verified. No message was sent.".into());}}
 account(own,r)?;if let Some(chat)=&plan.chat{let mut expected=plan.people.iter().map(|p|p.id.to_lowercase()).collect::<Vec<_>>();expected.sort();if chat_people(chat,r)?!=expected{return Err("Chat membership changed. No message was sent.".into());}}
 let(path,payload,expected)=if let Some(chat)=&plan.chat{(format!("/chats/{}/messages",enc(chat)?),json!({"body":{"contentType":"html","content":format!("<p><strong>{}</strong></p>{}",escape(&plan.subject),content(&plan))}}),201)}else{("/me/sendMail".into(),mail_payload(&plan)?,202)};
 delivery_attempted=true;let reply=r(Method::POST,&path,Some(payload))?;if reply.status!=expected||(expected==201&&reply.body["id"].as_str().is_none()){return Err("Message delivery was not confirmed.".into());}Ok(json!({"status":"sent"}))})();
 Ok(match result{Ok(value)=>value,Err(e)=>json!({"status":"stopped","error":format!("{e} {} No automatic retry was sent.",if delivery_attempted{"The message may have arrived; check the destination before sharing again. Access already granted remains in OneDrive."}else if access_attempted{"Some access may already have been granted and remains in OneDrive. Check sharing before trying again."}else{"No sharing or message write was attempted."})})})
}
#[cfg(test)]mod tests{
use super::*;use crate::groups::Reply;
const OWN:&str="11111111-1111-1111-1111-111111111111";const OTHER:&str="22222222-2222-2222-2222-222222222222";
struct Graph{writes:Vec<(String,Value)>,access:bool,fail_grant:bool,fail_send:bool,changed:bool,chat_changed:bool}
impl Graph{fn new()->Self{Self{writes:vec![],access:false,fail_grant:false,fail_send:false,changed:false,chat_changed:false}}fn request(&mut self,m:Method,p:&str,b:Option<Value>)->Result<Reply,String>{
 if m==Method::POST{self.writes.push((p.into(),b.unwrap()));if p.ends_with("/invite"){if self.fail_grant{return Ok(Reply{status:207,body:json!({"value":[{"error":{}}]})});}self.access=true;return Ok(Reply{status:200,body:json!({"value":[]})});}if self.fail_send{return Err("network".into());}return Ok(Reply{status:if p=="/me/sendMail"{202}else{201},body:json!({"id":"message"})});}
 let body=if p=="/me?$select=id"{json!({"id":OWN})}else if p=="/me/drive?$select=id"{json!({"id":"drive"})}else if p.starts_with("/users/"){json!({"id":OTHER,"displayName":"Alex","mail":"alex@example.test","userType":"Member"})}else if p.ends_with("/members"){json!({"value":[{"@odata.type":"#microsoft.graph.aadUserConversationMember","userId":OWN},{"@odata.type":"#microsoft.graph.aadUserConversationMember","userId":if self.chat_changed{"33333333-3333-3333-3333-333333333333"}else{OTHER}}]})}else if p.ends_with("/permissions"){if self.access{json!({"value":[{"id":"permission","roles":["write"],"grantedToV2":{"user":{"id":OTHER}}}]})}else{json!({"value":[]})}}else{json!({"id":"file","name":"Report.pdf","file":{},"eTag":if self.changed{"changed"}else{"v1"},"webUrl":"https://example.sharepoint.com/Documents/Report.pdf"})};Ok(Reply{status:200,body})
}}
fn input(channel:&str)->Input{Input{items:vec![crate::files_delete::Item{id:"file".into(),name:"Report.pdf".into(),folder:false}],channel:channel.into(),chat_id:if channel=="chat"{Some("existing-chat".into())}else{None},recipients:if channel=="email"{vec![OTHER.into()]}else{vec![]},subject:"Report".into(),message:"Please review <this>".into()}}
fn review(g:&mut Graph,channel:&str)->Value{prepare(OWN,input(channel),true,true,&mut|m,p,b|g.request(m,p,b)).unwrap()}
fn submit(g:&mut Graph,v:&Value)->Value{send(OWN,v["planId"].as_str().unwrap(),true,true,true,&mut|m,p,b|g.request(m,p,b)).unwrap()}
#[test]fn review_is_read_only_and_contains_no_urls(){let mut g=Graph::new();let v=review(&mut g,"email");assert!(g.writes.is_empty());assert!(!v.to_string().contains("https://"));assert_eq!(v["files"][0]["newAccess"][0],"Alex");}
#[test]fn send_grants_named_read_access_then_emails_once(){let mut g=Graph::new();let v=review(&mut g,"email");assert_eq!(submit(&mut g,&v)["status"],"sent");assert_eq!(g.writes.len(),2);let grant=&g.writes[0].1;assert_eq!(grant["roles"],json!(["read"]));assert_eq!(grant["sendInvitation"],false);assert_eq!(grant["requireSignIn"],true);assert_eq!(grant["recipients"][0]["objectId"],OTHER);assert_eq!(g.writes[1].0,"/me/sendMail");assert!(g.writes[1].1["message"]["body"]["content"].as_str().unwrap().contains("&lt;this&gt;"));assert!(send(OWN,v["planId"].as_str().unwrap(),true,true,true,&mut|_,_,_|panic!("replay")).is_err());}
#[test]fn existing_edit_access_is_not_changed_and_chat_is_existing_only(){let mut g=Graph::new();g.access=true;let v=review(&mut g,"chat");assert_eq!(submit(&mut g,&v)["status"],"sent");assert_eq!(g.writes.len(),1);assert_eq!(g.writes[0].0,"/chats/existing%2Dchat/messages");}
#[test]fn failed_access_verification_stops_before_message(){let mut g=Graph::new();g.fail_grant=true;let v=review(&mut g,"email");let result=submit(&mut g,&v);assert_eq!(result["status"],"stopped");assert_eq!(g.writes.len(),1);assert!(result["error"].as_str().unwrap().contains("access may"));}
#[test]fn changed_membership_and_item_version_prevent_writes(){for mode in ["chat","email"]{let mut g=Graph::new();let v=review(&mut g,mode);if mode=="chat"{g.chat_changed=true;}else{g.changed=true;}assert_eq!(submit(&mut g,&v)["status"],"stopped");assert!(g.writes.is_empty());}}
#[test]fn uncertain_message_is_not_replayed(){let mut g=Graph::new();g.fail_send=true;let v=review(&mut g,"email");assert!(submit(&mut g,&v)["error"].as_str().unwrap().contains("may have arrived"));assert_eq!(g.writes.len(),2);assert!(send(OWN,v["planId"].as_str().unwrap(),true,true,true,&mut|_,_,_|panic!()).is_err());}
#[test]fn missing_scopes_and_changed_send_permission_never_write(){let mut g=Graph::new();assert!(prepare(OWN,input("email"),true,false,&mut|_,_,_|panic!()).is_err());let v=review(&mut g,"email");assert!(send(OWN,v["planId"].as_str().unwrap(),true,false,true,&mut|_,_,_|panic!()).is_err());assert!(g.writes.is_empty());}
}
