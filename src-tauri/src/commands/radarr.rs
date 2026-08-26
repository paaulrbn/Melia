use reqwest::Client;

async fn http_get(url: &str) -> Result<String, String> {
    let client = Client::new();
    let response = client.get(url).send().await.map_err(|e| e.to_string())?;
    let text = response.text().await.map_err(|e| e.to_string())?;
    Ok(text)
}

#[tauri::command]
pub async fn fetch_radarr_movies(url: String) -> Result<String, String> {
    http_get(&url).await
}

#[tauri::command]
pub async fn search_radarr_movies(url: String) -> Result<String, String> {
    http_get(&url).await
}

#[tauri::command]
pub async fn get_radarr_quality_profiles(url: String) -> Result<String, String> {
    http_get(&url).await
}

#[tauri::command]
pub async fn add_radarr_movie(url: String, body: String) -> Result<String, String> {
    let client = Client::new();
    let response = client
        .post(&url)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let text = response.text().await.map_err(|e| e.to_string())?;
    Ok(text)
}

#[tauri::command]
pub async fn delete_radarr_movie(url: String) -> Result<String, String> {
    let client = Client::new();
    let response = client.delete(&url).send().await.map_err(|e| e.to_string())?;
    let text = response.text().await.unwrap_or_default();
    Ok(text)
}
