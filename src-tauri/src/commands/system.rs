use std::process::Command;
use tauri::AppHandle;

#[derive(serde::Serialize)]
pub struct AppInfo {
    pub version: String,
    pub default_download_dir: String,
    pub os: String,
    pub arch: String,
}

#[tauri::command]
pub fn get_app_info(app: AppHandle) -> AppInfo {
    let version = app.package_info().version.to_string();
    let default_download_dir = dirs::download_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("Melia")
        .to_string_lossy()
        .to_string();
    AppInfo {
        version,
        default_download_dir,
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
    }
}

#[tauri::command]
pub async fn select_folder() -> Result<Option<String>, String> {
    let folder = rfd::AsyncFileDialog::new()
        .set_title("Choisir le dossier de téléchargement")
        .pick_folder()
        .await;

    Ok(folder.map(|f| f.path().to_string_lossy().to_string()))
}

#[tauri::command]
pub fn open_folder(path: String) -> Result<(), String> {
    let path_obj = std::path::Path::new(&path);
    if !path_obj.exists() {
        let _ = std::fs::create_dir_all(path_obj);
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(&path).spawn().map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer").arg(&path).spawn().map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Command::new("xdg-open").arg(&path).spawn().map_err(|e| e.to_string())?;
        return Ok(());
    }
}

#[tauri::command]
pub fn check_file_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
pub fn delete_file(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if p.exists() {
        std::fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_file_size(path: String) -> Option<u64> {
    std::fs::metadata(path).ok().map(|m| m.len())
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct ScannedEpisode {
    pub series_folder: String,
    pub season_number: u32,
    pub episode_number: u32,
    pub title: Option<String>,
    pub file_path: String,
    pub file_size: u64,
}

#[tauri::command]
pub fn scan_local_episodes(dir: String) -> Vec<ScannedEpisode> {
    let mut results = Vec::new();
    let root = std::path::Path::new(&dir);
    if !root.is_dir() {
        return results;
    }

    let video_extensions = ["mkv", "mp4", "avi", "mov", "m4v", "webm", "ts"];

    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let series_folder = entry.file_name().to_string_lossy().to_string();
                scan_series_dir(&path, &series_folder, &video_extensions, &mut results);
            }
        }
    }

    results
}

fn scan_series_dir(
    dir: &std::path::Path,
    series_folder: &str,
    video_extensions: &[&str],
    results: &mut Vec<ScannedEpisode>,
) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                scan_series_dir(&path, series_folder, video_extensions, results);
            } else if path.is_file() {
                let ext = path
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                if video_extensions.contains(&ext.as_str()) {
                    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    if let Some((season, episode, ep_title)) = parse_episode_info(file_name, &path) {
                        let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                        results.push(ScannedEpisode {
                            series_folder: series_folder.to_string(),
                            season_number: season,
                            episode_number: episode,
                            title: ep_title,
                            file_path: path.to_string_lossy().to_string(),
                            file_size: size,
                        });
                    }
                }
            }
        }
    }
}

fn parse_episode_info(file_name: &str, file_path: &std::path::Path) -> Option<(u32, u32, Option<String>)> {
    let stem = std::path::Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(file_name);
    let chars: Vec<char> = stem.chars().collect();
    let len = chars.len();

    // 1. Look for SxxExx (e.g. S01E01, s1e2)
    for i in 0..len {
        if (chars[i] == 'S' || chars[i] == 's') && i + 1 < len {
            let mut j = i + 1;
            while j < len && chars[j].is_ascii_digit() {
                j += 1;
            }
            let s_digits = j - (i + 1);
            if s_digits >= 1 && s_digits <= 3 && j < len && (chars[j] == 'E' || chars[j] == 'e') {
                let s_str: String = chars[i + 1..j].iter().collect();
                let mut k = j + 1;
                while k < len && chars[k].is_ascii_digit() {
                    k += 1;
                }
                let e_digits = k - (j + 1);
                if e_digits >= 1 && e_digits <= 3 {
                    let e_str: String = chars[j + 1..k].iter().collect();
                    if let (Ok(s_num), Ok(e_num)) = (s_str.parse::<u32>(), e_str.parse::<u32>()) {
                        let rest: String = chars[k..].iter().collect();
                        let title = rest
                            .trim_start_matches(|c: char| c == '-' || c == '•' || c == ' ' || c == '_')
                            .trim();
                        let title_opt = if !title.is_empty() {
                            Some(title.to_string())
                        } else {
                            None
                        };
                        return Some((s_num, e_num, title_opt));
                    }
                }
            }
        }
    }

    // 2. Fallback: check parent directory if it's "Season XX" or "Saison XX"
    let parent_name = file_path
        .parent()
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str())
        .unwrap_or("");
    let parent_lower = parent_name.to_lowercase();
    let mut season_num = None;
    if parent_lower.starts_with("season") || parent_lower.starts_with("saison") {
        let digits: String = parent_lower.chars().filter(|c| c.is_ascii_digit()).collect();
        if let Ok(s) = digits.parse::<u32>() {
            season_num = Some(s);
        }
    }

    if let Some(s_num) = season_num {
        for i in 0..len {
            if (chars[i] == 'E' || chars[i] == 'e') && i + 1 < len {
                let mut k = i + 1;
                while k < len && chars[k].is_ascii_digit() {
                    k += 1;
                }
                let e_digits = k - (i + 1);
                if e_digits >= 1 && e_digits <= 3 {
                    let e_str: String = chars[i + 1..k].iter().collect();
                    if let Ok(e_num) = e_str.parse::<u32>() {
                        return Some((s_num, e_num, None));
                    }
                }
            }
        }
    }

    None
}
