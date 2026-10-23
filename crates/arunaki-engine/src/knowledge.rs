use crate::paths::{contains_path, gen_id, normalize_workspace_path, now_ms};
use axum::{
    extract::{Multipart, Path as AxumPath, Query},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{delete, get, patch, post},
    Json, Router,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

pub fn router() -> Router {
    Router::new()
        .route("/api/knowledge", get(handle_list).post(handle_create))
        .route("/api/knowledge/upload", post(handle_upload))
        .route("/api/knowledge/sync-sheet", post(handle_sync_sheet))
        .route("/api/knowledge/edges", post(handle_create_edge))
        .route("/api/knowledge/edges/:id", delete(handle_delete_edge))
        .route("/api/knowledge/:id/position", patch(handle_update_pos))
        .route("/api/knowledge/:id/toggle", patch(handle_toggle))
        .route("/api/knowledge/:id", delete(handle_delete_node))
}

fn store_path(workspace_path: &str) -> PathBuf {
    let norm = normalize_workspace_path(workspace_path);
    let dir = Path::new(&norm).join(".arunaki");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("knowledge-store.json")
}

fn read_store(workspace_path: &str) -> Value {
    let p = store_path(workspace_path);
    if let Ok(raw) = std::fs::read_to_string(&p) {
        if let Ok(val) = serde_json::from_str::<Value>(&raw) {
            if val.get("nodes").is_some() {
                return val;
            }
        }
    }
    json!({ "nodes": {}, "edges": {} })
}

fn write_store(workspace_path: &str, data: &Value) {
    let p = store_path(workspace_path);
    if let Ok(raw) = serde_json::to_string_pretty(data) {
        let _ = std::fs::write(p, raw);
    }
}

pub fn get_active_knowledge_for_workspace(workspace_path: &str) -> Vec<Value> {
    let store = read_store(workspace_path);
    let mut out = Vec::new();
    if let Some(nodes) = store.get("nodes").and_then(|v| v.as_object()) {
        for n in nodes.values() {
            if n.get("isActive").and_then(|v| v.as_bool()).unwrap_or(true) {
                out.push(n.clone());
            }
        }
    }
    out
}

async fn handle_list(Query(q): Query<HashMap<String, String>>) -> Response {
    let Some(ws) = q.get("workspacePath") else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "workspacePath is required" })),
        )
            .into_response();
    };
    let store = read_store(ws);
    let mut nodes: Vec<Value> = store
        .get("nodes")
        .and_then(|v| v.as_object())
        .map(|m| m.values().cloned().collect())
        .unwrap_or_default();
    nodes.sort_by(|a, b| {
        let ta = a.get("updatedAt").and_then(|v| v.as_u64()).unwrap_or(0);
        let tb = b.get("updatedAt").and_then(|v| v.as_u64()).unwrap_or(0);
        tb.cmp(&ta)
    });
    let edges: Vec<Value> = store
        .get("edges")
        .and_then(|v| v.as_object())
        .map(|m| m.values().cloned().collect())
        .unwrap_or_default();

    Json(json!({ "nodes": nodes, "edges": edges })).into_response()
}

async fn handle_create(Json(body): Json<Value>) -> Response {
    let Some(ws) = body.get("workspacePath").and_then(|v| v.as_str()) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "workspacePath is required" })),
        )
            .into_response();
    };
    let mut store = read_store(ws);
    let count = store
        .get("nodes")
        .and_then(|v| v.as_object())
        .map(|m| m.len())
        .unwrap_or(0);
    let id = gen_id("kn");
    let now = now_ms();
    let content = body
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let node = json!({
        "id": id,
        "workspacePath": normalize_workspace_path(ws),
        "title": body.get("title").and_then(|v| v.as_str()).unwrap_or("Untitled Note"),
        "type": body.get("type").and_then(|v| v.as_str()).unwrap_or("note"),
        "content": content,
        "filePath": body.get("filePath").and_then(|v| v.as_str()),
        "sourceUrl": body.get("sourceUrl").and_then(|v| v.as_str()),
        "positionX": body.get("positionX").and_then(|v| v.as_f64()).unwrap_or(80.0 + ((count % 3) as f64) * 320.0),
        "positionY": body.get("positionY").and_then(|v| v.as_f64()).unwrap_or(80.0 + ((count / 3) as f64) * 240.0),
        "isActive": body.get("isActive").and_then(|v| v.as_bool()).unwrap_or(true),
        "tokenEstimate": ((content.len() as f64) / 4.0).ceil() as u64,
        "createdAt": now,
        "updatedAt": now,
    });
    store["nodes"][&id] = node.clone();
    write_store(ws, &store);
    (StatusCode::CREATED, Json(node)).into_response()
}

async fn handle_upload(
    Query(q): Query<HashMap<String, String>>,
    mut multipart: Multipart,
) -> Response {
    let mut ws = q.get("workspacePath").cloned().unwrap_or_default();
    let mut title_override = None;
    let mut file_name = String::from("uploaded.txt");
    let mut file_bytes = Vec::new();

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        if name == "workspacePath" {
            if let Ok(txt) = field.text().await {
                if ws.is_empty() {
                    ws = txt;
                }
            }
        } else if name == "title" {
            if let Ok(txt) = field.text().await {
                title_override = Some(txt);
            }
        } else if name == "file" {
            if let Some(fname) = field.file_name() {
                file_name = fname.to_string();
            }
            if let Ok(b) = field.bytes().await {
                file_bytes = b.to_vec();
            }
        }
    }

    if ws.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "workspacePath is required" })),
        )
            .into_response();
    }

    let safe_name: String = Path::new(&file_name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("uploaded.txt")
        .chars()
        .map(|c| {
            if matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') {
                '_'
            } else {
                c
            }
        })
        .collect();

    let norm_ws = normalize_workspace_path(&ws);
    let dest_dir = Path::new(&norm_ws).join(".arunaki").join("knowledge_files");
    let _ = std::fs::create_dir_all(&dest_dir);
    let dest_path = dest_dir.join(format!("{}-{}", now_ms(), safe_name));
    if !contains_path(Path::new(&norm_ws), &dest_path) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Target path outside workspace" })),
        )
            .into_response();
    }
    let _ = std::fs::write(&dest_path, &file_bytes);

    let ext = Path::new(&safe_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let dest_str = dest_path.to_string_lossy().to_string();
    let content = if ext == "pdf" {
        arunaki_docs::build_pdf_map(&dest_str, Some(30))
            .ok()
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
            .and_then(|v| {
                v.get("pages")
                    .and_then(|p| p.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|pg| pg.get("text").and_then(|t| t.as_str()))
                            .collect::<Vec<_>>()
                            .join("\n\n")
                    })
            })
            .unwrap_or_default()
    } else if ext == "docx" {
        arunaki_docs::build_word_map(&dest_str)
            .ok()
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
            .and_then(|v| {
                v.get("paragraphs")
                    .and_then(|p| p.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
                            .collect::<Vec<_>>()
                            .join("\n")
                    })
            })
            .unwrap_or_default()
    } else {
        String::from_utf8_lossy(&file_bytes).to_string()
    };

    let mut store = read_store(&norm_ws);
    let count = store
        .get("nodes")
        .and_then(|v| v.as_object())
        .map(|m| m.len())
        .unwrap_or(0);
    let id = gen_id("kn");
    let now = now_ms();
    let node_type = if ext == "pdf" {
        "pdf"
    } else if ext == "docx" {
        "docx"
    } else {
        "txt"
    };
    let node = json!({
        "id": id,
        "workspacePath": norm_ws,
        "title": title_override.unwrap_or(safe_name),
        "type": node_type,
        "content": content.chars().take(120_000).collect::<String>(),
        "filePath": dest_path.to_string_lossy(),
        "positionX": 80.0 + ((count % 3) as f64) * 320.0,
        "positionY": 80.0 + ((count / 3) as f64) * 240.0,
        "isActive": true,
        "tokenEstimate": ((content.len() as f64) / 4.0).ceil() as u64,
        "createdAt": now,
        "updatedAt": now,
    });
    store["nodes"][&id] = node.clone();
    write_store(&norm_ws, &store);
    (StatusCode::CREATED, Json(node)).into_response()
}

async fn handle_sync_sheet(Json(body): Json<Value>) -> Response {
    let Some(ws) = body.get("workspacePath").and_then(|v| v.as_str()) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "workspacePath is required" })),
        )
            .into_response();
    };
    let Some(url) = body.get("url").and_then(|v| v.as_str()) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "url is required" })),
        )
            .into_response();
    };

    // Extract sheet ID
    let sheet_id = url
        .split("/spreadsheets/d/")
        .nth(1)
        .and_then(|s| s.split('/').next())
        .unwrap_or("");
    if sheet_id.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Invalid Google Sheets URL" })),
        )
            .into_response();
    }
    let csv_url = format!(
        "https://docs.google.com/spreadsheets/d/{}/export?format=csv",
        sheet_id
    );
    let csv_text = match reqwest::get(&csv_url).await {
        Ok(r) if r.status().is_success() => r.text().await.unwrap_or_default(),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Failed to fetch Google Sheet CSV" })),
            )
                .into_response()
        }
    };

    let mut store = read_store(ws);
    let count = store
        .get("nodes")
        .and_then(|v| v.as_object())
        .map(|m| m.len())
        .unwrap_or(0);
    let id = gen_id("kn");
    let now = now_ms();
    let node = json!({
        "id": id,
        "workspacePath": normalize_workspace_path(ws),
        "title": body.get("title").and_then(|v| v.as_str()).unwrap_or("Google Sheet"),
        "type": "gsheet",
        "content": csv_text,
        "sourceUrl": url,
        "positionX": 80.0 + ((count % 3) as f64) * 320.0,
        "positionY": 80.0 + ((count / 3) as f64) * 240.0,
        "isActive": true,
        "tokenEstimate": ((csv_text.len() as f64) / 4.0).ceil() as u64,
        "createdAt": now,
        "updatedAt": now,
    });
    store["nodes"][&id] = node.clone();
    write_store(ws, &store);
    (StatusCode::CREATED, Json(node)).into_response()
}

async fn handle_update_pos(
    AxumPath(id): AxumPath<String>,
    Json(body): Json<Value>,
) -> Response {
    let Some(ws) = body.get("workspacePath").and_then(|v| v.as_str()) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "workspacePath is required" })),
        )
            .into_response();
    };
    let mut store = read_store(ws);
    if let Some(node) = store.pointer_mut(&format!("/nodes/{}", id)) {
        node["positionX"] = json!(body.get("positionX").and_then(|v| v.as_f64()).unwrap_or(0.0));
        node["positionY"] = json!(body.get("positionY").and_then(|v| v.as_f64()).unwrap_or(0.0));
        node["updatedAt"] = json!(now_ms());
        let updated = node.clone();
        write_store(ws, &store);
        return Json(updated).into_response();
    }
    (
        StatusCode::NOT_FOUND,
        Json(json!({ "error": "Knowledge node not found" })),
    )
        .into_response()
}

async fn handle_toggle(AxumPath(id): AxumPath<String>, Json(body): Json<Value>) -> Response {
    let Some(ws) = body.get("workspacePath").and_then(|v| v.as_str()) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "workspacePath is required" })),
        )
            .into_response();
    };
    let mut store = read_store(ws);
    if let Some(node) = store.pointer_mut(&format!("/nodes/{}", id)) {
        node["isActive"] = json!(body.get("isActive").and_then(|v| v.as_bool()).unwrap_or(true));
        node["updatedAt"] = json!(now_ms());
        let updated = node.clone();
        write_store(ws, &store);
        return Json(updated).into_response();
    }
    (
        StatusCode::NOT_FOUND,
        Json(json!({ "error": "Knowledge node not found" })),
    )
        .into_response()
}

async fn handle_delete_node(
    AxumPath(id): AxumPath<String>,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let Some(ws) = q.get("workspacePath") else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "workspacePath is required" })),
        )
            .into_response();
    };
    let mut store = read_store(ws);
    let mut removed = false;
    if let Some(nodes) = store.get_mut("nodes").and_then(|v| v.as_object_mut()) {
        removed = nodes.remove(&id).is_some();
    }
    if removed {
        if let Some(edges) = store.get_mut("edges").and_then(|v| v.as_object_mut()) {
            edges.retain(|_, e| {
                e.get("sourceId").and_then(|v| v.as_str()) != Some(&id)
                    && e.get("targetId").and_then(|v| v.as_str()) != Some(&id)
            });
        }
        write_store(ws, &store);
    }
    Json(json!({ "ok": removed })).into_response()
}

async fn handle_create_edge(Json(body): Json<Value>) -> Response {
    let Some(ws) = body.get("workspacePath").and_then(|v| v.as_str()) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "workspacePath is required" })),
        )
            .into_response();
    };
    let mut store = read_store(ws);
    let id = gen_id("ke");
    let edge = json!({
        "id": id,
        "workspacePath": normalize_workspace_path(ws),
        "sourceId": body.get("sourceId").and_then(|v| v.as_str()).unwrap_or(""),
        "targetId": body.get("targetId").and_then(|v| v.as_str()).unwrap_or(""),
        "label": body.get("label").and_then(|v| v.as_str()),
        "createdAt": now_ms()
    });
    store["edges"][&id] = edge.clone();
    write_store(ws, &store);
    (StatusCode::CREATED, Json(edge)).into_response()
}

async fn handle_delete_edge(
    AxumPath(id): AxumPath<String>,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let Some(ws) = q.get("workspacePath") else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "workspacePath is required" })),
        )
            .into_response();
    };
    let mut store = read_store(ws);
    let mut removed = false;
    if let Some(edges) = store.get_mut("edges").and_then(|v| v.as_object_mut()) {
        removed = edges.remove(&id).is_some();
    }
    if removed {
        write_store(ws, &store);
    }
    Json(json!({ "ok": removed })).into_response()
}
