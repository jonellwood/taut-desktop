//! Explicit organizer updates/cancellations. Only single meetings; never retry a write.
use serde::Deserialize;
use serde_json::{json,Value};

const SELECT:&str="id,changeKey,type,recurrence,isOrganizer,isCancelled,isAllDay,isOnlineMeeting,subject,start,end,body,bodyPreview,attendees,location,locations,organizer,responseStatus,onlineMeetingProvider,onlineMeeting,webLink";
#[derive(Clone,Deserialize,Default)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Changes {
 pub subject:Option<String>,pub start:Option<String>,pub end:Option<String>,pub description:Option<String>,pub description_note:Option<String>,pub people:Option<Vec<Person>>,
 #[serde(default)]pub change_room:bool,pub room:Option<crate::meeting::Room>,
}
#[derive(Clone,Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Person {pub address:String,pub kind:String}
fn encoded(id:&str)->Result<String,String>{if id.is_empty()||id.len()>2048||id=="."||id==".."||id.chars().any(|c|c.is_control()||"/\\?#".contains(c)){return Err("Invalid meeting identifier".into());}Ok(percent_encoding::utf8_percent_encode(id,percent_encoding::NON_ALPHANUMERIC).to_string())}
fn eligible(event:&Value)->Result<(),String>{
 if event["isOrganizer"]!=true||event["isCancelled"]!=false||event["type"]!="singleInstance"||!event["recurrence"].is_null(){return Err("Only an active single meeting you organize can be changed here. Use Outlook for recurring meetings.".into());}Ok(())
}
pub fn read(id:&str,request:&mut dyn FnMut(&str,&str,Value,Option<String>)->Result<(u16,Value),String>)->Result<Value,String>{
 let(status,event)=request("GET",&format!("/me/events/{}?$select={SELECT}",encoded(id)?),Value::Null,None)?;
 if status!=200||event["id"].as_str()!=Some(id)||event["changeKey"].as_str().is_none_or(str::is_empty){return Err("Meeting could not be loaded. Refresh Calendar or check Outlook.".into());}eligible(&event)?;Ok(event)
}
fn attendee(person:&Value)->Result<Value,String>{
 let address=person["emailAddress"]["address"].as_str().ok_or("An attendee address is unavailable. Use Outlook.")?;
 if !crate::meeting::address(address){return Err("Invalid attendee address".into());}
 let kind=person["type"].as_str().filter(|k|matches!(*k,"required"|"optional"|"resource")).ok_or("Unsupported attendee type. Use Outlook.")?;
 Ok(json!({"emailAddress":person["emailAddress"],"type":kind}))
}
pub fn patch(current:&Value,c:&Changes)->Result<Value,String>{
 eligible(current)?;let mut body=json!({});
 if let Some(subject)=&c.subject{if subject.trim().is_empty()||subject.chars().count()>255||subject.chars().any(char::is_control){return Err("Add a subject within 255 characters.".into());}body["subject"]=json!(subject.trim());}
 match (&c.start,&c.end){(Some(start),Some(end))=>{if current["isAllDay"]!=false{return Err("Use Outlook to change all-day meeting times.".into());}let(a,b)=crate::meeting::times(start,end)?;body["start"]=json!({"dateTime":a,"timeZone":"UTC"});body["end"]=json!({"dateTime":b,"timeZone":"UTC"});},(None,None)=>{},_=>return Err("Review both meeting start and end times.".into())}
 if c.description.is_some()&&c.description_note.is_some(){return Err("Review one description change at a time.".into());}
 if let Some(description)=&c.description{if description.len()>64000||current["body"]["contentType"].as_str().is_none_or(|t|!t.eq_ignore_ascii_case("text"))||current["isOnlineMeeting"]!=false{return Err("This description contains formatted or online meeting content. Edit it in Outlook to preserve the original.".into());}body["body"]=json!({"contentType":"text","content":description});}
 if let Some(note)=&c.description_note{
  if note.trim().is_empty()||note.len()>16000{return Err("Add a description note within 16 KB.".into());}
  let original=current["body"]["content"].as_str().ok_or("Original description unavailable")?;
  if original.len()+note.len()>200000{return Err("Description is too large to update here. Use Outlook.".into());}
  let kind=current["body"]["contentType"].as_str().unwrap_or("");
  let content=if kind.eq_ignore_ascii_case("text"){format!("{original}\n\n{note}")}else if kind.eq_ignore_ascii_case("html"){let escaped=note.replace('&',"&amp;").replace('<',"&lt;").replace('>',"&gt;").replace('\n',"<br>");format!("{original}<p>{escaped}</p>")}else{return Err("Unsupported original description. Use Outlook.".into());};
  body["body"]=json!({"contentType":kind,"content":content});
 }
 if c.room.is_some()&&!c.change_room{return Err("Review the room change before sending.".into());}
 if c.people.is_some()||c.change_room{
  let existing=current["attendees"].as_array().ok_or("Attendees unavailable. Refresh Calendar.")?;
  let mut people=if let Some(people)=&c.people{
   if people.len()>20{return Err("Use at most 20 people.".into());}
   let mut result=vec![];
   for p in people{if !crate::meeting::address(&p.address)||!matches!(p.kind.as_str(),"required"|"optional"){return Err("Check attendee addresses and types.".into());}
    let email=existing.iter().find(|a|a["emailAddress"]["address"].as_str().is_some_and(|s|s.eq_ignore_ascii_case(&p.address))).map(|a|a["emailAddress"].clone()).unwrap_or(json!({"address":p.address}));
    result.push(json!({"emailAddress":email,"type":p.kind}));
   }result
  }else{existing.iter().filter(|p|p["type"]!="resource").map(attendee).collect::<Result<Vec<_>,_>>()?};
  if c.change_room{
   if existing.iter().filter(|a|a["type"]=="resource").count()>1||current["locations"].as_array().is_some_and(|l|l.len()>1){return Err("Use Outlook to change meetings with multiple rooms or locations.".into());}
   if let Some(room)=&c.room{if !crate::meeting::address(&room.email_address)||room.display_name.trim().is_empty()||room.display_name.len()>255{return Err("Choose a valid room.".into());}people.push(json!({"type":"resource","emailAddress":{"address":room.email_address,"name":room.display_name}}));body["location"]=json!({"displayName":room.display_name,"locationEmailAddress":room.email_address});}
   else{body["location"]=json!({"displayName":""});}
  }else{for resource in existing.iter().filter(|p|p["type"]=="resource"){people.push(attendee(resource)?);}}
  let mut seen=std::collections::HashSet::new();for person in &people{let email=person["emailAddress"]["address"].as_str().unwrap_or("").to_lowercase();if !seen.insert(email){return Err("Remove duplicate people and room addresses.".into());}}
  body["attendees"]=json!(people);
 }
 if body.as_object().unwrap().is_empty(){return Err("There are no changes to send.".into());}Ok(body)
}
pub fn change(own:&str,id:&str,version:&str,action:&str,changes:Option<&Changes>,comment:&str,permitted:bool,request:&mut dyn FnMut(&str,&str,Value,Option<String>)->Result<(u16,Value),String>)->Result<Value,String>{
 if !permitted{return Err("Reconnect with Calendars.ReadWrite to manage meetings.".into());}
 encoded(id)?;if own.is_empty()||version.is_empty()||version.len()>2048||!matches!(action,"update"|"cancel")||comment.chars().count()>4000{return Err("Invalid meeting change".into());}
 if (action=="update")!=changes.is_some(){return Err("Review the meeting change again.".into());}
 let(status,identity)=request("GET","/me?$select=id",Value::Null,None)?;
 if status!=200||identity["id"].as_str()!=Some(own){return Err("Account changed. Reopen the meeting before continuing.".into());}
 let current=read(id,request)?;
 if current["changeKey"].as_str()!=Some(version){return Err("This meeting changed in Outlook. Reopen it and review the latest version; nothing was sent.".into());}
 let (method,path,body,etag)=if action=="update"{
  let etag=current["@odata.etag"].as_str().filter(|v|v.len()<=1024&&!v.chars().any(char::is_control)).map(str::to_owned);
  ("PATCH",format!("/me/events/{}",encoded(id)?),patch(&current,changes.unwrap())?,etag)
 }else{("POST",format!("/me/events/{}/cancel",encoded(id)?),json!({"comment":comment}),None)};
 // One mutation only. Even definite HTTP failures are not automatically retried.
 match request(method,&path,body,etag){
  Ok((200,event)) if action=="update"&&event["id"].as_str()==Some(id)&&event["start"]["dateTime"].is_string()&&event["end"]["dateTime"].is_string()=>Ok(json!({"status":"updated","event":event})),
  Ok((202,_)) if action=="cancel"=>Ok(json!({"status":"accepted"})),
  Ok((status,_))=>Ok(json!({"status":"uncertain","error":format!("Meeting change was not confirmed (HTTP {status}). Check Outlook before another attempt.")})),
  Err(_)=>Ok(json!({"status":"uncertain","error":"Meeting change was not confirmed. Check Outlook; TAUT will not repeat it automatically."})),
 }
}

#[cfg(test)]mod tests{
 use super::*;
 fn current()->Value{json!({"id":"event","changeKey":"v1","@odata.etag":"W/\"v1\"","type":"singleInstance","isOrganizer":true,"isCancelled":false,"isAllDay":false,"isOnlineMeeting":false,"subject":"Plan","start":{"dateTime":"2026-11-20T15:00:00","timeZone":"UTC"},"end":{"dateTime":"2026-11-20T16:00:00","timeZone":"UTC"},"body":{"contentType":"text","content":"Keep this"},"attendees":[{"type":"optional","emailAddress":{"address":"person@example.test","name":"Person"},"status":{"response":"accepted"}},{"type":"resource","emailAddress":{"address":"room@example.test","name":"Room"},"status":{"response":"accepted"}}],"location":{"displayName":"Room"}})}
 fn subject()->Changes{Changes{subject:Some("New subject".into()),..Default::default()}}
 #[test]fn subject_only_update_preserves_omitted_content_and_checks_identity_version(){let mut calls=vec![];let result=change("own","event","v1","update",Some(&subject()),"",true,&mut|method,path,body,etag|{calls.push((method.to_owned(),path.to_owned(),body,etag));Ok((200,if path=="/me?$select=id"{json!({"id":"own"})}else{current()}))}).unwrap();assert_eq!(result["status"],"updated");assert_eq!(calls.len(),3);assert_eq!(calls[2].0,"PATCH");assert_eq!(calls[2].1,"/me/events/event");assert_eq!(calls[2].2,json!({"subject":"New subject"}));assert_eq!(calls[2].3.as_deref(),Some("W/\"v1\""));}
 #[test]fn roster_preserves_optional_types_names_and_room_without_writing_response_status(){let c=Changes{people:Some(vec![Person{address:"person@example.test".into(),kind:"optional".into()},Person{address:"new@example.test".into(),kind:"required".into()}]),..Default::default()};let body=patch(&current(),&c).unwrap();assert_eq!(body["attendees"][0],json!({"type":"optional","emailAddress":{"address":"person@example.test","name":"Person"}}));assert_eq!(body["attendees"][2]["type"],"resource");assert!(body["location"].is_null());assert!(body["attendees"][2]["status"].is_null());}
 #[test]fn room_replacement_and_removal_are_explicit_and_preserve_people(){let mut c=Changes{change_room:true,room:Some(crate::meeting::Room{email_address:"new-room@example.test".into(),display_name:"New room".into()}),..Default::default()};let body=patch(&current(),&c).unwrap();assert_eq!(body["attendees"].as_array().unwrap().len(),2);assert_eq!(body["attendees"][0]["type"],"optional");assert_eq!(body["attendees"][1]["emailAddress"]["address"],"new-room@example.test");assert_eq!(body["location"]["displayName"],"New room");c.room=None;assert_eq!(patch(&current(),&c).unwrap()["attendees"].as_array().unwrap().len(),1);}
 #[test]fn formatted_and_online_content_is_preserved_when_adding_notes(){let mut event=current();event["body"]=json!({"contentType":"html","content":"<div>ORIGINAL TEAMS MEETING BLOB</div>"});event["isOnlineMeeting"]=json!(true);assert!(patch(&event,&Changes{description:Some("replace".into()),..Default::default()}).is_err());let body=patch(&event,&Changes{description_note:Some("Note <x>\nnext".into()),..Default::default()}).unwrap();assert_eq!(body["body"]["content"],"<div>ORIGINAL TEAMS MEETING BLOB</div><p>Note &lt;x&gt;<br>next</p>");assert!(patch(&event,&subject()).unwrap()["body"].is_null());}
 #[test]fn stale_foreign_cancelled_recurring_and_denied_never_write(){for which in ["scope","account","version","organizer","cancelled","series","occurrence"]{let mut event=current();match which{"version"=>event["changeKey"]=json!("v2"),"organizer"=>event["isOrganizer"]=json!(false),"cancelled"=>event["isCancelled"]=json!(true),"series"=>event["type"]=json!("seriesMaster"),"occurrence"=>event["type"]=json!("occurrence"),_=>{}}let mut writes=0;assert!(change("own","event","v1","update",Some(&subject()),"",which!="scope",&mut|m,p,_,_|{if m!="GET"{writes+=1;}Ok((200,if p=="/me?$select=id"{json!({"id":if which=="account"{"other"}else{"own"}})}else{event.clone()}))}).is_err(),"{which}");assert_eq!(writes,0);}}
 #[test]fn cancellation_uses_cancel_action_and_never_delete(){let mut writes=vec![];let result=change("own","event","v1","cancel",None,"No longer needed",true,&mut|method,path,body,_|{if method=="GET"{Ok((200,if path=="/me?$select=id"{json!({"id":"own"})}else{current()}))}else{writes.push((method.to_owned(),path.to_owned(),body));Ok((202,Value::Null))}}).unwrap();assert_eq!(result["status"],"accepted");assert_eq!(writes,vec![("POST".into(),"/me/events/event/cancel".into(),json!({"comment":"No longer needed"}))]);}
 #[test]fn mutation_timeouts_and_http_failures_are_never_retried(){for status in [0,412,429,503]{let mut writes=0;let result=change("own","event","v1","update",Some(&subject()),"",true,&mut|method,path,_,_|{if method=="GET"{Ok((200,if path=="/me?$select=id"{json!({"id":"own"})}else{current()}))}else{writes+=1;if status==0{Err("timeout".into())}else{Ok((status,Value::Null))}}}).unwrap();assert_eq!(writes,1);assert_eq!(result["status"],"uncertain");}}
 #[test]fn rejects_unsafe_identifiers_duplicates_empty_changes_and_partial_times(){assert!(read("../other",&mut|_,_,_,_|panic!()).is_err());assert!(patch(&current(),&Changes::default()).is_err());assert!(patch(&current(),&Changes{start:Some("2026-11-20T15:00:00Z".into()),..Default::default()}).is_err());assert!(patch(&current(),&Changes{people:Some(vec![Person{address:"room@example.test".into(),kind:"required".into()}]),..Default::default()}).is_err());}
}
