use std::collections::HashMap;
use tauri::Manager;

#[tauri::command]
pub fn get_config(app: tauri::AppHandle) -> HashMap<String, String> {
    // App bundlée : lire le .env depuis le dossier resources
    if let Ok(resource_dir) = app.path().resource_dir() {
        let env_path = resource_dir.join(".env");
        if let Ok(content) = std::fs::read_to_string(&env_path) {
            for line in content.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') {
                    continue;
                }
                if let Some((k, v)) = line.split_once('=') {
                    std::env::set_var(k.trim(), v.trim());
                }
            }
        }
    }

    // Fallback développement local : lire ../.env ou .env
    dotenv::dotenv().ok();
    if let Ok(content) = std::fs::read_to_string("../.env").or_else(|_| std::fs::read_to_string(".env")) {
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some((k, v)) = line.split_once('=') {
                std::env::set_var(k.trim(), v.trim());
            }
        }
    }

    let mut config = HashMap::new();
    let keys = vec![
        "MEDIA_SERVER_HOST",
        "MEDIA_SERVER_PORT",
        "MEDIA_SERVER_USERNAME",
        "MEDIA_SERVER_PASSWORD",
        "MEDIA_SERVER_ROOT_PATH",
        "RADARR_BASE_URL",
        "RADARR_API_KEY",
        "RADARR_ROOT_FOLDER",
        "SONARR_BASE_URL",
        "SONARR_API_KEY",
        "SONARR_ROOT_FOLDER",
    ];

    for key in keys {
        if let Ok(val) = std::env::var(key) {
            config.insert(key.to_string(), val);
        } else {
            config.insert(key.to_string(), "".to_string());
        }
    }

    config
}
