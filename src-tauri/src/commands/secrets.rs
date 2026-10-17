use std::collections::HashMap;

use keyring::Entry;

const SERVICE: &str = "com.melia.app";

/// Single keychain entry holding every secret as JSON: macOS asks for access entry by entry,
/// so one entry means one prompt instead of one per secret.
const ENTRY_NAME: &str = "secrets";

/// Only these keys can be stored.
const SECRET_KEYS: [&str; 3] = ["RADARR_API_KEY", "SONARR_API_KEY", "MEDIA_SERVER_PASSWORD"];

fn secrets_entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ENTRY_NAME).map_err(|e| e.to_string())
}

/// Parses the stored JSON, keeping only whitelisted keys with non-empty values.
fn parse_secrets(json: &str) -> HashMap<String, String> {
    let parsed: HashMap<String, String> = serde_json::from_str(json).unwrap_or_default();
    filter_secrets(parsed)
}

fn filter_secrets(values: HashMap<String, String>) -> HashMap<String, String> {
    values
        .into_iter()
        .filter(|(key, value)| SECRET_KEYS.contains(&key.as_str()) && !value.is_empty())
        .collect()
}

async fn run_blocking<T, F>(task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tokio::task::spawn_blocking(task).await.map_err(|e| e.to_string())?
}

/// One keychain read for all the secrets.
#[tauri::command]
pub async fn get_secrets() -> Result<HashMap<String, String>, String> {
    run_blocking(|| match secrets_entry()?.get_password() {
        Ok(json) => Ok(parse_secrets(&json)),
        Err(keyring::Error::NoEntry) => Ok(HashMap::new()),
        Err(e) => Err(e.to_string()),
    })
    .await
}

/// One keychain write for all the secrets. An empty set removes the entry.
#[tauri::command]
pub async fn set_secrets(values: HashMap<String, String>) -> Result<(), String> {
    run_blocking(move || {
        let entry = secrets_entry()?;
        let secrets = filter_secrets(values);
        if secrets.is_empty() {
            return match entry.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                Err(e) => Err(e.to_string()),
            };
        }
        let json = serde_json::to_string(&secrets).map_err(|e| e.to_string())?;
        entry.set_password(&json).map_err(|e| e.to_string())
    })
    .await
}

/// Migration: secrets stored by older versions, one keychain entry per secret.
#[tauri::command]
pub async fn read_legacy_secrets() -> Result<HashMap<String, String>, String> {
    run_blocking(|| {
        let mut found = HashMap::new();
        for key in SECRET_KEYS {
            let entry = Entry::new(SERVICE, key).map_err(|e| e.to_string())?;
            match entry.get_password() {
                Ok(value) if !value.is_empty() => {
                    found.insert(key.to_string(), value);
                }
                Ok(_) | Err(keyring::Error::NoEntry) => {}
                Err(e) => return Err(e.to_string()),
            }
        }
        Ok(found)
    })
    .await
}

/// Migration: removes the old per-secret entries once their values are in the single entry.
#[tauri::command]
pub async fn delete_legacy_secrets() -> Result<(), String> {
    run_blocking(|| {
        for key in SECRET_KEYS {
            let entry = Entry::new(SERVICE, key).map_err(|e| e.to_string())?;
            match entry.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => {}
                Err(e) => return Err(e.to_string()),
            }
        }
        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_only_whitelisted_keys_with_values() {
        let parsed = parse_secrets(
            r#"{"RADARR_API_KEY":"a","SONARR_API_KEY":"","EVIL":"x","MEDIA_SERVER_PASSWORD":"p"}"#,
        );
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed.get("RADARR_API_KEY").map(String::as_str), Some("a"));
        assert_eq!(parsed.get("MEDIA_SERVER_PASSWORD").map(String::as_str), Some("p"));
    }

    #[test]
    fn corrupted_json_gives_no_secrets() {
        assert!(parse_secrets("not json").is_empty());
        assert!(parse_secrets(r#"{"RADARR_API_KEY": 42}"#).is_empty());
    }

    #[test]
    fn round_trips_through_json() {
        let values = HashMap::from([
            ("RADARR_API_KEY".to_string(), "clé \"spéciale\" é".to_string()),
            ("SONARR_API_KEY".to_string(), "b".to_string()),
        ]);
        let json = serde_json::to_string(&filter_secrets(values.clone())).unwrap();
        assert_eq!(parse_secrets(&json), values);
    }

    #[test]
    fn three_secrets_stay_far_below_the_windows_entry_limit() {
        let long = "x".repeat(200);
        let values = SECRET_KEYS.iter().map(|k| (k.to_string(), long.clone())).collect();
        let json = serde_json::to_string(&filter_secrets(values)).unwrap();
        assert!(json.len() < 2500);
    }
}
