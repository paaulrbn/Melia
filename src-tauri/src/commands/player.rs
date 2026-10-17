use std::process::Command;
use url::Url;

use super::proxy::PlayerProxy;
use super::settings::RuntimeState;
use super::system::{ensure_under_roots, external_path};

#[cfg(target_os = "macos")]
const NO_PLAYER_ERROR: &str = "Impossible de lancer un lecteur vidéo. Veuillez installer IINA, VLC ou mpv.";
#[cfg(not(target_os = "macos"))]
const NO_PLAYER_ERROR: &str = "Impossible de lancer un lecteur vidéo. Veuillez installer mpv ou VLC.";

/// Media server URLs go through the local proxy (credentials stay in Rust);
/// anything else must be a local file inside the download folder.
fn player_target(input: &str, runtime: &RuntimeState, proxy: &PlayerProxy) -> Result<String, String> {
    if input.starts_with("http://") || input.starts_with("https://") {
        let parsed = Url::parse(input).map_err(|_| "URL de lecture invalide".to_string())?;
        let origin = runtime.api_config().media_origin()?;
        if parsed.scheme() != "https"
            || parsed.host_str() != origin.host_str()
            || parsed.port_or_known_default() != origin.port_or_known_default()
        {
            return Err("Source de lecture non autorisée".to_string());
        }
        let mut path_and_query = parsed.path().to_string();
        if let Some(query) = parsed.query() {
            path_and_query.push('?');
            path_and_query.push_str(query);
        }
        return Ok(proxy.local_url(&path_and_query));
    }

    let local = ensure_under_roots(input, &runtime.allowed_roots())?;
    Ok(external_path(&local))
}

#[tauri::command]
pub fn play_video(
    runtime: tauri::State<RuntimeState>,
    proxy: tauri::State<PlayerProxy>,
    url: String,
) -> Result<(), String> {
    let url = player_target(&url, &runtime, &proxy)?;

    #[cfg(target_os = "macos")]
    {
        // 1. Essayer IINA en priorité
        let mut iina_cmd = Command::new("open");
        iina_cmd.arg("-a").arg("IINA").arg(&url);
        if iina_cmd.spawn().is_ok() {
            return Ok(());
        }

        // 2. Sinon VLC
        let mut vlc_cmd = Command::new("open");
        vlc_cmd.arg("-a").arg("VLC").arg(&url);
        if vlc_cmd.spawn().is_ok() {
            return Ok(());
        }

        // 3. Sinon mpv
        let mut cmd = Command::new("mpv");
        cmd.arg("--fullscreen").arg("--force-window=immediate").arg(&url);
        if cmd.spawn().is_ok() {
            return Ok(());
        }
    }

    #[cfg(target_os = "windows")]
    {
        // 1. mpv
        let mut cmd = Command::new("mpv");
        cmd.arg("--fullscreen").arg("--force-window=immediate").arg(&url);
        if cmd.spawn().is_ok() {
            return Ok(());
        }

        // 2. VLC
        let vlc_paths = [
            "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe",
            "C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe",
        ];
        for path in vlc_paths {
            let mut vlc_cmd = Command::new(path);
            vlc_cmd.arg("--fullscreen").arg(&url);
            if vlc_cmd.spawn().is_ok() {
                return Ok(());
            }
        }
    }

    // Fallback global (Linux etc.)
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let mut cmd = Command::new("mpv");
        cmd.arg("--fullscreen").arg("--force-window=immediate").arg(&url);
        if cmd.spawn().is_ok() {
            return Ok(());
        }
    }

    Err(NO_PLAYER_ERROR.to_string())
}
