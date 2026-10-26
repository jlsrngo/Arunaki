use crate::paths::{arunaki_config_dir, arunaki_data_dir, home_dir, now_ms};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::{json, Value};

pub fn read_arunaki_config() -> Value {
    let p = arunaki_config_dir().join("arunaki.json");
    let mut val = if let Ok(raw) = std::fs::read_to_string(&p) {
        serde_json::from_str::<Value>(&raw).unwrap_or_else(|_| json!({}))
    } else {
        json!({})
    };

    // Auto-recover kenari if missing from global config
    let has_kenari = val.pointer("/provider/kenari").is_some() || val.pointer("/providers/kenari").is_some();
    if !has_kenari {
        let candidates = [
            arunaki_config_dir().join("Arunaki.json.bak-before-kiro-repair"),
            std::path::PathBuf::from(".arunaki").join("arunaki.json"),
            std::path::PathBuf::from(".arunaki").join("config.json"),
            std::path::PathBuf::from("E:/REKAPAN/.arunaki/arunaki.json"),
            std::path::PathBuf::from("E:/JS/Arunika/.arunaki/config.json"),
        ];
        for cand in &candidates {
            if let Ok(raw) = std::fs::read_to_string(cand) {
                if let Ok(cand_val) = serde_json::from_str::<Value>(&raw) {
                    if let Some(kenari) = cand_val.pointer("/provider/kenari").or_else(|| cand_val.pointer("/providers/kenari")) {
                        if val.get("provider").and_then(|v| v.as_object()).is_none() {
                            val["provider"] = json!({});
                        }
                        val["provider"]["kenari"] = kenari.clone();
                        let _ = write_arunaki_config(&val);
                        break;
                    }
                }
            }
        }
    }

    val
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
