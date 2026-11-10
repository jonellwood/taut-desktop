//! Narrow read-state mutation; the transport is injected for offline testing.
use serde_json::{json,Value};
pub fn change(own:&str,message:&str,read:bool,permitted:bool,request:&mut dyn FnMut(&str,&str,Option<Value>)->Result<(u16,Value),String>)->Result<Value,String>{
 if !permitted{return Err("Read-state changes need Mail.ReadWrite consent and a fresh sign-in.".into());}
 if own.is_empty()||message.is_empty()||message.len()>1024||message=="."||message==".."||message.chars().any(|c|c.is_control()||"/\\?#".contains(c)){return Err("Invalid mail identity".into());}
 let(status,me)=request("GET","/me?$select=id",None)?;
 if status!=200||me["id"].as_str()!=Some(own){return Err("Account changed. Reconnect before changing mail.".into());}
 let path=format!("/me/messages/{}",percent_encoding::utf8_percent_encode(message,percent_encoding::NON_ALPHANUMERIC));
 // Never retry a write. Reconcile through a fresh GET even on an ambiguous outcome.
 let _=request("PATCH",&path,Some(json!({"isRead":read})));
 let(status,value)=request("GET",&format!("{path}?$select=id,isRead"),None)?;
 if status!=200||value["id"].as_str()!=Some(message)||value["isRead"].as_bool()!=Some(read){return Err("Mail read state was not confirmed. Refresh before trying again.".into());}
 Ok(json!({"id":message,"isRead":read}))
}
#[cfg(test)]mod tests{use super::*;
 #[test]fn gates_and_reconciles_only_is_read(){let mut calls=vec![];let result=change("me","m",false,true,&mut|method,path,body|{calls.push((method.to_string(),path.to_string(),body.clone()));Ok((200,if path.starts_with("/me?"){json!({"id":"me"})}else{json!({"id":"m","isRead":false})}))}).unwrap();assert_eq!(result["isRead"],false);assert_eq!(calls.len(),3);assert_eq!(calls[1].0,"PATCH");assert_eq!(calls[1].2,Some(json!({"isRead":false})));}
 #[test]fn missing_scope_bad_id_and_account_never_write(){for (scope,id) in [(false,"m"),(true,"../bad"),(true,"m")]{let mut writes=0;assert!(change("me",id,true,scope,&mut|method,_,_|{if method=="PATCH"{writes+=1;}Ok((200,json!({"id":"other"})))}).is_err());assert_eq!(writes,0);}}
 #[test]fn ambiguous_write_is_read_back_without_retry(){let mut writes=0;assert!(change("me","m",true,true,&mut|method,path,_|{if method=="PATCH"{writes+=1;return Err("timeout".into());}Ok((200,if path.starts_with("/me?"){json!({"id":"me"})}else{json!({"id":"m","isRead":false})}))}).is_err());assert_eq!(writes,1);}
}
