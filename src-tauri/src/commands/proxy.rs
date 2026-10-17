use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::net::{Ipv4Addr, SocketAddr, TcpListener};

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{header, HeaderMap, HeaderName, Response, StatusCode};
use axum::Router;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::Client;

use super::settings::RuntimeState;

/// Headers forwarded from the player to the media server (Range is required for seeking).
const FORWARDED_REQUEST_HEADERS: [HeaderName; 3] = [header::RANGE, header::IF_RANGE, header::USER_AGENT];

/// Headers relayed from the media server back to the player.
const FORWARDED_RESPONSE_HEADERS: [HeaderName; 7] = [
    header::CONTENT_TYPE,
    header::CONTENT_LENGTH,
    header::CONTENT_RANGE,
    header::ACCEPT_RANGES,
    header::LAST_MODIFIED,
    header::ETAG,
    header::CONTENT_DISPOSITION,
];

/// Local playback proxy: listens on 127.0.0.1 only, on a random port, behind a random token in the path.
/// It adds the `Authorization` header so credentials never appear in the player's arguments,
/// in the process list or in the player's history.
#[derive(Clone)]
pub struct PlayerProxy {
    pub port: u16,
    pub token: String,
}

#[derive(Clone)]
struct ProxyState {
    client: Client,
    runtime: RuntimeState,
    token: String,
}

fn random_token() -> String {
    // RandomState is seeded by the OS for each process; several instances plus the clock
    // give 128 bits that other local processes cannot guess.
    let mut token = String::with_capacity(32);
    for salt in 0..2u64 {
        let mut hasher = RandomState::new().build_hasher();
        hasher.write_u64(salt);
        hasher.write_u32(std::process::id());
        if let Ok(now) = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
            hasher.write_u128(now.as_nanos());
        }
        token.push_str(&format!("{:016x}", hasher.finish()));
    }
    token
}

/// Binds the listener synchronously (so the port is known immediately) and serves on the async runtime.
pub fn start(client: Client, runtime: RuntimeState) -> Result<PlayerProxy, String> {
    let listener = TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, 0))).map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let token = random_token();

    let state = ProxyState {
        client,
        runtime,
        token: token.clone(),
    };
    let app = Router::new().fallback(handle).with_state(state);

    tauri::async_runtime::spawn(async move {
        if let Ok(listener) = tokio::net::TcpListener::from_std(listener) {
            let _ = axum::serve(listener, app).await;
        }
    });

    Ok(PlayerProxy { port, token })
}

impl PlayerProxy {
    /// Local URL for a media server URL (`https://host/path?query`).
    pub fn local_url(&self, path_and_query: &str) -> String {
        format!("http://127.0.0.1:{}/{}{}", self.port, self.token, path_and_query)
    }
}

fn error_response(status: StatusCode) -> Response<Body> {
    let mut response = Response::new(Body::empty());
    *response.status_mut() = status;
    response
}

/// Splits `/TOKEN/rest/of/path` into the rest, verifying the token.
fn strip_token<'a>(path: &'a str, token: &str) -> Option<&'a str> {
    let rest = path.strip_prefix('/')?.strip_prefix(token)?;
    if rest.starts_with('/') {
        Some(rest)
    } else {
        None
    }
}

async fn handle(State(state): State<ProxyState>, request: Request) -> Response<Body> {
    if request.method() != axum::http::Method::GET && request.method() != axum::http::Method::HEAD {
        return error_response(StatusCode::METHOD_NOT_ALLOWED);
    }

    let Some(upstream_path) = strip_token(request.uri().path(), &state.token) else {
        return error_response(StatusCode::NOT_FOUND);
    };
    if upstream_path.contains("..") || upstream_path.contains("//") {
        return error_response(StatusCode::BAD_REQUEST);
    }

    let config = state.runtime.api_config();
    let Ok(origin) = config.media_origin() else {
        return error_response(StatusCode::SERVICE_UNAVAILABLE);
    };
    let mut upstream_url = origin;
    upstream_url.set_path(upstream_path);
    upstream_url.set_query(request.uri().query());

    let mut upstream = state.client.request(request.method().clone(), upstream_url);
    for name in FORWARDED_REQUEST_HEADERS.iter() {
        if let Some(value) = request.headers().get(name) {
            upstream = upstream.header(name, value);
        }
    }
    if config.has_media_credentials() {
        let credentials = STANDARD.encode(format!("{}:{}", config.media_user, config.media_password));
        upstream = upstream.header(header::AUTHORIZATION, format!("Basic {}", credentials));
    }

    let response = match upstream.send().await {
        Ok(response) => response,
        Err(_) => return error_response(StatusCode::BAD_GATEWAY),
    };

    let mut headers = HeaderMap::new();
    for name in FORWARDED_RESPONSE_HEADERS.iter() {
        if let Some(value) = response.headers().get(name) {
            headers.insert(name.clone(), value.clone());
        }
    }

    let status = response.status();
    let mut out = Response::new(Body::from_stream(response.bytes_stream()));
    *out.status_mut() = status;
    *out.headers_mut() = headers;
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_is_32_hex_chars_and_unique() {
        let a = random_token();
        let b = random_token();
        assert_eq!(a.len(), 32);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b);
    }

    #[test]
    fn strips_valid_token_only() {
        assert_eq!(strip_token("/abc/paul/film.mkv", "abc"), Some("/paul/film.mkv"));
        assert_eq!(strip_token("/abcd/paul/film.mkv", "abc"), None);
        assert_eq!(strip_token("/other/paul/film.mkv", "abc"), None);
        assert_eq!(strip_token("/abc", "abc"), None);
    }
}
