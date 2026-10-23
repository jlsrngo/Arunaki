use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::{json, Value};

pub async fn handle_wa_qr() -> Response {
    Json(json!({ "status": "disconnected", "qrDataUrl": Value::Null })).into_response()
}

pub async fn handle_wa_logout() -> Response {
    Json(json!({ "ok": true })).into_response()
}
