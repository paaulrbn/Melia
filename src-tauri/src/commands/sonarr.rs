use reqwest::Client;

async fn http_get(url: &str) -> Result<String, String> {
    let client = Client::new();
    let response = client.get(url).send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Sonarr HTTP error ({}): {}", status, text));
    }
    Ok(text)
}

#[tauri::command]
pub async fn fetch_sonarr_series(url: String) -> Result<String, String> {
    http_get(&url).await
}

#[tauri::command]
pub async fn search_sonarr_series(url: String) -> Result<String, String> {
    http_get(&url).await
}

#[tauri::command]
pub async fn get_sonarr_quality_profiles(url: String) -> Result<String, String> {
    http_get(&url).await
}

#[tauri::command]
pub async fn get_sonarr_root_folders(url: String) -> Result<String, String> {
    http_get(&url).await
}

#[tauri::command]
pub async fn get_sonarr_episodes(url: String) -> Result<String, String> {
    http_get(&url).await
}

#[tauri::command]
pub async fn get_sonarr_episode_files(url: String) -> Result<String, String> {
    http_get(&url).await
}

#[tauri::command]
pub async fn add_sonarr_series(url: String, body: String) -> Result<String, String> {
    let client = Client::new();
    let response = client
        .post(&url)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Sonarr error ({}): {}", status, text));
    }
    Ok(text)
}

#[tauri::command]
pub async fn delete_sonarr_series(url: String) -> Result<String, String> {
    let client = Client::new();
    let response = client.delete(&url).send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Sonarr error ({}): {}", status, text));
    }
    Ok(text)
}
