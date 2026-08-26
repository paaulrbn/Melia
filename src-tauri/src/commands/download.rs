use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use reqwest::Client;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;
use url::Url;

pub struct DownloadState(pub Mutex<HashMap<u32, Arc<AtomicBool>>>);

#[derive(Clone, serde::Serialize)]
pub struct ProgressPayload {
    pub id: u32,
    pub downloaded: u64,
    pub total: Option<u64>,
    pub speed: Option<u64>,
}

#[tauri::command]
pub fn cancel_download(state: tauri::State<DownloadState>, id: u32) {
    if let Ok(map) = state.0.lock() {
        if let Some(flag) = map.get(&id) {
            flag.store(true, Ordering::SeqCst);
        }
    }
}

#[tauri::command]
pub async fn download_video(
    app: AppHandle,
    state: tauri::State<'_, DownloadState>,
    url: String,
    filename: String,
    id: u32,
    custom_dir: Option<String>,
) -> Result<String, String> {
    let cancel_flag = Arc::new(AtomicBool::new(false));
    if let Ok(mut map) = state.0.lock() {
        map.insert(id, cancel_flag.clone());
    }

    let mut target_url = url.clone();
    let mut auth_header = None;

    if let Ok(mut parsed_url) = Url::parse(&url) {
        let username = parsed_url.username().to_string();
        let password = parsed_url.password().unwrap_or("").to_string();

        if !username.is_empty() {
            let decoded_user = percent_encoding::percent_decode_str(&username)
                .decode_utf8_lossy()
                .to_string();
            let decoded_pass = percent_encoding::percent_decode_str(&password)
                .decode_utf8_lossy()
                .to_string();
            let auth = format!("{}:{}", decoded_user, decoded_pass);
            let b64 = STANDARD.encode(auth.as_bytes());
            auth_header = Some(format!("Basic {}", b64));

            let _ = parsed_url.set_username("");
            let _ = parsed_url.set_password(None);
            target_url = parsed_url.to_string();
        }
    }

    let melia_dir = if let Some(dir) = custom_dir {
        if !dir.trim().is_empty() {
            std::path::PathBuf::from(dir)
        } else {
            dirs::download_dir()
                .unwrap_or_else(std::env::temp_dir)
                .join("Melia")
        }
    } else {
        dirs::download_dir()
            .unwrap_or_else(std::env::temp_dir)
            .join("Melia")
    };
    std::fs::create_dir_all(&melia_dir).map_err(|e| e.to_string())?;

    let safe_filename = filename.replace('/', "_").replace('\\', "_");
    let file_path = melia_dir.join(safe_filename);

    let mut downloaded: u64 = 0;
    if file_path.exists() {
        if let Ok(metadata) = std::fs::metadata(&file_path) {
            downloaded = metadata.len();
        }
    }

    let client = Client::new();
    let mut request = client.get(&target_url).header(
        reqwest::header::USER_AGENT,
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
    if let Some(header) = auth_header {
        request = request.header(reqwest::header::AUTHORIZATION, header);
    }
    if downloaded > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={}-", downloaded));
    }

    let mut response = request.send().await.map_err(|e| e.to_string())?;

    if response.status() == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
        if let Ok(mut map) = state.0.lock() {
            map.remove(&id);
        }
        let _ = app.emit(
            "download_progress",
            ProgressPayload {
                id,
                downloaded,
                total: Some(downloaded),
                speed: None,
            },
        );
        return Ok(file_path.to_string_lossy().to_string());
    }

    let is_partial = response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    if response.status() != reqwest::StatusCode::OK && !is_partial {
        if let Ok(mut map) = state.0.lock() {
            map.remove(&id);
        }
        return Err(format!("Erreur HTTP: {}", response.status()));
    }

    if !is_partial {
        downloaded = 0;
    }

    let total_size = response.content_length().map(|len| len + downloaded);

    let file = if is_partial {
        tokio::fs::OpenOptions::new()
            .append(true)
            .open(&file_path)
            .await
            .map_err(|e| e.to_string())?
    } else {
        tokio::fs::File::create(&file_path)
            .await
            .map_err(|e| e.to_string())?
    };

    let mut writer = tokio::io::BufWriter::with_capacity(8 * 1024 * 1024, file);

    let mut last_emit_time = std::time::Instant::now();
    let mut last_speed_calc_time = std::time::Instant::now();
    let mut last_speed_downloaded = downloaded;
    let mut current_speed: Option<u64> = None;

    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        if cancel_flag.load(Ordering::SeqCst) {
            let _ = writer.flush().await;
            if let Ok(mut map) = state.0.lock() {
                map.remove(&id);
            }
            return Err("Téléchargement mis en pause".to_string());
        }

        writer.write_all(&chunk).await.map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;

        let speed_elapsed_ms = last_speed_calc_time.elapsed().as_millis();
        if speed_elapsed_ms >= 1000 {
            let bytes_diff = downloaded.saturating_sub(last_speed_downloaded);
            let speed_bps = (bytes_diff as f64 / (speed_elapsed_ms as f64 / 1000.0)) as u64;
            current_speed = Some(speed_bps);
            last_speed_calc_time = std::time::Instant::now();
            last_speed_downloaded = downloaded;
        }

        if last_emit_time.elapsed().as_millis() > 200 {
            let _ = app.emit(
                "download_progress",
                ProgressPayload {
                    id,
                    downloaded,
                    total: total_size,
                    speed: current_speed,
                },
            );
            last_emit_time = std::time::Instant::now();
        }
    }

    writer.flush().await.map_err(|e| e.to_string())?;

    let _ = app.emit(
        "download_progress",
        ProgressPayload {
            id,
            downloaded,
            total: total_size,
            speed: None,
        },
    );

    if let Ok(mut map) = state.0.lock() {
        map.remove(&id);
    }
    Ok(file_path.to_string_lossy().to_string())
}
