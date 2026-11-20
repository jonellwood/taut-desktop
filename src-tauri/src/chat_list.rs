//! Continuations can supply a query, never a new authenticated destination.
pub const FIRST_PATH: &str = "/me/chats?$top=50&$expand=members,lastMessagePreview&$orderby=lastMessagePreview/createdDateTime%20desc";

pub fn path(next: Option<&str>) -> Result<String, String> {
    let Some(link) = next else { return Ok(FIRST_PATH.into()); };
    let invalid = "Invalid conversation continuation";
    if link.len() > 16000 { return Err(invalid.into()); }
    let u = url::Url::parse(link).map_err(|_| invalid)?;
    if u.scheme() != "https" || u.host_str() != Some("graph.microsoft.com")
        || !u.username().is_empty() || u.password().is_some() || u.port().is_some()
        || u.fragment().is_some() || !matches!(u.path(), "/v1.0/chats" | "/v1.0/me/chats")
    { return Err(invalid.into()); }
    let mut seen = std::collections::HashSet::new();
    for (key, value) in u.query_pairs() {
        if !seen.insert(key.to_string()) { return Err(invalid.into()); }
        let valid = match key.as_ref() {
            "$top" => value == "50",
            "$expand" => value == "members,lastMessagePreview",
            "$orderby" => value == "lastMessagePreview/createdDateTime desc",
            "$skiptoken" => !value.is_empty(),
            _ => false,
        };
        if !valid { return Err(invalid.into()); }
    }
    if !seen.contains("$skiptoken") { return Err(invalid.into()); }
    // Preserve Graph's opaque cursor and always keep the list's original shape.
    let token = u.query_pairs().find(|(key,_)| key == "$skiptoken").unwrap().1.into_owned();
    let token: String = url::form_urlencoded::byte_serialize(token.as_bytes()).collect();
    Ok(format!("{FIRST_PATH}&$skiptoken={token}"))
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn canonical_and_me_routes_keep_the_original_collection_and_query() {
        assert_eq!(path(None).unwrap(), FIRST_PATH);
        for route in ["chats", "me/chats"] {
            let link = format!("https://graph.microsoft.com/v1.0/{route}?$skiptoken=opaque%2B%2F%3D");
            assert_eq!(path(Some(&link)).unwrap(), format!("{FIRST_PATH}&$skiptoken=opaque%2B%2F%3D"));
        }
    }
    #[test] fn rejects_unrelated_destinations_and_changed_query_shape() {
        for link in [
            "https://evil.test/v1.0/chats?$skiptoken=x",
            "http://graph.microsoft.com/v1.0/chats?$skiptoken=x",
            "https://user@graph.microsoft.com/v1.0/chats?$skiptoken=x",
            "https://graph.microsoft.com/v1.0/users/other/chats?$skiptoken=x",
            "https://graph.microsoft.com/v1.0/chats/a/messages?$skiptoken=x",
            "https://graph.microsoft.com/beta/chats?$skiptoken=x",
            "https://graph.microsoft.com/v1.0/chats?$skiptoken=x#fragment",
            "https://graph.microsoft.com/v1.0/chats?$skiptoken=x&$expand=messages",
            "https://graph.microsoft.com/v1.0/chats?$skiptoken=x&$filter=chatType",
            "https://graph.microsoft.com/v1.0/chats?$skiptoken=x&$skiptoken=y",
            "https://graph.microsoft.com/v1.0/chats",
        ] { assert!(path(Some(link)).is_err(), "{link}"); }
    }
}
