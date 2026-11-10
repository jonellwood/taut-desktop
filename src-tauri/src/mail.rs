//! Optional, read-only mailbox access. Continuations cannot leave the selected query.
use serde::Deserialize;
use serde_json::{json, Value};
use url::Url;
use base64::Engine;

#[derive(Clone, Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Query {
 pub collection:String,
 pub folder:Option<String>,
 pub message_id:Option<String>,
 pub conversation_id:Option<String>,
 pub search:Option<String>,
 pub next:Option<String>,
}
fn id(value:Option<&str>)->Result<&str,String>{value.filter(|s|!s.is_empty()&&s.len()<=1024&&!s.chars().any(|c|c.is_control()||"/\\?#".contains(c))&&*s!="."&&*s!="..").ok_or("Invalid mail identifier".into())}
fn enc(s:&str)->String{percent_encoding::utf8_percent_encode(s,percent_encoding::NON_ALPHANUMERIC).to_string()}
const SUMMARY:&str="id,conversationId,subject,from,toRecipients,receivedDateTime,sentDateTime,bodyPreview,isRead,hasAttachments,importance,webLink";
fn route(q:&Query)->Result<String,String>{
 let mut pairs:Vec<(&str,String)>=vec![];
 let path=match q.collection.as_str(){
  "messages"=>{
   let folder=q.folder.as_deref().unwrap_or("inbox");if !["inbox","sentitems"].contains(&folder){return Err("Unsupported mail folder".into());}
   pairs.push(("$select",SUMMARY.into()));pairs.push(("$top","25".into()));
   if let Some(search)=q.search.as_deref().filter(|s|!s.trim().is_empty()){
    if search.len()>500||search.chars().any(char::is_control){return Err("Search must be at most 500 characters".into());}
    pairs.push(("$search",format!("\"{}\"",search.trim().replace('\\',"\\\\").replace('"',"\\\""))));
    // Search intentionally covers the whole mailbox, including Sent Items.
    "/me/messages".into()
   }else{pairs.push(("$orderby","receivedDateTime desc".into()));format!("/me/mailFolders/{folder}/messages")}
  },
  "conversation"=>{let c=id(q.conversation_id.as_deref())?;pairs.extend([("$select",SUMMARY.into()),("$top","25".into()),("$filter",format!("conversationId eq '{}'",c.replace('\'',"''")))]);"/me/messages".into()},
  "message"=>{pairs.push(("$select",format!("{SUMMARY},ccRecipients,replyTo,body")));format!("/me/messages/{}",enc(id(q.message_id.as_deref())?))},
  // contentId belongs to fileAttachment, not the base attachment collection.
  // Qualify the derived property; keep contentBytes out of metadata requests.
  "attachments"=>{pairs.extend([("$select","id,name,contentType,size,isInline,microsoft.graph.fileAttachment/contentId".into()),("$top","25".into())]);format!("/me/messages/{}/attachments",enc(id(q.message_id.as_deref())?))},
  _=>return Err("Unsupported mail collection".into())
 };
 let query=url::form_urlencoded::Serializer::new(String::new()).extend_pairs(pairs).finish();Ok(format!("{path}?{query}"))
}
fn continuation(initial:&str,next:&str)->Result<String,String>{
 let base=Url::parse(&format!("https://graph.microsoft.com/v1.0{initial}")).map_err(|_|"Invalid mail query")?;
 let url=Url::parse(next).map_err(|_|"Invalid mail continuation")?;
 if url.scheme()!="https"||url.host_str()!=Some("graph.microsoft.com")||url.port().is_some()||!url.username().is_empty()||url.password().is_some()||url.fragment().is_some()||!url.path().starts_with("/v1.0/"){return Err("Invalid mail continuation destination".into());}
 // Graph may canonicalize /me and well-known folders into OData key routes.
 // Never follow that destination: apply its paging query to our original,
 // locally constructed /me resource instead. This also prevents a caller from
 // redirecting a continuation to another user's mailbox or another folder.
 let original:std::collections::HashMap<_,_>=base.query_pairs().map(|(k,v)|(k.into_owned(),v.into_owned())).collect();
 let mut seen=std::collections::HashSet::new();
 for (k,v) in url.query_pairs(){
  if !seen.insert(k.to_string())||v.len()>16000{return Err("Invalid mail continuation query".into());}
  if k=="$skip" {if v.parse::<u64>().is_err(){return Err("Invalid mail offset".into());}}
  else if k!="$skiptoken"&&original.get(k.as_ref()).map(String::as_str)!=Some(v.as_ref()){return Err("Mail continuation changed the selected query".into());}
 }
 for k in original.keys(){if !seen.contains(k){return Err("Mail continuation lost the selected query".into());}}
 Ok(format!("{}?{}",base.path().strip_prefix("/v1.0").ok_or("Invalid mail version")?,url.query().unwrap_or("")))
}
fn allowed(permitted:bool)->Result<(),String>{if permitted{Ok(())}else{Err("Mail preview needs delegated Mail.Read consent and a fresh sign-in. Chats remain available.".into())}}
fn status_error(status:u16)->String{match status{401=>"Mail sign-in expired. Reconnect from Account preferences.".into(),403=>"Mailbox access was denied. Check Mail.Read consent and mailbox availability.".into(),429=>"Mail is being throttled. Wait a little, then refresh.".into(),_=>format!("Mail could not be loaded (HTTP {status}). Your mailbox was not changed.")}}
pub fn page(q:&Query,permitted:bool,request:&mut dyn FnMut(&str)->Result<(u16,Value),String>)->Result<Value,String>{
 allowed(permitted)?;let initial=route(q)?;let path=if let Some(next)=&q.next{if q.collection=="message"{return Err("Messages do not have continuation pages".into());}continuation(&initial,next)?}else{initial};
 let (status,mut body)=request(&path)?;if status!=200{return Err(status_error(status));}
 if q.collection=="message" {if !body.is_object()||body.get("id").and_then(Value::as_str).is_none(){return Err("Invalid mail response".into());}return Ok(body);}
 let rows=body.get_mut("value").and_then(Value::as_array_mut).ok_or("Invalid mail collection")?;if rows.len()>100{return Err("Mail page exceeded its limit".into());}
 let next=body.get("@odata.nextLink").and_then(Value::as_str).map(str::to_owned);
 if let Some(next)=&next {continuation(&route(q)?,next)?;}
 Ok(json!({"value":body["value"],"next":next}))
}
pub fn attachment(message:&str,attachment:&str,permitted:bool,request:&mut dyn FnMut(&str)->Result<(u16,Value),String>)->Result<Value,String>{
 allowed(permitted)?;let path=format!("/me/messages/{}/attachments/{}",enc(id(Some(message))?),enc(id(Some(attachment))?));
 let(status,body)=request(&path)?;if status!=200{return Err(status_error(status));}
 if body["@odata.type"]!="#microsoft.graph.fileAttachment"{return Err("This attachment type can be opened in Outlook.".into());}
 let data=body["contentBytes"].as_str().ok_or("Attachment content unavailable")?;
 if data.len()>14_000_000{return Err("Attachments larger than 10 MB can be opened in Outlook.".into());}
 let bytes=base64::engine::general_purpose::STANDARD.decode(data).map_err(|_|"Invalid attachment content")?;
 if bytes.len()>10*1024*1024{return Err("Attachments larger than 10 MB can be opened in Outlook.".into());}
 Ok(json!({"name":body["name"].as_str().unwrap_or("attachment"),"contentType":body["contentType"].as_str().unwrap_or("application/octet-stream"),"base64":data}))
}
#[cfg(test)]
mod tests{
 use super::*;
 fn query(collection:&str)->Query{Query{collection:collection.into(),folder:None,message_id:Some("mail-id".into()),conversation_id:Some("conv-id".into()),search:None,next:None}}
 #[test]fn message_reads_select_actual_importance(){
  for collection in ["messages","conversation","message"]{
   let path=route(&query(collection)).unwrap();
   let url=Url::parse(&format!("https://graph.microsoft.com/v1.0{path}")).unwrap();
   let selected=url.query_pairs().find(|(k,_)|k=="$select").unwrap().1.into_owned();
   assert!(selected.split(',').any(|field|field=="importance"));
  }
 }
 #[test]fn attachment_metadata_qualifies_file_properties_and_preserves_paging(){
  let mut q=query("attachments");q.message_id=Some("mail+id=".into());
  let root=route(&q).unwrap();
  let url=Url::parse(&format!("https://graph.microsoft.com/v1.0{root}")).unwrap();
  assert_eq!(url.path(),"/v1.0/me/messages/mail%2Bid%3D/attachments");
  let selected=url.query_pairs().find(|(k,_)|k=="$select").unwrap().1.into_owned();
  assert_eq!(selected,"id,name,contentType,size,isInline,microsoft.graph.fileAttachment/contentId");
  assert!(!selected.split(',').any(|p|p=="contentId"||p=="contentBytes"));
  let next=format!("https://graph.microsoft.com/v1.0{root}&%24skip=25");
  let first=page(&q,true,&mut |path|{
   assert_eq!(path,root);
   Ok((200,json!({"value":[{"id":"logo","contentId":"signature","isInline":true},{"id":"item","@odata.type":"#microsoft.graph.itemAttachment"}],"@odata.nextLink":next})))
  }).unwrap();
  assert_eq!(first["value"][0]["contentId"],"signature");
  assert_eq!(first["value"].as_array().unwrap().len(),2);
  q.next=Some(next);
  page(&q,true,&mut |path|{assert_eq!(path,format!("{root}&%24skip=25"));Ok((200,json!({"value":[]})))}).unwrap();
 }
 #[test]fn no_consent_makes_no_request(){let mut n=0;let mut r=|_:&str|{n+=1;Ok((200,json!({"value":[]})))};assert!(page(&query("messages"),false,&mut r).is_err());assert!(attachment("m","a",false,&mut r).is_err());assert_eq!(n,0);}
 #[test]fn routes_are_read_only_and_query_encoded(){let mut q=query("messages");q.search=Some("boss & budget".into());let path=route(&q).unwrap();assert!(path.starts_with("/me/messages?"));assert!(path.contains("%26"));assert!(!path.contains("boss &"));q.collection="send".into();assert!(route(&q).is_err());q=query("message");q.message_id=Some("../token".into());assert!(route(&q).is_err());}
 #[test]fn continuations_stay_on_resource_and_query(){let root=route(&query("messages")).unwrap();let good=format!("https://graph.microsoft.com/v1.0{root}&%24skip=25");assert!(continuation(&root,&good).is_ok());for bad in [good.replace("graph.microsoft.com","evil.test"),good.replace("25","500"),good.replace("https://","http://"),good.replace("/v1.0/","/beta/"),good.replace("https://graph", "https://user@graph"),format!("{good}#fragment")]{assert!(continuation(&root,&bad).is_err());}}
 #[test]fn canonical_graph_paging_keeps_the_original_mailbox_and_folder(){
  let mut q=query("messages");let root=route(&q).unwrap();
  let query_string=root.split_once('?').unwrap().1;
  for destination in ["/me/mailFolders('Inbox')/messages", "/users/own-user/mailFolders/opaque-folder/messages", "/users/other-user/mailFolders/other-folder/messages"] {
   let next=format!("https://graph.microsoft.com/v1.0{destination}?{query_string}&%24skip=25");
   let first=page(&q,true,&mut |_|Ok((200,json!({"value":[{"id":"first"}],"@odata.nextLink":next})))).unwrap();
   assert_eq!(first["value"][0]["id"],"first");
   q.next=Some(next);
   page(&q,true,&mut |path|{assert_eq!(path,format!("{root}&%24skip=25"));Ok((200,json!({"value":[]})))}).unwrap();
   q.next=None;
  }
 }
 #[test]fn conversation_literals_and_search_limits(){let mut q=query("conversation");q.conversation_id=Some("a'b".into());assert!(route(&q).unwrap().contains("a%27%27b"));q=query("messages");q.search=Some("x".repeat(501));assert!(route(&q).is_err());}
 #[test]fn pages_and_errors_do_not_mutate(){let q=query("messages");let mut paths=vec![];let result=page(&q,true,&mut|p|{paths.push(p.to_string());Ok((200,json!({"value":[{"id":"a"}]})))}).unwrap();assert_eq!(result["value"][0]["id"],"a");assert_eq!(paths.len(),1);assert!(page(&q,true,&mut |_|Ok((429,Value::Null))).unwrap_err().contains("throttled"));}
 #[test]fn attachment_type_and_content_are_checked(){let mut calls=0;let result=attachment("m","a",true,&mut |_|{calls+=1;Ok((200,json!({"@odata.type":"#microsoft.graph.fileAttachment","name":"test.txt","contentType":"text/plain","contentBytes":"aGk="})))}).unwrap();assert_eq!(calls,1);assert_eq!(result["base64"],"aGk=");assert!(attachment("m","a",true,&mut |_|Ok((200,json!({"@odata.type":"#microsoft.graph.referenceAttachment"})))).is_err());}
}
