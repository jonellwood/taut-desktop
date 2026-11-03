use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::{rngs::OsRng, RngCore};
use reqwest::blocking::Client;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{io::{Read, Write}, net::TcpListener, process::Command, sync::Mutex, thread, time::{Duration, Instant}};
use tauri::State;
use url::Url;

const TENANT: &str = "5c747a22-76d4-498e-9d9a-75523aff7ceb";
const CLIENT_ID: &str = "082aabde-4018-4e9e-8936-d2b74a34d9de";
const SCOPES: &str = "openid profile offline_access User.Read Chat.Read ChatMessage.Send Chat.Create User.ReadBasic.All";

#[derive(Default)]
struct AuthState(Mutex<Option<TokenState>>);
struct TokenState { access: String, refresh: Option<String>, expires_at: Instant }

fn random_urlsafe() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}
fn http_client() -> Result<Client, String> {
    Client::builder().timeout(Duration::from_secs(20)).build().map_err(|_| "HTTP client unavailable".into())
}
fn exchange_token(form: &[(&str, &str)]) -> Result<Value, String> {
    let url = format!("https://login.microsoftonline.com/{TENANT}/oauth2/v2.0/token");
    let resp = http_client()?.post(url).form(form).send().map_err(|_| "Token exchange network error".to_string())?;
    if !resp.status().is_success() { return Err(format!("Microsoft sign-in returned HTTP {} (verify redirect URI and tenant settings)", resp.status())); }
    resp.json().map_err(|_| "Invalid token exchange response".into())
}
fn store_token(state: &AuthState, value: Value) -> Result<(), String> {
    let access = value["access_token"].as_str().ok_or("Missing access token")?.to_owned();
    let refresh = value["refresh_token"].as_str().map(str::to_owned);
    let ttl = value["expires_in"].as_u64().unwrap_or(3600);
    *state.0.lock().map_err(|_| "Authentication state unavailable")? = Some(TokenState {
        access, refresh, expires_at: Instant::now() + Duration::from_secs(ttl.saturating_sub(90).max(1))
    });
    Ok(())
}
fn get_access_token(state: &AuthState) -> Result<String, String> {
    let (refresh, access) = {
        let guard = state.0.lock().map_err(|_| "Authentication state unavailable")?;
        let saved = guard.as_ref().ok_or("Not signed in")?;
        if Instant::now() < saved.expires_at { return Ok(saved.access.clone()); }
        (saved.refresh.clone(), saved.access.clone())
    };
    let refresh = refresh.ok_or("Session expired; sign in again")?;
    let token = exchange_token(&[("client_id", CLIENT_ID), ("grant_type", "refresh_token"), ("refresh_token", &refresh), ("scope", SCOPES)])?;
    let token = if token.get("refresh_token").is_some() { token } else {
        let mut token = token;
        token["refresh_token"] = Value::String(refresh);
        token
    };
    store_token(state, token)?;
    let guard = state.0.lock().map_err(|_| "Authentication state unavailable")?;
    Ok(guard.as_ref().map(|v|v.access.clone()).unwrap_or(access))
}

#[tauri::command]
async fn sign_in(state: State<'_, AuthState>) -> Result<(), String> {
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
                    let message = if code.is_some() { "Authorization received. Return to TAUT while the session finishes connecting." } else { "Authentication was not completed. Return to TAUT and try again." };
                    let body = format!("<html><body style='font:16px system-ui;background:#151b21;color:#efbb70;padding:40px'><h2>TAUT</h2><p>{message}</p></body></html>");
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
    ])).await.map_err(|_| "Token request failed")??;
    store_token(&state, result)
}

fn graph_request(state: &AuthState, endpoint: &str) -> Result<Value, String> {
    let token = get_access_token(state)?;
    let response = http_client()?.get(format!("https://graph.microsoft.com/v1.0{endpoint}"))
        .bearer_auth(token).send().map_err(|_| "Microsoft Graph network error")?;
    if !response.status().is_success() { return Err(format!("Graph returned HTTP {}", response.status())); }
    response.json().map_err(|_| "Invalid Graph response".into())
}
#[tauri::command]
fn graph_profile(state: State<'_, AuthState>) -> Result<Value, String> { graph_request(&state, "/me?$select=id,displayName,userPrincipalName") }
#[tauri::command]
fn graph_chats(state: State<'_, AuthState>) -> Result<Value, String> { graph_request(&state, "/me/chats?$top=50&$expand=members") }
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
    graph_request(&state, &format!("/me/chats/{encoded}/messages?$top=50"))
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
fn sign_out(state: State<'_, AuthState>) -> Result<(), String> {
    *state.0.lock().map_err(|_| "Authentication state unavailable")? = None;
    Ok(())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AuthState::default())
        .invoke_handler(tauri::generate_handler![sign_in, sign_out, graph_profile, graph_chats, graph_chat_members, graph_search_users, graph_messages, graph_send_message, graph_create_chat, graph_hosted_image])
        .run(tauri::generate_context!())
        .expect("error while running TAUT desktop");
}

#[cfg(test)]
mod tests {
    use super::*;
    const ME: &str = "11111111-1111-1111-1111-111111111111";
    const OTHER: &str = "22222222-2222-2222-2222-222222222222";

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
