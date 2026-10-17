use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use serde::Deserialize;
use url::Url;

/// Server settings pushed by the webview. They live in Rust: the webview never builds Radarr/Sonarr
/// request URLs, and the media server credentials never travel in a URL.
#[derive(Default, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ApiConfig {
    pub radarr_url: String,
    pub radarr_key: String,
    pub sonarr_url: String,
    pub sonarr_key: String,
    pub media_host: String,
    pub media_user: String,
    pub media_password: String,
}

impl ApiConfig {
    /// `https://<MEDIA_SERVER_HOST>`, the only origin the player proxy and the downloader may reach.
    pub fn media_origin(&self) -> Result<Url, String> {
        let host = self
            .media_host
            .trim()
            .trim_start_matches("https://")
            .trim_start_matches("http://")
            .trim_end_matches('/');
        if host.is_empty() {
            return Err("Serveur média non configuré".to_string());
        }
        Url::parse(&format!("https://{}", host)).map_err(|_| "Hôte du serveur média invalide".to_string())
    }

    pub fn has_media_credentials(&self) -> bool {
        !self.media_user.is_empty() && !self.media_password.is_empty()
    }
}

#[derive(Default, Clone)]
pub struct RuntimeState {
    api: Arc<RwLock<ApiConfig>>,
    download_dir: Arc<RwLock<Option<String>>>,
    /// Folders used before the current one: files already downloaded there stay playable and deletable.
    previous_dirs: Arc<RwLock<Vec<String>>>,
}

impl RuntimeState {
    pub fn api_config(&self) -> ApiConfig {
        self.api.read().map(|c| c.clone()).unwrap_or_default()
    }

    /// Configured download folder, or `~/Downloads/Melia` by default.
    pub fn download_root(&self) -> PathBuf {
        let configured = self
            .download_dir
            .read()
            .ok()
            .and_then(|d| d.clone())
            .filter(|d| !d.trim().is_empty());
        match configured {
            Some(dir) => PathBuf::from(dir),
            None => default_download_root(),
        }
    }
}

impl RuntimeState {
    /// Current download folder first, then the previous ones. File commands accept any of them;
    /// new downloads and the episode scan only use the first.
    pub fn allowed_roots(&self) -> Vec<PathBuf> {
        let mut roots = vec![self.download_root()];
        let mut previous: Vec<PathBuf> = self
            .previous_dirs
            .read()
            .map(|dirs| dirs.iter().filter(|d| !d.trim().is_empty()).map(PathBuf::from).collect())
            .unwrap_or_default();
        previous.push(default_download_root());
        for path in previous {
            if !roots.contains(&path) {
                roots.push(path);
            }
        }
        roots
    }
}

pub fn default_download_root() -> PathBuf {
    dirs::download_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("Melia")
}

#[tauri::command]
pub fn set_api_config(state: tauri::State<RuntimeState>, config: ApiConfig) -> Result<(), String> {
    let mut guard = state
        .api
        .write()
        .map_err(|_| "Configuration indisponible".to_string())?;
    *guard = config;
    Ok(())
}

#[tauri::command]
pub fn set_download_dir(
    state: tauri::State<RuntimeState>,
    dir: Option<String>,
    previous_dirs: Option<Vec<String>>,
) -> Result<(), String> {
    let mut guard = state
        .download_dir
        .write()
        .map_err(|_| "Configuration indisponible".to_string())?;
    *guard = dir;

    let mut previous = state
        .previous_dirs
        .write()
        .map_err(|_| "Configuration indisponible".to_string())?;
    *previous = previous_dirs.unwrap_or_default();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config_with_host(host: &str) -> ApiConfig {
        ApiConfig {
            media_host: host.to_string(),
            ..Default::default()
        }
    }

    #[test]
    fn media_origin_strips_scheme_and_slash() {
        let origin = config_with_host("https://media.example.com/").media_origin().unwrap();
        assert_eq!(origin.as_str(), "https://media.example.com/");
        let with_port = config_with_host("media.example.com:8443").media_origin().unwrap();
        assert_eq!(with_port.port(), Some(8443));
    }

    #[test]
    fn media_origin_requires_a_host() {
        assert!(config_with_host("  ").media_origin().is_err());
    }
}
