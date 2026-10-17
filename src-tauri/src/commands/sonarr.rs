use super::http::{api_request, HttpState};
use super::settings::RuntimeState;

/// Generic Sonarr request. Base URL and API key come from the Rust-side settings.
#[tauri::command]
pub async fn sonarr_request(
    http: tauri::State<'_, HttpState>,
    runtime: tauri::State<'_, RuntimeState>,
    method: String,
    path: String,
    body: Option<String>,
) -> Result<String, String> {
    let cfg = runtime.api_config();
    api_request(&http.0, "Sonarr", &cfg.sonarr_url, &cfg.sonarr_key, &method, &path, body).await
}
