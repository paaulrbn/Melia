use std::collections::HashMap;
use std::sync::Mutex;

mod commands;
use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .setup(|_app| {
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = _app.deep_link().register_all();
            }
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(DownloadState(Mutex::new(HashMap::new())))
        .invoke_handler(tauri::generate_handler![
            play_video,
            download_video,
            get_config,
            fetch_radarr_movies,
            search_radarr_movies,
            get_radarr_quality_profiles,
            add_radarr_movie,
            delete_radarr_movie,
            cancel_download,
            check_update,
            install_update,
            get_app_info,
            select_folder,
            open_folder,
            check_file_exists,
            delete_file,
            get_file_size
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
