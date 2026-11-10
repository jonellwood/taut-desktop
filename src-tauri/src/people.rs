//! Read-only, bounded People directory and profile requests.
use crate::{
    deletion::{read, Request},
    groups::Reply,
};
use serde_json::{json, Value};
const FIELDS:&str="id,displayName,mail,userPrincipalName,givenName,surname,jobTitle,department,companyName,officeLocation,businessPhones,mobilePhone";
fn destination(next: &str) -> Result<String, String> {
    let url = url::Url::parse(next).map_err(|_| "Invalid directory continuation")?;
    if url.scheme() != "https"
        || url.host_str() != Some("graph.microsoft.com")
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || url.path() != "/v1.0/users"
    {
        return Err("Invalid directory continuation".into());
    }
    Ok(format!(
        "/users{}",
        url.query().map(|q| format!("?{q}")).unwrap_or_default()
    ))
}
fn identity(id: &str) -> Result<&str, String> {
    if !crate::presence::guid(id) {
        return Err("Invalid coworker identifier".into());
    }
    Ok(id)
}

fn profile(value: &Value) -> Value {
    let mut row = serde_json::Map::new();
    for field in FIELDS.split(',') {
        if let Some(v) = value.get(field) {
            row.insert(field.into(), v.clone());
        }
    }
    Value::Object(row)
}
pub fn page(
    next: Option<&str>,
    permitted: bool,
    request: &mut Request<'_>,
) -> Result<Value, String> {
    if !permitted {
        return Err("People directory needs User.Read.All consent and a fresh sign-in.".into());
    }
    let path = match next {
        Some(n) => destination(n)?,
        None => format!("/users?$select={FIELDS}&$top=200"),
    };
    let data = read(&path, request)?;
    let rows = data["value"]
        .as_array()
        .ok_or("Invalid directory response")?;
    let next = data["@odata.nextLink"].as_str();
    if let Some(n) = next {
        destination(n)?;
    }
    Ok(json!({"value":rows.iter().map(profile).collect::<Vec<_>>(),"next":next}))
}
pub fn detail(id: &str, permitted: bool, request: &mut Request<'_>) -> Result<Value, String> {
    if !permitted {
        return Err("People profiles need User.Read.All consent and a fresh sign-in.".into());
    }
    let id = identity(id)?;
    let user = profile(&read(&format!("/users/{id}?$select={FIELDS}"), request)?);
    let manager = request(
        reqwest::Method::GET,
        &format!("/users/{id}/manager?$select=id,displayName,mail,jobTitle"),
        None,
    );
    let (manager, notice) = match manager {
        Ok(Reply { status: 200, body }) => (Some(profile(&body)), ""),
        Ok(Reply { status: 404, .. }) => (None, ""),
        _ => (None, "Manager information is unavailable."),
    };
    Ok(json!({"user":user,"manager":manager,"notice":notice}))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn destinations_are_restricted() {
        for n in [
            "https://evil.test/v1.0/users",
            "https://graph.microsoft.com/v1.0/users/abc",
            "https://graph.microsoft.com/v1.0/me",
        ] {
            assert!(destination(n).is_err())
        }
        assert!(destination("https://graph.microsoft.com/v1.0/users?$skiptoken=abc").is_ok());
    }
    #[test]
    fn reads_only_and_preserves_pagination() {
        let mut calls = vec![];
        let result=page(None,true,&mut|m,p,b|{calls.push((m,p.to_string(),b));Ok(Reply{status:200,body:json!({"value":[{"id":"x","displayName":"Alex","secret":"omit"}],"@odata.nextLink":"https://graph.microsoft.com/v1.0/users?$skiptoken=abc"})})}).unwrap();
        assert_eq!(calls[0].0, reqwest::Method::GET);
        assert!(calls[0].2.is_none());
        assert!(result["value"][0].get("secret").is_none());
        assert!(result["next"].is_string());
    }
    #[test]
    fn consent_and_invalid_ids_make_no_calls() {
        let mut request = |_, _: &str, _| -> Result<Reply, String> { panic!("unexpected request") };
        assert!(page(None, false, &mut request).is_err());
        assert!(detail("../me", true, &mut request).is_err());
    }
    #[test]
    fn missing_manager_does_not_hide_profile() {
        let id = "22222222-2222-2222-2222-222222222222";
        let r = detail(id, true, &mut |m, p, b| {
            assert_eq!(m, reqwest::Method::GET);
            assert!(b.is_none());
            Ok(if p.contains("/manager") {
                Reply {
                    status: 404,
                    body: Value::Null,
                }
            } else {
                Reply {
                    status: 200,
                    body: json!({"id":id,"jobTitle":"Engineer"}),
                }
            })
        })
        .unwrap();
        assert_eq!(r["user"]["jobTitle"], "Engineer");
        assert!(r["manager"].is_null());
    }
}
