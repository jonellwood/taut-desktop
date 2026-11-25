//! Explicit own-drive recycle-bin deletion. No write retries or permanent deletion.
use serde::Deserialize;
use serde_json::{json,Value};
use reqwest::Method;
use std::collections::{HashMap,HashSet};
#[derive(Deserialize,Clone)]
#[serde(deny_unknown_fields)]
pub struct Item{pub id:String,pub name:String,pub folder:bool}
pub type Request<'a>=dyn FnMut(Method,&str,Option<&str>)->Result<(u16,Value),String>+'a;
fn read(path:&str,r:&mut Request<'_>)->Result<Value,String>{let(s,v)=r(Method::GET,path,None)?;if s!=200{return Err(format!("Item unavailable (HTTP {s})."));}Ok(v)}
fn account(own:&str,r:&mut Request<'_>)->Result<(),String>{if read("/me?$select=id",r)?["id"].as_str()!=Some(own){return Err("Account changed. Reopen Files.".into());}Ok(())}
pub fn delete(own:&str,items:&[Item],permitted:bool,r:&mut Request<'_>)->Result<Value,String>{
 if !permitted{return Err("Deleting needs existing Files.ReadWrite consent. Sign in again.".into());}
 if items.is_empty()||items.len()>100{return Err("Select between 1 and 100 items.".into());}
 let mut ids=HashSet::new();for item in items{crate::files::segment(&item.id)?;if !ids.insert(item.id.clone())||item.name.is_empty(){return Err("Invalid selection. Review again.".into());}}
 account(own,r)?;let drive=read("/me/drive?$select=id",r)?;let base=format!("/drives/{}",crate::files::segment(drive["id"].as_str().ok_or("Drive unavailable")?)?);
 let mut metadata=HashMap::new();let mut ancestors=HashMap::new();let mut failures=HashMap::new();
 // Resolve ancestry before any writes so a selected descendant is never deleted separately.
 for item in items{let result=(||->Result<(),String>{let v=read(&format!("{base}/items/{}",crate::files::segment(&item.id)?),r)?;
 if v["id"].as_str()!=Some(&item.id)||v["name"].as_str()!=Some(&item.name)||v["folder"].is_object()!=item.folder||v["root"].is_object()||v["remoteItem"].is_object(){return Err("Item changed or is a shared shortcut. Refresh and review again.".into());}
 if v["eTag"].as_str().filter(|s|!s.is_empty()).is_none(){return Err("Item version unavailable. Refresh and review again.".into());}
 let mut chain=vec![];let mut current=v.clone();for _ in 0..64{if current["root"].is_object(){ancestors.insert(item.id.clone(),chain);metadata.insert(item.id.clone(),v);return Ok(());}
 let parent=current["parentReference"]["id"].as_str().ok_or("Parent unavailable")?;
 if chain.iter().any(|s|s==parent){return Err("Folder ancestry unavailable.".into());}chain.push(parent.to_string());current=read(&format!("{base}/items/{}",crate::files::segment(parent)?),r)?;if current["remoteItem"].is_object(){return Err("Shared shortcuts cannot be deleted here.".into());}}
 Err("Folder ancestry exceeds supported depth.".into())})();if let Err(e)=result{failures.insert(item.id.clone(),e);}}
 let folders:HashSet<_>=items.iter().filter(|i|i.folder).map(|i|i.id.clone()).collect();let mut results=vec![];let mut stopped=false;
 for item in items{if let Some(e)=failures.get(&item.id){results.push(json!({"id":item.id,"status":"failed","error":e}));continue;}
 if let Some(parent)=ancestors[&item.id].iter().find(|id|folders.contains(*id)){results.push(json!({"id":item.id,"status":"covered","coveredBy":parent}));continue;}
 if stopped{results.push(json!({"id":item.id,"status":"failed","error":"Not attempted after an unconfirmed result. Check OneDrive first."}));continue;}
 if let Err(e)=account(own,r){results.push(json!({"id":item.id,"status":"failed","error":e}));stopped=true;continue;}
 let tag=metadata[&item.id]["eTag"].as_str().unwrap();let result=r(Method::DELETE,&format!("{base}/items/{}",crate::files::segment(&item.id)?),Some(tag));
 match result{Ok((204,_))=>results.push(json!({"id":item.id,"status":"deleted"})),Ok((status,_))if [400,401,403,404,409,412,423,429].contains(&status)=>results.push(json!({"id":item.id,"status":"failed","error":format!("Not deleted (HTTP {status}). Refresh and review before retrying.")})),_=>{stopped=true;results.push(json!({"id":item.id,"status":"unconfirmed","error":"Deletion was not confirmed. Check OneDrive before retrying. No retry was sent."}));}}
 }
 Ok(json!({"results":results}))
}
#[cfg(test)]mod tests{use super::*;
fn item(id:&str,folder:bool)->Item{Item{id:id.into(),name:id.into(),folder}}
fn response(m:Method,p:&str)->(u16,Value){(if m==Method::DELETE{204}else{200},if p=="/me?$select=id"{json!({"id":"me"})}else if p.starts_with("/me/drive?"){json!({"id":"drive"})}else if p.ends_with("/root"){json!({"id":"root","root":{},"folder":{}})}else{let id=p.rsplit('/').next().unwrap();json!({"id":id,"name":id,"eTag":"tag","parentReference":{"id":"root"}})})}
#[test]fn no_consent_or_duplicate_selection_has_no_requests(){assert!(delete("me",&[item("a",false)],false,&mut|_,_,_|panic!()).is_err());assert!(delete("me",&[item("a",false),item("a",false)],true,&mut|_,_,_|panic!()).is_err());}
#[test]fn conditional_delete_and_partial_results(){let mut writes=vec![];let v=delete("me",&[item("a",false),item("b",false)],true,&mut|m,p,tag|{if m==Method::DELETE{assert_eq!(tag,Some("tag"));writes.push(p.to_string());if p.ends_with("/b"){return Ok((412,Value::Null));}}Ok(response(m,p))}).unwrap();assert_eq!(writes.len(),2);assert_eq!(v["results"][0]["status"],"deleted");assert_eq!(v["results"][1]["status"],"failed");}
#[test]fn uncertain_write_stops_without_retry(){let mut writes=0;let v=delete("me",&[item("a",false),item("b",false)],true,&mut|m,p,_|{if m==Method::DELETE{writes+=1;return Err("network".into());}Ok(response(m,p))}).unwrap();assert_eq!(writes,1);assert_eq!(v["results"][0]["status"],"unconfirmed");}
#[test]fn selected_descendant_is_covered_by_folder(){let mut writes=vec![];let v=delete("me",&[item("child",false),item("parent",true)],true,&mut|m,p,_|{if m==Method::DELETE{writes.push(p.to_string());}let(s,mut v)=response(m,p);if p.ends_with("/child"){v["parentReference"]=json!({"id":"parent"});}if p.ends_with("/parent"){v["folder"]=json!({});}Ok((s,v))}).unwrap();assert_eq!(writes.len(),1);assert!(writes[0].ends_with("/parent"));assert_eq!(v["results"][0]["status"],"covered");assert_eq!(v["results"][0]["coveredBy"],"parent");}
#[test]fn changed_item_and_account_never_deleted(){let mut reads=0;let v=delete("me",&[item("a",false)],true,&mut|m,p,_|{assert_eq!(m,Method::GET);let(s,mut v)=response(m,p);if p=="/me?$select=id"{reads+=1;if reads>1{v["id"]=json!("other");}}Ok((s,v))}).unwrap();assert_eq!(v["results"][0]["status"],"failed");}
#[test]fn root_shortcut_and_renamed_items_are_refused(){for mode in ["root","shortcut","renamed","version"]{let v=delete("me",&[item("a",false)],true,&mut|m,p,_|{assert_eq!(m,Method::GET);let(status,mut v)=response(m,p);if p.ends_with("/a"){match mode{"root"=>v["root"]=json!({}),"shortcut"=>v["remoteItem"]=json!({}),"renamed"=>v["name"]=json!("different"),_=>v["eTag"]=Value::Null}}Ok((status,v))}).unwrap();assert_eq!(v["results"][0]["status"],"failed");}}

}
