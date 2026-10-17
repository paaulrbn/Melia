use std::collections::HashMap;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;
use tokio::sync::Notify;
use url::Url;

use super::http::HttpState;
use super::paths::resolve_download_path;
use super::settings::RuntimeState;

/// Maximum silence tolerated on the connection before the download fails (partial file is kept).
const CHUNK_TIMEOUT: Duration = Duration::from_secs(30);

/// Maximum wait for the response headers (a server that accepts the connection but never answers).
const RESPONSE_TIMEOUT: Duration = Duration::from_secs(60);

const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/// Structured error sent to the webview: it matches on `code`, never on the message text.
#[derive(Serialize)]
pub struct DownloadError {
    pub code: &'static str,
    pub message: String,
}

impl DownloadError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

impl From<String> for DownloadError {
    fn from(message: String) -> Self {
        Self::new("FAILED", message)
    }
}

#[derive(Clone)]
pub struct ActiveDownload {
    pub cancel_flag: Arc<AtomicBool>,
    pub delete_on_cancel: Arc<AtomicBool>,
    pub cancel_notify: Arc<Notify>,
    pub file_path: PathBuf,
}

pub struct DownloadState(pub Arc<Mutex<HashMap<String, ActiveDownload>>>);

pub struct DownloadGuard {
    state: Arc<Mutex<HashMap<String, ActiveDownload>>>,
    id: String,
}

impl Drop for DownloadGuard {
    fn drop(&mut self) {
        if let Ok(mut map) = self.state.lock() {
            map.remove(&self.id);
        }
    }
}

#[derive(Clone, Serialize)]
pub struct ProgressPayload {
    pub id: String,
    pub downloaded: u64,
    pub total: Option<u64>,
    pub speed: Option<u64>,
}

#[tauri::command]
pub fn cancel_download(
    state: tauri::State<DownloadState>,
    id: String,
    delete_file: Option<bool>,
) -> Option<String> {
    let should_delete = delete_file.unwrap_or(false);
    if let Ok(map) = state.0.lock() {
        if let Some(active) = map.get(&id) {
            if should_delete {
                active.delete_on_cancel.store(true, Ordering::SeqCst);
            }
            active.cancel_flag.store(true, Ordering::SeqCst);
            active.cancel_notify.notify_one();
            return Some(active.file_path.to_string_lossy().to_string());
        }
    }
    None
}

enum ChunkEvent<C> {
    Chunk(Result<Option<C>, reqwest::Error>),
    Cancelled,
    TimedOut,
}

enum SendFailure {
    Cancelled,
    TimedOut,
    Failed(String),
}

/// Sends a request that pause/cancel can interrupt and that cannot hang forever.
async fn send_guarded<F>(
    request: F,
    cancel_flag: &AtomicBool,
    cancel_notify: &Notify,
) -> Result<reqwest::Response, SendFailure>
where
    F: Future<Output = Result<reqwest::Response, reqwest::Error>>,
{
    if cancel_flag.load(Ordering::SeqCst) {
        return Err(SendFailure::Cancelled);
    }
    tokio::select! {
        res = request => res.map_err(|e| SendFailure::Failed(e.without_url().to_string())),
        _ = cancel_notify.notified() => Err(SendFailure::Cancelled),
        _ = tokio::time::sleep(RESPONSE_TIMEOUT) => Err(SendFailure::TimedOut),
    }
}

/// Error for a pause or a cancel; a cancel that asked for deletion also removes the partial file.
async fn cancellation_error(delete_on_cancel: &AtomicBool, file_path: &Path) -> DownloadError {
    if delete_on_cancel.load(Ordering::SeqCst) {
        if file_path.exists() {
            let _ = tokio::fs::remove_file(file_path).await;
        }
        DownloadError::new("CANCELLED", "Téléchargement annulé")
    } else {
        DownloadError::new("PAUSED", "Téléchargement mis en pause")
    }
}

async fn send_failure_error(
    failure: SendFailure,
    delete_on_cancel: &AtomicBool,
    file_path: &Path,
) -> DownloadError {
    match failure {
        SendFailure::Cancelled => cancellation_error(delete_on_cancel, file_path).await,
        SendFailure::TimedOut => DownloadError::new(
            "CONNECTION_LOST",
            "Connexion perdue (le serveur ne répond pas)",
        ),
        SendFailure::Failed(message) => DownloadError::new("CONNECTION_LOST", message),
    }
}

#[tauri::command]
pub async fn download_video(
    app: AppHandle,
    state: tauri::State<'_, DownloadState>,
    http: tauri::State<'_, HttpState>,
    runtime: tauri::State<'_, RuntimeState>,
    url: String,
    filename: String,
    id: String,
) -> Result<String, DownloadError> {
    let file_path = resolve_download_path(&filename, &runtime.download_root());

    let cancel_flag = Arc::new(AtomicBool::new(false));
    let delete_on_cancel = Arc::new(AtomicBool::new(false));
    let cancel_notify = Arc::new(Notify::new());
    {
        let mut map = state
            .0
            .lock()
            .map_err(|_| "État des téléchargements indisponible".to_string())?;
        if map.contains_key(&id) {
            return Err(DownloadError::new("ALREADY_RUNNING", "Téléchargement déjà en cours"));
        }
        map.insert(
            id.clone(),
            ActiveDownload {
                cancel_flag: cancel_flag.clone(),
                delete_on_cancel: delete_on_cancel.clone(),
                cancel_notify: cancel_notify.clone(),
                file_path: file_path.clone(),
            },
        );
    }
    let _guard = DownloadGuard {
        state: state.0.clone(),
        id: id.clone(),
    };

    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Only the configured media server can be downloaded from; credentials are added here,
    // never carried by the URL the webview sends.
    let api_config = runtime.api_config();
    let target = Url::parse(&url).map_err(|_| "URL de téléchargement invalide".to_string())?;
    let origin = api_config.media_origin()?;
    if target.scheme() != "https"
        || target.host_str() != origin.host_str()
        || target.port_or_known_default() != origin.port_or_known_default()
    {
        return Err("Source de téléchargement non autorisée".to_string().into());
    }
    let target_url = target.to_string();
    let auth_header = api_config.has_media_credentials().then(|| {
        let credentials = format!("{}:{}", api_config.media_user, api_config.media_password);
        format!("Basic {}", STANDARD.encode(credentials.as_bytes()))
    });

    let mut downloaded: u64 = 0;
    if let Ok(metadata) = std::fs::metadata(&file_path) {
        downloaded = metadata.len();
    }

    let client = &http.0;
    let send_request = |from: u64| {
        let mut request = client
            .get(&target_url)
            .header(reqwest::header::USER_AGENT, USER_AGENT);
        if let Some(header) = &auth_header {
            request = request.header(reqwest::header::AUTHORIZATION, header);
        }
        if from > 0 {
            request = request.header(reqwest::header::RANGE, format!("bytes={}-", from));
        }
        request.send()
    };

    let mut response = match send_guarded(send_request(downloaded), &cancel_flag, &cancel_notify).await {
        Ok(response) => response,
        Err(failure) => return Err(send_failure_error(failure, &delete_on_cancel, &file_path).await),
    };

    if response.status() == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
        // The local file is at least as large as what the server can serve from that offset.
        // Only treat it as complete when the server confirms the exact same total size.
        let remote_total = response
            .headers()
            .get(reqwest::header::CONTENT_RANGE)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.rsplit('/').next())
            .and_then(|v| v.trim().parse::<u64>().ok());

        if remote_total == Some(downloaded) {
            let _ = app.emit(
                "download_progress",
                ProgressPayload {
                    id: id.clone(),
                    downloaded,
                    total: Some(downloaded),
                    speed: None,
                },
            );
            return Ok(file_path.to_string_lossy().to_string());
        }

        // Different size (corrupted file or another version on the server): start over.
        downloaded = 0;
        response = match send_guarded(send_request(0), &cancel_flag, &cancel_notify).await {
            Ok(response) => response,
            Err(failure) => return Err(send_failure_error(failure, &delete_on_cancel, &file_path).await),
        };
    }

    let is_partial = response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    if response.status() != reqwest::StatusCode::OK && !is_partial {
        return Err(format!("Erreur HTTP: {}", response.status()).into());
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

    loop {
        // Cancellation is raced against the network read, so pause/cancel work on a dead connection.
        let next = if cancel_flag.load(Ordering::SeqCst) {
            ChunkEvent::Cancelled
        } else {
            tokio::select! {
                res = response.chunk() => ChunkEvent::Chunk(res),
                _ = cancel_notify.notified() => ChunkEvent::Cancelled,
                _ = tokio::time::sleep(CHUNK_TIMEOUT) => ChunkEvent::TimedOut,
            }
        };

        let chunk = match next {
            ChunkEvent::Chunk(Ok(Some(chunk))) => chunk,
            ChunkEvent::Chunk(Ok(None)) => break,
            ChunkEvent::Chunk(Err(e)) => {
                let _ = writer.flush().await;
                return Err(DownloadError::new(
                    "CONNECTION_LOST",
                    format!("Connexion perdue : {}", e.without_url()),
                ));
            }
            ChunkEvent::TimedOut => {
                let _ = writer.flush().await;
                return Err(DownloadError::new(
                    "CONNECTION_LOST",
                    "Connexion perdue (aucune donnée reçue depuis 30 s)",
                ));
            }
            ChunkEvent::Cancelled => {
                if !delete_on_cancel.load(Ordering::SeqCst) {
                    let _ = writer.flush().await;
                }
                drop(writer);
                return Err(cancellation_error(&delete_on_cancel, &file_path).await);
            }
        };

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

        if last_emit_time.elapsed().as_millis() >= 1000 {
            let _ = app.emit(
                "download_progress",
                ProgressPayload {
                    id: id.clone(),
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
            id: id.clone(),
            downloaded,
            total: total_size,
            speed: None,
        },
    );

    Ok(file_path.to_string_lossy().to_string())
}
