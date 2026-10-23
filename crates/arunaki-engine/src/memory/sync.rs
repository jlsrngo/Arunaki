use super::store::{id_of, load, resolve_dir, save, MAIN_NODE_ID};
use crate::paths::now_iso;
use axum::{
    extract::{Multipart, Query},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;

pub fn extract_text(file_name: &str, bytes: &[u8], tmp_dir: &Path) -> String {
    let ext = Path::new(file_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if ext != "pdf" && ext != "docx" {
        return String::from_utf8_lossy(bytes).to_string();
    }
    let _ = std::fs::create_dir_all(tmp_dir);
    let tmp = tmp_dir.join(format!("upload-{}.{}", crate::paths::now_ms(), ext));
    if std::fs::write(&tmp, bytes).is_err() {
        return String::new();
    }
    let p = tmp.to_string_lossy().to_string();
    let (map, key) = if ext == "pdf" {
        (arunaki_docs::build_pdf_map(&p, Some(30)), "pages")
    } else {
        (arunaki_docs::build_word_map(&p), "paragraphs")
    };
    let _ = std::fs::remove_file(&tmp);
    map.ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|v| {
            v.get(key).and_then(|a| a.as_array()).map(|arr| {
                arr.iter()
                    .filter_map(|x| x.get("text").and_then(|t| t.as_str()))
                    .collect::<Vec<_>>()
                    .join("\n\n")
            })
        })
        .unwrap_or_default()
}

pub async fn handle_upload(
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Response {
    let dir = resolve_dir(&q, &headers);
    let mut file_name = String::from("upload.txt");
    let mut bytes = Vec::new();
    let mut pos_x = 200.0;
    let mut pos_y = 200.0;
    while let Ok(Some(field)) = multipart.next_field().await {
        match field.name().unwrap_or("") {
            "file" => {
                if let Some(f) = field.file_name() {
                    file_name = f.to_string();
                }
                bytes = field.bytes().await.map(|b| b.to_vec()).unwrap_or_default();
            }
            "positionX" => {
                pos_x = field.text().await.ok().and_then(|t| t.trim().parse().ok()).unwrap_or(200.0)
            }
            "positionY" => {
                pos_y = field.text().await.ok().and_then(|t| t.trim().parse().ok()).unwrap_or(200.0)
            }
            _ => {}
        }
    }
    let content = extract_text(
        &file_name,
        &bytes,
        &Path::new(&dir).join(".arunaki").join("cache"),
    );
    if content.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "message": "No file content provided", "status": 400 })),
        )
            .into_response();
    }
    let title = Path::new(&file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Uploaded file")
        .to_string();
    let mut store = load(&dir);
    let id = format!("node-{}", store.next_id);
    store.next_id += 1;
    let node = json!({
        "id": id,
        "title": title,
        "content": content.chars().take(120_000).collect::<String>(),
        "type": "document",
        "active": true,
        "positionX": pos_x,
        "positionY": pos_y,
        "nodeColor": "#F59E0B",
        "icon": "file-text",
        "city": "",
        "urls": "[]",
        "createdAt": now_iso()
    });
    store.nodes.push(node.clone());
    let edge_id = format!("edge-{}", store.next_id);
    store.next_id += 1;
    store
        .edges
        .push(json!({ "id": edge_id, "sourceId": id, "targetId": MAIN_NODE_ID }));
    save(&dir, &store);
    Json(json!({ "data": node })).into_response()
}

pub fn to_sheets_csv_url(url: &str) -> Option<String> {
    let rest = url.split("docs.google.com/spreadsheets/d/").nth(1)?;
    let id: String = rest
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if id.is_empty() {
        return None;
    }
    let gid = ["#gid=", "&gid=", "?gid="]
        .iter()
        .find_map(|k| url.split(k).nth(1))
        .map(|g| g.chars().take_while(|c| c.is_ascii_digit()).collect::<String>())
        .filter(|g| !g.is_empty())
        .map(|g| format!("&gid={}", g))
        .unwrap_or_default();
    Some(format!(
        "https://docs.google.com/spreadsheets/d/{}/export?format=csv{}",
        id, gid
    ))
}

pub async fn handle_sync(Query(q): Query<HashMap<String, String>>, headers: HeaderMap) -> Response {
    let dir = resolve_dir(&q, &headers);
    let mut store = load(&dir);
    let cache_dir = Path::new(&dir).join(".arunaki").join("cache");
    let _ = std::fs::create_dir_all(&cache_dir);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .unwrap();
    let mut synced = 0u64;
    let mut errors: Vec<String> = Vec::new();

    for node in store.nodes.iter_mut() {
        if !node.get("active").and_then(|v| v.as_bool()).unwrap_or(true) {
            continue;
        }
        let urls: Vec<String> = node
            .get("urls")
            .and_then(|v| v.as_str())
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or_default();
        let title = node.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let nid = id_of(node).to_string();
        for raw in urls.iter().map(|u| u.trim()).filter(|u| !u.is_empty()) {
            let target = to_sheets_csv_url(raw).unwrap_or_else(|| raw.to_string());
            let res = client
                .get(&target)
                .header("User-Agent", "Arunaki-Desktop/1.0")
                .header("Accept", "text/csv, text/plain, */*")
                .send()
                .await;
            match res {
                Ok(r) if r.status().is_success() => {
                    let body = r.text().await.unwrap_or_default();
                    if !body.is_empty() && !body.contains("accounts.google.com/ServiceLogin") {
                        let _ = std::fs::write(cache_dir.join(format!("{}.csv", nid)), &body);
                        node["lastSyncedAt"] = json!(now_iso());
                        node["syncStatus"] = json!("success");
                        synced += 1;
                    } else {
                        errors.push(format!("{}: sheet is private or requires Google login", title));
                        node["syncStatus"] = json!("failed");
                    }
                }
                Ok(r) => {
                    errors.push(format!("{}: HTTP status {}", title, r.status().as_u16()));
                    node["syncStatus"] = json!("failed");
                }
                Err(e) => {
                    errors.push(format!("{}: {}", title, e));
                    node["syncStatus"] = json!("failed");
                }
            }
        }
    }
    if synced > 0 || !errors.is_empty() {
        save(&dir, &store);
    }
    Json(json!({
        "data": {
            "success": errors.is_empty() || synced > 0,
            "syncedCount": synced,
            "timestamp": now_iso(),
            "errors": errors
        }
    }))
    .into_response()
}
