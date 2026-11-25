//! Explicit, reviewed OneDrive uploads. No automatic write retries.
use base64::{engine::general_purpose::STANDARD,Engine as _};
use serde_json::{json,Value};
use std::{collections::BTreeMap,sync::Mutex};
pub const MAX:usize=10*1024*1024;
#[derive(Default)]pub struct State(pub Mutex<BTreeMap<String,Value>>);
pub fn input(attempt:&str,name:&str,data:&str,behavior:&str)->Result<Vec<u8>,String>{
 if !crate::presence::guid(attempt)||name.trim().is_empty()||name.len()>180||name.ends_with(['.',' '])||name.chars().any(|c|c.is_control()||"<>:\"/\\|?*".contains(c))||!["rename","fail"].contains(&behavior){return Err("Invalid upload filename, attempt, or duplicate-name choice.".into());}
 if data.len()>MAX.div_ceil(3)*4{return Err("Choose files up to 10 MB each.".into());}let bytes=STANDARD.decode(data).map_err(|_|"The selected file could not be read.")?;if bytes.is_empty()||bytes.len()>MAX{return Err("Choose nonempty files up to 10 MB each.".into());}Ok(bytes)
}
pub fn session_path(drive:&str,parent:&str,name:&str)->Result<String,String>{Ok(format!("/drives/{}/items/{}:/{}:/createUploadSession",crate::files::segment(drive)?,crate::files::segment(parent)?,crate::files::segment(name)?))}
pub fn transfer(url:&str,bytes:&[u8],put:&mut dyn FnMut(&str,&str,&[u8])->Result<(u16,Value),String>,progress:&mut dyn FnMut(usize))->Result<Value,String>{
 crate::files::download_url(url)?;
 const CHUNK:usize=320*1024*4;
 for (index,chunk) in bytes.chunks(CHUNK).enumerate(){let start=index*CHUNK;let end=start+chunk.len();let range=format!("bytes {}-{}/{}",start,end-1,bytes.len());
  let(status,value)=put(url,&range,chunk)?;
  if end==bytes.len(){if ![200,201].contains(&status)||value["id"].as_str().is_none()||value["name"].as_str().is_none()||value["size"].as_u64()!=Some(bytes.len() as u64)||!value["file"].is_object(){return Err("Upload completion was not confirmed. Check OneDrive before retrying.".into());}progress(end);return Ok(json!({"id":value["id"],"name":value["name"],"size":value["size"]}));}
  if status!=202{return Err("Upload stopped. Check OneDrive before retrying.".into());}
  let expected=format!("{end}-");if value["nextExpectedRanges"].as_array().is_none_or(|ranges|ranges.len()!=1||ranges[0].as_str()!=Some(&expected)){return Err("Upload progress could not be confirmed. Check OneDrive before retrying.".into());}progress(end);
 }Err("Empty upload".into())
}
impl State{
 pub fn begin(&self,attempt:&str,own:&str,total:usize)->Result<(),String>{let mut rows=self.0.lock().map_err(|_|"Upload state unavailable")?;if rows.contains_key(attempt)||rows.values().any(|r|r["own"]==own&&r["status"]=="uploading"){return Err("An upload was already attempted or is still running. Check OneDrive first.".into());}if rows.len()>=1000{return Err("Upload history is full for this session. Restart TAUT after checking OneDrive.".into());}rows.insert(attempt.into(),json!({"own":own,"status":"uploading","uploaded":0,"total":total}));Ok(())}
 pub fn update(&self,attempt:&str,uploaded:usize,status:&str){if let Ok(mut rows)=self.0.lock(){if let Some(row)=rows.get_mut(attempt){row["uploaded"]=json!(uploaded);row["status"]=json!(status);}}}
 pub fn progress(&self,attempt:&str,own:&str)->Result<Value,String>{let rows=self.0.lock().map_err(|_|"Upload state unavailable")?;Ok(rows.get(attempt).filter(|r|r["own"]==own).map(|r|json!({"status":r["status"],"uploaded":r["uploaded"],"total":r["total"]})).unwrap_or(json!({"status":"unknown"})))}
}
#[cfg(test)]mod tests{use super::*;
#[test]fn input_rejects_invalid_names_overwrite_and_oversize_before_writes(){let id="81496ff4-75b6-4961-bc40-b6915af5d737";assert_eq!(input(id,"test.txt","YWJj","rename").unwrap(),b"abc");for(name,mode)in[("../test","rename"),("test.txt","replace"),("test. ","fail")]{assert!(input(id,name,"YWJj",mode).is_err());}assert!(input(id,"test.txt","","fail").is_err());assert!(input(id,"test.txt",&"a".repeat(MAX.div_ceil(3)*4+1),"fail").is_err());}
#[test]fn chunk_progress_and_final_result_are_verified_without_exposing_urls(){let bytes=vec![1;320*1024*4+2];let mut ranges=vec![];let mut progress=vec![];let item=transfer("https://upload.1drv.com/test",&bytes,&mut|_,range,chunk|{ranges.push((range.to_string(),chunk.len()));Ok(if ranges.len()==1{(202,json!({"nextExpectedRanges":["1310720-"]}))}else{(201,json!({"id":"file","name":"test.bin","file":{},"size":bytes.len(),"uploadUrl":"secret"}))})},&mut|n|progress.push(n)).unwrap();assert_eq!(ranges[1],("bytes 1310720-1310721/1310722".into(),2));assert_eq!(progress,vec![1310720,1310722]);assert!(!item.to_string().contains("secret"));}
#[test]fn upload_failure_is_not_retried(){let mut calls=0;assert!(transfer("https://upload.1drv.com/test",b"abc",&mut|_,_,_|{calls+=1;Err("network error".into())},&mut|_|{}).is_err());assert_eq!(calls,1);}
#[test]fn attempts_are_scoped_and_cannot_overlap_or_repeat(){let s=State::default();s.begin("one","own",10).unwrap();assert!(s.begin("two","own",10).is_err());assert_eq!(s.progress("one","other").unwrap()["status"],"unknown");s.update("one",10,"complete");assert!(s.begin("one","own",10).is_err());s.begin("two","own",10).unwrap();}
#[test]fn invalid_upload_hosts_and_unverified_final_sizes_stop_without_retry(){let mut calls=0;assert!(transfer("https://evil.test/upload",b"abc",&mut|_,_,_|{calls+=1;Ok((201,json!({})) )},&mut|_|{}).is_err());assert_eq!(calls,0);assert!(transfer("https://upload.1drv.com/test",b"abc",&mut|_,_,_|{calls+=1;Ok((201,json!({"id":"id","name":"file","file":{},"size":4})))},&mut|_|panic!("unverified progress")).is_err());assert_eq!(calls,1);}

}
