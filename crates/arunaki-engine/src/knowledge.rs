//! Knowledge graph store — wire-compatible with the TypeScript engine
//! (`packages/engine/engine/src/server/routes/instance/httpapi/handlers/knowledge.ts`).
//!
//! Storage: `{directory}/.arunaki/knowledge.json` = `{ nodes: [], edges: [], nextId }`.
//! Every response is wrapped as `{ data: ... }`. The active folder comes from the
//! `directory` query / `x-arunaki-directory` header; with no folder open the sandbox
//! folder `~/.arunaki/scratch` is used (same as the TS engine) instead of failing 400.

use crate::files::urlencoding_decode;
use crate::paths::{arunaki_dot_dir, normalize_workspace_path, now_iso};
use axum::{
    extract::{Multipart, Path as AxumPath, Query},
    http::{HeaderMap, StatusCode},
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
        .route("/api/knowledge/sync", post(handle_sync))
        .route(
            "/api/knowledge/edges",
            get(handle_list_edges).post(handle_create_edge),
        )
        .route("/api/knowledge/edges/:id", delete(handle_delete_edge))
        .route("/api/knowledge/:id/position", patch(handle_update_pos))
        .route("/api/knowledge/:id/toggle", patch(handle_toggle))
        .route(
            "/api/knowledge/:id",
            get(handle_get).patch(handle_update).delete(handle_delete_node),
        )
}

const MAIN_NODE_ID: &str = "main-ai-node";

fn main_node() -> Value {
    json!({
        "id": MAIN_NODE_ID,
        "title": "Agent Core",
        "content": "Central AI agent node",
        "type": "agent",
        "active": true,
        "positionX": 300,
        "positionY": 200,
        "nodeColor": "#8B5CF6",
        "icon": "sparkles",
        "city": "",
        "urls": "[]",
        "createdAt": "1970-01-01T00:00:00.000Z"
    })
}

fn sandbox_dir() -> String {
    let dir = arunaki_dot_dir().join("scratch");
    let _ = std::fs::create_dir_all(&dir);
    dir.to_string_lossy().to_string()
}

fn resolve_dir(q: &HashMap<String, String>, headers: &HeaderMap) -> String {
    if let Some(d) = q.get("directory").or_else(|| q.get("workspacePath")) {
        if !d.trim().is_empty() {
            return normalize_workspace_path(&urlencoding_decode(d));
        }
    }
    if let Some(h) = headers
        .get("x-arunaki-directory")
        .or_else(|| headers.get("x-opencode-directory"))
        .and_then(|v| v.to_str().ok())
    {
        if !h.trim().is_empty() {
            return normalize_workspace_path(&urlencoding_decode(h));
        }
    }
    sandbox_dir()
}

fn store_path(dir: &str) -> PathBuf {
    Path::new(&normalize_workspace_path(dir))
        .join(".arunaki")
        .join("knowledge.json")
}

struct Store {
    nodes: Vec<Value>,
    edges: Vec<Value>,
    next_id: u64,
}

fn load(dir: &str) -> Store {
    let raw = std::fs::read_to_string(store_path(dir)).unwrap_or_default();
    let parsed: Value = serde_json::from_str(&raw).unwrap_or_else(|_| json!({}));
    let mut nodes: Vec<Value> = parsed
        .get("nodes")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let edges: Vec<Value> = parsed
        .get("edges")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    if !nodes.iter().any(|n| n.get("id").and_then(|v| v.as_str()) == Some(MAIN_NODE_ID)) {
        nodes.insert(0, main_node());
    }
    let stored = parsed.get("nextId").and_then(|v| v.as_u64()).unwrap_or(1);
    let next_id = stored.max((nodes.len() + edges.len() + 1) as u64);
    Store { nodes, edges, next_id }
}

fn save(dir: &str, store: &Store) {
    let p = store_path(dir);
    if let Some(parent) = p.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let data = json!({ "nodes": store.nodes, "edges": store.edges, "nextId": store.next_id });
    if let Ok(raw) = serde_json::to_string_pretty(&data) {
        let _ = std::fs::write(p, raw);
    }
}

fn is_visible(n: &Value) -> bool {
    n.get("id").and_then(|v| v.as_str()) != Some("arunaki-rulebook")
        && n.get("type").and_then(|v| v.as_str()) != Some("rules")
}

fn id_of(v: &Value) -> &str {
    v.get("id").and_then(|v| v.as_str()).unwrap_or("")
}

fn not_found(msg: &str) -> Response {
    (StatusCode::NOT_FOUND, Json(json!({ "message": msg, "status": 404 }))).into_response()
}

/// Active (AI-visible) knowledge nodes for prompt context.
pub fn get_active_knowledge_for_workspace(workspace_path: &str) -> Vec<Value> {
    let dir = if workspace_path.trim().is_empty() {
        sandbox_dir()
    } else {
        workspace_path.to_string()
    };
    load(&dir)
        .nodes
        .into_iter()
        .filter(|n| id_of(n) != MAIN_NODE_ID && is_visible(n))
        .filter(|n| n.get("active").and_then(|v| v.as_bool()).unwrap_or(true))
        .collect()
}

async fn handle_list(Query(q): Query<HashMap<String, String>>, headers: HeaderMap) -> Response {
    let store = load(&resolve_dir(&q, &headers));
    let nodes: Vec<Value> = store.nodes.into_iter().filter(is_visible).collect();
    Json(json!({ "data": nodes })).into_response()
}

async fn handle_get(
    AxumPath(id): AxumPath<String>,
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    let store = load(&resolve_dir(&q, &headers));
    match store.nodes.into_iter().find(|n| id_of(n) == id) {
        Some(n) => Json(json!({ "data": n })).into_response(),
        None => not_found("Node not found"),
    }
}

async fn handle_create(
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    let dir = resolve_dir(&q, &headers);
    let mut store = load(&dir);
    let id = format!("node-{}", store.next_id);
    store.next_id += 1;
    let s = |k: &str, d: &str| body.get(k).and_then(|v| v.as_str()).unwrap_or(d).to_string();
    let node = json!({
        "id": id,
        "title": s("title", "Untitled"),
        "content": s("content", ""),
        "type": s("type", "note"),
        "active": true,
        "positionX": body.get("positionX").and_then(|v| v.as_f64()).unwrap_or(200.0),
        "positionY": body.get("positionY").and_then(|v| v.as_f64()).unwrap_or(200.0),
        "nodeColor": s("nodeColor", "#3B82F6"),
        "icon": s("icon", "file-text"),
        "city": "",
        "urls": "[]",
        "createdAt": now_iso()
    });
    store.nodes.push(node.clone());
    save(&dir, &store);
    Json(json!({ "data": node })).into_response()
}

async fn handle_update(
    AxumPath(id): AxumPath<String>,
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    let dir = resolve_dir(&q, &headers);
    let mut store = load(&dir);
    let Some(node) = store.nodes.iter_mut().find(|n| id_of(n) == id) else {
        return not_found("Node not found");
    };
    if let Some(t) = body.get("title").and_then(|v| v.as_str()) {
        node["title"] = json!(t);
    }
    let mut content = body
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if content.trim() == "Enter knowledge content here..."
        || content.contains("JavaScript tidak diaktifkan")
    {
        content.clear();
    }
    node["content"] = json!(content);
    let urls = body.get("urls").cloned().unwrap_or_else(|| json!([]));
    node["urls"] = json!(serde_json::to_string(&urls).unwrap_or_else(|_| "[]".into()));
    node["city"] = json!(body.get("city").and_then(|v| v.as_str()).unwrap_or(""));
    let updated = node.clone();
    save(&dir, &store);
    Json(json!({ "data": updated })).into_response()
}

async fn handle_delete_node(
    AxumPath(id): AxumPath<String>,
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    let dir = resolve_dir(&q, &headers);
    let mut store = load(&dir);
    if !store.nodes.iter().any(|n| id_of(n) == id) {
        return not_found("Node not found");
    }
    store.nodes.retain(|n| id_of(n) != id);
    store.edges.retain(|e| {
        e.get("sourceId").and_then(|v| v.as_str()) != Some(&id)
            && e.get("targetId").and_then(|v| v.as_str()) != Some(&id)
    });
    save(&dir, &store);
    Json(json!({ "data": {} })).into_response()
}

async fn handle_update_pos(
    AxumPath(id): AxumPath<String>,
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    let dir = resolve_dir(&q, &headers);
    let mut store = load(&dir);
    let Some(node) = store.nodes.iter_mut().find(|n| id_of(n) == id) else {
        return not_found("Node not found");
    };
    node["positionX"] = json!(body.get("positionX").and_then(|v| v.as_f64()).unwrap_or(0.0));
    node["positionY"] = json!(body.get("positionY").and_then(|v| v.as_f64()).unwrap_or(0.0));
    let updated = node.clone();
    save(&dir, &store);
    Json(json!({ "data": updated })).into_response()
}

async fn handle_toggle(
    AxumPath(id): AxumPath<String>,
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    let dir = resolve_dir(&q, &headers);
    let mut store = load(&dir);
    let Some(node) = store.nodes.iter_mut().find(|n| id_of(n) == id) else {
        return not_found("Node not found");
    };
    let active = node.get("active").and_then(|v| v.as_bool()).unwrap_or(true);
    node["active"] = json!(!active);
    let updated = node.clone();
    save(&dir, &store);
    Json(json!({ "data": updated })).into_response()
}

async fn handle_list_edges(
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    let store = load(&resolve_dir(&q, &headers));
    let visible: std::collections::HashSet<String> = store
        .nodes
        .iter()
        .filter(|n| is_visible(n))
        .map(|n| id_of(n).to_string())
        .collect();
    let edges: Vec<Value> = store
        .edges
        .into_iter()
        .filter(|e| {
            let s = e.get("sourceId").and_then(|v| v.as_str()).unwrap_or("");
            let t = e.get("targetId").and_then(|v| v.as_str()).unwrap_or("");
            visible.contains(s) && visible.contains(t)
        })
        .collect();
    Json(json!({ "data": edges })).into_response()
}

async fn handle_create_edge(
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    let dir = resolve_dir(&q, &headers);
    let mut store = load(&dir);
    let id = format!("edge-{}", store.next_id);
    store.next_id += 1;
    let mut edge = json!({
        "id": id,
        "sourceId": body.get("sourceId").and_then(|v| v.as_str()).unwrap_or(""),
        "targetId": body.get("targetId").and_then(|v| v.as_str()).unwrap_or(""),
    });
    if let Some(l) = body.get("label").and_then(|v| v.as_str()) {
        edge["label"] = json!(l);
    }
    store.edges.push(edge.clone());
    save(&dir, &store);
    Json(json!({ "data": edge })).into_response()
}

async fn handle_delete_edge(
    AxumPath(id): AxumPath<String>,
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    let dir = resolve_dir(&q, &headers);
    let mut store = load(&dir);
    if !store.edges.iter().any(|e| id_of(e) == id) {
        return not_found("Edge not found");
    }
    store.edges.retain(|e| id_of(e) != id);
    save(&dir, &store);
    Json(json!({ "data": {} })).into_response()
}

fn extract_text(file_name: &str, bytes: &[u8], tmp_dir: &Path) -> String {
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

async fn handle_upload(
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

fn to_sheets_csv_url(url: &str) -> Option<String> {
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

async fn handle_sync(Query(q): Query<HashMap<String, String>>, headers: HeaderMap) -> Response {
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
