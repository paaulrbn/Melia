use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tauri::Manager;

mod commands;
use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let http_client = build_client();
    let runtime = RuntimeState::default();

    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .setup({
            let http_client = http_client.clone();
            let runtime = runtime.clone();
            move |app| {
                #[cfg(any(windows, target_os = "linux"))]
                {
                    use tauri_plugin_deep_link::DeepLinkExt;
                    let _ = app.deep_link().register_all();
                }
                let player_proxy = proxy::start(http_client, runtime)?;
                app.manage(player_proxy);
                Ok(())
            }
        })
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(DownloadState(Arc::new(Mutex::new(HashMap::new()))))
        .manage(HttpState(http_client))
        .manage(runtime)
        .invoke_handler(tauri::generate_handler![
            play_video,
            download_video,
            get_config,
            get_secrets,
            set_secrets,
            read_legacy_secrets,
            delete_legacy_secrets,
            set_api_config,
            set_download_dir,
            radarr_request,
            sonarr_request,
            cancel_download,
            get_download_path,
            stat_downloads,
            check_update,
            install_update,
            get_app_info,
            select_folder,
            open_folder,
            check_file_exists,
            delete_file,
            get_file_size,
            scan_local_episodes
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
