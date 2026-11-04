//! Only explicit Send invokes these operations. Selection stays entirely local.
use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::Method;
use serde_json::{json, Value};
use std::{collections::HashMap, sync::Mutex};

const MAX_BYTES: usize = 10 * 1024 * 1024;
#[derive(Default)]
pub struct AttachmentState(pub std::sync::Arc<Mutex<HashMap<String, Upload>>>);
pub struct Upload {
    chat_id: String,
    name: String,
    digest: Vec<u8>,
    remote_name: String,
    attempted: bool,
    item: Option<Value>,
    recipients: Vec<String>,
    ready: bool,
}
pub struct Reply {
    pub status: u16,
    pub body: Value,
}
pub type Request<'a> =
    dyn FnMut(Method, &str, Option<Value>, Option<Vec<u8>>) -> Result<Reply, String> + 'a;
fn enc(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}
fn ok(reply: Reply) -> Result<Value, String> {
    if !(200..300).contains(&reply.status) {
        return Err(format!("Attachment request returned HTTP {}. Your draft is saved; check OneDrive and Teams before retrying.", reply.status));
    }
    Ok(reply.body)
}
fn guid(s: &str) -> bool {
    s.len() == 36
        && s.chars().enumerate().all(|(i, c)| {
            if [8, 13, 18, 23].contains(&i) {
                c == '-'
            } else {
                c.is_ascii_hexdigit()
            }
        })
}
fn valid_chat(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 512 || id.starts_with("pending:") {
        return Err("Choose an existing conversation before uploading files".into());
    }
    Ok(())
}
fn members(chat: &str, request: &mut Request<'_>) -> Result<Vec<String>, String> {
    let me = ok(request(Method::GET, "/me?$select=id", None, None)?)?;
    let own = me["id"]
        .as_str()
        .ok_or("Cannot verify the signed-in user")?;
    let value = ok(request(
        Method::GET,
        &format!("/chats/{}/members", enc(chat)),
        None,
        None,
    )?)?;
    // Fail closed rather than share with only a subset of a large/unsupported chat.
    if value.get("@odata.nextLink").is_some() {
        return Err("This conversation has too many members for attachment sharing in TAUT. Use Teams for this file.".into());
    }
    let rows = value["value"]
        .as_array()
        .ok_or("Cannot verify conversation members")?;
    let mut ids = Vec::new();
    for member in rows {
        if member["@odata.type"].as_str() != Some("#microsoft.graph.aadUserConversationMember") {
            return Err("Attachments require identifiable Microsoft 365 participants. Use Teams for this conversation.".into());
        }
        let id = member["userId"]
            .as_str()
            .filter(|id| guid(id))
            .ok_or("A conversation member could not be verified")?;
        ids.push(id.to_lowercase());
    }
    if !ids.contains(&own.to_lowercase()) {
        return Err("You are no longer a member of this conversation".into());
    }
    ids.retain(|id| !id.eq_ignore_ascii_case(own));
    ids.sort();
    ids.dedup();
    if ids.is_empty() {
        return Err("No other conversation members could be verified".into());
    }
    Ok(ids)
}
fn validate_input(id: &str, name: &str, data: &str) -> Result<Vec<u8>, String> {
    if !guid(id)
        || name.trim().is_empty()
        || name.len() > 180
        || name.ends_with(['.', ' '])
        || name
            .chars()
            .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
    {
        return Err("Invalid attachment name or identifier".into());
    }
    if data.len() > MAX_BYTES.div_ceil(3) * 4 {
        return Err("File exceeds the 10 MB limit".into());
    }
    let bytes = STANDARD
        .decode(data)
        .map_err(|_| "Could not read the selected file")?;
    if bytes.is_empty() || bytes.len() > MAX_BYTES {
        return Err("Choose a nonempty file up to 10 MB".into());
    }
    Ok(bytes)
}
fn item_fields(item: &Value) -> Result<(&str, &str), String> {
    let id = item["id"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or("Upload response did not identify the file; check OneDrive before retrying")?;
    let web = item["webUrl"]
        .as_str()
        .ok_or("Upload did not return a file link")?;
    let url = url::Url::parse(web).map_err(|_| "Invalid OneDrive file link")?;
    let host = url.host_str().unwrap_or("");
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || !(host.ends_with(".sharepoint.com") || host.ends_with(".sharepoint-df.com"))
    {
        return Err("Unsupported OneDrive file link. Use Teams for this tenant.".into());
    }
    Ok((id, web))
}
// Keep the unpredictable destination prefix and extension, avoiding Unicode/space
// normalization in OneDrive. The attachment label retains the original filename.
fn upload_name(name: &str) -> String {
    let safe: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || "._-".contains(c) {
                c
            } else {
                '_'
            }
        })
        .collect();
    format!("TAUT-{}-{safe}", super::random_urlsafe())
}
fn verify_item(item: &Value, expected_name: &str, expected_size: usize) -> Result<(), String> {
    item_fields(item)?;
    if item["name"].as_str() != Some(expected_name) {
        return Err("OneDrive returned a different filename. The uploaded copy is retained; sharing and sending were stopped.".into());
    }
    match item["size"].as_u64() {
        Some(size) if size==expected_size as u64 => {},
        Some(size) => return Err(format!("OneDrive file size could not be verified (expected {expected_size} bytes, received {size}). The uploaded copy is retained; sharing and sending were stopped.")),
        None => return Err("OneDrive did not return the uploaded file size. The uploaded copy is retained; sharing and sending were stopped.".into()),
    }
    if !item["file"].is_object() {
        return Err("OneDrive did not identify the uploaded item as a file. The uploaded copy is retained; sharing and sending were stopped.".into());
    }
    Ok(())
}
pub fn prepare(
    store: &mut HashMap<String, Upload>,
    permitted: bool,
    chat: &str,
    id: &str,
    name: &str,
    data: &str,
    request: &mut Request<'_>,
) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    valid_chat(chat)?;
    let bytes = validate_input(id, name, data)?;
    if !permitted {
        return Err("Attachment sending needs Files.ReadWrite permission. Enable it after approval, then sign out and sign in again. No file was uploaded.".into());
    }
    let digest = Sha256::digest(&bytes).to_vec();
    let recipients = members(chat, request)?;
    if !store.contains_key(id) && store.len() >= 100 {
        return Err(
            "Attachment session limit reached. Sign out to clear local upload records.".into(),
        );
    }
    let upload = store.entry(id.to_owned()).or_insert_with(|| Upload {
        chat_id: chat.to_owned(),
        name: name.to_owned(),
        digest: digest.clone(),
        remote_name: upload_name(name),
        attempted: false,
        item: None,
        recipients: recipients.clone(),
        ready: false,
    });
    if upload.chat_id != chat || upload.name != name || upload.digest != digest {
        return Err(
            "This attachment belongs to a different draft. Remove it and select the file again."
                .into(),
        );
    }
    if upload.recipients != recipients {
        return Err("Conversation membership changed. Previously shared files may remain accessible. Remove this attachment and select it again to send a new copy.".into());
    }
    if upload.ready {
        return Ok(());
    }
    let path = format!("/me/drive/root:/{}", enc(&upload.remote_name));
    if upload.item.is_none() && upload.attempted {
        let recovered = request(Method::GET, &path, None, None)?;
        if recovered.status != 404 {
            upload.item = Some(ok(recovered)?);
        }
    }
    if upload.item.is_none() {
        // A stable, random destination lets an explicit retry recover an uncertain PUT.
        upload.attempted = true;
        upload.item = Some(ok(request(
            Method::PUT,
            &format!("{path}:/content"),
            None,
            Some(bytes.clone()),
        )?)?);
    }
    if verify_item(
        upload.item.as_ref().unwrap(),
        &upload.remote_name,
        bytes.len(),
    )
    .is_err()
    {
        // A successful PUT may return incomplete metadata. Read the same item once;
        // do not re-upload it or leave an invalid response permanently cached.
        let previous_id = upload.item.as_ref().unwrap()["id"]
            .as_str()
            .filter(|s| !s.is_empty())
            .map(str::to_owned);
        let endpoint = previous_id
            .as_ref()
            .map(|id| {
                format!(
                    "/me/drive/items/{}?$select=id,name,size,file,webUrl",
                    enc(id)
                )
            })
            .unwrap_or_else(|| path.clone());
        let refreshed = ok(request(Method::GET, &endpoint, None, None)?)?;
        if let Some(id) = previous_id {
            if refreshed["id"].as_str() != Some(&id) {
                return Err("OneDrive returned a different file identity. Sharing and sending were stopped.".into());
            }
        }
        upload.item = Some(refreshed);
    }
    let item = upload.item.as_ref().unwrap();
    verify_item(item, &upload.remote_name, bytes.len())?;
    let (item_id, _) = item_fields(item)?;
    let grants = ok(request(
        Method::POST,
        &format!("/me/drive/items/{}/invite", enc(item_id)),
        Some(json!({
            "recipients":recipients.iter().map(|id| json!({"objectId":id})).collect::<Vec<_>>(),
            "requireSignIn":true,"sendInvitation":false,"roles":["read"],
        })),
        None,
    )?)?;
    let permissions = grants["value"]
        .as_array()
        .ok_or("File uploaded, but sharing was not confirmed. Your draft is saved.")?;
    if permissions.len() < recipients.len()
        || permissions
            .iter()
            .any(|p| p.get("error").is_some() || p["id"].as_str().is_none())
    {
        return Err(
            "File uploaded, but some sharing permissions were not confirmed. Your draft is saved."
                .into(),
        );
    }
    upload.ready = true;
    Ok(())
}
fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
        .replace('\n', "<br>")
}
#[cfg(test)]
pub fn send(store: &HashMap<String, Upload>,chat:&str,text:&str,ids:&[String],request:&mut Request<'_>)->Result<Value,String>{send_formatted(store,chat,text,ids,false,request)}
pub fn send_formatted(
    store: &HashMap<String, Upload>,
    chat: &str,
    text: &str,
    ids: &[String],
    formatted: bool,
    request: &mut Request<'_>,
) -> Result<Value, String> {
    valid_chat(chat)?;
    if ids.is_empty() || ids.len() > 5 || text.trim().chars().count() > 4000 {
        return Err("Attach 1–5 files and use up to 4000 message characters".into());
    }
    let mut unique = std::collections::HashSet::new();
    let mut attachments = Vec::new();
    let mut content = if formatted {crate::compose_format::body(text,true,true)?["content"].as_str().unwrap().to_owned()} else {escape(text.trim())};
    let recipients = members(chat, request)?;
    let mut total = 0u64;
    for id in ids {
        if !unique.insert(id) {
            return Err("Duplicate attachment".into());
        }
        let upload = store
            .get(id)
            .filter(|u| u.chat_id == chat && u.ready)
            .ok_or("An attachment is not ready for this conversation")?;
        if recipients != upload.recipients {
            return Err("Conversation membership changed. Check the file's sharing permissions before retrying.".into());
        }
        let item = upload.item.as_ref().ok_or("Missing uploaded attachment")?;
        let (_, url) = item_fields(item)?;
        total += item["size"].as_u64().unwrap_or(u64::MAX);
        content.push_str(&format!("<attachment id=\"{id}\"></attachment>"));
        attachments
            .push(json!({"id":id,"contentType":"reference","contentUrl":url,"name":upload.name}));
    }
    if total > 25 * 1024 * 1024 {
        return Err("Attachments exceed the 25 MB message limit".into());
    }
    let reply=request(Method::POST, &format!("/chats/{}/messages", enc(chat)), Some(json!({"body":{"contentType":"html","content":content},"attachments":attachments})), None)
        .map_err(|_| "Delivery was not confirmed. Files may already be shared and the message may have arrived. Check Teams before explicitly retrying; your draft is saved.".to_owned())?;
    if reply.status != 201
        || reply.body["id"]
            .as_str()
            .filter(|s| !s.is_empty())
            .is_none()
    {
        return Err("Delivery was not confirmed. Files may already be shared. Check Teams before explicitly retrying; your draft is saved.".into());
    }
    Ok(reply.body)
}

#[cfg(test)]
mod tests {
    use super::*;
    const ME: &str = "11111111-1111-1111-1111-111111111111";
    const OTHER: &str = "22222222-2222-2222-2222-222222222222";
    const ID: &str = "33333333-3333-3333-3333-333333333333";
    #[derive(Default)]
    struct Graph {
        calls: Vec<(Method, String, Option<Value>)>,
        item: Option<Value>,
        puts: usize,
        fail_upload: bool,
        fail_share: bool,
        fail_send: bool,
        changed: bool,
        partial: bool,
        paged: bool,
        incomplete_response: bool,
        size_mismatch: bool,
        wrong_name: bool,
    }
    impl Graph {
        fn request(
            &mut self,
            method: Method,
            path: &str,
            body: Option<Value>,
            bytes: Option<Vec<u8>>,
        ) -> Result<Reply, String> {
            self.calls
                .push((method.clone(), path.to_owned(), body.clone()));
            let result = if path == "/me?$select=id" {
                json!({"id":ME})
            } else if path.ends_with("/members") {
                let other = if self.changed { ID } else { OTHER };
                let mut value = json!({"value":[
                    {"@odata.type":"#microsoft.graph.aadUserConversationMember","userId":ME},
                    {"@odata.type":"#microsoft.graph.aadUserConversationMember","userId":other}
                ]});
                if self.paged {
                    value["@odata.nextLink"] = json!("https://graph.microsoft.com/next");
                }
                value
            } else if method == Method::PUT {
                self.puts += 1;
                let encoded = path
                    .strip_prefix("/me/drive/root:/")
                    .unwrap()
                    .strip_suffix(":/content")
                    .unwrap();
                let name = url::form_urlencoded::parse(format!("n={encoded}").as_bytes())
                    .next()
                    .unwrap()
                    .1
                    .into_owned();
                self.item = Some(
                    json!({"id":"remote","name":name,"size":bytes.unwrap().len(),"file":{},"webUrl":"https://example.sharepoint.com/file"}),
                );
                if self.size_mismatch {
                    self.item.as_mut().unwrap()["size"] = json!(999);
                }
                if self.wrong_name {
                    self.item.as_mut().unwrap()["name"] = json!("unrelated.txt");
                }
                if self.incomplete_response {
                    return Ok(Reply {
                        status: 201,
                        body: json!({"id":"remote"}),
                    });
                }
                if self.fail_upload {
                    self.fail_upload = false;
                    return Err("upload timeout".into());
                }
                self.item.clone().unwrap()
            } else if method == Method::GET
                && (path.starts_with("/me/drive/root:/")
                    || path.starts_with("/me/drive/items/remote?"))
            {
                self.item.clone().unwrap()
            } else if path.ends_with("/invite") {
                if self.fail_share {
                    self.fail_share = false;
                    return Err("sharing timeout".into());
                }
                if self.partial {
                    json!({"value":[{"error":{"code":"denied"}}]})
                } else {
                    json!({"value":[{"id":"permission"}]})
                }
            } else if path.ends_with("/messages") {
                if self.fail_send {
                    return Err("send timeout".into());
                }
                return Ok(Reply {
                    status: 201,
                    body: json!({"id":"message"}),
                });
            } else {
                panic!("unexpected request {method} {path}");
            };
            Ok(Reply {
                status: 200,
                body: result,
            })
        }
    }
    fn prepare_file(store: &mut HashMap<String, Upload>, graph: &mut Graph) -> Result<(), String> {
        prepare(
            store,
            true,
            "chat",
            ID,
            "notes & report.txt",
            "aGk=",
            &mut |m, p, b, d| graph.request(m, p, b, d),
        )
    }
    #[test]
    fn formatted_send_preserves_file_references(){
      let mut store=HashMap::new();let mut graph=Graph::default();prepare_file(&mut store,&mut graph).unwrap();
      send_formatted(&store,"chat","**See file** <x>",&[ID.into()],true,&mut |m,p,b,d|graph.request(m,p,b,d)).unwrap();
      let payload=graph.calls.last().unwrap().2.as_ref().unwrap();let content=payload["body"]["content"].as_str().unwrap();assert!(content.starts_with("<p><strong>See file</strong> &lt;x&gt;</p>"));assert!(content.contains("<attachment id="));assert_eq!(payload["attachments"].as_array().unwrap().len(),1);
    }
    #[test]
    fn invalid_input_and_missing_permission_make_no_requests() {
        let mut store = HashMap::new();
        for (permitted, chat, id, name, data) in [
            (false, "chat", ID, "ok.txt", "aGk="),
            (true, "pending:other", ID, "ok.txt", "aGk="),
            (true, "chat", ID, "../secret", "aGk="),
            (true, "chat", ID, "ok.txt", ""),
            (true, "chat", "invalid", "ok.txt", "aGk="),
        ] {
            assert!(prepare(
                &mut store,
                permitted,
                chat,
                id,
                name,
                data,
                &mut |_, _, _, _| panic!("unexpected request")
            )
            .is_err());
        }
    }
    #[test]
    fn explicit_send_uploads_then_grants_read_without_invitation_then_sends_escaped_html() {
        let mut store = HashMap::new();
        let mut graph = Graph::default();
        prepare_file(&mut store, &mut graph).unwrap();
        send(
            &store,
            "chat",
            "<script> & hi",
            &[ID.into()],
            &mut |m, p, b, d| graph.request(m, p, b, d),
        )
        .unwrap();
        let invite = graph
            .calls
            .iter()
            .find(|c| c.1.ends_with("/invite"))
            .unwrap()
            .2
            .as_ref()
            .unwrap();
        assert_eq!(invite["sendInvitation"], false);
        assert_eq!(invite["requireSignIn"], true);
        assert_eq!(invite["roles"], json!(["read"]));
        assert_eq!(invite["recipients"], json!([{"objectId":OTHER}]));
        let payload = graph.calls.last().unwrap().2.as_ref().unwrap();
        assert!(payload["body"]["content"]
            .as_str()
            .unwrap()
            .starts_with("&lt;script&gt; &amp; hi"));
        assert_eq!(payload["attachments"][0]["contentType"], "reference");
        assert_eq!(payload["attachments"][0]["name"], "notes & report.txt");
        assert_eq!(graph.puts, 1);
    }
    #[test]
    fn uncertain_upload_is_recovered_by_read_on_explicit_retry() {
        let mut store = HashMap::new();
        let mut graph = Graph {
            fail_upload: true,
            ..Default::default()
        };
        assert!(prepare_file(&mut store, &mut graph).is_err());
        assert!(!graph.calls.iter().any(|c| c.1.ends_with("/invite")));
        prepare_file(&mut store, &mut graph).unwrap();
        assert_eq!(graph.puts, 1);
        assert!(graph
            .calls
            .iter()
            .any(|c| c.0 == Method::GET && c.1.starts_with("/me/drive/root:/")));
    }
    #[test]
    fn sharing_failure_retains_uploaded_file_for_explicit_retry() {
        let mut store = HashMap::new();
        let mut graph = Graph {
            fail_share: true,
            ..Default::default()
        };
        assert!(prepare_file(&mut store, &mut graph).is_err());
        prepare_file(&mut store, &mut graph).unwrap();
        assert_eq!(graph.puts, 1);
        prepare_file(&mut store, &mut graph).unwrap();
        assert_eq!(
            graph
                .calls
                .iter()
                .filter(|c| c.1.ends_with("/invite"))
                .count(),
            2
        );
    }
    #[test]
    fn partial_sharing_never_marks_file_ready() {
        let mut store = HashMap::new();
        let mut graph = Graph {
            partial: true,
            ..Default::default()
        };
        assert!(prepare_file(&mut store, &mut graph).is_err());
        assert!(!store[ID].ready);
        assert!(
            send(&store, "chat", "Hi", &[ID.into()], &mut |m, p, b, d| graph
                .request(m, p, b, d))
            .is_err()
        );
        assert!(!graph.calls.iter().any(|c| c.1.ends_with("/messages")));
    }
    #[test]
    fn delivery_timeout_retains_file_without_automatic_retry() {
        let mut store = HashMap::new();
        let mut graph = Graph {
            fail_send: true,
            ..Default::default()
        };
        prepare_file(&mut store, &mut graph).unwrap();
        assert!(
            send(&store, "chat", "", &[ID.into()], &mut |m, p, b, d| graph
                .request(m, p, b, d))
            .unwrap_err()
            .contains("Check Teams")
        );
        assert!(store[ID].ready);
        assert_eq!(
            graph
                .calls
                .iter()
                .filter(|c| c.1.ends_with("/messages"))
                .count(),
            1
        );
        graph.fail_send = false;
        prepare_file(&mut store, &mut graph).unwrap();
        send(&store, "chat", "", &[ID.into()], &mut |m, p, b, d| {
            graph.request(m, p, b, d)
        })
        .unwrap();
        assert_eq!(graph.puts, 1);
    }
    #[test]
    fn membership_changes_cross_chat_reuse_and_duplicate_ids_are_rejected() {
        let mut store = HashMap::new();
        let mut graph = Graph::default();
        prepare_file(&mut store, &mut graph).unwrap();
        assert!(send(
            &store,
            "other-chat",
            "Hi",
            &[ID.into()],
            &mut |m, p, b, d| graph.request(m, p, b, d)
        )
        .is_err());
        assert!(send(
            &store,
            "chat",
            "Hi",
            &[ID.into(), ID.into()],
            &mut |m, p, b, d| graph.request(m, p, b, d)
        )
        .is_err());
        graph.changed = true;
        assert!(prepare_file(&mut store, &mut graph).is_err());
        assert!(
            send(&store, "chat", "Hi", &[ID.into()], &mut |m, p, b, d| graph
                .request(m, p, b, d))
            .is_err()
        );
        assert!(!graph.calls.iter().any(|c| c.1.ends_with("/messages")));
        assert_eq!(graph.puts, 1);
    }
    #[test]
    fn incomplete_membership_never_uploads() {
        let mut store = HashMap::new();
        let mut graph = Graph {
            paged: true,
            ..Default::default()
        };
        assert!(prepare_file(&mut store, &mut graph).is_err());
        assert_eq!(graph.puts, 0);
    }
    #[test]
    fn macos_screenshot_names_use_ascii_destinations_but_keep_original_labels() {
        let mut store = HashMap::new();
        let mut graph = Graph::default();
        let name = "Screenshot 2026-11-03 at 8.58.54\u{202f}AM.png";
        prepare(
            &mut store,
            true,
            "chat",
            ID,
            name,
            "aGk=",
            &mut |m, p, b, d| graph.request(m, p, b, d),
        )
        .unwrap();
        assert!(store[ID].remote_name.is_ascii());
        assert!(store[ID].remote_name.ends_with("AM.png"));
        send(
            &store,
            "chat",
            "Screenshot",
            &[ID.into()],
            &mut |m, p, b, d| graph.request(m, p, b, d),
        )
        .unwrap();
        assert_eq!(
            graph.calls.last().unwrap().2.as_ref().unwrap()["attachments"][0]["name"],
            name
        );
        assert_eq!(graph.puts, 1);
    }
    #[test]
    fn incomplete_upload_response_is_refreshed_without_duplicate_upload() {
        let mut store = HashMap::new();
        let mut graph = Graph {
            incomplete_response: true,
            ..Default::default()
        };
        prepare_file(&mut store, &mut graph).unwrap();
        assert!(store[ID].ready);
        assert_eq!(graph.puts, 1);
        assert!(graph
            .calls
            .iter()
            .any(|c| c.0 == Method::GET && c.1.starts_with("/me/drive/items/remote?")));
    }
    #[test]
    fn metadata_mismatch_stops_sharing_and_retry_refreshes_the_same_upload() {
        for wrong_name in [false, true] {
            let mut store = HashMap::new();
            let mut graph = Graph {
                size_mismatch: !wrong_name,
                wrong_name,
                ..Default::default()
            };
            let error = prepare_file(&mut store, &mut graph).unwrap_err();
            assert!(error.contains(if wrong_name {
                "different filename"
            } else {
                "expected 2 bytes, received 999"
            }));
            assert!(!graph
                .calls
                .iter()
                .any(|c| c.1.ends_with("/invite") || c.1.ends_with("/messages")));
            graph.item.as_mut().unwrap()["name"] = json!(store[ID].remote_name);
            graph.item.as_mut().unwrap()["size"] = json!(2);
            prepare_file(&mut store, &mut graph).unwrap();
            assert!(store[ID].ready);
            assert_eq!(graph.puts, 1);
        }
    }
}
