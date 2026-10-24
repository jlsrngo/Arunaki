use crate::paths::{arunaki_config_dir, arunaki_data_dir, home_dir, now_ms};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::{json, Value};

pub fn read_arunaki_config() -> Value {
    let p = arunaki_config_dir().join("arunaki.json");
    if let Ok(raw) = std::fs::read_to_string(&p) {
        if let Ok(val) = serde_json::from_str::<Value>(&raw) {
            return val;
        }
    }
    json!({})
}

pub fn write_arunaki_config(cfg: &Value) {
    let p = arunaki_config_dir().join("arunaki.json");
    if let Ok(raw) = serde_json::to_string_pretty(cfg) {
        let _ = std::fs::write(p, raw);
    }
}

pub async fn handle_config_get() -> Response {
    Json(read_arunaki_config()).into_response()
}

pub async fn handle_project_list() -> Response {
    let cwd = std::env::current_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .to_string_lossy()
        .replace('\\', "/");
    Json(json!([{
        "id": "proj_default",
        "worktree": cwd,
        "time": { "created": now_ms(), "updated": now_ms() }
    }]))
    .into_response()
}

pub async fn handle_project_current() -> Response {
    let cwd = std::env::current_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .to_string_lossy()
        .replace('\\', "/");
    Json(json!({
        "id": "proj_default",
        "worktree": cwd,
        "time": { "created": now_ms(), "updated": now_ms() }
    }))
    .into_response()
}

pub async fn handle_path_get() -> Response {
    let cwd = std::env::current_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .to_string_lossy()
        .replace('\\', "/");
    Json(json!({
        "home": home_dir().to_string_lossy().replace('\\', "/"),
        "state": arunaki_data_dir().to_string_lossy().replace('\\', "/"),
        "config": arunaki_config_dir().to_string_lossy().replace('\\', "/"),
        "worktree": cwd,
        "directory": cwd
    }))
    .into_response()
}

pub async fn handle_vcs_get() -> Response {
    Json(json!({ "branch": "main" })).into_response()
}
