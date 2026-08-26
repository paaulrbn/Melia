use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

#[derive(serde::Serialize)]
pub struct UpdateCheckResult {
    pub available: bool,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub error: Option<String>,
}

fn get_app_updater(app: &AppHandle) -> Result<tauri_plugin_updater::Updater, String> {
    app.updater_builder().build().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<UpdateCheckResult, String> {
    let current_version = app.package_info().version.to_string();
    let updater = match get_app_updater(&app) {
        Ok(u) => u,
        Err(e) => {
            return Ok(UpdateCheckResult {
                available: false,
                current_version,
                latest_version: None,
                error: Some(e),
            });
        }
    };

    match updater.check().await {
        Ok(Some(update)) => Ok(UpdateCheckResult {
            available: true,
            current_version,
            latest_version: Some(update.version.to_string()),
            error: None,
        }),
        Ok(None) => Ok(UpdateCheckResult {
            available: false,
            current_version,
            latest_version: None,
            error: None,
        }),
        Err(e) => Ok(UpdateCheckResult {
            available: false,
            current_version,
            latest_version: None,
            error: Some(e.to_string()),
        }),
    }
}

#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let updater = get_app_updater(&app)?;
    let update = updater.check().await.map_err(|e| e.to_string())?;
    if let Some(update) = update {
        update
            .download_and_install(|_, _| {}, || {})
            .await
            .map_err(|e| e.to_string())?;
        app.restart();
    }
    Ok(())
}
