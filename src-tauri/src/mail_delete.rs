//! Explicit, single-message move. Never retry a mutation.
use serde_json::{json,Value};
pub fn move_deleted(own:&str,message:&str,permitted:bool,request:&mut dyn FnMut(&str,&str,Option<Value>)->Result<(u16,Value),String>)->Result<Value,String>{
 if !permitted{return Err("Moving mail needs Mail.ReadWrite consent and a fresh sign-in.".into());}
 if own.is_empty()||message.is_empty()||message.len()>1024||message=="."||message==".."||message.chars().any(|c|c.is_control()||"/\\?#".contains(c)){return Err("Invalid mail identity".into());}
 let(status,me)=request("GET","/me?$select=id",None)?;
 if status!=200||me["id"].as_str()!=Some(own){return Err("Account changed. Reconnect before moving mail.".into());}
 let path=format!("/me/messages/{}/move",percent_encoding::utf8_percent_encode(message,percent_encoding::NON_ALPHANUMERIC));
 let uncertain="Move not confirmed. Check Deleted Items in Outlook before another attempt.";
 let(status,value)=request("POST",&path,Some(json!({"destinationId":"deleteditems"}))).map_err(|_|uncertain.to_string())?;
 if status!=201||value["id"].as_str().is_none_or(str::is_empty){return Err(uncertain.into());}
 Ok(json!({"id":value["id"]}))
}
#[cfg(test)]mod tests{use super::*;
 #[test]fn moves_once_to_deleted_items(){let mut calls=vec![];let result=move_deleted("me","m",true,&mut|method,path,body|{calls.push((method.to_owned(),path.to_owned(),body));Ok(if method=="GET"{(200,json!({"id":"me"}))}else{(201,json!({"id":"new"}))})}).unwrap();assert_eq!(result["id"],"new");assert_eq!(calls.len(),2);assert_eq!(calls[1].1,"/me/messages/m/move");assert_eq!(calls[1].2,Some(json!({"destinationId":"deleteditems"})));}
 #[test]fn gates_never_write(){for(scope,id)in[(false,"m"),(true,"../bad"),(true,"m")]{let mut writes=0;assert!(move_deleted("me",id,scope,&mut|method,_,_|{if method=="POST"{writes+=1;}Ok((200,json!({"id":"other"})))}).is_err());assert_eq!(writes,0);}}
 #[test]fn uncertain_write_is_not_retried(){let mut writes=0;assert!(move_deleted("me","m",true,&mut|method,_,_|{if method=="POST"{writes+=1;Err("timeout".into())}else{Ok((200,json!({"id":"me"})))}}).is_err());assert_eq!(writes,1);}
}
