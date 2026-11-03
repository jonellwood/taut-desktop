mod auth;
mod notifications;
mod read_state;
mod reaction_ops;
mod attachments;
mod groups;
mod deletion;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::{rngs::OsRng, RngCore};
use reqwest::blocking::Client;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{io::{Read, Write}, net::TcpListener, process::Command, sync::Mutex, thread, time::{Duration, Instant}};
use tauri::{State,Manager};
use tauri_plugin_notification::NotificationExt;
use url::Url;

const TENANT: &str = "5c747a22-76d4-498e-9d9a-75523aff7ceb";
const CLIENT_ID: &str = "082aabde-4018-4e9e-8936-d2b74a34d9de";
const SCOPES: &str = "openid profile offline_access User.Read Chat.Read ChatMessage.Send Chat.Create User.ReadBasic.All Files.ReadWrite ChatMember.ReadWrite Chat.ReadWrite";

#[derive(Default)]
struct AuthState(std::sync::Arc<Mutex<auth::Session>>);

fn random_urlsafe() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}
fn http_client() -> Result<Client, String> {
    Client::builder().timeout(Duration::from_secs(20)).build().map_err(|_| "HTTP client unavailable".into())
}
fn exchange_token(form: &[(&str, &str)]) -> Result<Value, auth::ExchangeError> {
    let url = format!("https://login.microsoftonline.com/{TENANT}/oauth2/v2.0/token");
    let resp = http_client().map_err(|_|auth::ExchangeError::Unavailable)?.post(url).form(form).send().map_err(|_|auth::ExchangeError::Unavailable)?;
    let status=resp.status();
    let value:Value=resp.json().map_err(|_|auth::ExchangeError::InvalidResponse)?;
    if !status.is_success(){
        return Err(match value["error"].as_str(){
            Some("invalid_grant"|"interaction_required"|"login_required"|"consent_required"|"invalid_scope")=>auth::ExchangeError::Reauthenticate,
            _=>auth::ExchangeError::Unavailable,
        });
    }
    Ok(value)
}
fn refresh_exchange(refresh:&str)->Result<Value,auth::ExchangeError>{
    exchange_token(&[("client_id",CLIENT_ID),("grant_type","refresh_token"),("refresh_token",refresh),("scope",SCOPES)])
}
#[cfg(test)]
fn store_token(state:&AuthState,value:Value)->Result<(),String>{
    state.0.lock().map_err(|_|"Authentication state unavailable")?.set_test_token(value)
}
fn get_access_token(state: &AuthState) -> Result<String, String> {
    // Serialize refresh, Keychain updates and logout to prevent stale saves after sign-out.
    state.0.lock().map_err(|_|"Authentication state unavailable")?.access(&mut auth::Keychain,&mut refresh_exchange)
}
#[tauri::command]
async fn restore_session(state:State<'_,AuthState>)->Result<auth::Status,String>{
    let state=AuthState(state.0.clone());
    tauri::async_runtime::spawn_blocking(move ||state.0.lock().map_err(|_|"Authentication state unavailable")?.restore(&mut auth::Keychain,&mut refresh_exchange)).await.map_err(|_|"Saved sign-in restoration stopped")?
}
#[tauri::command]
async fn auth_persistence_status(state:State<'_,AuthState>)->Result<auth::Status,String>{
    let state=AuthState(state.0.clone());
    tauri::async_runtime::spawn_blocking(move ||Ok(state.0.lock().map_err(|_|"Authentication state unavailable")?.status())).await.map_err(|_|"Sign-in status unavailable")?
}

#[tauri::command]
async fn sign_in(state: State<'_, AuthState>, notifications:State<'_,notifications::State>) -> Result<(), String> {
    notifications.0.lock().map_err(|_|"Notification state unavailable")?.tracker.reset();
    let epoch=state.0.lock().map_err(|_|"Authentication state unavailable")?.begin_login();
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|_| "Could not open localhost sign-in listener")?;
    let port = listener.local_addr().map_err(|_| "Could not determine sign-in port")?.port();
    listener.set_nonblocking(true).map_err(|_| "Could not configure callback listener")?;
    let redirect = format!("http://localhost:{port}/");
    let verifier = random_urlsafe();
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let expected_state = random_urlsafe();
    let mut url = Url::parse(&format!("https://login.microsoftonline.com/{TENANT}/oauth2/v2.0/authorize")).map_err(|_| "Invalid authorization URL")?;
    url.query_pairs_mut()
        .append_pair("client_id", CLIENT_ID)
        .append_pair("response_type", "code")
        .append_pair("redirect_uri", &redirect)
        .append_pair("response_mode", "query")
        .append_pair("scope", SCOPES)
        .append_pair("state", &expected_state)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256");
    // macOS system browser. No embedded credentials or custom protocol hijacking.
    let launched = Command::new("open").arg(url.as_str()).status().map_err(|_| "Unable to launch system browser")?;
    if !launched.success() { return Err("Unable to launch system browser".into()); }
    let callback = tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let started = Instant::now();
        loop {
            if started.elapsed() > Duration::from_secs(180) { return Err("Sign-in timed out; please try again".into()); }
            match listener.accept() {
                Ok((mut socket, _)) => {
                    socket.set_read_timeout(Some(Duration::from_secs(5))).ok();
                    let mut buffer = [0u8; 8192];
                    let length = socket.read(&mut buffer).map_err(|_| "Invalid sign-in callback")?;
                    let line = String::from_utf8_lossy(&buffer[..length]);
                    let target = line.lines().next().and_then(|s|s.split_whitespace().nth(1)).ok_or("Invalid callback request")?;
                    let parsed = Url::parse(&format!("http://localhost:{port}{target}")).map_err(|_| "Invalid callback URL")?;
                    let params: std::collections::HashMap<String, String> = parsed.query_pairs().into_owned().collect();
                    let valid = parsed.path() == "/" && params.get("state").map(String::as_str) == Some(expected_state.as_str());
                    let code = if valid { params.get("code").cloned() } else { None };
                    let body = if code.is_some() {
                        include_str!("auth-complete.html")
                    } else {
                        "<html><body style='font:16px system-ui;background:#151b21;color:#efbb70;padding:40px'><h2>TAUT</h2><p>Authentication was not completed. Return to TAUT and try again.</p></body></html>"
                    };
                    let resp = format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
                    let _ = socket.write_all(resp.as_bytes());
                    return code.ok_or("Sign-in was cancelled or callback validation failed".into());
                }
                Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => thread::sleep(Duration::from_millis(75)),
                Err(_) => return Err("Could not receive sign-in callback".into()),
            }
        }
    }).await.map_err(|_| "Sign-in task stopped unexpectedly")??;
    let result = tauri::async_runtime::spawn_blocking(move || exchange_token(&[
        ("client_id", CLIENT_ID), ("grant_type", "authorization_code"),
        ("code", &callback), ("redirect_uri", &redirect), ("code_verifier", &verifier), ("scope", SCOPES),
    ])).await.map_err(|_| "Token request failed")?.map_err(|e|e.message().to_owned())?;
    let state=AuthState(state.0.clone());
    tauri::async_runtime::spawn_blocking(move ||state.0.lock().map_err(|_|"Authentication state unavailable")?.accept_login(epoch,result,&mut auth::Keychain)).await.map_err(|_|"Sign-in session storage stopped")?
}

fn graph_read_builder(client:&Client,token:String,endpoint:&str,system_events:bool)->reqwest::blocking::RequestBuilder {
    let request=client.get(format!("https://graph.microsoft.com/v1.0{endpoint}")).bearer_auth(token);
    if system_events { request.header("Prefer","include-unknown-enum-members") } else { request }
}
fn graph_request(state: &AuthState, endpoint: &str) -> Result<Value, String> {
    graph_get(state,endpoint,false)
}
fn graph_get(state:&AuthState,endpoint:&str,system_events:bool)->Result<Value,String>{
    let response=graph_read_builder(&http_client()?,get_access_token(state)?,endpoint,system_events)
        .send().map_err(|_|"Microsoft Graph network error")?;
    if !response.status().is_success(){return Err(format!("Graph returned HTTP {}",response.status()));}
    response.json().map_err(|_|"Invalid Graph response".into())
}
#[derive(serde::Deserialize)]
#[serde(rename_all="camelCase")]
struct EventPerson { id:String, tenant_id:Option<String> }
fn event_names_with(people:&[EventPerson],mut lookup:impl FnMut(&str)->Result<Option<String>,String>)->Result<Value,String>{
    if people.len()>30 || people.iter().any(|p|p.id.len()!=36 || !p.id.chars().enumerate().all(|(i,c)|if [8,13,18,23].contains(&i){c=='-'}else{c.is_ascii_hexdigit()})) {return Err("Invalid participant name lookup".into());}
    let mut names=Vec::new();let mut visited=std::collections::HashSet::new();
    for person in people {
        // Never resolve a foreign tenant's object ID against this tenant's directory.
        if person.tenant_id.as_ref().map(|id|!id.eq_ignore_ascii_case(TENANT)).unwrap_or(false){continue;}
        let key=(person.id.to_lowercase(),person.tenant_id.clone().unwrap_or_default().to_lowercase());
        if !visited.insert(key){continue;}
        if let Some(name)=lookup(&person.id)? {
            names.push(serde_json::json!({"id":person.id,"tenantId":person.tenant_id,"displayName":name}));
        }
    }
    Ok(serde_json::json!(names))
}
#[tauri::command]
async fn graph_event_names(state:State<'_,AuthState>,people:Vec<EventPerson>)->Result<Value,String>{
    let state=AuthState(state.0.clone());
    tauri::async_runtime::spawn_blocking(move ||event_names_with(&people,|id|{
        let client=Client::builder().timeout(Duration::from_secs(20)).redirect(reqwest::redirect::Policy::none()).build().map_err(|_|"Name lookup client unavailable")?;
        let encoded:String=url::form_urlencoded::byte_serialize(id.as_bytes()).collect();
        let response=client.get(format!("https://graph.microsoft.com/v1.0/users/{encoded}?$select=id,displayName")).bearer_auth(get_access_token(&state)?).send().map_err(|_|"Participant name lookup unavailable")?;
        let status=response.status();
        if matches!(status.as_u16(),403|404|410){return Ok(None);}
        if !status.is_success(){return Err(format!("Participant name lookup returned HTTP {status}"));}
        let value:Value=response.json().map_err(|_|"Invalid participant name response")?;
        if !value["id"].as_str().map(|returned|returned.eq_ignore_ascii_case(id)).unwrap_or(false){return Ok(None);}
        Ok(value["displayName"].as_str().filter(|s|!s.trim().is_empty()).map(str::to_owned))
    })).await.map_err(|_|"Participant name lookup stopped")?
}
#[tauri::command]
fn graph_profile(state: State<'_, AuthState>, notifications:State<'_,notifications::State>) -> Result<Value, String> {
    let generation=notifications.0.lock().map_err(|_|"Notification state unavailable")?.tracker.generation;
    let value=graph_request(&state,"/me?$select=id,displayName,userPrincipalName")?;
    if let Some(id)=value["id"].as_str(){let mut manager=notifications.0.lock().map_err(|_|"Notification state unavailable")?;if manager.tracker.generation==generation{manager.tracker.account(id);}}
    Ok(value)
}
const CHAT_LIST_PATH:&str="/me/chats?$top=50&$expand=members,lastMessagePreview&$orderby=lastMessagePreview/createdDateTime%20desc";
#[tauri::command]
fn graph_chats(state: State<'_, AuthState>, notifications:State<'_,notifications::State>, app:tauri::AppHandle) -> Result<Value, String> {
    let generation=notifications.0.lock().map_err(|_|"Notification state unavailable")?.tracker.generation;
    let value=graph_get(&state,CHAT_LIST_PATH,true)?;
    notify_snapshot(&app,&notifications,&value,generation);Ok(value)
}
#[tauri::command]
fn graph_chat_members(state: State<'_, AuthState>, chat_id: String) -> Result<Value, String> {
    let id: String = url::form_urlencoded::byte_serialize(chat_id.as_bytes()).collect();
    graph_request(&state, &format!("/chats/{id}/members"))
}

// Directory lookup is tenant-scoped, delegated, and returns only basic profile fields.
#[tauri::command]
fn graph_search_users(state: State<'_, AuthState>, query: String) -> Result<Value, String> {
    let query = query.trim();
    if query.chars().count() < 2 || query.chars().count() > 80 || query.chars().any(|c| c.is_control()) {
        return Err("Enter at least two characters to search coworkers".into());
    }
    let safe = query.replace("'", "''");
    let filter = format!("startswith(displayName,'{safe}') or startswith(userPrincipalName,'{safe}') or startswith(mail,'{safe}')");
    let mut url = Url::parse("https://graph.microsoft.com/v1.0/users").map_err(|_| "Invalid Graph URL")?;
    url.query_pairs_mut().append_pair("$select", "id,displayName,mail,userPrincipalName")
        .append_pair("$filter", &filter).append_pair("$top", "12");
    let response = http_client()?.get(url).bearer_auth(get_access_token(&state)?).send()
        .map_err(|_| "Unable to search Microsoft 365 users".to_string())?;
    if !response.status().is_success() { return Err(format!("Coworker search returned HTTP {}", response.status())); }
    response.json().map_err(|_| "Invalid coworker search response".into())
}
#[tauri::command]
fn graph_messages(state: State<'_, AuthState>, chat_id: String) -> Result<Value, String> {
    if chat_id.len() > 512 || chat_id.is_empty() { return Err("Invalid chat identifier".into()); }
    let encoded: String = url::form_urlencoded::byte_serialize(chat_id.as_bytes()).collect();
    graph_get(&state, &format!("/chats/{encoded}/messages?$top=50&$orderby=createdDateTime%20desc"),true)
}
#[tauri::command]
fn graph_send_message(state: State<'_, AuthState>, chat_id: String, text: String) -> Result<Value, String> {
    if chat_id.is_empty() || chat_id.len() > 512 { return Err("Invalid chat identifier".into()); }
    let content = text.trim();
    if content.is_empty() || content.chars().count() > 4000 { return Err("Message must contain 1–4000 characters".into()); }
    // The message is plain text: Graph is explicitly instructed not to interpret HTML.
    let encoded: String = url::form_urlencoded::byte_serialize(chat_id.as_bytes()).collect();
    let payload = serde_json::json!({"body": {"contentType": "text", "content": content}});
    let token = get_access_token(&state)?;
    let response = http_client()?.post(format!("https://graph.microsoft.com/v1.0/chats/{encoded}/messages"))
        .bearer_auth(token).json(&payload).send()
        .map_err(|_| "Couldn't reach Microsoft Graph. Check the chat before retrying to avoid duplicates.".to_string())?;
    if response.status() != reqwest::StatusCode::CREATED {
        return Err(format!("Microsoft Graph returned HTTP {}. Message not confirmed; check Teams before retrying.", response.status()));
    }
    response.json().map_err(|_| "Graph accepted the message but its response was unreadable. Refresh the chat before retrying.".into())
}
fn attachment_permission_granted(state: &AuthState) -> Result<bool, String> {
    get_access_token(state)?;
    let guard=state.0.lock().map_err(|_| "Authentication state unavailable")?;
    Ok(guard.token.as_ref().map(|t| t.scopes.split_whitespace().any(|s| s.eq_ignore_ascii_case("Files.ReadWrite"))).unwrap_or(false))
}
#[tauri::command]
async fn attachment_permission(state: State<'_, AuthState>) -> Result<bool, String> {
    let state=AuthState(state.0.clone());
    tauri::async_runtime::spawn_blocking(move || attachment_permission_granted(&state)).await.map_err(|_| "Attachment permission check stopped unexpectedly")?
}
fn attachment_request(state: &AuthState, method: reqwest::Method, endpoint: &str, body: Option<Value>, bytes: Option<Vec<u8>>) -> Result<attachments::Reply, String> {
    // All destinations are generated in Rust. Never forward bearer tokens on redirects.
    let client=Client::builder().timeout(Duration::from_secs(60)).redirect(reqwest::redirect::Policy::none()).build().map_err(|_| "Attachment HTTP client unavailable")?;
    let request=client.request(method, format!("https://graph.microsoft.com/v1.0{endpoint}")).bearer_auth(get_access_token(state)?);
    let request=if let Some(body)=body { request.json(&body) } else { request };
    let request=if let Some(bytes)=bytes { request.header(reqwest::header::CONTENT_TYPE,"application/octet-stream").body(bytes) } else { request };
    let response=request.send().map_err(|_| "Attachment request was not confirmed. Files may already be uploaded or shared. Your draft is saved; check OneDrive and Teams before retrying.")?;
    let status=response.status().as_u16();
    let body=if (200..300).contains(&status) { response.json().map_err(|_| "Attachment response could not be read. Check OneDrive and Teams before retrying.")? } else { Value::Null };
    Ok(attachments::Reply { status, body })
}
#[tauri::command]
async fn graph_prepare_attachment(state: State<'_, AuthState>, uploads: State<'_, attachments::AttachmentState>, chat_id: String, id: String, name: String, data: String) -> Result<(), String> {
    let state=AuthState(state.0.clone());let uploads=uploads.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let permitted=attachment_permission_granted(&state)?;
        let mut store=uploads.lock().map_err(|_| "Attachment state unavailable")?;
        attachments::prepare(&mut store, permitted, &chat_id, &id, &name, &data, &mut |method,path,body,bytes| attachment_request(&state, method,path,body,bytes))
    }).await.map_err(|_| "Attachment preparation stopped unexpectedly. Check OneDrive before retrying")?
}
#[tauri::command]
async fn graph_send_attachments(state: State<'_, AuthState>, uploads: State<'_, attachments::AttachmentState>, chat_id: String, text: String, ids: Vec<String>) -> Result<Value, String> {
    let state=AuthState(state.0.clone());let uploads=uploads.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if !attachment_permission_granted(&state)? { return Err("Attachment permission is missing; sign in again after approval".into()); }
        let store=uploads.lock().map_err(|_| "Attachment state unavailable")?;
        attachments::send(&store, &chat_id, &text, &ids, &mut |method,path,body,bytes| attachment_request(&state, method,path,body,bytes))
    }).await.map_err(|_| "Delivery was not confirmed. Check Teams before retrying")?
}
// Graph action POSTs without payloads still need explicit HTTP message framing.
fn graph_operation_payload(request:reqwest::blocking::RequestBuilder,method:&reqwest::Method,body:Option<Value>)->reqwest::blocking::RequestBuilder {
    if let Some(body)=body {request.json(&body)}
    else if *method==reqwest::Method::POST {request.header(reqwest::header::CONTENT_LENGTH,"0")}
    else {request}
}
fn graph_operation_request(state:&AuthState,method:reqwest::Method,path:&str,body:Option<Value>)->Result<groups::Reply,String>{
    let client=Client::builder().timeout(Duration::from_secs(30)).redirect(reqwest::redirect::Policy::none()).build().map_err(|_|"Microsoft 365 HTTP client unavailable")?;
    let message_read=method==reqwest::Method::GET && path.contains("/messages/");
    let request=client.request(method.clone(),format!("https://graph.microsoft.com/v1.0{path}")).bearer_auth(get_access_token(state)?);
    let request=if message_read {request.header("Prefer","include-unknown-enum-members")}else{request};
    let request=graph_operation_payload(request,&method,body);
    let response=request.send().map_err(|_|"Microsoft 365 operation was not confirmed. Refresh and check Teams before retrying")?;
    let status=response.status().as_u16();
    let body=if (200..300).contains(&status){
        let bytes=response.bytes().map_err(|_|"Microsoft 365 response unreadable; check Teams before retrying")?;
        if bytes.is_empty(){Value::Null}else{serde_json::from_slice(&bytes).map_err(|_|"Microsoft 365 response unreadable; check Teams before retrying")?}
    }else{Value::Null};
    Ok(groups::Reply{status,body})
}
fn group_permission_granted(state:&AuthState)->Result<bool,String>{
    get_access_token(state)?;
    let guard=state.0.lock().map_err(|_|"Authentication state unavailable")?;
    Ok(guard.token.as_ref().map(|token|token.scopes.split_whitespace().any(|s|s.eq_ignore_ascii_case("ChatMember.ReadWrite"))).unwrap_or(false))
}
#[tauri::command]
async fn group_member_permission(state:State<'_,AuthState>)->Result<bool,String>{
    let state=AuthState(state.0.clone());
    tauri::async_runtime::spawn_blocking(move ||group_permission_granted(&state)).await.map_err(|_|"Group permission check stopped")?
}
#[tauri::command]
async fn graph_create_group_chat(state:State<'_,AuthState>,recipients:Vec<String>,topic:String,first_message:String,own_id:String)->Result<Value,String>{
    let state=AuthState(state.0.clone());
    tauri::async_runtime::spawn_blocking(move ||groups::create(&recipients,&topic,&first_message,&own_id,&mut |m,p,b|graph_operation_request(&state,m,p,b)))
        .await.map_err(|_|"Group creation was not confirmed. Check Teams before retrying")?
}
#[tauri::command]
async fn graph_add_group_member(state:State<'_,AuthState>,chat_id:String,recipient:String,history:String)->Result<(),String>{
    let state=AuthState(state.0.clone());
    tauri::async_runtime::spawn_blocking(move ||groups::add(group_permission_granted(&state)?,&chat_id,&recipient,&history,&mut |m,p,b|graph_operation_request(&state,m,p,b)))
        .await.map_err(|_|"Member addition was not confirmed. Refresh members before retrying")?
}
#[tauri::command]
async fn graph_remove_group_member(state:State<'_,AuthState>,chat_id:String,membership_id:String)->Result<(),String>{
    let state=AuthState(state.0.clone());
    tauri::async_runtime::spawn_blocking(move ||groups::remove(group_permission_granted(&state)?,&chat_id,&membership_id,&mut |m,p,b|graph_operation_request(&state,m,p,b)))
        .await.map_err(|_|"Member removal was not confirmed. Check Teams before retrying")?
}
fn chat_write_permission_granted(state:&AuthState)->Result<bool,String>{
    get_access_token(state)?;
    let guard=state.0.lock().map_err(|_|"Authentication state unavailable")?;
    Ok(guard.token.as_ref().map(|token|token.scopes.split_whitespace().any(|s|s.eq_ignore_ascii_case("Chat.ReadWrite"))).unwrap_or(false))
}
#[tauri::command]
async fn chat_write_permission(state:State<'_,AuthState>)->Result<bool,String>{
    let state=AuthState(state.0.clone());
    tauri::async_runtime::spawn_blocking(move ||chat_write_permission_granted(&state)).await.map_err(|_|"Chat permission check stopped")?
}
#[tauri::command]
async fn graph_change_message(state:State<'_,AuthState>,chat_id:String,message_id:String,restore:bool)->Result<(),String>{
    let state=AuthState(state.0.clone());
    tauri::async_runtime::spawn_blocking(move ||deletion::change_message(chat_write_permission_granted(&state)?,&chat_id,&message_id,restore,&mut |m,p,b|graph_operation_request(&state,m,p,b)))
        .await.map_err(|_|"Message change was not confirmed. Check Teams before retrying")?
}
#[tauri::command]
async fn graph_message_status(state:State<'_,AuthState>,chat_id:String,message_id:String)->Result<bool,String>{
    let state=AuthState(state.0.clone());
    tauri::async_runtime::spawn_blocking(move ||deletion::message_status(&chat_id,&message_id,&mut |m,p,b|graph_operation_request(&state,m,p,b)))
        .await.map_err(|_|"Message status check stopped")?
}
#[tauri::command]
async fn graph_set_chat_visibility(state:State<'_,AuthState>,chat_id:String,hidden:bool)->Result<(),String>{
    let state=AuthState(state.0.clone());
    tauri::async_runtime::spawn_blocking(move ||deletion::set_visibility(chat_write_permission_granted(&state)?,&chat_id,hidden,TENANT,&mut |m,p,b|graph_operation_request(&state,m,p,b)))
        .await.map_err(|_|"Visibility change was not confirmed. Check Teams before retrying")?
}
#[tauri::command]
async fn graph_chat_visibility(state:State<'_,AuthState>,chat_id:String)->Result<bool,String>{
    let state=AuthState(state.0.clone());
    tauri::async_runtime::spawn_blocking(move ||deletion::visibility_status(&chat_id,&mut |m,p,b|graph_operation_request(&state,m,p,b)))
        .await.map_err(|_|"Chat visibility check stopped")?
}
#[tauri::command]
async fn graph_mark_chat_read(state:State<'_,AuthState>,chat_id:String,message_id:String)->Result<bool,String>{
    let state=AuthState(state.0.clone());
    tauri::async_runtime::spawn_blocking(move ||read_state::mark_read(chat_write_permission_granted(&state)?,&chat_id,&message_id,TENANT,&mut |m,p,b|graph_operation_request(&state,m,p,b))).await.map_err(|_|"Read-state update was not confirmed. Refresh before retrying.")?
}
#[tauri::command]
async fn graph_change_reaction(state:State<'_,AuthState>,chat_id:String,message_id:String,emoji:String,remove:bool)->Result<(),String>{
    let state=AuthState(state.0.clone());
    tauri::async_runtime::spawn_blocking(move ||reaction_ops::change(chat_write_permission_granted(&state)?,&chat_id,&message_id,&emoji,remove,&mut |m,p,b|graph_operation_request(&state,m,p,b))).await.map_err(|_|"Reaction change was not confirmed. Refresh status before retrying.")?
}
#[tauri::command]
async fn graph_reaction_state(state:State<'_,AuthState>,chat_id:String,message_id:String)->Result<Vec<String>,String>{
    let state=AuthState(state.0.clone());
    tauri::async_runtime::spawn_blocking(move ||reaction_ops::status(&chat_id,&message_id,&mut |m,p,b|graph_operation_request(&state,m,p,b))).await.map_err(|_|"Reaction status could not be refreshed")?
}
// Side effect: creates or returns a 1:1 chat. Only explicit first-message Send may call this.
#[tauri::command]
fn graph_create_chat(state: State<'_, AuthState>, recipient: String, own_id: String, first_message: String) -> Result<Value, String> {
    create_chat_with(&recipient, &own_id, &first_message, |method, endpoint, payload| {
        let token = get_access_token(&state)?;
        let request = http_client()?.request(method, format!("https://graph.microsoft.com/v1.0{endpoint}"))
            .bearer_auth(token);
        let request = if let Some(body) = payload { request.json(body) } else { request };
        let response = request.send().map_err(|_| "Graph request was not confirmed. Refresh your chat list before retrying".to_string())?;
        if !response.status().is_success() {
            return Err(format!("Graph returned HTTP {}. Refresh your chat list before retrying.", response.status()));
        }
        response.json().map_err(|_| "Graph response unreadable; refresh your chat list before retrying".into())
    })
}

// Inject the request boundary so safety tests never contact Microsoft 365.
fn create_chat_with(
    recipient: &str, own_id: &str, first_message: &str,
    mut request: impl FnMut(reqwest::Method, &str, Option<&Value>) -> Result<Value, String>,
) -> Result<Value, String> {
    if first_message.trim().is_empty() || first_message.trim().chars().count() > 4000 {
        return Err("A first message of 1–4000 characters is required".into());
    }
    let recipient = recipient.trim();
    let valid_guid = recipient.len() == 36 && recipient.chars().all(|c| c.is_ascii_hexdigit() || c == '-');
    let valid_upn = recipient.len() <= 254 && recipient.contains('@') && !recipient.chars().any(|c| c.is_whitespace() || c == '\'' || c == '"' || c == '/');
    if !(valid_guid || valid_upn) { return Err("Choose a coworker or enter a valid work email".into()); }
    if own_id.len() < 8 || own_id.len() > 100 || !own_id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
        return Err("Invalid signed-in user identifier".into());
    }
    // Resolve signed-in identity from Graph rather than trusting an identifier from the UI.
    let me = request(reqwest::Method::GET, "/me?$select=id", None)?;
    let me_id = me["id"].as_str().ok_or("Missing current user ID")?;
    if !me_id.eq_ignore_ascii_case(&own_id) { return Err("Signed-in identity mismatch".into()); }
    if recipient.eq_ignore_ascii_case(me_id) { return Err("A one-on-one chat needs another participant".into()); }
    // Resolve email aliases too, so typing one's own email cannot bypass self-chat protection.
    let encoded: String = url::form_urlencoded::byte_serialize(recipient.as_bytes()).collect();
    let user = request(reqwest::Method::GET, &format!("/users/{encoded}?$select=id"), None)?;
    let recipient = user["id"].as_str().ok_or("Missing recipient ID")?;
    if recipient.eq_ignore_ascii_case(me_id) { return Err("A one-on-one chat needs another participant".into()); }
    let base = "https://graph.microsoft.com/v1.0/users";
    let recipient_ref = format!("{base}('{}')", recipient.replace("'", ""));
    let self_ref = format!("{base}('{}')", me_id);
    let payload = serde_json::json!({
      "chatType":"oneOnOne",
      "members":[
        {"@odata.type":"#microsoft.graph.aadUserConversationMember","roles":["owner"],"user@odata.bind":self_ref},
        {"@odata.type":"#microsoft.graph.aadUserConversationMember","roles":["owner"],"user@odata.bind":recipient_ref}
      ]
    });
    request(reqwest::Method::POST, "/chats", Some(&payload))
}
// Only a message-owned hosted content ID is accepted; never fetch an arbitrary URL.
#[tauri::command]
fn graph_hosted_image(state: State<'_, AuthState>, chat_id: String, message_id: String, content_id: String) -> Result<String, String> {
    if chat_id.is_empty() || message_id.is_empty() || content_id.is_empty() || chat_id.len()>512 || message_id.len()>512 || content_id.len()>1024 {
        return Err("Invalid image identifier".into());
    }
    let enc = |id: &str| -> String { url::form_urlencoded::byte_serialize(id.as_bytes()).collect() };
    let endpoint = format!("https://graph.microsoft.com/v1.0/chats/{}/messages/{}/hostedContents/{}/$value", enc(&chat_id), enc(&message_id), enc(&content_id));
    let response = http_client()?.get(endpoint).bearer_auth(get_access_token(&state)?).send()
        .map_err(|_| "Image request failed".to_string())?;
    if !response.status().is_success() { return Err(format!("Image unavailable (Graph HTTP {})", response.status())); }
    let mime = response.headers().get(reqwest::header::CONTENT_TYPE).and_then(|v| v.to_str().ok()).unwrap_or("").split(';').next().unwrap_or("").trim().to_ascii_lowercase();
    if !matches!(mime.as_str(), "image/png" | "image/jpeg" | "image/gif" | "image/webp") { return Err("Unsupported image type".into()); }
    if response.content_length().unwrap_or(0) > 8*1024*1024 { return Err("Image too large (8 MB limit)".into()); }
    let bytes = response.bytes().map_err(|_| "Could not read image".to_string())?;
    if bytes.len() > 8*1024*1024 { return Err("Image too large (8 MB limit)".into()); }
    use base64::engine::general_purpose::STANDARD;
    Ok(format!("data:{};base64,{}", mime, STANDARD.encode(bytes)))
}
#[tauri::command]
async fn sign_out(state: State<'_, AuthState>, uploads: State<'_, attachments::AttachmentState>,notifications:State<'_,notifications::State>) -> Result<(), String> {
    let state=AuthState(state.0.clone());let uploads=uploads.0.clone();let notifications=notifications.0.clone();
    tauri::async_runtime::spawn_blocking(move ||{
        let result=state.0.lock().map_err(|_|"Authentication state unavailable")?.logout(&mut auth::Keychain);
        notifications.lock().map_err(|_|"Notification state unavailable")?.tracker.reset();
        uploads.lock().map_err(|_|"Attachment state unavailable")?.clear();
        result
    }).await.map_err(|_|"Sign-out stopped; saved credentials may remain")?
}

fn notify_snapshot(app:&tauri::AppHandle,state:&notifications::State,value:&Value,generation:u64){
    let focused=app.get_webview_window("main").map(|w|w.is_focused().unwrap_or(false)&&w.is_visible().unwrap_or(false)).unwrap_or(false);
    let (notices,session)=match state.0.lock(){Ok(mut manager)=>{if manager.tracker.generation!=generation{return;}let settings=manager.settings;let notices=manager.tracker.observe(value,settings,focused);(notices,manager.tracker.session.clone())},Err(_)=>return};
    for notice in notices{
        if !state.0.lock().map(|manager|manager.settings.enabled&&manager.tracker.session==session).unwrap_or(false){break;}
        if app.notification().builder().id(notice.id).title("TAUT").body(&notice.body).extra("tautSession",&session).show().is_err(){
            if let Ok(mut manager)=state.0.lock(){manager.error=Some("A notification could not be requested. Check macOS Notifications and Focus settings.".into());}
        }
    }
}
#[tauri::command]
fn notification_settings(state:State<'_,notifications::State>)->Result<notifications::Status,String>{Ok(state.0.lock().map_err(|_|"Notification settings unavailable")?.status())}
#[tauri::command]
async fn notification_configure(app:tauri::AppHandle,state:State<'_,notifications::State>,enabled:bool,show_names:bool)->Result<notifications::Status,String>{
    let state=state.inner().clone();
    tauri::async_runtime::spawn_blocking(move ||{
        if enabled&&app.notification().request_permission().map_err(|_|"Notification permission could not be checked")?!=tauri::plugin::PermissionState::Granted{return Err("Notifications are not available. Check system settings.".into());}
        state.0.lock().map_err(|_|"Notification settings unavailable")?.configure(notifications::Settings{enabled,show_names})
    }).await.map_err(|_|"Notification preferences could not be updated")?
}
#[tauri::command]
fn notification_view(state:State<'_,notifications::State>,chat_id:Option<String>,at_latest:bool)->Result<(),String>{
    if chat_id.as_ref().map(|id|id.len()>512||id.chars().any(char::is_control)).unwrap_or(false){return Err("Invalid conversation view".into());}
    let mut manager=state.0.lock().map_err(|_|"Notification state unavailable")?;manager.tracker.active_chat=chat_id;manager.tracker.at_latest=at_latest;Ok(())
}
#[tauri::command]
fn notification_take_open(state:State<'_,notifications::State>)->Result<Option<String>,String>{Ok(state.0.lock().map_err(|_|"Notification state unavailable")?.tracker.pending_open.take())}
#[tauri::command]
fn notification_test(app:tauri::AppHandle,state:State<'_,notifications::State>)->Result<u64,String>{
    if !state.0.lock().map_err(|_|"Notification settings unavailable")?.settings.enabled{return Err("Enable message notifications first".into());}
    static TEST_SEQUENCE:std::sync::atomic::AtomicU64=std::sync::atomic::AtomicU64::new(0);
    let sequence=TEST_SEQUENCE.fetch_add(1,std::sync::atomic::Ordering::Relaxed)+1;
    app.notification().builder().title("TAUT").body(format!("Test notification #{sequence}. New message alerts are enabled in TAUT.")).show().map_err(|_|String::from("Test notification could not be requested"))?;
    Ok(sequence)
}
fn setup_notifications(app:&mut tauri::App)->Result<(),Box<dyn std::error::Error>>{
    let path=app.path().app_config_dir().ok().map(|p|p.join("notifications.json"));
    let state=notifications::State(std::sync::Arc::new(Mutex::new(notifications::Manager::load(path))));app.manage(state.clone());
    let handle=app.handle().clone();let click_state=state.clone();let click_handle=handle.clone();
    app.notification().on_action(move |action|{
        if action.action_id()!="tap"{return;}
        let Some(note)=action.notification()else{return;};
        let opened=click_state.0.lock().ok().and_then(|mut manager|{if note.extra().get("tautSession").and_then(Value::as_str)!=Some(manager.tracker.session.as_str()){return None;}manager.tracker.click(note.id())});
        if opened.is_some(){if let Some(window)=click_handle.get_webview_window("main"){let _=window.unminimize();let _=window.show();let _=window.set_focus();}}
    })?;
    let auth=AuthState(app.state::<AuthState>().0.clone());
    std::thread::spawn(move ||{
        let mut next=Instant::now()+Duration::from_secs(30);
        loop{
            std::thread::sleep(Duration::from_secs(1));if Instant::now()<next{continue;}
            let focused=handle.get_webview_window("main").map(|w|w.is_visible().unwrap_or(false)&&w.is_focused().unwrap_or(false)).unwrap_or(false);
            let generation=state.0.lock().ok().and_then(|manager|(manager.settings.enabled&&manager.tracker.own.is_some()).then_some(manager.tracker.generation));
            if focused||generation.is_none(){continue;}
            next=Instant::now()+Duration::from_secs(30);
            match graph_get(&auth,CHAT_LIST_PATH,true){Ok(value)=>notify_snapshot(&handle,&state,&value,generation.unwrap()),Err(error)=>{if error.contains("429"){next=Instant::now()+Duration::from_secs(60);}}}
        }
    });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(setup_notifications)
        .manage(AuthState::default())
        .manage(attachments::AttachmentState::default())
        .invoke_handler(tauri::generate_handler![notification_settings, notification_configure, notification_view, notification_take_open, notification_test, graph_change_reaction, graph_reaction_state, graph_mark_chat_read, sign_in, sign_out, restore_session, auth_persistence_status, graph_profile, graph_chats, graph_chat_members, graph_search_users, graph_messages, graph_send_message, graph_create_chat, graph_hosted_image, attachment_permission, graph_prepare_attachment, graph_send_attachments, group_member_permission, graph_create_group_chat, graph_add_group_member, graph_remove_group_member, graph_event_names, chat_write_permission, graph_change_message, graph_message_status, graph_set_chat_visibility, graph_chat_visibility])
        .run(tauri::generate_context!())
        .expect("error while running TAUT desktop");
}

#[cfg(test)]
mod tests {
    use super::*;
    const ME: &str = "11111111-1111-1111-1111-111111111111";
    const OTHER: &str = "22222222-2222-2222-2222-222222222222";

    #[test]
    fn message_read_requests_include_system_event_preference_without_sending() {
        let client=http_client().unwrap();
        let request=graph_read_builder(&client,"mock-token".into(),"/chats/chat/messages?$top=50",true).build().unwrap();
        assert_eq!(request.method(),reqwest::Method::GET);
        assert_eq!(request.headers().get("Prefer").unwrap(),"include-unknown-enum-members");
        let normal=graph_read_builder(&client,"mock-token".into(),"/me",false).build().unwrap();
        assert!(normal.headers().get("Prefer").is_none());
    }
    #[test]
    fn participant_name_lookup_is_bounded_and_skips_foreign_tenants() {
        let people=vec![EventPerson{id:ME.into(),tenant_id:None},EventPerson{id:ME.into(),tenant_id:None},EventPerson{id:OTHER.into(),tenant_id:Some("foreign-tenant".into())}];
        let mut calls=0;
        let names=event_names_with(&people,|_|{calls+=1;Ok(Some("Test Person".into()))}).unwrap();
        assert_eq!(calls,1);assert_eq!(names.as_array().unwrap().len(),1);
        assert!(event_names_with(&[EventPerson{id:"invalid".into(),tenant_id:None}],|_|panic!()).is_err());
    }
    #[test]
    fn group_membership_permission_requires_the_exact_delegated_grant() {
        let state=AuthState::default();
        for (scope, expected) in [("Chat.Read",false),("ChatMember.Read",false),("ChatMember.ReadWrite.All",false),("Chat.Read ChatMember.ReadWrite",true)] {
            store_token(&state,serde_json::json!({"access_token":"mock-token","scope":scope,"expires_in":3600})).unwrap();
            assert_eq!(group_permission_granted(&state).unwrap(),expected);
        }
    }
    #[test]
    fn chat_list_requests_latest_previews_in_message_order_without_writing() {
        let request=graph_read_builder(&Client::new(),"mock-token".into(),CHAT_LIST_PATH,true).build().unwrap();
        assert_eq!(request.method(),reqwest::Method::GET);
        let query:std::collections::HashMap<_,_>=request.url().query_pairs().collect();
        assert_eq!(query.get("$expand").map(|s|s.as_ref()),Some("members,lastMessagePreview"));
        assert_eq!(query.get("$orderby").map(|s|s.as_ref()),Some("lastMessagePreview/createdDateTime desc"));
        assert_eq!(request.headers()["Prefer"],"include-unknown-enum-members");
    }
    #[test]
    fn empty_graph_action_posts_have_zero_content_length_without_json_body() {
        let client=Client::new();
        for action in ["softDelete","undoSoftDelete"] {
            let method=reqwest::Method::POST;
            let request=graph_operation_payload(client.request(method.clone(),format!("https://graph.microsoft.com/v1.0/users/mock/chats/mock/messages/mock/{action}")),&method,None).build().unwrap();
            assert_eq!(request.headers()[reqwest::header::CONTENT_LENGTH],"0");
            assert!(request.body().is_none());
            assert!(!request.headers().contains_key(reqwest::header::CONTENT_TYPE));
        }
        // GET and DELETE reads/removals retain their prior framing; JSON actions keep their payload.
        for method in [reqwest::Method::GET,reqwest::Method::DELETE] {
            let request=graph_operation_payload(client.request(method.clone(),"https://graph.microsoft.com/v1.0/mock"),&method,None).build().unwrap();
            assert!(!request.headers().contains_key(reqwest::header::CONTENT_LENGTH));
            assert!(request.body().is_none());
        }
        let method=reqwest::Method::POST;
        let body=serde_json::json!({"user":{"id":"mock","tenantId":"mock"}});
        let request=graph_operation_payload(client.request(method.clone(),"https://graph.microsoft.com/v1.0/mock"),&method,Some(body.clone())).build().unwrap();
        assert_ne!(request.headers().get(reqwest::header::CONTENT_LENGTH).and_then(|v|v.to_str().ok()),Some("0"));
        assert_eq!(serde_json::from_slice::<Value>(request.body().unwrap().as_bytes().unwrap()).unwrap(),body);
    }
    #[test]
    fn message_and_visibility_permission_requires_exact_delegated_grant() {
        let state=AuthState::default();
        for (scope, expected) in [("Chat.Read",false),("Chat.ReadWrite.All",false),("Chat.ManageDeletion.All",false),("Chat.Read Chat.ReadWrite",true)] {
            store_token(&state,serde_json::json!({"access_token":"mock-token","scope":scope,"expires_in":3600})).unwrap();
            assert_eq!(chat_write_permission_granted(&state).unwrap(),expected);
        }
    }
    #[test]
    fn file_permission_stays_in_rust_and_requires_exact_grant() {
        let state=AuthState::default();
        for (scope, expected) in [("User.Read",false),("Files.ReadWrite.All",false),("User.Read Files.ReadWrite",true)] {
            store_token(&state,serde_json::json!({"access_token":"mock-token","scope":scope,"expires_in":3600})).unwrap();
            assert_eq!(attachment_permission_granted(&state).unwrap(),expected);
        }
    }
    #[test]
    fn empty_first_message_never_requests_graph() {
        for text in ["".to_owned(), "   ".to_owned(), "x".repeat(4001)] {
            assert!(create_chat_with(OTHER, ME, &text, |_, _, _| panic!("unexpected Graph request")).is_err());
        }
    }
    #[test]
    fn own_email_alias_never_creates_chat() {
        let mut calls = 0;
        let result = create_chat_with("me@example.com", ME, "Hello", |method, _, _| {
            calls += 1;
            assert_eq!(method, reqwest::Method::GET);
            Ok(serde_json::json!({"id": ME}))
        });
        assert!(result.is_err());
        assert_eq!(calls, 2);
    }
    #[test]
    fn explicit_first_message_creates_only_chat_with_resolved_members() {
        let mut calls = Vec::new();
        let result = create_chat_with("other@example.com", ME, "Hello", |method, endpoint, body| {
            calls.push((method.clone(), endpoint.to_owned()));
            if endpoint == "/me?$select=id" { return Ok(serde_json::json!({"id": ME})); }
            if method == reqwest::Method::GET { return Ok(serde_json::json!({"id": OTHER})); }
            assert_eq!(endpoint, "/chats");
            let body = body.unwrap();
            assert_eq!(body["chatType"], "oneOnOne");
            assert!(body["members"][1]["user@odata.bind"].as_str().unwrap().contains(OTHER));
            assert!(body.get("body").is_none());
            Ok(serde_json::json!({"id": "created"}))
        }).unwrap();
        assert_eq!(result["id"], "created");
        assert_eq!(calls.len(), 3);
        assert_eq!(calls.iter().filter(|(m, _)| *m == reqwest::Method::POST).count(), 1);
    }
    #[test]
    fn failed_creation_is_never_retried() {
        let mut posts = 0;
        assert!(create_chat_with(OTHER, ME, "Hello", |method, endpoint, _| {
            if method == reqwest::Method::POST { posts += 1; return Err("timeout".into()); }
            Ok(serde_json::json!({"id": if endpoint.starts_with("/me?") { ME } else { OTHER }}))
        }).is_err());
        assert_eq!(posts, 1);
    }
}
