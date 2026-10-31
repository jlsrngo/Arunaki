//! Session Model Resolution & Control Handlers — mirrors OpenCode `packages/core/src/session/model.ts`.

use crate::paths::now_ms;
use crate::provider::read_arunaki_config;
use crate::session::session::{save_store, set_active_run, with_store};
use axum::{
    extract::Path as AxumPath,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Value};

/// Resolves the default model configuration, prioritizing the most recent active session
/// or the global configuration file.
pub fn default_model_ref() -> Value {
    // 1. Prioritize model from the most recently updated active session
    let recent_model = with_store(|store| {
        let mut list: Vec<&Value> = store.sessions.values().collect();
        list.sort_by_key(|s| s.pointer("/time/updated").and_then(|v| v.as_u64()).unwrap_or(0));
        list.last().and_then(|s| s.get("model")).cloned()
    });

    if let Some(m) = recent_model {
        if let (Some(pid), Some(mid)) = (
            m.get("providerID").and_then(|v| v.as_str()),
            m.get("id").and_then(|v| v.as_str()),
        ) {
            if !pid.is_empty() && !mid.is_empty() {
                return json!({
                    "providerID": pid,
                    "id": mid
                });
            }
        }
    }

    let cfg = read_arunaki_config();
    let model_str = cfg
        .pointer("/provider/antigravity/options/defaultModel")
        .or_else(|| cfg.get("defaultModel"))
        .and_then(|v| v.as_str())
        .unwrap_or("gemini-3.8-flash-low");
    json!({
        "providerID": "antigravity",
        "id": model_str
    })
}

/// HTTP handler to switch the model of an active session.
pub async fn handle_switch_model(
    AxumPath(id): AxumPath<String>,
    Json(body): Json<Value>,
) -> Response {
    let model = body.get("model").cloned().unwrap_or_else(|| body.clone());
    let updated = with_store(|store| {
        if let Some(s) = store.sessions.get_mut(&id) {
            s["model"] = model.clone();
            s["time"]["updated"] = json!(now_ms());
            let cloned = s.clone();
            save_store(store);
            Some(cloned)
        } else {
            None
        }
    });
    if let Some(s) = updated {
        Json(json!({ "data": s, "ok": true })).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Session not found" })),
        )
            .into_response()
    }
}

/// HTTP handler to abort an in-flight prompt run.
pub async fn handle_abort(AxumPath(id): AxumPath<String>) -> Response {
    set_active_run(&id, false);
    Json(json!({ "data": { "aborted": true } })).into_response()
}

