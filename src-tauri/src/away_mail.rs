//! Bounded, fail-closed Mail destination for the existing away ledger.
use crate::deletion::{read, Request};
use base64::Engine;
use serde_json::Value;
fn enc(s: &str) -> String {
    percent_encoding::utf8_percent_encode(s, percent_encoding::NON_ALPHANUMERIC).to_string()
}
fn address(v: &Value) -> Option<String> {
    let s = v["emailAddress"]["address"]
        .as_str()?
        .trim()
        .to_ascii_lowercase();
    (s.is_ascii()
        && s.len() <= 254
        && s.split('@').count() == 2
        && !s.starts_with('@')
        && !s.ends_with('@')
        && !s
            .chars()
            .any(|c| c.is_whitespace() || c.is_control() || "<>\\\"".contains(c)))
    .then_some(s)
}
fn own_addresses(me: &Value) -> Vec<String> {
    ["mail", "userPrincipalName"]
        .iter()
        .filter_map(|key| me[key].as_str())
        .map(str::to_ascii_lowercase)
        .collect()
}
pub fn eligible(message: &Value, own: &[String], after: i64, now: i64) -> Option<String> {
    let time = chrono::DateTime::parse_from_rfc3339(message["receivedDateTime"].as_str()?)
        .ok()?
        .timestamp_millis();
    if time <= after || time > now + 5000 || message["isDraft"].as_bool() != Some(false) {
        return None;
    }
    let sender = address(&message["from"])?;
    if own.contains(&sender) || address(&message["sender"]).as_deref() != Some(&sender) {
        return None;
    }
    let local = sender.split('@').next()?;
    if [
        "noreply",
        "no-reply",
        "donotreply",
        "do-not-reply",
        "mailer-daemon",
        "postmaster",
        "notifications",
    ]
    .iter()
    .any(|v| local.contains(v))
    {
        return None;
    }
    let recipients = message["toRecipients"].as_array()?;
    if !recipients
        .iter()
        .filter_map(address)
        .any(|v| own.contains(&v))
    {
        return None;
    }
    let reply_to = message["replyTo"].as_array()?;
    if !reply_to.is_empty()
        && (reply_to.len() != 1 || address(&reply_to[0]).as_deref() != Some(&sender))
    {
        return None;
    }
    let headers = message["internetMessageHeaders"].as_array()?;
    for header in headers {
        let name = header["name"].as_str()?.to_ascii_lowercase();
        let value = header["value"].as_str()?.trim().to_ascii_lowercase();
        if name.starts_with("list-")
            || ["x-autoreply", "x-autorespond", "x-taut-auto-reply"].contains(&name.as_str())
            || name == "auto-submitted" && value != "no"
            || name == "x-auto-response-suppress" && value != "none"
            || name == "precedence"
                && ["bulk", "list", "junk", "auto_reply"].contains(&value.as_str())
            || name == "return-path" && value == "<>"
            || name == "content-type" && value.contains("report-type=")
        {
            return None;
        }
    }
    let subject = message["subject"]
        .as_str()
        .unwrap_or("")
        .to_ascii_lowercase();
    if [
        "automatic reply:",
        "auto reply:",
        "out of office:",
        "undeliverable:",
    ]
    .iter()
    .any(|p| subject.starts_with(p))
        || message["bodyPreview"]
            .as_str()
            .unwrap_or("")
            .contains(crate::away::MARKER)
    {
        return None;
    }
    Some(sender)
}
pub struct Candidate {
    pub sender: String,
    pub message_id: String,
    pub email: String,
    pub from: String,
    pub subject: String,
    pub internet_id: String,
}
pub fn candidates(
    own: &str,
    after: i64,
    now: i64,
    request: &mut Request<'_>,
) -> Result<Vec<Candidate>, String> {
    let me = read("/me?$select=id,mail,userPrincipalName", request)?;
    if me["id"].as_str() != Some(own) {
        return Err("Account changed".into());
    }
    let addresses = own_addresses(&me);
    let Some(from) = addresses
        .iter()
        .find(|s| address(&serde_json::json!({"emailAddress":{"address":s}})).is_some())
        .cloned()
    else {
        return Ok(vec![]);
    };
    if addresses.is_empty() {
        return Ok(vec![]);
    }
    let page=read("/me/mailFolders/inbox/messages?$top=50&$orderby=receivedDateTime%20desc&$select=id,receivedDateTime",request)?;
    let mut out = vec![];
    for summary in page["value"]
        .as_array()
        .ok_or("Away monitor could not read Mail")?
    {
        let Some(id) = summary["id"]
            .as_str()
            .filter(|s| !s.is_empty() && s.len() <= 1024 && !s.chars().any(char::is_control))
        else {
            continue;
        };
        let Some(time) = summary["receivedDateTime"]
            .as_str()
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map(|d| d.timestamp_millis())
        else {
            continue;
        };
        if time <= after || time > now + 5000 {
            continue;
        }
        let detail=read(&format!("/me/messages/{}?$select=id,receivedDateTime,isDraft,from,sender,toRecipients,replyTo,internetMessageHeaders,subject,bodyPreview,internetMessageId",enc(id)),request)?;
        if detail["id"].as_str() != Some(id) {
            continue;
        }
        let Some(email) = eligible(&detail, &addresses, after, now) else {
            continue;
        };
        // /users resolves a UPN, not arbitrary external email. Require exact matching identity.
        let user = match read(
            &format!("/users/{}?$select=id,mail,userPrincipalName", enc(&email)),
            request,
        ) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let Some(sender) = user["id"].as_str().filter(|s| crate::presence::guid(s)) else {
            continue;
        };
        if sender.eq_ignore_ascii_case(own)
            || !crate::presence::directory_coworker(&user, sender)
            || !own_addresses(&user).contains(&email)
        {
            continue;
        }
        let Some(internet_id) = detail["internetMessageId"].as_str().filter(|s| {
            s.len() <= 900
                && s.starts_with('<')
                && s.ends_with('>')
                && s.bytes().all(|c| c.is_ascii_graphic())
        }) else {
            continue;
        };
        out.push(Candidate {
            sender: sender.to_ascii_lowercase(),
            message_id: id.into(),
            email,
            from: from.clone(),
            subject: detail["subject"]
                .as_str()
                .unwrap_or("")
                .chars()
                .take(200)
                .collect(),
            internet_id: internet_id.into(),
        });
    }
    Ok(out)
}
pub fn reply(candidate: &Candidate, text: &str, request: &mut Request<'_>) -> bool {
    // MIME permits the standard Auto-Submitted header; JSON custom headers must start X-.
    let encode = |v: &str| base64::engine::general_purpose::STANDARD.encode(v);
    let mut words = vec![];
    let mut chunk = String::new();
    for ch in format!("Automatic reply: {}", candidate.subject).chars() {
        if chunk.len() + ch.len_utf8() > 42 {
            words.push(format!("=?UTF-8?B?{}?=", encode(&chunk)));
            chunk.clear();
        }
        chunk.push(ch);
    }
    if !chunk.is_empty() {
        words.push(format!("=?UTF-8?B?{}?=", encode(&chunk)));
    }
    let subject = words.join("\r\n ");
    let body = encode(text);
    let wrapped = body
        .as_bytes()
        .chunks(76)
        .map(|c| std::str::from_utf8(c).unwrap())
        .collect::<Vec<_>>()
        .join("\r\n");
    let mime=format!("From: {}\r\nTo: {}\r\nSubject: {}\r\nIn-Reply-To: {}\r\nReferences: {}\r\nAuto-Submitted: auto-replied\r\nX-Auto-Response-Suppress: All\r\nX-TAUT-Auto-Reply: true\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n{}\r\n",candidate.from,candidate.email,subject,candidate.internet_id,candidate.internet_id,wrapped);
    request(
        reqwest::Method::POST,
        &format!("/me/messages/{}/reply", enc(&candidate.message_id)),
        Some(Value::String(encode(&mime))),
    )
    .is_ok_and(|r| r.status == 202)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn message() -> Value {
        json!({"id":"mail1","receivedDateTime":"2026-11-09T12:00:00Z","isDraft":false,"from":{"emailAddress":{"address":"alex@example.com"}},"sender":{"emailAddress":{"address":"alex@example.com"}},"toRecipients":[{"emailAddress":{"address":"me@example.com"}}],"replyTo":[],"internetMessageHeaders":[],"subject":"Hello","bodyPreview":"Hi"})
    }
    #[test]
    fn only_new_direct_human_mail_qualifies() {
        let own = vec!["me@example.com".into()];
        let now = chrono::DateTime::parse_from_rfc3339("2026-11-09T12:00:01Z")
            .unwrap()
            .timestamp_millis();
        let m = message();
        assert_eq!(
            eligible(&m, &own, now - 2000, now),
            Some("alex@example.com".into())
        );
        assert!(eligible(&m, &own, now, now).is_none());
        for (name, value) in [
            ("Auto-Submitted", "auto-replied"),
            ("Auto-Submitted", "auto-generated"),
            ("X-Auto-Response-Suppress", "All"),
            ("List-Id", "team"),
            ("Precedence", "bulk"),
            ("Return-Path", "<>"),
            ("X-TAUT-Auto-Reply", "true"),
        ] {
            let mut v = m.clone();
            v["internetMessageHeaders"] = json!([{"name":name,"value":value}]);
            assert!(eligible(&v, &own, now - 2000, now).is_none(), "{name}");
        }
        for change in 0..7 {
            let mut v = m.clone();
            match change {
                0 => v["from"]["emailAddress"]["address"] = json!("noreply@example.com"),
                1 => v["sender"]["emailAddress"]["address"] = json!("other@example.com"),
                2 => v["replyTo"] = json!([{"emailAddress":{"address":"elsewhere@example.com"}}]),
                3 => v["toRecipients"] = json!([]),
                4 => v["isDraft"] = json!(true),
                5 => v["subject"] = json!("Automatic reply: away"),
                _ => {
                    v.as_object_mut().unwrap().remove("internetMessageHeaders");
                }
            }
            assert!(eligible(&v, &own, now - 2000, now).is_none(), "{change}");
        }
    }
    #[test]
    fn reply_targets_only_sender_and_marks_auto_response() {
        let c = Candidate {
            sender: "id".into(),
            message_id: "a/b".into(),
            email: "alex@example.com".into(),
            from: "me@example.com".into(),
            subject: "Hello\r\nBcc: injected".into(),
            internet_id: "<original@example.com>".into(),
        };
        assert!(reply(&c, "Away", &mut |method, path, body| {
            assert_eq!(method, reqwest::Method::POST);
            assert_eq!(path, "/me/messages/a%2Fb/reply");
            let b = body.unwrap();
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(b.as_str().unwrap())
                .unwrap();
            let mime = String::from_utf8(bytes).unwrap();
            assert!(mime.starts_with("From: me@example.com\r\nTo: alex@example.com\r\n"));
            assert!(mime.contains("Auto-Submitted: auto-replied\r\n"));
            assert!(mime.contains("In-Reply-To: <original@example.com>\r\n"));
            assert!(!mime.contains("\r\nBcc:"));
            assert!(mime.contains("\r\n\r\nQXdheQ==\r\n"));
            Ok(crate::groups::Reply {
                status: 202,
                body: Value::Null,
            })
        }));
        assert!(!reply(&c, "Away", &mut |_, _, _| Err("timeout".into())));
    }
}
