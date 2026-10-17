use super::http::{api_request, HttpState};
use super::settings::RuntimeState;

/// Generic Radarr request. Base URL and API key come from the Rust-side settings.
#[tauri::command]
pub async fn radarr_request(
    http: tauri::State<'_, HttpState>,
    runtime: tauri::State<'_, RuntimeState>,
    method: String,
    path: String,
    body: Option<String>,
) -> Result<String, String> {
    let cfg = runtime.api_config();
    api_request(&http.0, "Radarr", &cfg.radarr_url, &cfg.radarr_key, &method, &path, body).await
}
