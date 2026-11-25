//! OneDrive reads only. Download URLs never cross IPC.
use serde::Deserialize;
use serde_json::{json,Value};
pub type Request<'a>=dyn FnMut(&str)->Result<(u16,Value),String>+'a;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Query {pub folder:Option<String>,pub search:Option<String>,pub next:Option<String>}
pub fn segment(value:&str)->Result<String,String>{
 if value.is_empty()||value.len()>512||value.chars().any(char::is_control){return Err("Invalid OneDrive identifier".into());}
 Ok(percent_encoding::utf8_percent_encode(value,percent_encoding::NON_ALPHANUMERIC).to_string())
}
fn get(path:&str,request:&mut Request<'_>)->Result<Value,String>{let(status,value)=request(path)?;if status!=200{return Err(format!("OneDrive could not be loaded (HTTP {status})."));}Ok(value)}
pub fn drive(permitted:bool,request:&mut Request<'_>)->Result<Value,String>{if !permitted{return Err("OneDrive needs Files.Read consent and a fresh sign-in.".into());}get("/me/drive?$select=id,name,owner,webUrl",request)}
fn base(drive:&str,q:&Query)->Result<String,String>{
 let root=format!("/drives/{}",segment(drive)?);
 if let Some(search)=q.search.as_deref(){let search=search.trim();if search.is_empty()||search.len()>500||search.chars().any(char::is_control){return Err("Enter a search of up to 500 characters.".into());}if q.folder.is_some(){return Err("Search covers your whole OneDrive.".into());}let escaped=search.replace('\'',"''");return Ok(format!("{root}/root/search(q='{}')",percent_encoding::utf8_percent_encode(&escaped,percent_encoding::NON_ALPHANUMERIC)));}
 Ok(match q.folder.as_deref(){Some(folder)=>format!("{root}/items/{}/children",segment(folder)?),None=>format!("{root}/root/children")})
}
fn continuation(value:&str,path:&str)->Result<String,String>{
 if value.len()>16000{return Err("Invalid OneDrive continuation".into());}
 let url=url::Url::parse(value).map_err(|_|"Invalid OneDrive continuation")?;
 if url.scheme()!="https"||url.host_str()!=Some("graph.microsoft.com")||url.port().is_some()||!url.username().is_empty()||url.password().is_some()||url.fragment().is_some()||percent_encoding::percent_decode_str(url.path()).decode_utf8_lossy()!=percent_encoding::percent_decode_str(&format!("/v1.0{path}")).decode_utf8_lossy(){return Err("Invalid OneDrive continuation destination".into());}
 Ok(format!("{path}{}",url.query().map(|q|format!("?{q}")).unwrap_or_default()))
}
fn row(value:&Value,owner:&str,drive_id:&str)->Option<Value>{
 let id=value["id"].as_str()?;segment(id).ok()?;
 let remote=value["remoteItem"].is_object()||value["parentReference"]["driveId"].as_str().is_some_and(|id|id!=drive_id);
 Some(json!({"id":id,"name":value["name"].as_str().unwrap_or("Untitled"),"size":value["size"].as_u64().unwrap_or(0),"created":value["createdDateTime"],"modified":value["lastModifiedDateTime"],"folder":value["folder"].is_object(),"shortcut":remote,"mime":value["file"]["mimeType"],"parentId":value["parentReference"]["id"],"location":value["parentReference"]["path"],"owner":if remote{"Shared item"}else{owner}}))
}
pub fn page(q:&Query,permitted:bool,request:&mut Request<'_>)->Result<Value,String>{
 let drive=drive(permitted,request)?;let id=drive["id"].as_str().ok_or("OneDrive identity unavailable")?;let base=base(id,q)?;
 let fields="id,name,size,createdDateTime,lastModifiedDateTime,folder,file,parentReference,remoteItem";
 let path=match q.next.as_deref(){Some(next)=>continuation(next,&base)?,None=>format!("{base}?{}",url::form_urlencoded::Serializer::new(String::new()).append_pair("$select",fields).append_pair("$top","100").finish())};
 let result=get(&path,request)?;let next=result["@odata.nextLink"].as_str();if let Some(next)=next{continuation(next,&base)?;}
 let owner=drive["owner"]["user"]["displayName"].as_str().unwrap_or("You");let rows=result["value"].as_array().ok_or("Invalid OneDrive response")?;if rows.len()>1000{return Err("OneDrive page is too large".into());}
 Ok(json!({"value":rows.iter().filter_map(|v|row(v,owner,id)).collect::<Vec<_>>(),"next":next,"driveName":drive["name"].as_str().unwrap_or("My OneDrive")}))
}
pub fn item(id:&str,permitted:bool,request:&mut Request<'_>)->Result<Value,String>{let drive=drive(permitted,request)?;get(&format!("/drives/{}/items/{}",segment(drive["id"].as_str().ok_or("OneDrive unavailable")?)?,segment(id)?),request)}
pub fn web_url(value:&str)->Option<String>{let u=url::Url::parse(value).ok()?;let host=u.host_str()?;let allowed=host.ends_with(".sharepoint.com")||host.ends_with(".sharepoint.us")||host=="onedrive.live.com"||host=="1drv.ms"; (allowed&&u.scheme()=="https"&&u.username().is_empty()&&u.password().is_none()&&u.port().is_none()).then(||u.to_string())}
pub fn download_url(value:&str)->Result<url::Url,String>{let u=url::Url::parse(value).map_err(|_|"Invalid OneDrive download destination")?;let host=u.host_str().unwrap_or("");if u.scheme()!="https"||!u.username().is_empty()||u.password().is_some()||u.port().is_some()||u.fragment().is_some()||!(host.ends_with(".sharepoint.com")||host.ends_with(".sharepoint.us")||host.ends_with(".1drv.com")||host.ends_with(".onedrive.com")){return Err("Unsupported OneDrive download destination. Use Open in browser.".into());}Ok(u)}
#[cfg(test)]mod tests{use super::*;
#[test]fn listing_is_read_only_and_strips_download_urls(){let mut paths=vec![];let value=page(&Query{folder:None,search:None,next:None},true,&mut|p|{paths.push(p.to_string());Ok((200,if paths.len()==1{json!({"id":"own-drive","owner":{"user":{"displayName":"You"}}})}else{json!({"value":[{"id":"file","name":"Notes.pdf","file":{"mimeType":"application/pdf"},"@microsoft.graph.downloadUrl":"secret"}]})}))}).unwrap();assert_eq!(value["value"][0]["name"],"Notes.pdf");assert!(!value.to_string().contains("secret"));assert!(paths[1].starts_with("/drives/own%2Ddrive/root/children?"));}
#[test]fn scopes_and_continuations_are_bounded(){assert!(drive(false,&mut|_|panic!("no request")).is_err());for url in ["https://evil.test/v1.0/drives/a/root/children","https://graph.microsoft.com/v1.0/users","https://graph.microsoft.com/v1.0/drives/b/root/children","https://user@graph.microsoft.com/v1.0/drives/a/root/children"]{assert!(continuation(url,"/drives/a/root/children").is_err());}}
#[test]fn search_quotes_and_paths_cannot_escape_routes(){let q=Query{folder:None,search:Some("O'Brien / notes".into()),next:None};let path=base("drive",&q).unwrap();assert!(path.contains("O%27%27Brien%20%2F%20notes"));assert!(segment("../x").unwrap().contains("%2F"));}
#[test]fn download_destinations_are_microsoft_https_without_credentials(){assert!(download_url("https://tenant-my.sharepoint.com/file?token=x").is_ok());for url in ["http://tenant.sharepoint.com/file","https://sharepoint.com.evil.test/file","https://localhost/file","https://user@tenant.sharepoint.com/file","https://tenant.sharepoint.com:8443/file"]{assert!(download_url(url).is_err());}}
}
