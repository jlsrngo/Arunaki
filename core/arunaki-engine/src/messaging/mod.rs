pub mod telegram;
pub mod whatsapp;

pub use telegram::start_telegram_worker;

use crate::paths::arunaki_data_dir;
use axum::{
    extract::Path as AxumPath,
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
            get(handle_get_config)
                .put(handle_put_config)
                .post(handle_put_config),
        )
        .route(
            "/messaging/config",
            get(handle_get_config)
                .put(handle_put_config)
                .post(handle_put_config),
        )
        .route("/api/messaging/status", get(handle_status))
        .route("/messaging/status", get(handle_status))
        .route("/api/messaging/test", post(handle_test_body))
        .route("/messaging/test", post(handle_test_body))
        .route("/api/messaging/test/:platform", post(handle_test_platform))
        .route("/messaging/test/:platform", post(handle_test_platform))
        .route("/api/messaging/whatsapp/qr", get(whatsapp::handle_wa_qr))
        .route("/messaging/whatsapp/qr", get(whatsapp::handle_wa_qr))
        .route("/api/messaging/whatsapp/logout", post(whatsapp::handle_wa_logout))
        .route("/messaging/whatsapp/logout", post(whatsapp::handle_wa_logout))
        .route(
            "/api/messaging/active-session",
            get(handle_get_active).post(handle_set_active),
        )
        .route(
            "/messaging/active-session",
            get(handle_get_active).post(handle_set_active),
        )
}

pub fn config_file() -> PathBuf {
    arunaki_data_dir().join("messaging.json")
}

pub fn read_config() -> Value {
    let p = config_file();
    if let Ok(raw) = std::fs::read_to_string(&p) {
        if let Ok(val) = serde_json::from_str::<Value>(&raw) {
            return val;
        }
    }
    json!({
        "telegram": {
            "enabled": false,
            "botToken": "",
            "allowedUserId": "",
            "targetFolder": "",
            "allowedChatIds": []
        },
        "whatsapp": {
            "enabled": false,
            "phoneNumber": "",
            "allowedSenders": []
        }
    })
}

pub fn write_config(cfg: &Value) {
    let p = config_file();
    if let Ok(raw) = serde_json::to_string_pretty(cfg) {
        let _ = std::fs::write(p, raw);
    }
}

pub fn mask_token(tok: &str) -> String {
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

pub fn get_active_session_folder() -> Option<String> {
    ACTIVE_SESSION
        .get_or_init(|| Mutex::new(None))
        .lock()
        .ok()
        .and_then(|g| g.clone())
        .and_then(|v| {
            v.get("directory")
                .or_else(|| v.get("workspacePath"))
                .and_then(|w| w.as_str())
                .map(|s| s.to_string())
        })
}

pub fn get_active_session_info(target_dir: Option<&str>) -> Option<(String, String)> {
    let norm_target = target_dir.map(|f| f.trim().replace('/', "\\").to_lowercase());

    // 1. Check in-memory active session reported by UI
    let in_mem = ACTIVE_SESSION
        .get_or_init(|| Mutex::new(None))
        .lock()
        .ok()
        .and_then(|g| g.clone())
        .and_then(|v| {
            let sid = v.get("sessionID").or_else(|| v.get("sessionId")).and_then(|s| s.as_str())?;
            let dir = v.get("directory").or_else(|| v.get("workspacePath")).and_then(|d| d.as_str())?;
            Some((sid.to_string(), dir.to_string()))
        });

    if let Some((sid, dir)) = in_mem {
        let norm_dir = dir.trim().replace('/', "\\").to_lowercase();
        if let Some(ref target) = norm_target {
            if target.is_empty() || &norm_dir == target {
                return Some((sid, dir));
            }
        } else {
            return Some((sid, dir));
        }
    }

    // 2. Fallback: Lookup the most recently active session for target_dir in sessions-store.json!
    let store = crate::session::session::load_store();
    let mut candidate: Option<(String, String, u64)> = None;

    for (sid, sval) in store.sessions {
        if sid.starts_with("ses_tg_") {
            continue;
        }

        let dir = sval.get("directory").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let norm_dir = dir.trim().replace('/', "\\").to_lowercase();

        if let Some(ref target) = norm_target {
            if !target.is_empty() && &norm_dir != target {
                continue;
            }
        }

        let updated = sval
            .pointer("/time/updated")
            .and_then(|v| v.as_u64())
            .or_else(|| sval.pointer("/time/created").and_then(|v| v.as_u64()))
            .unwrap_or(0);

        if candidate.as_ref().map(|c| updated > c.2).unwrap_or(true) {
            candidate = Some((sid, dir, updated));
        }
    }

    candidate.map(|(sid, dir, _)| (sid, dir))
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
    if cfg.pointer("/telegram/allowedUserId").is_none() {
        cfg["telegram"]["allowedUserId"] = Value::String(String::new());
    }
    if cfg.pointer("/telegram/targetFolder").is_none() {
        cfg["telegram"]["targetFolder"] = Value::String(String::new());
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
    let final_tok = if new_tok.contains('•') || (new_tok.is_empty() && !cur_tok.is_empty()) {
        cur_tok.to_string()
    } else {
        new_tok.to_string()
    };

    let allowed_user_id = body
        .pointer("/telegram/allowedUserId")
        .and_then(|v| v.as_str())
        .or_else(|| {
            current
                .pointer("/telegram/allowedUserId")
                .and_then(|v| v.as_str())
        })
        .unwrap_or("")
        .to_string();

    let target_folder = body
        .pointer("/telegram/targetFolder")
        .and_then(|v| v.as_str())
        .or_else(|| {
            current
                .pointer("/telegram/targetFolder")
                .and_then(|v| v.as_str())
        })
        .unwrap_or("")
        .to_string();

    let next = json!({
        "telegram": {
            "enabled": body.pointer("/telegram/enabled").and_then(|v| v.as_bool()).unwrap_or(false),
            "botToken": final_tok,
            "allowedUserId": allowed_user_id,
            "targetFolder": target_folder,
            "allowedChatIds": body.pointer("/telegram/allowedChatIds").and_then(|v| v.as_array()).cloned().unwrap_or_default()
        },
        "whatsapp": {
            "enabled": body.pointer("/whatsapp/enabled").and_then(|v| v.as_bool()).unwrap_or(false),
            "phoneNumber": body.pointer("/whatsapp/phoneNumber").and_then(|v| v.as_str()).unwrap_or(""),
            "allowedSenders": body.pointer("/whatsapp/allowedSenders").and_then(|v| v.as_array()).cloned().unwrap_or_default()
        }
    });
    write_config(&next);
    telegram::start_telegram_worker();

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

    let st = telegram::TG_STATE
        .get_or_init(|| Mutex::new(telegram::TelegramRuntimeState::default()))
        .lock()
        .ok()
        .map(|g| g.clone())
        .unwrap_or_default();

    Json(json!({
        "telegram": {
            "enabled": tg_enabled,
            "running": st.connected || (tg_enabled && !tg_token.is_empty()),
            "connected": st.connected,
            "botUsername": st.bot_username,
            "botFirstName": st.bot_first_name,
            "lastActive": st.last_active,
            "lastError": st.last_error,
            "error": st.last_error,
            "lastMessageAt": st.last_active
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

async fn handle_test_body(Json(body): Json<Value>) -> Response {
    let cfg = read_config();
    let saved_tok = cfg
        .pointer("/telegram/botToken")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let body_tok = body
        .get("botToken")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let tok = if body_tok.is_empty() || body_tok.contains('•') {
        saved_tok
    } else {
        body_tok
    };
    telegram::verify_telegram_token(tok).await
}

async fn handle_test_platform(
    AxumPath(platform): AxumPath<String>,
    body_bytes: axum::body::Bytes,
) -> Response {
    if platform == "telegram" {
        let body: Value = serde_json::from_slice(&body_bytes).unwrap_or_else(|_| json!({}));
        return handle_test_body(Json(body)).await;
    }
    Json(json!({ "ok": true, "success": true })).into_response()
}

async fn handle_set_active(body_bytes: axum::body::Bytes) -> Response {
    let body: Value = serde_json::from_slice(&body_bytes).unwrap_or_else(|_| json!({}));
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
