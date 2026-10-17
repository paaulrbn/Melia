use std::time::Duration;

use reqwest::{Client, Method};
use url::Url;

/// Shared HTTP client (connection pool and TLS sessions are reused across requests).
/// No global request timeout: downloads can run for hours. API calls set their own per-request timeout.
pub struct HttpState(pub Client);

pub const API_TIMEOUT: Duration = Duration::from_secs(30);

pub fn build_client() -> Client {
    Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .pool_idle_timeout(Duration::from_secs(60))
        .build()
        .expect("failed to build HTTP client")
}

/// Only relative `/api/v3/...` paths are accepted: no host, no scheme, no traversal.
fn validate_api_path(path: &str) -> Result<(), String> {
    let valid = path.starts_with("/api/v3/")
        && !path.contains("..")
        && !path.contains("//")
        && !path.contains('\\')
        && !path.contains('#')
        && !path.chars().any(|c| c.is_control() || c.is_whitespace());
    if valid {
        Ok(())
    } else {
        Err("Chemin d'API invalide".to_string())
    }
}

fn parse_method(method: &str) -> Result<Method, String> {
    match method.to_ascii_uppercase().as_str() {
        "GET" => Ok(Method::GET),
        "POST" => Ok(Method::POST),
        "PUT" => Ok(Method::PUT),
        "DELETE" => Ok(Method::DELETE),
        _ => Err("Méthode HTTP non autorisée".to_string()),
    }
}

/// Performs a request on a Radarr / Sonarr instance. The API key goes in the `X-Api-Key` header
/// and transport errors are stripped of the URL, so the key cannot leak into logs or the UI.
pub async fn api_request(
    client: &Client,
    service: &str,
    base_url: &str,
    api_key: &str,
    method: &str,
    path: &str,
    body: Option<String>,
) -> Result<String, String> {
    if base_url.trim().is_empty() || api_key.trim().is_empty() {
        return Err(format!("{} n'est pas configuré", service));
    }
    validate_api_path(path)?;
    let method = parse_method(method)?;

    let base = base_url.trim().trim_end_matches('/');
    let parsed = Url::parse(base).map_err(|_| format!("URL {} invalide", service))?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(format!("URL {} invalide", service));
    }

    let mut request = client
        .request(method, format!("{}{}", base, path))
        .header("X-Api-Key", api_key)
        .timeout(API_TIMEOUT);
    if let Some(body) = body {
        request = request
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(body);
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("{} injoignable : {}", service, e.without_url()))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("Réponse {} illisible : {}", service, e.without_url()))?;
    if !status.is_success() {
        return Err(format!("{} error ({}): {}", service, status, text));
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_api_paths() {
        assert!(validate_api_path("/api/v3/movie").is_ok());
        assert!(validate_api_path("/api/v3/movie/lookup?term=star%20wars").is_ok());
    }

    #[test]
    fn rejects_unsafe_paths() {
        for path in [
            "api/v3/movie",
            "/api/v2/movie",
            "/api/v3/../../etc",
            "//evil.example/api/v3/",
            "/api/v3/movie#x",
            "/api/v3/mo vie",
            "http://evil.example/api/v3/x",
        ] {
            assert!(validate_api_path(path).is_err(), "{path} should be rejected");
        }
    }

    #[test]
    fn rejects_unknown_methods() {
        assert!(parse_method("PATCH").is_err());
        assert!(parse_method("get").is_ok());
    }
}
