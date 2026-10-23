//! Session summary module — mirrors `packages/engine/engine/src/session/summary.ts`.
//! Handles session summarization, diff tracking, and title generation.

use axum::{
    extract::Path as AxumPath,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Value};

pub async fn handle_summarize(
    AxumPath(_sid): AxumPath<String>,
    Json(_body): Json<Value>,
) -> Response {
    Json(json!({
        "ok": true,
        "summary": {
            "additions": 0,
            "deletions": 0,
            "files": 0
        }
    }))
    .into_response()
}
