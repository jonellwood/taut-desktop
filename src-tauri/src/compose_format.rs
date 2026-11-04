//! Safe outgoing formatting. Never accept HTML supplied by the webview.
use serde_json::{json, Value};
pub fn escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}
fn inline(mut s: &str) -> String {
    let mut out = String::new();
    while !s.is_empty() {
        let mark = if s.starts_with("**") {
            "**"
        } else if s.starts_with('`') {
            "`"
        } else {
            ""
        };
        if !mark.is_empty() {
            if let Some(end) = s[mark.len()..].find(mark).map(|n| n + mark.len()) {
                if end > mark.len() {
                    let tag = if mark == "**" { "strong" } else { "code" };
                    out.push_str(&format!("<{tag}>{}</{tag}>", escape(&s[mark.len()..end])));
                    s = &s[end + mark.len()..];
                    continue;
                }
            }
        }
        if s.starts_with('[') {
            if let Some(close) = s.find("](").filter(|n| *n > 1) {
                if let Some(stop) = s[close + 2..].find(')').map(|n| n + close + 2) {
                    let href = &s[close + 2..stop];
                    if url::Url::parse(href).is_ok_and(|u| {
                        ["http", "https"].contains(&u.scheme())
                            && u.username().is_empty()
                            && u.password().is_none()
                    }) {
                        out.push_str(&format!(
                            "<a href=\"{}\">{}</a>",
                            escape(href),
                            escape(&s[1..close])
                        ));
                        s = &s[stop + 1..];
                        continue;
                    }
                }
            }
        }
        let ch = s.chars().next().unwrap();
        out.push_str(&escape(&ch.to_string()));
        s = &s[ch.len_utf8()..];
    }
    out
}
fn item(s: &str) -> Option<(&str, &str)> {
    if let Some(v) = s.strip_prefix("- ") {
        Some(("ul", v))
    } else {
        let (n, v) = s.split_once(". ")?;
        if !n.is_empty() && n.bytes().all(|c| c.is_ascii_digit()) {
            Some(("ol", v))
        } else {
            None
        }
    }
}
pub fn render(source: &str) -> (String, String) {
    let normalized = source.replace("\r\n", "\n").replace('\r', "\n");
    let lines: Vec<_> = normalized.split('\n').collect();
    let mut i = 0;
    let mut html = String::new();
    let mut visible = String::new();
    while i < lines.len() {
        let line = lines[i];
        if let Some(language) = line.strip_prefix("```") {
            let language = language.trim().to_lowercase();
            let language = if [
                "text",
                "powershell",
                "php",
                "javascript",
                "typescript",
                "json",
                "bash",
                "python",
                "sql",
                "html",
                "css",
                "rust",
                "csharp",
            ]
            .contains(&language.as_str())
            {
                language.as_str()
            } else {
                "text"
            };
            i += 1;
            let mut code = Vec::new();
            while i < lines.len() && lines[i] != "```" {
                code.push(lines[i]);
                i += 1;
            }
            let value = code.join("\n");
            let language = if language == "text" {
                "plaintext"
            } else {
                language
            };
            html.push_str(&format!(
                "<codeblock class=\"{language}\"><code>{}</code></codeblock>",
                escape(&value)
            ));
            visible.push_str(&value);
        } else if let Some((tag, _)) = item(line) {
            html.push_str(&format!("<{tag}>"));
            while i < lines.len() {
                if let Some((t, value)) = item(lines[i]) {
                    if t != tag {
                        break;
                    }
                    html.push_str(&format!("<li>{}</li>", inline(value)));
                    visible.push_str(value);
                    i += 1;
                } else {
                    break;
                }
            }
            html.push_str(&format!("</{tag}>"));
            continue;
        } else {
            html.push_str(&if line.is_empty() {
                "<p><br></p>".into()
            } else {
                format!("<p>{}</p>", inline(line))
            });
            visible.push_str(line);
        }
        i += 1;
    }
    (html, visible.trim().into())
}
pub fn body(text: &str, formatted: bool, allow_empty: bool) -> Result<Value, String> {
    if text.trim().chars().count() > 4000 {
        return Err("Message must contain at most 4000 characters".into());
    }
    let (html, visible) = if formatted {
        render(text.trim())
    } else {
        (String::new(), text.trim().into())
    };
    if !allow_empty && visible.is_empty() {
        return Err("Write a nonempty message before sending".into());
    }
    Ok(if formatted {
        json!({"contentType":"html","content":html})
    } else {
        json!({"contentType":"text","content":text.trim()})
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn safe_code_and_formatting() {
        let b = body(
            "**Hello**\n- One\n- Two\n```powershell\n$x = '<script>'\n```",
            true,
            false,
        )
        .unwrap();
        let s = b["content"].as_str().unwrap();
        assert!(s.contains("<strong>Hello</strong>"));
        assert!(s.contains("<ul><li>One</li><li>Two</li></ul>"));
        assert!(s.contains("codeblock class=\"powershell\""));
        assert!(s.contains("&lt;script&gt;"));
        assert!(!s.contains("<script>"));
    }
    #[test]
    fn no_blank_code_send() {
        assert!(body("```php\n \n```", true, false).is_err());
        assert!(body("", true, true).is_ok());
    }
    #[test]
    fn links_and_literal_html() {
        let s = render("[Go](https://example.com) [No](javascript:alert) <img onerror=x>").0;
        assert!(s.contains("<a href=\"https://example.com\">Go</a>"));
        assert!(!s.contains("href=\"javascript:"));
        assert!(!s.contains("<img"));
        assert_eq!(
            body("<b>plain</b>", false, false).unwrap()["contentType"],
            "text"
        );
    }
}
