//! Reviewed creation in the user's own drive. Duplicate names fail; POST never retries.
use reqwest::Method;
use serde_json::{json,Value};
use crate::groups::Request;
pub fn valid_name(name:&str)->bool{!name.trim().is_empty()&&name==name.trim()&&name.len()<=180&&!name.ends_with('.')&&!name.chars().any(|c|c.is_control()||"<>:\"/\\|?*".contains(c))&&!matches!(name,"."|"..")}
pub fn create(own:&str,folder:Option<&str>,name:&str,permitted:bool,request:&mut Request<'_>)->Result<Value,String>{
 if !permitted{return Err("New folders need Files.ReadWrite consent and a fresh sign-in.".into());}
 if !valid_name(name){return Err("Choose a folder name up to 180 characters without reserved filename characters or trailing spaces/dots.".into());}
 if crate::deletion::own_id(request)?!=own{return Err("Account changed. Reopen Files.".into());}
 let drive=crate::files::drive(true,&mut|p|{let r=request(Method::GET,p,None)?;Ok((r.status,r.body))})?;
 let drive_id=crate::files::segment(drive["id"].as_str().ok_or("OneDrive identity unavailable")?)?;
 let parent_path=match folder{Some(id)=>format!("/drives/{drive_id}/items/{}",crate::files::segment(id)?),None=>format!("/drives/{drive_id}/root")};
 let parent=request(Method::GET,&parent_path,None)?;
 if parent.status!=200||!parent.body["folder"].is_object()||parent.body["remoteItem"].is_object(){return Err("Choose a folder in your own OneDrive.".into());}
 let parent_id=crate::files::segment(parent.body["id"].as_str().ok_or("Destination unavailable")?)?;
 if crate::deletion::own_id(request)?!=own{return Err("Account changed. Nothing was created.".into());}
 let result=request(Method::POST,&format!("/drives/{drive_id}/items/{parent_id}/children"),Some(json!({"name":name,"folder":{},"@microsoft.graph.conflictBehavior":"fail"})));
 match result{
  Ok(reply)if reply.status==201&&reply.body["folder"].is_object()&&reply.body["id"].as_str().is_some()&&reply.body["name"].as_str()==Some(name)=>Ok(json!({"status":"created","item":{"id":reply.body["id"],"name":reply.body["name"]}})),
  Ok(reply)if reply.status==409=>Ok(json!({"status":"notSent","error":"An item with this name already exists. Choose another name; nothing was replaced or renamed."})),
  Ok(reply)if [400,401,403,404,412,423,507].contains(&reply.status)=>Ok(json!({"status":"notSent","error":format!("The folder could not be created (HTTP {}). Nothing was replaced.",reply.status)})),
  _=>Ok(json!({"status":"unconfirmed","error":"Folder creation was not confirmed. Refresh OneDrive and check for this folder before trying again. No retry was sent."})),
 }
}
#[cfg(test)]mod tests{use super::*;use crate::groups::Reply;
const OWN:&str="81496ff4-75b6-4961-bc40-b6915af5d737";
fn graph(method:Method,path:&str)->Reply{Reply{status:200,body:if path=="/me?$select=id"{json!({"id":OWN})}else if path.starts_with("/me/drive?"){json!({"id":"drive"})}else if method==Method::GET{json!({"id":"parent","folder":{}})}else{Value::Null}}}
#[test]fn invalid_inputs_make_no_requests(){for name in ["","../folder","bad/name","name.","name ",".",".."]{assert!(create(OWN,None,name,true,&mut|_,_,_|panic!("request")).is_err());}assert!(create(OWN,None,"Good",false,&mut|_,_,_|panic!("request")).is_err());}
#[test]fn creation_targets_verified_parent_and_fails_on_duplicate_names(){let mut writes=vec![];let result=create(OWN,Some("parent"),"Project & notes",true,&mut|m,p,b|{if m==Method::POST{writes.push((p.to_string(),b.unwrap()));Ok(Reply{status:201,body:json!({"id":"created","name":"Project & notes","folder":{},"webUrl":"not returned"})})}else{Ok(graph(m,p))}}).unwrap();assert_eq!(writes.len(),1);assert_eq!(writes[0].0,"/drives/drive/items/parent/children");assert_eq!(writes[0].1["@microsoft.graph.conflictBehavior"],"fail");assert_eq!(result["status"],"created");assert!(!result.to_string().contains("not returned"));}
#[test]fn conflict_and_uncertain_response_never_retry(){for status in [409,500]{let mut writes=0;let result=create(OWN,None,"New",true,&mut|m,p,_|{if m==Method::POST{writes+=1;Ok(Reply{status,body:Value::Null})}else{Ok(graph(m,p))}}).unwrap();assert_eq!(writes,1);assert_eq!(result["status"],if status==409{"notSent"}else{"unconfirmed"});}}
#[test]fn account_change_and_remote_folder_prevent_writes(){let mut me=0;assert!(create(OWN,None,"New",true,&mut|m,p,_|{assert_eq!(m,Method::GET);let mut r=graph(m,p);if p=="/me?$select=id"{me+=1;if me==2{r.body=json!({"id":"other"});}}Ok(r)}).is_err());assert!(create(OWN,None,"New",true,&mut|m,p,_|{assert_eq!(m,Method::GET);let mut r=graph(m,p);if p.ends_with("/root"){r.body["remoteItem"]=json!({});}Ok(r)}).is_err());}
}
