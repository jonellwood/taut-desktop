//! Reviewed organizer event creation and read-only room/availability discovery.
use serde::{Deserialize,Serialize};
use serde_json::{json,Value};
#[derive(Clone,Deserialize,Serialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Draft {pub transaction_id:String,pub subject:String,pub description:String,pub start:String,pub end:String,pub attendees:Vec<String>,pub room:Option<Room>,#[serde(default)] pub online:bool,#[serde(default)] pub recurrence:Option<crate::recurrence::Recurrence>}
#[derive(Clone,Deserialize,Serialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Room {pub email_address:String,pub display_name:String}
pub(super) fn address(s:&str)->bool{s.len()<=254&&!s.chars().any(|c|c.is_whitespace()||c.is_control()||"<>;,".contains(c))&&s.split('@').count()==2&&s.split('@').all(|p|!p.is_empty())}
pub(super) fn times(start:&str,end:&str)->Result<(String,String),String>{let a=chrono::DateTime::parse_from_rfc3339(start).map_err(|_|"Invalid start time")?;let b=chrono::DateTime::parse_from_rfc3339(end).map_err(|_|"Invalid end time")?;if b<=a||(b-a).num_seconds()>31*86400{return Err("End must follow start, within 31 days.".into());}Ok((a.with_timezone(&chrono::Utc).format("%Y-%m-%dT%H:%M:%S").to_string(),b.with_timezone(&chrono::Utc).format("%Y-%m-%dT%H:%M:%S").to_string()))}
pub fn payload(d:&Draft)->Result<Value,String>{
 if d.transaction_id.len()<16||d.transaction_id.len()>100||!d.transaction_id.chars().all(|c|c.is_ascii_alphanumeric()||c=='-')||d.subject.trim().is_empty()||d.subject.chars().count()>255||d.description.len()>64000||d.attendees.len()>20{return Err("Check the meeting subject, description and attendees (maximum 20).".into());}
 let(a,b)=times(&d.start,&d.end)?;let mut seen=std::collections::HashSet::new();let mut attendees=vec![];
 for email in &d.attendees{if !address(email)||!seen.insert(email.to_lowercase()){return Err("Use unique valid attendee email addresses.".into());}attendees.push(json!({"emailAddress":{"address":email},"type":"required"}));}
 let mut body=json!({"transactionId":d.transaction_id,"subject":d.subject.trim(),"body":{"contentType":"text","content":d.description},"start":{"dateTime":a,"timeZone":"UTC"},"end":{"dateTime":b,"timeZone":"UTC"},"attendees":attendees});
 if let Some(room)=&d.room{if !address(&room.email_address)||room.display_name.len()>255||!seen.insert(room.email_address.to_lowercase()){return Err("Choose a valid room distinct from attendees.".into());}body["attendees"].as_array_mut().unwrap().push(json!({"emailAddress":{"address":room.email_address,"name":room.display_name},"type":"resource"}));body["location"]=json!({"displayName":room.display_name,"locationEmailAddress":room.email_address});}
 if d.online{body["isOnlineMeeting"]=json!(true);body["onlineMeetingProvider"]=json!("teamsForBusiness");}
 if let Some(recurrence)=&d.recurrence{crate::recurrence::apply(&mut body,recurrence,&d.start,&d.end)?;}
 Ok(body)
}
pub const ONLINE_CALENDAR_PATH:&str="/me/calendar?$select=allowedOnlineMeetingProviders";
pub fn online_support(request:&mut dyn FnMut(&str)->Result<(u16,Value),String>)->Result<bool,String>{
 let(status,value)=request(ONLINE_CALENDAR_PATH)?;
 if status!=200{return Err("Teams meeting support could not be checked. Try again.".into());}
 let providers=value["allowedOnlineMeetingProviders"].as_array().ok_or("Calendar did not return online meeting providers.")?;
 Ok(providers.iter().any(|p|p.as_str()==Some("teamsForBusiness")))
}
pub fn create(d:&Draft,permitted:bool,request:&mut dyn FnMut(&str,&str,Value)->Result<(u16,Value),String>)->Result<Value,String>{
 if !permitted{return Err("Reconnect with Calendars.ReadWrite to create meetings.".into());}
 let body=payload(d)?;
 if d.online{match online_support(&mut|path|request("GET",path,Value::Null)){
  Ok(true)=>{},Ok(false)=>return Ok(json!({"status":"notSent","error":"This calendar does not support Teams meetings. Turn off Teams meeting to continue. Nothing was sent."})),
  Err(_)=>return Ok(json!({"status":"notSent","error":"Teams meeting support could not be verified. Try again or turn off Teams meeting. Nothing was sent."}))
 }}
 match request("POST","/me/events",body){
  Ok((201,event)) if event["id"].as_str().is_some()=>{
   let warning=if d.online&&(event["isOnlineMeeting"]!=true||event["onlineMeetingProvider"]!="teamsForBusiness"||event["onlineMeeting"]["joinUrl"].as_str().is_none_or(str::is_empty)){Some("Meeting created, but Teams join details are not available yet. Refresh meeting status or check Outlook; do not create another copy.")}else{None};
   Ok(json!({"status":"created","event":event,"warning":warning}))
  },
  Ok((status,_))=>Ok(json!({"status":"uncertain","error":format!("Meeting creation not confirmed (HTTP {status}). Check Calendar or Outlook before another attempt.")})),
  Err(_)=>Ok(json!({"status":"uncertain","error":"Meeting creation not confirmed. Check Calendar or Outlook; TAUT will not repeat it automatically."}))
 }
}
pub fn schedule(addresses:&[String],start:&str,end:&str,request:&mut dyn FnMut(&str,Value)->Result<(u16,Value),String>)->Result<Value,String>{if addresses.is_empty()||addresses.len()>20||addresses.iter().any(|s|!address(s)){return Err("Check availability for 1–20 email addresses.".into());}let(a,b)=times(start,end)?;let(status,value)=request("/me/calendar/getSchedule",json!({"schedules":addresses,"startTime":{"dateTime":a,"timeZone":"UTC"},"endTime":{"dateTime":b,"timeZone":"UTC"},"availabilityViewInterval":15}))?;if status!=200||!value["value"].is_array(){return Err(format!("Availability unavailable (HTTP {status})."));}Ok(value["value"].clone())}
pub fn rooms(next:Option<&str>,request:&mut dyn FnMut(&str)->Result<(u16,Value),String>)->Result<Value,String>{let path=if let Some(link)=next{let u=url::Url::parse(link).map_err(|_|"Invalid room continuation")?;if u.scheme()!="https"||u.host_str()!=Some("graph.microsoft.com")||!u.username().is_empty()||u.password().is_some()||u.port().is_some()||u.fragment().is_some()||u.path()!="/v1.0/places/microsoft.graph.room"{return Err("Invalid room continuation".into());}format!("/places/microsoft.graph.room{}",u.query().map(|q|format!("?{q}")).unwrap_or_default())}else{"/places/microsoft.graph.room?$select=id,displayName,emailAddress,capacity,building,floorLabel&$top=100".into()};let(status,value)=request(&path)?;if status!=200||!value["value"].is_array(){return Err(format!("Rooms unavailable (HTTP {status})."));}if let Some(link)=value["@odata.nextLink"].as_str(){// Validate before returning to the UI without following it.
 let u=url::Url::parse(link).map_err(|_|"Invalid room continuation")?;if u.scheme()!="https"||u.host_str()!=Some("graph.microsoft.com")||u.path()!="/v1.0/places/microsoft.graph.room"||!u.username().is_empty()||u.password().is_some()||u.port().is_some()||u.fragment().is_some(){return Err("Invalid room continuation".into());}}
 Ok(json!({"value":value["value"],"next":value["@odata.nextLink"]}))}
#[cfg(test)]mod tests{use super::*;fn draft()->Draft{Draft{transaction_id:"12345678-1234-1234".into(),subject:"Plan".into(),description:"Discuss".into(),start:"2026-11-12T15:00:00Z".into(),end:"2026-11-12T16:00:00Z".into(),attendees:vec!["person@example.test".into()],room:Some(Room{email_address:"room@example.test".into(),display_name:"Room".into()}),online:false,recurrence:None}}
#[test]fn resource_and_utc_payload(){let v=payload(&draft()).unwrap();assert_eq!(v["attendees"][1]["type"],"resource");assert_eq!(v["start"]["timeZone"],"UTC");assert_eq!(v["transactionId"],"12345678-1234-1234");}
#[test]fn invalid_and_denied_never_post(){let mut d=draft();d.end=d.start.clone();assert!(create(&d,true,&mut|_,_,_|panic!()).is_err());assert!(create(&draft(),false,&mut|_,_,_|panic!()).is_err());d=draft();d.attendees.push("PERSON@example.test".into());assert!(payload(&d).is_err());}
#[test]fn uncertain_is_one_attempt(){let mut n=0;let v=create(&draft(),true,&mut|_,_,_|{n+=1;Err("timeout".into())}).unwrap();assert_eq!(n,1);assert_eq!(v["status"],"uncertain");}
#[test]fn created_requires_event(){assert_eq!(create(&draft(),true,&mut|m,p,_|{assert_eq!(m,"POST");assert_eq!(p,"/me/events");Ok((201,json!({"id":"new"})))}).unwrap()["status"],"created");}
#[test]fn room_continuation_cannot_escape(){assert!(rooms(Some("https://evil.test/v1.0/places/microsoft.graph.room"),&mut|_|panic!()).is_err());}
#[test]fn availability_is_not_creation(){schedule(&["room@example.test".into()],&draft().start,&draft().end,&mut|p,_|{assert_eq!(p,"/me/calendar/getSchedule");Ok((200,json!({"value":[]})))}).unwrap();}}

#[cfg(test)]mod online_tests{
 use super::*;
 fn draft()->Draft{serde_json::from_value(json!({"transactionId":"12345678-1234-1234","subject":"Hybrid","description":"Discuss","start":"2026-11-23T15:00:00Z","end":"2026-11-23T16:00:00Z","attendees":["person@example.test"],"room":{"emailAddress":"room@example.test","displayName":"Room"},"online":true})).unwrap()}
 #[test]fn online_creation_checks_provider_then_posts_once_with_room_and_people(){
  let mut methods=vec![];
  let result=create(&draft(),true,&mut|method,path,body|{
   methods.push(method.to_owned());
   if method=="GET"{assert_eq!(path,ONLINE_CALENDAR_PATH);return Ok((200,json!({"allowedOnlineMeetingProviders":["teamsForBusiness"]})));}
   assert_eq!(path,"/me/events");assert_eq!(body["isOnlineMeeting"],true);assert_eq!(body["onlineMeetingProvider"],"teamsForBusiness");assert_eq!(body["attendees"][1]["type"],"resource");assert_eq!(body["body"]["content"],"Discuss");
   Ok((201,json!({"id":"new","isOnlineMeeting":true,"onlineMeetingProvider":"teamsForBusiness","onlineMeeting":{"joinUrl":"https://teams.microsoft.com/meet/123"}})))
  }).unwrap();
  assert_eq!(methods,vec!["GET","POST"]);assert_eq!(result["status"],"created");assert!(result["warning"].is_null());
 }
 #[test]fn unsupported_or_unverified_calendar_never_posts(){
  for response in [Ok((200,json!({"allowedOnlineMeetingProviders":["skypeForBusiness"]}))),Ok((200,json!({}))),Ok((403,Value::Null)),Err("timeout".to_owned())]{
   let result=create(&draft(),true,&mut|method,_,_|{assert_eq!(method,"GET");response.clone()}).unwrap();assert_eq!(result["status"],"notSent");
  }
 }
 #[test]fn missing_join_details_is_created_with_warning_not_a_repeatable_failure(){
  let mut posts=0;let result=create(&draft(),true,&mut|method,_,_|if method=="GET"{Ok((200,json!({"allowedOnlineMeetingProviders":["teamsForBusiness"]})))}else{posts+=1;Ok((201,json!({"id":"new"})))}).unwrap();
  assert_eq!(posts,1);assert_eq!(result["status"],"created");assert!(result["warning"].as_str().unwrap().contains("do not create another copy"));
 }
 #[test]fn old_drafts_default_off_and_permission_denial_never_reads_or_writes(){
  let mut value=serde_json::to_value(draft()).unwrap();value.as_object_mut().unwrap().remove("online");let old:Draft=serde_json::from_value(value).unwrap();assert!(!old.online);assert!(payload(&old).unwrap().get("isOnlineMeeting").is_none());
  assert!(create(&draft(),false,&mut|_,_,_|panic!("No requests")).is_err());
 }
 #[test]fn online_timeout_never_retries_creation(){
  let mut posts=0;let result=create(&draft(),true,&mut|method,_,_|if method=="GET"{Ok((200,json!({"allowedOnlineMeetingProviders":["teamsForBusiness"]})))}else{posts+=1;Err("timeout".into())}).unwrap();assert_eq!(posts,1);assert_eq!(result["status"],"uncertain");
 }
 #[test]fn online_meeting_without_room_never_invents_a_resource_or_location(){
  let mut d=draft();d.room=None;let body=payload(&d).unwrap();
  assert_eq!(body["isOnlineMeeting"],true);assert_eq!(body["attendees"].as_array().unwrap().len(),1);assert_eq!(body["attendees"][0]["type"],"required");assert!(body.get("location").is_none());
 }
}
