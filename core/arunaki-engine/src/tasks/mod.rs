//! Modular Operational Tasks & Rollover Engine (`engine::tasks`).
//!
//! Provides atomic disk persistence (`.arunaki/tasks.json`), automatic day/time rollover
//! reconciliation, and live `tasks.updated` SSE event emission.

pub mod rollover;

use crate::files::urlencoding_decode;
use crate::paths::normalize_workspace_path;
use crate::session::message::emit_event;
use axum::{
    extract::Query,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;

pub fn router() -> Router {
    Router::new()
        .route("/api/tasks", get(handle_get_tasks).post(handle_save_tasks))
        .route("/api/desktop/tasks", get(handle_get_tasks).post(handle_save_tasks))
}

#[derive(Debug, Deserialize)]
pub struct SaveTasksRequest {
    #[serde(default)]
    pub directory: String,
    #[serde(default)]
    pub tasks: Vec<Value>,
}

fn resolve_workspace_dir(
    q: &HashMap<String, String>,
    headers: &HeaderMap,
    body_dir: Option<&str>,
) -> String {
    if let Some(d) = body_dir {
        if !d.trim().is_empty() {
            return normalize_workspace_path(d);
        }
    }
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
    String::new()
}

/// `GET /api/tasks?directory=...` — Reads `.arunaki/tasks.json`, runs automatic rollover reconciliation
/// in Rust, persists if any rollover occurred, and returns `{ ok: true, tasks, rolledOver }`.
pub async fn handle_get_tasks(
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    let dir = resolve_workspace_dir(&q, &headers, None);
    if dir.is_empty() {
        return Json(json!({
            "ok": true,
            "tasks": [],
            "rolledOver": false,
        }))
        .into_response();
    }

    let (tasks, rolled_over) = rollover::read_and_reconcile_tasks(&dir);
    Json(json!({
        "ok": true,
        "tasks": tasks,
        "rolledOver": rolled_over,
    }))
    .into_response()
}

/// `POST /api/tasks` — Atomically writes `.arunaki/tasks.json` via temporary file + rename
/// and broadcasts `tasks.updated` over SSE.
pub async fn handle_save_tasks(
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
    Json(req): Json<SaveTasksRequest>,
) -> Response {
    let dir = resolve_workspace_dir(&q, &headers, Some(&req.directory));
    if dir.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "ok": false, "error": "Active project directory is required" })),
        )
            .into_response();
    }

    let mut tasks = req.tasks;
    let now = chrono::Local::now();
    let today_ymd = now.format("%Y-%m-%d").to_string();
    let now_minutes = (now.format("%H").to_string().parse::<u32>().unwrap_or(0)) * 60
        + (now.format("%M").to_string().parse::<u32>().unwrap_or(0));
    let now_iso = now.to_rfc3339();
    rollover::reconcile_tasks_rollover(&mut tasks, &today_ymd, now_minutes, &now_iso);

    match rollover::atomic_write_tasks(&dir, &tasks) {
        Ok(()) => {
            emit_event(
                &dir,
                "tasks.updated",
                json!({
                    "action": "sync",
                    "count": tasks.len(),
                }),
            );
            Json(json!({
                "ok": true,
                "tasks": tasks,
            }))
            .into_response()
        }
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "ok": false, "error": err })),
        )
            .into_response(),
    }
}

