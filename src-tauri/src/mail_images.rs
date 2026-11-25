//! Explicit, unauthenticated external email image retrieval. Never use the Graph client.
use base64::Engine;
use std::{
    io::Read,
    net::{IpAddr, ToSocketAddrs},
    time::Duration,
};
use url::Url;
fn public(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => {
            let [a, b, c, _] = v.octets();
            !matches!(a, 0 | 10 | 127 | 224..=255)
                && !(a == 100 && (64..=127).contains(&b))
                && !(a == 169 && b == 254)
                && !(a == 172 && (16..=31).contains(&b))
                && !(a == 192 && (b == 168 || b == 0 || b == 2))
                && !(a == 198 && (b == 18 || b == 19 || b == 51 && c == 100))
                && !(a == 203 && b == 0 && c == 113)
        }
        IpAddr::V6(v) => {
            let s = v.segments();
            s[0] & 0xe000 == 0x2000
                && !(s[0] == 0x2001 && (s[1] < 0x200 || s[1] == 0xdb8))
                && s[0] != 0x2002
        }
    }
}
fn destination(raw: &str) -> Result<Url, String> {
    let u = Url::parse(raw).map_err(|_| "Invalid image address")?;
    if raw.len() > 8192
        || u.scheme() != "https"
        || !u.username().is_empty()
        || u.password().is_some()
        || u.port_or_known_default() != Some(443)
        || u.host_str().is_none()
    {
        return Err("Only public HTTPS images on the standard port can be loaded".into());
    }
    Ok(u)
}
fn image_type(b: &[u8]) -> Option<&'static str> {
    if b.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("png")
    } else if b.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("jpeg")
    } else if b.starts_with(b"GIF87a") || b.starts_with(b"GIF89a") {
        Some("gif")
    } else if b.len() >= 12 && b.starts_with(b"RIFF") && &b[8..12] == b"WEBP" {
        Some("webp")
    } else {
        None
    }
}
fn intranet(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => v.is_private(),
        IpAddr::V6(v) => v.segments()[0] & 0xfe00 == 0xfc00,
    }
}
pub fn load(raw: &str, allow_intranet: bool) -> Result<String, String> {
    let u = destination(raw)?;
    let host = u.host_str().unwrap();
    let addresses: Vec<_> = (host, 443)
        .to_socket_addrs()
        .map_err(|_| "Image host could not be resolved")?
        .collect();
    if addresses.is_empty()
        || addresses
            .iter()
            .any(|a| !public(a.ip()) && !intranet(a.ip()))
    {
        return Err("Images on local, link-local or special networks are blocked".into());
    }
    if !allow_intranet && addresses.iter().any(|a| intranet(a.ip())) {
        return Err("INTRANET_IMAGE_APPROVAL_REQUIRED".into());
    }
    // Pin the validated DNS result, disable proxies/redirects, and send no credentials/referrer.
    let client = reqwest::blocking::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(15))
        .resolve_to_addrs(host, &addresses)
        .build()
        .map_err(|_| "Image client unavailable")?;
    let response = client
        .get(u.clone())
        .header("Accept", "image/png,image/jpeg,image/gif,image/webp")
        .send()
        .map_err(|_| "External image could not be loaded")?;
    if !response.status().is_success() {
        return Err("Image server refused the request or requires a redirect. Open the email in Outlook to view it.".into());
    }
    const LIMIT: u64 = 5 * 1024 * 1024;
    if response.content_length().is_some_and(|n| n > LIMIT) {
        return Err("External image exceeds 5 MiB".into());
    }
    let mut bytes = Vec::new();
    response
        .take(LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Image download failed")?;
    if bytes.len() as u64 > LIMIT {
        return Err("External image exceeds 5 MiB".into());
    }
    let kind = image_type(&bytes)
        .ok_or("Unsupported image content; only PNG, JPEG, GIF and WebP are allowed")?;
    Ok(format!(
        "data:image/{kind};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn destinations_are_restricted() {
        for u in [
            "http://example.com/a",
            "https://user:pass@example.com/a",
            "https://example.com:444/a",
            "file:///x",
        ] {
            assert!(destination(u).is_err());
        }
        assert!(destination("https://example.com/a.png?q=1").is_ok());
    }
    #[test]
    fn private_and_special_addresses_are_rejected() {
        for ip in [
            "127.0.0.1",
            "10.2.3.4",
            "169.254.169.254",
            "100.64.1.2",
            "192.168.1.1",
            "198.18.0.1",
            "::1",
            "::ffff:8.8.8.8",
            "2001:db8::1",
            "2002:0808:0808::1",
        ] {
            assert!(!public(ip.parse().unwrap()), "{ip}");
        }
        for ip in ["8.8.8.8", "2606:4700:4700::1111"] {
            assert!(public(ip.parse().unwrap()));
        }
    }
    #[test]
    fn intranet_approval_never_includes_loopback_or_link_local() {
        for ip in ["10.50.10.27", "172.16.1.1", "192.168.1.1", "fd00::1"] {
            assert!(intranet(ip.parse().unwrap()));
        }
        for ip in ["127.0.0.1", "169.254.169.254", "::1", "fe80::1", "8.8.8.8"] {
            assert!(!intranet(ip.parse().unwrap()));
        }
    }
    #[test]
    fn rejects_active_content() {
        assert_eq!(image_type(b"<svg></svg>"), None);
        assert_eq!(image_type(b"<html>"), None);
        assert_eq!(image_type(b"\x89PNG\r\n\x1a\n"), Some("png"));
    }
}
