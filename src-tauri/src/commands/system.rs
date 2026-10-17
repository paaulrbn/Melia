use std::path::{Component, Path, PathBuf};
use std::process::Command;
use tauri::AppHandle;

use super::settings::{default_download_root, RuntimeState};

const OUTSIDE_ROOT_ERROR: &str = "Chemin hors du dossier de téléchargement";

/// Canonicalizes the deepest existing ancestor of `path`, then re-appends the missing tail.
/// Works for files that do not exist yet or no longer exist.
fn canonicalize_lenient(path: &Path) -> PathBuf {
    let mut tail = Vec::new();
    let mut current = path.to_path_buf();
    loop {
        if let Ok(canonical) = current.canonicalize() {
            let mut result = canonical;
            for part in tail.iter().rev() {
                result.push(part);
            }
            return result;
        }
        match (current.file_name().map(|n| n.to_os_string()), current.parent().map(|p| p.to_path_buf())) {
            (Some(name), Some(parent)) => {
                tail.push(name);
                current = parent;
            }
            _ => return path.to_path_buf(),
        }
    }
}

/// Returns the canonical path when it is inside `root` (or equal to it), an error otherwise.
pub fn ensure_under_root(path: &str, root: &Path) -> Result<PathBuf, String> {
    let candidate = Path::new(path);
    if path.trim().is_empty() || candidate.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(OUTSIDE_ROOT_ERROR.to_string());
    }
    let canonical = canonicalize_lenient(candidate);
    let canonical_root = canonicalize_lenient(root);
    if canonical.starts_with(&canonical_root) {
        Ok(canonical)
    } else {
        Err(OUTSIDE_ROOT_ERROR.to_string())
    }
}

/// On Windows `canonicalize` returns verbatim paths (`\\?\C:\...`, `\\?\UNC\server\share\...`).
/// Explorer, mpv and VLC handle them badly: external programs get the plain form, while internal
/// comparisons keep the canonical one.
pub fn strip_verbatim_prefix(path: &str) -> String {
    if let Some(rest) = path.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{}", rest)
    } else if let Some(rest) = path.strip_prefix(r"\\?\") {
        rest.to_string()
    } else {
        path.to_string()
    }
}

/// Path as a string, ready to be handed to an external program.
pub fn external_path(path: &Path) -> String {
    strip_verbatim_prefix(&path.to_string_lossy())
}

/// Same as `ensure_under_root`, accepting any of the allowed folders (current and previous ones).
pub fn ensure_under_roots(path: &str, roots: &[PathBuf]) -> Result<PathBuf, String> {
    roots
        .iter()
        .find_map(|root| ensure_under_root(path, root).ok())
        .ok_or_else(|| OUTSIDE_ROOT_ERROR.to_string())
}

async fn run_blocking<T, F>(task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> T + Send + 'static,
{
    tokio::task::spawn_blocking(task).await.map_err(|e| e.to_string())
}

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
    let default_download_dir = default_download_root().to_string_lossy().to_string();
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
pub async fn open_folder(state: tauri::State<'_, RuntimeState>, path: String) -> Result<(), String> {
    let roots = state.allowed_roots();
    run_blocking(move || {
        let target = ensure_under_roots(&path, &roots)?;
        if !target.exists() {
            let _ = std::fs::create_dir_all(&target);
        }

        #[cfg(target_os = "macos")]
        let program = "open";
        #[cfg(target_os = "windows")]
        let program = "explorer";
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        let program = "xdg-open";

        Command::new(program).arg(external_path(&target)).spawn().map_err(|e| e.to_string())?;
        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn check_file_exists(state: tauri::State<'_, RuntimeState>, path: String) -> Result<bool, String> {
    let roots = state.allowed_roots();
    // A path outside every allowed folder is an error, not "missing": the caller keeps its entry.
    run_blocking(move || ensure_under_roots(&path, &roots).map(|p| p.exists())).await?
}

#[tauri::command]
pub async fn delete_file(state: tauri::State<'_, RuntimeState>, path: String) -> Result<(), String> {
    let roots = state.allowed_roots();
    run_blocking(move || {
        let target = ensure_under_roots(&path, &roots)?;
        if roots.iter().any(|root| target == canonicalize_lenient(root)) {
            return Err(OUTSIDE_ROOT_ERROR.to_string());
        }
        if target.is_file() {
            std::fs::remove_file(&target).map_err(|e| e.to_string())?;
        }
        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn get_file_size(state: tauri::State<'_, RuntimeState>, path: String) -> Result<Option<u64>, String> {
    let roots = state.allowed_roots();
    run_blocking(move || {
        ensure_under_roots(&path, &roots)
            .ok()
            .and_then(|p| std::fs::metadata(p).ok())
            .map(|m| m.len())
    })
    .await
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

/// Scans the configured download folder (never an arbitrary directory).
#[tauri::command]
pub async fn scan_local_episodes(state: tauri::State<'_, RuntimeState>) -> Result<Vec<ScannedEpisode>, String> {
    let root = state.download_root();
    run_blocking(move || {
        let mut results = Vec::new();
        if !root.is_dir() {
            return results;
        }

        let video_extensions = ["mkv", "mp4", "avi", "mov", "m4v", "webm", "ts"];

        if let Ok(entries) = std::fs::read_dir(&root) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let series_folder = entry.file_name().to_string_lossy().to_string();
                    scan_series_dir(&path, &series_folder, &video_extensions, &mut results);
                }
            }
        }

        results
    })
    .await
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
            if (1..=3).contains(&s_digits) && j < len && (chars[j] == 'E' || chars[j] == 'e') {
                let s_str: String = chars[i + 1..j].iter().collect();
                let mut k = j + 1;
                while k < len && chars[k].is_ascii_digit() {
                    k += 1;
                }
                let e_digits = k - (j + 1);
                if (1..=3).contains(&e_digits) {
                    let e_str: String = chars[j + 1..k].iter().collect();
                    if let (Ok(s_num), Ok(e_num)) = (s_str.parse::<u32>(), e_str.parse::<u32>()) {
                        let rest: String = chars[k..].iter().collect();
                        let title = rest
                            .trim_start_matches(['-', '•', ' ', '_'])
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
                if (1..=3).contains(&e_digits) {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_sxxexx_with_title() {
        let path = Path::new("/x/Show/Season 01/Show - S01E02 - Pilot.mkv");
        let parsed = parse_episode_info("Show - S01E02 - Pilot.mkv", path);
        assert_eq!(parsed, Some((1, 2, Some("Pilot".to_string()))));
    }

    #[test]
    fn falls_back_to_season_folder() {
        let path = Path::new("/x/Show/Saison 03/E07.mkv");
        assert_eq!(parse_episode_info("E07.mkv", path), Some((3, 7, None)));
    }

    #[test]
    fn rejects_unparseable_names() {
        assert_eq!(parse_episode_info("movie.mkv", Path::new("/x/movie.mkv")), None);
    }

    #[test]
    fn accepts_paths_inside_root() {
        let root = std::env::temp_dir().join("melia-root-test");
        let inside = root.join("Show").join("ep.mkv");
        assert!(ensure_under_root(&inside.to_string_lossy(), &root).is_ok());
    }

    #[test]
    fn rejects_paths_outside_root() {
        let root = std::env::temp_dir().join("melia-root-test");
        let outside = std::env::temp_dir().join("elsewhere.mkv");
        assert!(ensure_under_root(&outside.to_string_lossy(), &root).is_err());
    }

    #[test]
    fn strips_windows_verbatim_prefixes() {
        assert_eq!(strip_verbatim_prefix(r"\\?\C:\Users\paul\Melia\film.mkv"), r"C:\Users\paul\Melia\film.mkv");
        assert_eq!(strip_verbatim_prefix(r"\\?\UNC\nas\media\film.mkv"), r"\\nas\media\film.mkv");
    }

    #[test]
    fn leaves_ordinary_paths_untouched() {
        assert_eq!(strip_verbatim_prefix("/Users/paul/Melia/film.mkv"), "/Users/paul/Melia/film.mkv");
        assert_eq!(strip_verbatim_prefix(r"C:\Melia\film.mkv"), r"C:\Melia\film.mkv");
    }

    #[test]
    fn accepts_any_allowed_root() {
        let current = std::env::temp_dir().join("melia-root-test");
        let previous = std::env::temp_dir().join("melia-old-root-test");
        let roots = vec![current, previous.clone()];
        let in_previous = previous.join("film.mkv");
        assert!(ensure_under_roots(&in_previous.to_string_lossy(), &roots).is_ok());
        let elsewhere = std::env::temp_dir().join("elsewhere.mkv");
        assert!(ensure_under_roots(&elsewhere.to_string_lossy(), &roots).is_err());
    }

    #[test]
    fn rejects_traversal() {
        let root = std::env::temp_dir().join("melia-root-test");
        let sneaky = root.join("..").join("elsewhere.mkv");
        assert!(ensure_under_root(&sneaky.to_string_lossy(), &root).is_err());
        assert!(ensure_under_root("", &root).is_err());
    }
}
