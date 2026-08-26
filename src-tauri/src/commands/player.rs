use std::process::Command;

#[tauri::command]
pub fn play_video(url: String) -> Result<(), String> {
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

    Err("Impossible de lancer un lecteur vidéo. Veuillez installer IINA, VLC ou mpv.".to_string())
}
