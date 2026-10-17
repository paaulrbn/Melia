use std::collections::HashMap;
use tauri::Manager;

/// The media server port, when not standard, goes in `MEDIA_SERVER_HOST` (`host:8443`).
const CONFIG_KEYS: [&str; 10] = [
    "MEDIA_SERVER_HOST",
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

/// Parses `KEY=VALUE` lines into a local map. The process environment is never modified.
fn parse_env(content: &str, into: &mut HashMap<String, String>) {
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((k, v)) = line.split_once('=') {
            let value = v.trim().trim_matches(|c| c == '"' || c == '\'');
            into.insert(k.trim().to_string(), value.to_string());
        }
    }
}

#[tauri::command]
pub fn get_config(app: tauri::AppHandle) -> HashMap<String, String> {
    let mut values: HashMap<String, String> = HashMap::new();

    // Bundled app: .env shipped in the resources folder
    if let Ok(resource_dir) = app.path().resource_dir() {
        if let Ok(content) = std::fs::read_to_string(resource_dir.join(".env")) {
            parse_env(&content, &mut values);
        }
    }

    // Local development only: ../.env or .env relative to the working directory
    if cfg!(debug_assertions) {
        if let Ok(content) =
            std::fs::read_to_string("../.env").or_else(|_| std::fs::read_to_string(".env"))
        {
            parse_env(&content, &mut values);
        }
    }

    CONFIG_KEYS
        .iter()
        .map(|key| {
            let value = values
                .get(*key)
                .cloned()
                .or_else(|| std::env::var(key).ok())
                .unwrap_or_default();
            (key.to_string(), value)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_env_lines() {
        let mut map = HashMap::new();
        parse_env("# comment\n\nA=1\n B = \"two\" \nC=x=y\n", &mut map);
        assert_eq!(map.get("A").map(String::as_str), Some("1"));
        assert_eq!(map.get("B").map(String::as_str), Some("two"));
        assert_eq!(map.get("C").map(String::as_str), Some("x=y"));
    }
}
