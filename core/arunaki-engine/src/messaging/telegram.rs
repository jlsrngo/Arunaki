use super::{get_active_session_folder, read_config};
use crate::files::collect_files_recursive;
use crate::paths::now_iso;
use crate::session::run_direct_prompt;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex, OnceLock,
};

#[derive(Debug, Clone, Default)]
pub struct TelegramRuntimeState {
    pub connected: bool,
    pub bot_username: Option<String>,
    pub bot_first_name: Option<String>,
    pub last_active: Option<String>,
    pub last_error: Option<String>,
}

pub static TG_STATE: OnceLock<Mutex<TelegramRuntimeState>> = OnceLock::new();
pub static TG_GENERATION: AtomicU64 = AtomicU64::new(0);

pub async fn verify_telegram_token(tok: &str) -> Response {
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

pub async fn handle_telegram_message(client: &reqwest::Client, token: &str, msg: &Value) {
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

        // Cache the verified sender's numeric chat ID for outgoing alerts & reminders
        let mut cfg_mut = cfg.clone();
        cfg_mut["telegram"]["activeChatId"] = json!(chat_id.to_string());
        super::write_config(&cfg_mut);
    }

    let target_dir = cfg
        .pointer("/telegram/targetFolder")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.to_string())
        .or_else(|| get_active_session_folder())
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
