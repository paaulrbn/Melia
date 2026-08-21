use std::process::Command;
use url::Url;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use tauri::{AppHandle, Emitter};
use reqwest::Client;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

struct DownloadState(Mutex<HashMap<u32, Arc<AtomicBool>>>);

#[derive(Clone, serde::Serialize)]
struct ProgressPayload {
    id: u32,
    downloaded: u64,
    total: Option<u64>,
}

#[tauri::command]
fn cancel_download(state: tauri::State<DownloadState>, id: u32) {
    if let Some(flag) = state.0.lock().unwrap().get(&id) {
        flag.store(true, Ordering::SeqCst);
    }
}

#[tauri::command]
fn get_config(app: tauri::AppHandle) -> HashMap<String, String> {
    use tauri::Manager;

    // App bundlée : lire le .env depuis le dossier resources
    if let Ok(resource_dir) = app.path().resource_dir() {
        let env_path = resource_dir.join(".env");
        if let Ok(content) = std::fs::read_to_string(&env_path) {
            for line in content.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') { continue; }
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
            if line.is_empty() || line.starts_with('#') { continue; }
            if let Some((k, v)) = line.split_once('=') {
                std::env::set_var(k.trim(), v.trim());
            }
        }
    }

    let mut config = HashMap::new();
    let keys = vec![
        "MEDIA_SERVER_DISPLAY_NAME", "MEDIA_SERVER_HOST", "MEDIA_SERVER_PORT",
        "MEDIA_SERVER_USERNAME", "MEDIA_SERVER_PASSWORD", "MEDIA_SERVER_ROOT_PATH",
        "RADARR_BASE_URL", "RADARR_API_KEY",
        "SONARR_BASE_URL", "SONARR_API_KEY"
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

#[tauri::command]
async fn fetch_radarr_movies(url: String) -> Result<String, String> {
    let client = Client::new();
    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let text = response.text().await.map_err(|e| e.to_string())?;
    Ok(text)
}

#[tauri::command]
async fn download_video(app: AppHandle, state: tauri::State<'_, DownloadState>, url: String, filename: String, id: u32) -> Result<String, String> {
    println!("Début du téléchargement : {}", filename);
    let cancel_flag = Arc::new(AtomicBool::new(false));
    state.0.lock().unwrap().insert(id, cancel_flag.clone());
    
    let mut target_url = url.clone();
    let mut auth_header = None;

    if let Ok(mut parsed_url) = Url::parse(&url) {
        let username = parsed_url.username().to_string();
        let password = parsed_url.password().unwrap_or("").to_string();
        
        if !username.is_empty() {
            let decoded_user = percent_encoding::percent_decode_str(&username).decode_utf8_lossy().to_string();
            let decoded_pass = percent_encoding::percent_decode_str(&password).decode_utf8_lossy().to_string();
            let auth = format!("{}:{}", decoded_user, decoded_pass);
            let b64 = STANDARD.encode(auth.as_bytes());
            auth_header = Some(format!("Basic {}", b64));
            
            let _ = parsed_url.set_username("");
            let _ = parsed_url.set_password(None);
            target_url = parsed_url.to_string();
        }
    }

    let download_dir = dirs::download_dir().unwrap_or_else(|| std::env::temp_dir());
    let melia_dir = download_dir.join("Melia");
    std::fs::create_dir_all(&melia_dir).map_err(|e| e.to_string())?;
    
    let safe_filename = filename.replace("/", "_").replace("\\", "_");
    let file_path = melia_dir.join(safe_filename);

    let mut downloaded: u64 = 0;
    if file_path.exists() {
        if let Ok(metadata) = std::fs::metadata(&file_path) {
            downloaded = metadata.len();
        }
    }

    let client = Client::new();
    let mut request = client.get(&target_url).header(reqwest::header::USER_AGENT, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    if let Some(header) = auth_header {
        request = request.header(reqwest::header::AUTHORIZATION, header);
    }
    if downloaded > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={}-", downloaded));
    }

    let mut response = request.send().await.map_err(|e| e.to_string())?;

    if response.status() == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
        state.0.lock().unwrap().remove(&id);
        println!("Fichier déjà téléchargé : {:?}", file_path);
        let _ = app.emit("download_progress", ProgressPayload {
            id,
            downloaded,
            total: Some(downloaded),
        });
        return Ok(file_path.to_str().unwrap().to_string());
    }

    let is_partial = response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    if response.status() != reqwest::StatusCode::OK && !is_partial {
        state.0.lock().unwrap().remove(&id);
        return Err(format!("Erreur HTTP: {}", response.status()));
    }

    if !is_partial {
        downloaded = 0;
    }

    let total_size = response.content_length().map(|len| len + downloaded);

    let file = if is_partial {
        tokio::fs::OpenOptions::new().append(true).open(&file_path).await.map_err(|e| e.to_string())?
    } else {
        tokio::fs::File::create(&file_path).await.map_err(|e| e.to_string())?
    };
    
    // Utiliser le BufWriter asynchrone de Tokio (8MB buffer)
    use tokio::io::AsyncWriteExt;
    let mut writer = tokio::io::BufWriter::with_capacity(8 * 1024 * 1024, file);
    
    let mut last_emit_time = std::time::Instant::now();

    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        if cancel_flag.load(Ordering::SeqCst) {
            let _ = writer.flush().await;
            state.0.lock().unwrap().remove(&id);
            return Err("Téléchargement mis en pause".to_string());
        }

        writer.write_all(&chunk).await.map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        
        if last_emit_time.elapsed().as_millis() > 250 {
            let _ = app.emit("download_progress", ProgressPayload {
                id,
                downloaded,
                total: total_size,
            });
            last_emit_time = std::time::Instant::now();
        }
    }
    
    writer.flush().await.map_err(|e| e.to_string())?;

    let _ = app.emit("download_progress", ProgressPayload {
        id,
        downloaded,
        total: total_size,
    });

    state.0.lock().unwrap().remove(&id);
    println!("Téléchargement terminé : {:?}", file_path);
    Ok(file_path.to_str().unwrap().to_string())
}

#[tauri::command]
fn play_video(url: String) -> Result<(), String> {
    println!("Lancement du lecteur natif pour : {}", url);

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .manage(DownloadState(Mutex::new(HashMap::new())))
        .invoke_handler(tauri::generate_handler![play_video, download_video, get_config, fetch_radarr_movies, cancel_download])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

