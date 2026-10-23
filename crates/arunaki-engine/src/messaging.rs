use crate::paths::arunaki_data_dir;
use axum::{
    extract::Path as AxumPath,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

static ACTIVE_SESSION: OnceLock<Mutex<Option<Value>>> = OnceLock::new();

pub fn router() -> Router {
    Router::new()
        .route(
            "/api/messaging/config",
            get(handle_get_config).put(handle_put_config),
        )
        .route(
            "/messaging/config",
            get(handle_get_config).put(handle_put_config),
        )
        .route("/api/messaging/status", get(handle_status))
        .route("/messaging/status", get(handle_status))
        .route("/api/messaging/test/:platform", post(handle_test))
        .route("/messaging/test/:platform", post(handle_test))
        .route("/api/messaging/whatsapp/qr", get(handle_wa_qr))
        .route("/messaging/whatsapp/qr", get(handle_wa_qr))
        .route("/api/messaging/whatsapp/logout", post(handle_wa_logout))
        .route("/messaging/whatsapp/logout", post(handle_wa_logout))
        .route(
            "/api/messaging/active-session",
            get(handle_get_active).post(handle_set_active),
        )
        .route(
            "/messaging/active-session",
            get(handle_get_active).post(handle_set_active),
        )
}

fn config_file() -> PathBuf {
    arunaki_data_dir().join("messaging.json")
}

fn read_config() -> Value {
    let p = config_file();
    if let Ok(raw) = std::fs::read_to_string(&p) {
        if let Ok(val) = serde_json::from_str::<Value>(&raw) {
            return val;
        }
    }
    json!({
        "telegram": { "enabled": false, "botToken": "", "allowedChatIds": [] },
        "whatsapp": { "enabled": false, "phoneNumber": "", "allowedSenders": [] }
    })
}

fn write_config(cfg: &Value) {
    let p = config_file();
    if let Ok(raw) = serde_json::to_string_pretty(cfg) {
        let _ = std::fs::write(p, raw);
    }
}

fn mask_token(tok: &str) -> String {
    if tok.len() <= 8 {
        if tok.is_empty() {
            String::new()
        } else {
            "••••••••".to_string()
        }
    } else {
        format!("{}••••{}", &tok[..4], &tok[tok.len() - 4..])
    }
}

async fn handle_get_config() -> Response {
    let mut cfg = read_config();
    if let Some(tok) = cfg
        .pointer("/telegram/botToken")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
    {
        cfg["telegram"]["botToken"] = Value::String(mask_token(&tok));
    }
    Json(cfg).into_response()
}

async fn handle_put_config(Json(body): Json<Value>) -> Response {
    let current = read_config();
    let cur_tok = current
        .pointer("/telegram/botToken")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let new_tok = body
        .pointer("/telegram/botToken")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let final_tok = if new_tok.contains('•') {
        cur_tok.to_string()
    } else {
        new_tok.to_string()
    };

    let next = json!({
        "telegram": {
            "enabled": body.pointer("/telegram/enabled").and_then(|v| v.as_bool()).unwrap_or(false),
            "botToken": final_tok,
            "allowedChatIds": body.pointer("/telegram/allowedChatIds").and_then(|v| v.as_array()).cloned().unwrap_or_default()
        },
        "whatsapp": {
            "enabled": body.pointer("/whatsapp/enabled").and_then(|v| v.as_bool()).unwrap_or(false),
            "phoneNumber": body.pointer("/whatsapp/phoneNumber").and_then(|v| v.as_str()).unwrap_or(""),
            "allowedSenders": body.pointer("/whatsapp/allowedSenders").and_then(|v| v.as_array()).cloned().unwrap_or_default()
        }
    });
    write_config(&next);
    let mut resp = next;
    resp["telegram"]["botToken"] = Value::String(mask_token(&final_tok));
    Json(resp).into_response()
}

async fn handle_status() -> Response {
    let cfg = read_config();
    let tg_enabled = cfg
        .pointer("/telegram/enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let tg_token = cfg
        .pointer("/telegram/botToken")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let wa_enabled = cfg
        .pointer("/whatsapp/enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    Json(json!({
        "telegram": {
            "enabled": tg_enabled,
            "running": tg_enabled && !tg_token.is_empty(),
            "botUsername": Value::Null,
            "error": Value::Null,
            "lastMessageAt": Value::Null
        },
        "whatsapp": {
            "enabled": wa_enabled,
            "running": false,
            "status": "disconnected",
            "qrDataUrl": Value::Null,
            "connectedPhone": Value::Null,
            "error": Value::Null,
            "lastMessageAt": Value::Null
        }
    }))
    .into_response()
}

async fn handle_test(AxumPath(platform): AxumPath<String>) -> Response {
    let cfg = read_config();
    if platform == "telegram" {
        let tok = cfg
            .pointer("/telegram/botToken")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if tok.is_empty() {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "ok": false, "error": "Bot token is empty" })),
            )
                .into_response();
        }
        let url = format!("https://api.telegram.org/bot{}/getMe", tok);
        if let Ok(r) = reqwest::get(&url).await {
            if let Ok(data) = r.json::<Value>().await {
                if data.get("ok").and_then(|v| v.as_bool()) == Some(true) {
                    return Json(json!({
                        "ok": true,
                        "botUsername": data.pointer("/result/username")
                    }))
                    .into_response();
                }
            }
        }
        return Json(json!({ "ok": false, "error": "Invalid Telegram bot token" }))
            .into_response();
    }
    Json(json!({ "ok": true })).into_response()
}

async fn handle_wa_qr() -> Response {
    Json(json!({ "status": "disconnected", "qrDataUrl": Value::Null })).into_response()
}

async fn handle_wa_logout() -> Response {
    Json(json!({ "ok": true })).into_response()
}

async fn handle_set_active(Json(body): Json<Value>) -> Response {
    let m = ACTIVE_SESSION.get_or_init(|| Mutex::new(None));
    if let Ok(mut guard) = m.lock() {
        *guard = Some(body);
    }
    Json(json!({ "ok": true })).into_response()
}

async fn handle_get_active() -> Response {
    let m = ACTIVE_SESSION.get_or_init(|| Mutex::new(None));
    let val = m.lock().ok().and_then(|g| g.clone());
    Json(json!({ "activeSession": val })).into_response()
}
