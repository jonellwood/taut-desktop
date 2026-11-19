//! Shared Exchange-backed GET transport. Never used for mutations.
use reqwest::blocking::{Client, Response};
use std::{io::Read, time::Duration};

pub fn read(client: &Client, url: &str, token: &str) -> Result<Response, String> {
    read_with(client, url, token, &mut std::thread::sleep)
}
fn read_with(client: &Client, url: &str, token: &str, wait: &mut dyn FnMut(Duration)) -> Result<Response, String> {
    for attempt in 0..3 {
        let response = client.get(url).bearer_auth(token)
            .header("Prefer", "outlook.body-content-type=\"html\"")
            .send().map_err(|_| "Mailbox service could not connect. Refresh to try again.")?;
        let status = response.status().as_u16();
        if !matches!(status, 502|503|504) { return Ok(response); }
        if attempt < 2 {
            // Bound server-directed waits so a read cannot hang indefinitely.
            let seconds = response.headers().get("retry-after").and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u64>().ok()).unwrap_or(1 << attempt).min(5);
            wait(Duration::from_secs(seconds));
            continue;
        }
        let request_id = response.headers().get("request-id").and_then(|v| v.to_str().ok())
            .filter(|v| v.len() <= 64 && v.chars().all(|c| c.is_ascii_hexdigit() || c == '-')).unwrap_or("").to_owned();
        let mut bytes = Vec::new();
        let _ = response.take(16*1024).read_to_end(&mut bytes);
        // Only expose a machine error code, never arbitrary server text or message content.
        let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap_or_default();
        let code = body["error"]["code"].as_str().filter(|s| s.len()<=80 && s.chars().all(|c| c.is_ascii_alphanumeric() || c=='_')).unwrap_or("Unavailable");
        let id = if request_id.is_empty() { String::new() } else { format!(" Request ID: {request_id}.") };
        return Err(format!("Microsoft mailbox service returned HTTP {status} ({code}) after 3 read attempts.{id} Mail and Calendar may be affected; chats use a separate service. Refresh to retry."));
    }
    unreachable!()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{net::TcpListener, io::{Read,Write}, thread};
    fn run(statuses: Vec<u16>) -> Result<Response,String> {
        let listener=TcpListener::bind("127.0.0.1:0").unwrap();
        let url=format!("http://{}/mail",listener.local_addr().unwrap());
        let server=thread::spawn(move||for status in statuses {
            let(mut socket,_)=listener.accept().unwrap();let mut buffer=[0;4096];let n=socket.read(&mut buffer).unwrap();
            assert!(std::str::from_utf8(&buffer[..n]).unwrap().starts_with("GET /mail "));
            let body=r#"{"error":{"code":"ErrorMailboxUnavailable","message":"PRIVATE CONTENT"}}"#;
            write!(socket,"HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nConnection: close\r\nrequest-id: abc-123\r\n\r\n{body}",body.len()).unwrap();
        });
        let result=read_with(&Client::new(),&url,"fake-token",&mut |_|{});server.join().unwrap();result
    }
    #[test] fn transient_gateway_failure_recovers(){assert_eq!(run(vec![502,503,200]).unwrap().status(),200);}
    #[test] fn persistent_failure_has_safe_diagnostics(){let error=run(vec![502,502,502]).unwrap_err();assert!(error.contains("ErrorMailboxUnavailable"));assert!(error.contains("abc-123"));assert!(!error.contains("PRIVATE"));assert!(!error.contains("fake-token"));}
    #[test] fn permission_failures_are_not_retried(){assert_eq!(run(vec![403]).unwrap().status(),403);}
}
