use std::path::{Path, PathBuf};

use serde::Serialize;

use super::settings::RuntimeState;

pub fn resolve_download_path(filename: &str, root: &Path) -> PathBuf {
    let mut file_path = root.to_path_buf();
    let normalized = filename.replace('\\', "/");
    for part in normalized.split('/') {
        let trimmed = part.trim();
        if !trimmed.is_empty() && trimmed != "." && trimmed != ".." {
            let safe_part = sanitize_path_component(trimmed);
            if !safe_part.is_empty() {
                file_path.push(safe_part);
            }
        }
    }
    file_path
}

const WINDOWS_RESERVED_NAMES: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Single source of truth for file and folder names on disk.
/// The frontend never rebuilds these names: it asks `get_download_path` / `stat_downloads`.
fn sanitize_path_component(part: &str) -> String {
    let mut out = String::with_capacity(part.len());
    for c in part.chars() {
        match c {
            ':' => out.push_str(" -"),
            '<' | '>' | '"' | '|' | '?' | '*' => out.push('_'),
            c if c.is_control() => out.push('_'),
            c => out.push(c),
        }
    }

    let trimmed = out.trim_end_matches(['.', ' ']);
    let mut result = trimmed.trim_start().to_string();

    // Reserved device names are matched on the stem (before the first dot).
    let stem = result.split('.').next().unwrap_or("").to_uppercase();
    if WINDOWS_RESERVED_NAMES.contains(&stem.as_str()) {
        result.insert(0, '_');
    }
    result
}

#[tauri::command]
pub fn get_download_path(runtime: tauri::State<RuntimeState>, filename: String) -> Result<String, String> {
    let path = resolve_download_path(&filename, &runtime.download_root());
    Ok(path.to_string_lossy().to_string())
}

#[derive(Serialize)]
pub struct DownloadFileStat {
    pub path: String,
    /// `None` when the file does not exist.
    pub size: Option<u64>,
}

/// Resolves and stats many download names in one call (instead of three IPC round trips per file).
#[tauri::command]
pub async fn stat_downloads(
    runtime: tauri::State<'_, RuntimeState>,
    filenames: Vec<String>,
) -> Result<Vec<DownloadFileStat>, String> {
    let root = runtime.download_root();
    tokio::task::spawn_blocking(move || {
        filenames
            .iter()
            .map(|filename| {
                let path = resolve_download_path(filename, &root);
                let size = std::fs::metadata(&path).ok().filter(|m| m.is_file()).map(|m| m.len());
                DownloadFileStat {
                    path: path.to_string_lossy().to_string(),
                    size,
                }
            })
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn colon_becomes_dash() {
        assert_eq!(sanitize_path_component("Star Wars: Episode I (1999).mkv"), "Star Wars - Episode I (1999).mkv");
    }

    #[test]
    fn windows_forbidden_chars_are_replaced() {
        assert_eq!(sanitize_path_component("What? <Is> \"This\" | *"), "What_ _Is_ _This_ _ _");
    }

    #[test]
    fn trailing_dots_and_spaces_are_trimmed() {
        assert_eq!(sanitize_path_component("Movie Name. . "), "Movie Name");
    }

    #[test]
    fn reserved_names_are_prefixed() {
        assert_eq!(sanitize_path_component("CON.mkv"), "_CON.mkv");
        assert_eq!(sanitize_path_component("nul"), "_nul");
        assert_eq!(sanitize_path_component("Console.mkv"), "Console.mkv");
    }

    #[test]
    fn traversal_parts_are_dropped() {
        let root = Path::new("/downloads");
        assert_eq!(
            resolve_download_path("../../etc/passwd", root),
            Path::new("/downloads/etc/passwd")
        );
    }
}
