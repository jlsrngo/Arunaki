use crate::files::urlencoding_decode;
use crate::paths::{arunaki_dot_dir, normalize_workspace_path};
use axum::{
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

pub const MAIN_NODE_ID: &str = "main-ai-node";

pub fn main_node() -> Value {
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

pub fn sandbox_dir() -> String {
    let dir = arunaki_dot_dir().join("scratch");
    let _ = std::fs::create_dir_all(&dir);
    dir.to_string_lossy().to_string()
}

pub fn resolve_dir(q: &HashMap<String, String>, headers: &HeaderMap) -> String {
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

pub fn store_path(dir: &str) -> PathBuf {
    Path::new(&normalize_workspace_path(dir))
        .join(".arunaki")
        .join("knowledge.json")
}

pub struct Store {
    pub nodes: Vec<Value>,
    pub edges: Vec<Value>,
    pub next_id: u64,
}

pub fn load(dir: &str) -> Store {
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

pub fn save(dir: &str, store: &Store) {
    let p = store_path(dir);
    if let Some(parent) = p.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let data = json!({ "nodes": store.nodes, "edges": store.edges, "nextId": store.next_id });
    if let Ok(raw) = serde_json::to_string_pretty(&data) {
        let _ = std::fs::write(p, raw);
    }
}

pub fn is_visible(n: &Value) -> bool {
    n.get("id").and_then(|v| v.as_str()) != Some("arunaki-rulebook")
        && n.get("type").and_then(|v| v.as_str()) != Some("rules")
}

pub fn id_of(v: &Value) -> &str {
    v.get("id").and_then(|v| v.as_str()).unwrap_or("")
}

pub fn not_found(msg: &str) -> Response {
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
