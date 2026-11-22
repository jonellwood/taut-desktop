//! Bounded new daily/weekly series, constructed with named-zone wall times.
use chrono::Datelike;
use serde::{Deserialize,Serialize};
use serde_json::{json,Value};
#[derive(Clone,Deserialize,Serialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Recurrence{pub frequency:String,pub interval:u16,pub days_of_week:Vec<String>,pub ending:String,pub count:Option<u16>,pub end_date:Option<String>,pub time_zone:String}
const DAYS:[&str;7]=["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
pub fn apply(body:&mut Value,r:&Recurrence,start:&str,end:&str)->Result<(),String>{
 let fail="Check recurrence: daily/weekly, interval 1–52, selected weekdays, and an end date or 1–365 occurrences.";
 if !matches!(r.frequency.as_str(),"daily"|"weekly")||!(1..=52).contains(&r.interval)||r.days_of_week.len()>7{return Err(fail.into());}
 let tz:chrono_tz::Tz=r.time_zone.parse().map_err(|_|"Choose a supported named time zone for this series.")?;
 let start=chrono::DateTime::parse_from_rfc3339(start).map_err(|_|fail)?.with_timezone(&tz);
 let end=chrono::DateTime::parse_from_rfc3339(end).map_err(|_|fail)?.with_timezone(&tz);
 let mut pattern=json!({"type":r.frequency,"interval":r.interval});
 if r.frequency=="weekly"{
  let unique:std::collections::HashSet<_>=r.days_of_week.iter().map(String::as_str).collect();
  if unique.is_empty()||unique.len()!=r.days_of_week.len()||unique.iter().any(|day|!DAYS.contains(day))||!unique.contains(DAYS[start.weekday().num_days_from_monday() as usize]){return Err("Select valid weekdays including the first meeting's weekday.".into());}
  pattern["daysOfWeek"]=json!(DAYS.iter().filter(|day|unique.contains(**day)).collect::<Vec<_>>());pattern["firstDayOfWeek"]=json!("monday");
 }else if !r.days_of_week.is_empty(){return Err(fail.into());}
 let date=start.date_naive();
 let mut range=json!({"startDate":date.to_string(),"recurrenceTimeZone":r.time_zone});
 match r.ending.as_str(){
  "count"=>{let count=r.count.filter(|n|(1..=365).contains(n)).ok_or(fail)?;if r.end_date.is_some(){return Err(fail.into());}range["type"]=json!("numbered");range["numberOfOccurrences"]=json!(count);},
  "date"=>{let raw=r.end_date.as_deref().ok_or(fail)?;let until=chrono::NaiveDate::parse_from_str(raw,"%Y-%m-%d").map_err(|_|fail)?;if raw!=until.to_string()||until<date||r.count.is_some(){return Err("The series end date must be on or after the first meeting date.".into());}range["type"]=json!("endDate");range["endDate"]=json!(raw);},
  _=>return Err(fail.into())
 }
 body["start"]=json!({"dateTime":start.format("%Y-%m-%dT%H:%M:%S").to_string(),"timeZone":r.time_zone});
 body["end"]=json!({"dateTime":end.format("%Y-%m-%dT%H:%M:%S").to_string(),"timeZone":r.time_zone});
 body["recurrence"]=json!({"pattern":pattern,"range":range});Ok(())
}

#[cfg(test)]mod tests{
 use super::*;
 use chrono::TimeZone;
 fn rule()->Recurrence{Recurrence{frequency:"weekly".into(),interval:1,days_of_week:vec!["monday".into(),"wednesday".into()],ending:"count".into(),count:Some(6),end_date:None,time_zone:"America/New_York".into()}}
 #[test]fn weekly_payload_has_named_zone_and_preserves_local_time_across_dst(){
  let mut body=json!({});apply(&mut body,&rule(),"2026-03-02T14:00:00Z","2026-03-02T15:00:00Z").unwrap();
  assert_eq!(body["start"],json!({"dateTime":"2026-03-02T09:00:00","timeZone":"America/New_York"}));assert_eq!(body["recurrence"]["pattern"],json!({"type":"weekly","interval":1,"daysOfWeek":["monday","wednesday"],"firstDayOfWeek":"monday"}));assert_eq!(body["recurrence"]["range"]["numberOfOccurrences"],6);
  let tz:chrono_tz::Tz="America/New_York".parse().unwrap();let after=tz.with_ymd_and_hms(2026,3,9,9,0,0).single().unwrap();assert_eq!(after.with_timezone(&chrono::Utc).format("%H:%M").to_string(),"13:00");
 }
 #[test]fn recurrence_start_date_is_local_not_utc(){let mut r=rule();r.days_of_week=vec!["monday".into()];let mut body=json!({});apply(&mut body,&r,"2026-11-24T01:00:00Z","2026-11-24T02:00:00Z").unwrap();assert_eq!(body["recurrence"]["range"]["startDate"],"2026-11-23");}
 #[test]fn daily_end_date_uses_only_relevant_graph_fields(){let mut r=rule();r.frequency="daily".into();r.days_of_week.clear();r.ending="date".into();r.count=None;r.end_date=Some("2026-04-01".into());let mut body=json!({});apply(&mut body,&r,"2026-03-02T14:00:00Z","2026-03-02T15:00:00Z").unwrap();assert_eq!(body["recurrence"]["pattern"],json!({"type":"daily","interval":1}));assert_eq!(body["recurrence"]["range"]["endDate"],"2026-04-01");assert!(body["recurrence"]["range"].get("numberOfOccurrences").is_none());}
 #[test]fn invalid_recurrence_blocks_creation_before_any_request(){
  let base=serde_json::json!({"transactionId":"12345678-1234-1234","subject":"Series","description":"","start":"2026-03-02T14:00:00Z","end":"2026-03-02T15:00:00Z","attendees":[],"room":null,"recurrence":serde_json::to_value(rule()).unwrap()});
  for patch in [json!({"frequency":"monthly"}),json!({"interval":0}),json!({"interval":53}),json!({"daysOfWeek":[]}),json!({"daysOfWeek":["tuesday"]}),json!({"daysOfWeek":["monday","monday"]}),json!({"count":0}),json!({"count":366}),json!({"timeZone":"Not/AZone"}),json!({"ending":"noEnd"}),json!({"ending":"date","count":null,"endDate":"2026-03-01"})]{
   let mut value=base.clone();for(k,v)in patch.as_object().unwrap(){value["recurrence"][k]=v.clone();}
   let draft:crate::meeting::Draft=serde_json::from_value(value).unwrap();assert!(crate::meeting::create(&draft,true,&mut|_,_,_|panic!("No request for invalid recurrence")).is_err());
  }
 }
 #[test]fn recurring_hybrid_remains_one_event_write_with_all_attendees(){
  let draft:crate::meeting::Draft=serde_json::from_value(json!({"transactionId":"12345678-1234-1234","subject":"Series","description":"","start":"2026-03-02T14:00:00Z","end":"2026-03-02T15:00:00Z","attendees":["person@example.test"],"room":{"emailAddress":"room@example.test","displayName":"Room"},"online":true,"recurrence":rule()})).unwrap();
  let mut posts=0;let result=crate::meeting::create(&draft,true,&mut|method,path,body|{if method=="GET"{return Ok((200,json!({"allowedOnlineMeetingProviders":["teamsForBusiness"]})));}posts+=1;assert_eq!(path,"/me/events");assert_eq!(body["isOnlineMeeting"],true);assert_eq!(body["attendees"][1]["type"],"resource");assert!(body["recurrence"].is_object());Err("timeout".into())}).unwrap();assert_eq!(posts,1);assert_eq!(result["status"],"uncertain");
 }
}
