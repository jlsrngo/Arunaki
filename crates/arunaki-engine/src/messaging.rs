use crate::files::collect_files_recursive;
use crate::paths::{arunaki_data_dir, now_iso};
use crate::sessions::run_direct_prompt;
use axum::{
    extract::Path as AxumPath,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex, OnceLock,
};

#[derive(Debug, Clone, Default)]
struct TelegramRuntimeState {
    connected: bool,
    bot_username: Option<String>,
    bot_first_name: Option<String>,
    last_active: Option<String>,
    last_error: Option<String>,
}

static ACTIVE_SESSION: OnceLock<Mutex<Option<Value>>> = OnceLock::new();
static TG_STATE: OnceLock<Mutex<TelegramRuntimeState>> = OnceLock::new();
static TG_GENERATION: AtomicU64 = AtomicU64::new(0);

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
    start_telegram_worker();

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

    let st = TG_STATE
        .get_or_init(|| Mutex::new(TelegramRuntimeState::default()))
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
    verify_telegram_token(tok).await
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

async fn verify_telegram_token(tok: &str) -> Response {
    if tok.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "ok": false,
                "success": false,
                "error": "Bot token is empty"
            })),
        )
            .into_response();
    }
    let url = format!("https://api.telegram.org/bot{}/getMe", tok.trim());
    if let Ok(r) = reqwest::get(&url).await {
        if let Ok(data) = r.json::<Value>().await {
            if data.get("ok").and_then(|v| v.as_bool()) == Some(true) {
                let uname = data
                    .pointer("/result/username")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let fname = data
                    .pointer("/result/first_name")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                if let Ok(mut guard) = TG_STATE
                    .get_or_init(|| Mutex::new(TelegramRuntimeState::default()))
                    .lock()
                {
                    guard.connected = true;
                    guard.bot_username = uname.clone();
                    guard.bot_first_name = fname.clone();
                    guard.last_error = None;
                }
                return Json(json!({
                    "ok": true,
                    "success": true,
                    "botUsername": uname,
                    "botFirstName": fname
                }))
                .into_response();
            }
        }
    }
    Json(json!({
        "ok": false,
        "success": false,
        "error": "Invalid Telegram bot token"
    }))
    .into_response()
}

pub fn start_telegram_worker() {
    let gen = TG_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let cfg = read_config();
    let enabled = cfg
        .pointer("/telegram/enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let token = cfg
        .pointer("/telegram/botToken")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    if !enabled || token.is_empty() {
        if let Ok(mut guard) = TG_STATE
            .get_or_init(|| Mutex::new(TelegramRuntimeState::default()))
            .lock()
        {
            guard.connected = false;
        }
        return;
    }

    tokio::spawn(async move {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(35))
            .build()
            .unwrap_or_default();

        // Check getMe once at startup
        let me_url = format!("https://api.telegram.org/bot{}/getMe", token);
        if let Ok(r) = client.get(&me_url).send().await {
            if let Ok(data) = r.json::<Value>().await {
                if data.get("ok").and_then(|v| v.as_bool()) == Some(true) {
                    if let Ok(mut guard) = TG_STATE
                        .get_or_init(|| Mutex::new(TelegramRuntimeState::default()))
                        .lock()
                    {
                        guard.connected = true;
                        guard.bot_username = data
                            .pointer("/result/username")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                        guard.bot_first_name = data
                            .pointer("/result/first_name")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                        guard.last_error = None;
                    }
                }
            }
        }

        let mut offset: i64 = 0;
        while TG_GENERATION.load(Ordering::SeqCst) == gen {
            let poll_url = format!(
                "https://api.telegram.org/bot{}/getUpdates?offset={}&timeout=25",
                token, offset
            );
            match client.get(&poll_url).send().await {
                Ok(resp) => {
                    if let Ok(data) = resp.json::<Value>().await {
                        if let Some(updates) = data.get("result").and_then(|v| v.as_array()) {
                            for upd in updates {
                                if let Some(uid) = upd.get("update_id").and_then(|v| v.as_i64()) {
                                    offset = uid + 1;
                                }
                                if let Some(msg) = upd.get("message") {
                                    handle_telegram_message(&client, &token, msg).await;
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    if let Ok(mut guard) = TG_STATE
                        .get_or_init(|| Mutex::new(TelegramRuntimeState::default()))
                        .lock()
                    {
                        guard.last_error = Some(e.to_string());
                    }
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                }
            }
        }
    });
}

async fn handle_telegram_message(client: &reqwest::Client, token: &str, msg: &Value) {
    let chat_id = msg
        .pointer("/chat/id")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    if chat_id == 0 {
        return;
    }
    let sender_id = msg
        .pointer("/from/id")
        .and_then(|v| v.as_i64())
        .map(|n| n.to_string())
        .unwrap_or_default();
    let sender_username = msg
        .pointer("/from/username")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let text = msg
        .get("text")
        .or_else(|| msg.get("caption"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if text.is_empty() {
        return;
    }

    let cfg = read_config();
    let allowed = cfg
        .pointer("/telegram/allowedUserId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();

    if !allowed.is_empty() {
        let allowed_clean = allowed.trim_start_matches('@').to_lowercase();
        let matches = sender_id == allowed_clean
            || (!sender_username.is_empty() && sender_username.to_lowercase() == allowed_clean);
        if !matches {
            return;
        }
    }

    let target_dir = cfg
        .pointer("/telegram/targetFolder")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.to_string())
        .or_else(|| {
            ACTIVE_SESSION
                .get_or_init(|| Mutex::new(None))
                .lock()
                .ok()
                .and_then(|g| g.clone())
                .and_then(|v| {
                    v.get("workspacePath")
                        .and_then(|w| w.as_str())
                        .map(|s| s.to_string())
                })
        })
        .unwrap_or_else(|| {
            std::env::current_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .to_string_lossy()
                .to_string()
        });

    if let Ok(mut guard) = TG_STATE
        .get_or_init(|| Mutex::new(TelegramRuntimeState::default()))
        .lock()
    {
        guard.last_active = Some(now_iso());
    }

    let reply_text = match text.as_str() {
        "/start" | "/help" => format!(
            "Arunaki Desktop Document Agent\nActive Folder: {}\n\nCommands:\n/files - List files in folder\n/status - Engine & folder status\nOr send any instruction to process documents.",
            target_dir
        ),
        "/status" => format!(
            "Arunaki Rust Engine Active\nWorkspace: {}",
            target_dir
        ),
        "/files" => {
            let base = Path::new(&target_dir);
            let mut files = Vec::new();
            collect_files_recursive(base, base, &mut files, 50);
            let names: Vec<String> = files
                .into_iter()
                .map(|f| {
                    f.strip_prefix(base)
                        .unwrap_or(&f)
                        .to_string_lossy()
                        .replace('\\', "/")
                })
                .collect();
            if names.is_empty() {
                format!("No files found in {}", target_dir)
            } else {
                format!("Files in {}:\n- {}", target_dir, names.join("\n- "))
            }
        }
        _ => {
            let _ = client
                .post(format!(
                    "https://api.telegram.org/bot{}/sendChatAction",
                    token
                ))
                .json(&json!({ "chat_id": chat_id, "action": "typing" }))
                .send()
                .await;
            run_direct_prompt(&target_dir, &text).await
        }
    };

    let _ = client
        .post(format!(
            "https://api.telegram.org/bot{}/sendMessage",
            token
        ))
        .json(&json!({
            "chat_id": chat_id,
            "text": reply_text
        }))
        .send()
        .await;
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
