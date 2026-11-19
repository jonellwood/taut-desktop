//! Calendar reads and explicitly reviewed meeting responses. Writes are never retried.
use serde_json::{json, Value};
const SELECT: &str = "id,subject,start,end,isAllDay,isCancelled,isOrganizer,organizer,location,responseStatus,responseRequested,showAs,attendees,bodyPreview,webLink,type,changeKey";
fn route(start: &str, end: &str, next: Option<&str>) -> Result<String,String> {
    let a=chrono::DateTime::parse_from_rfc3339(start).map_err(|_|"Invalid calendar start")?;
    let b=chrono::DateTime::parse_from_rfc3339(end).map_err(|_|"Invalid calendar end")?;
    if b<=a || (b-a).num_seconds()>32*86400 { return Err("Choose a calendar range of at most 32 days".into()); }
    if let Some(next)=next {
        let url=url::Url::parse(next).map_err(|_|"Invalid calendar continuation")?;
        if url.scheme()!="https" || url.host_str()!=Some("graph.microsoft.com") || !url.username().is_empty() || url.password().is_some() || url.port().is_some() || url.fragment().is_some() || !matches!(url.path(),"/v1.0/me/calendarView"|"/v1.0/me/calendarView/") {
            return Err("Invalid calendar continuation destination".into());
        }
        return Ok(format!("{}{}",url.path().trim_start_matches("/v1.0"),url.query().map(|q|format!("?{q}")).unwrap_or_default()));
    }
    let query=url::form_urlencoded::Serializer::new(String::new()).append_pair("startDateTime",start).append_pair("endDateTime",end).append_pair("$select",SELECT).append_pair("$orderby","start/dateTime").append_pair("$top","100").finish();
    Ok(format!("/me/calendarView?{query}"))
}
pub fn page(start:&str,end:&str,next:Option<&str>,permitted:bool,request:&mut dyn FnMut(&str)->Result<(u16,Value),String>)->Result<Value,String>{
    if !permitted {return Err("Calendar needs Calendars.Read consent. Sign out and sign in again to connect it.".into());}
    let path=route(start,end,next)?;
    let(status,value)=request(&path)?;
    if status!=200 {return Err(format!("Calendar returned HTTP {status}. Your events are unchanged; refresh to retry."));}
    let rows=value["value"].as_array().ok_or("Invalid calendar response")?;
    if rows.len()>1000 {return Err("Calendar page is too large".into());}
    let next=value["@odata.nextLink"].as_str();
    if let Some(link)=next {route(start,end,Some(link))?;}
    Ok(json!({"value":rows,"next":next}))
}
#[cfg(test)]mod tests{
 use super::*;
 const A:&str="2026-11-12T00:00:00-05:00";const B:&str="2026-11-19T00:00:00-05:00";
 #[test]fn reads_occurrences_with_encoded_offset_and_response_status(){let mut paths=vec![];let result=page(A,B,None,true,&mut|p|{paths.push(p.to_owned());Ok((200,json!({"value":[{"id":"occurrence","type":"occurrence","responseStatus":{"response":"accepted"}}]})))}).unwrap();assert_eq!(result["value"][0]["responseStatus"]["response"],"accepted");assert!(paths[0].starts_with("/me/calendarView?"));assert!(paths[0].contains("%2D05%3A00")||paths[0].contains("-05%3A00"));}
 #[test]fn scope_and_invalid_ranges_make_no_requests(){for(scope,start,end)in[(false,A,B),(true,B,A),(true,"bad",B),(true,A,"2027-01-01T00:00:00Z")]{assert!(page(start,end,None,scope,&mut|_|panic!("unexpected request")).is_err());}}
 #[test]fn continuation_is_bound_to_calendar_graph_route(){for link in ["https://evil.test/v1.0/me/calendarView","https://graph.microsoft.com/v1.0/users/other/calendarView","https://graph.microsoft.com/v1.0/me/messages","https://graph.microsoft.com/v1.0/me/calendarView#x"]{assert!(route(A,B,Some(link)).is_err());}assert_eq!(route(A,B,Some("https://graph.microsoft.com/v1.0/me/calendarView?$skip=100")).unwrap(),"/me/calendarView?$skip=100");}
 #[test]fn failure_does_not_invent_empty_success(){assert!(page(A,B,None,true,&mut|_|Ok((403,Value::Null))).is_err());assert!(page(A,B,None,true,&mut|_|Ok((200,json!({})))).is_err());}
}

fn encoded_id(id:&str)->Result<String,String>{
 if id.is_empty()||id.len()>2048||id.chars().any(|c|c.is_control()||"/\\?#".contains(c))||matches!(id,"."|"..") {return Err("Invalid calendar identifier".into());}
 Ok(percent_encoding::utf8_percent_encode(id,percent_encoding::NON_ALPHANUMERIC).to_string())
}
pub fn event(id:&str,request:&mut dyn FnMut(&str)->Result<(u16,Value),String>)->Result<Value,String>{
 let path=format!("/me/events/{}?$select={SELECT}",encoded_id(id)?);
 let(status,value)=request(&path)?;
 if status!=200||value["id"].as_str()!=Some(id){return Err(format!("Calendar status could not be verified (HTTP {status}). Refresh or check Outlook."));}
 Ok(value)
}
pub fn invitation(id:&str,request:&mut dyn FnMut(&str)->Result<(u16,Value),String>)->Result<Value,String>{
 let(status,value)=request(&format!("/me/messages/{}?$expand=microsoft.graph.eventMessage/event",encoded_id(id)?))?;
 if status!=200{return Err(format!("Meeting invitation unavailable (HTTP {status})"));}
 // Request/response messages carry historical context, never the current RSVP.
 // Keep that context even if a declined/cancelled event is no longer available.
 let current=match value["event"]["id"].as_str(){Some(id)=>event(id,request).ok(),None=>None};
 Ok(json!({"event":current,"calendarUnavailable":current.is_none(),"previousStartDateTime":value["previousStartDateTime"],"previousEndDateTime":value["previousEndDateTime"],"previousLocation":value["previousLocation"],"meetingMessageType":value["meetingMessageType"],"isOutOfDate":value["isOutOfDate"],"responseRequested":value["responseRequested"]}))
}
pub fn respond(id:&str,version:&str,action:&str,comment:&str,send_response:bool,permitted:bool,request:&mut dyn FnMut(&str,&str,Value)->Result<(u16,Value),String>)->Result<Value,String>{
 if !permitted{return Err("Meeting responses need Calendars.ReadWrite consent and a fresh sign-in.".into());}
 if !matches!(action,"accept"|"tentativelyAccept"|"decline")||comment.chars().count()>4000||version.is_empty(){return Err("Invalid meeting response".into());}
 let encoded=encoded_id(id)?;
 let current=event(id,&mut|path|request("GET",path,Value::Null))?;
 if current["changeKey"].as_str()!=Some(version){return Err("This event changed. Refresh its status and review your response again.".into());}
 if current["isOrganizer"].as_bool()!=Some(false)||current["isCancelled"].as_bool()!=Some(false)||current["type"]=="seriesMaster"{return Err("This event cannot be answered here. Open it in Outlook.".into());}
 // Reserve the UI attempt before calling this function. Only one POST; never retry.
 let result=request("POST",&format!("/me/events/{encoded}/{action}"),json!({"comment":comment,"sendResponse":send_response}));
 match result {Ok((202,_))=>Ok(json!({"status":"accepted"})),Ok((status,_))=>Ok(json!({"status":"uncertain","error":format!("Response not confirmed (HTTP {status}). Check calendar status or Outlook before another attempt.")})),Err(_)=>Ok(json!({"status":"uncertain","error":"Response not confirmed. Check calendar status or Outlook; TAUT will not repeat it automatically."}))}
}
#[cfg(test)]mod response_tests{
 use super::*;
 fn current()->Value{json!({"id":"event","changeKey":"v1","isOrganizer":false,"isCancelled":false,"type":"occurrence","responseStatus":{"response":"notResponded"}})}
 #[test]fn response_checks_version_and_posts_once(){let mut calls=vec![];let result=respond("event","v1","accept","Thanks",true,true,&mut|method,path,body|{calls.push((method.to_string(),path.to_string(),body));Ok(if method=="GET"{(200,current())}else{(202,Value::Null)})}).unwrap();assert_eq!(result["status"],"accepted");assert_eq!(calls.len(),2);assert_eq!(calls[1].1,"/me/events/event/accept");assert_eq!(calls[1].2,json!({"comment":"Thanks","sendResponse":true}));}
 #[test]fn stale_cancelled_organizer_and_series_never_post(){for value in [json!({"id":"event","changeKey":"v2"}),json!({"id":"event","changeKey":"v1","isOrganizer":true}),json!({"id":"event","changeKey":"v1","isOrganizer":false,"isCancelled":true}),json!({"id":"event","changeKey":"v1","isOrganizer":false,"isCancelled":false,"type":"seriesMaster"})]{assert!(respond("event","v1","decline","",false,true,&mut|method,_,_|{assert_eq!(method,"GET");Ok((200,value.clone()))}).is_err());}}
 #[test]fn denied_and_invalid_make_no_requests(){for (scope,action,id) in [(false,"accept","event"),(true,"delete","event"),(true,"accept","../event")]{assert!(respond(id,"v1",action,"",true,scope,&mut|_,_,_|panic!("unexpected request")).is_err());}}
 #[test]fn network_failure_is_uncertain_without_retry(){let mut posts=0;let result=respond("event","v1","tentativelyAccept","",false,true,&mut|method,_,_|{if method=="GET"{Ok((200,current()))}else{posts+=1;Err("timeout".into())}}).unwrap();assert_eq!(posts,1);assert_eq!(result["status"],"uncertain");}
 #[test]fn invitation_uses_relationship_then_current_calendar_status(){let mut paths=vec![];let result=invitation("mail",&mut|path|{paths.push(path.to_string());Ok((200,if path.contains("messages"){json!({"event":{"id":"event"},"previousStartDateTime":{"dateTime":"old"}})}else{current()}))}).unwrap();assert_eq!(paths.len(),2);assert!(paths[0].contains("$expand=microsoft.graph.eventMessage/event"));assert_eq!(result["event"]["changeKey"],"v1");}
 #[test]fn invitation_keeps_history_separate_from_current_response(){
  let result=invitation("old-mail",&mut|path|Ok((200,if path.contains("messages"){json!({"event":{"id":"event"},"meetingMessageType":"meetingRequest","isOutOfDate":true,"responseRequested":false,"previousEndDateTime":{"dateTime":"old-end"},"previousLocation":{"displayName":"Old room"}})}else{current()}))).unwrap();
  assert_eq!(result["isOutOfDate"],true);assert_eq!(result["responseRequested"],false);assert_eq!(result["previousLocation"]["displayName"],"Old room");assert_eq!(result["event"]["responseStatus"]["response"],"notResponded");assert_eq!(result["calendarUnavailable"],false);
 }
 #[test]fn response_message_without_current_event_does_not_invent_a_response(){
  for associated in [false,true]{let result=invitation("mail",&mut|path|if path.contains("messages"){Ok((200,json!({"meetingMessageType":"meetingAccepted","event":if associated{json!({"id":"event"})}else{Value::Null}})))}else{Ok((404,Value::Null))}).unwrap();assert!(result["event"].is_null());assert_eq!(result["calendarUnavailable"],true);assert_eq!(result["meetingMessageType"],"meetingAccepted");}
 }
}
