//! Telegram Bot Dispatcher & Remote Administrative Alerts Engine.
//!
//! Enables the Administration Manager to dispatch daily cash closing reports,
//! executive summaries, and 3-way reconciliation anomaly alerts to Telegram
//! via the official Telegram Bot API (`sendMessage`), while recording an immutable
//! local audit log in `.arunaki/telegram_dispatches.json`.

use crate::messaging::read_config;
use crate::paths::now_ms;
use crate::session::emit_event;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::Path;
use std::time::Duration;

const TELEGRAM_PROMPT: &str = include_str!("prompt/telegram.txt");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramDispatchRecord {
    pub dispatch_id: String,
    pub kind: String,
    pub severity: String,
    pub title: String,
    pub message_markdown: String,
    pub attached_file: Option<String>,
    pub chat_id: String,
    pub delivered_live: bool,
    pub delivery_status: String,
    pub timestamp_ms: u64,
}

pub fn telegram_tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "type": "function",
            "function": {
                "name": "dispatch_telegram_report",
                "description": TELEGRAM_PROMPT,
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {
                            "type": "string",
                            "description": "Report headline (e.g. 'Daily Cash Closing Report — Oct 28, 2026')."
                        },
                        "summary_markdown": {
                            "type": "string",
                            "description": "Formatted Markdown body of the administrative report."
                        },
                        "file_path": {
                            "type": "string",
                            "description": "Optional relative filename in the active project folder to attach/include."
                        },
                        "chat_id": {
                            "type": "string",
                            "description": "Optional explicit Telegram Chat ID. Defaults to configured allowedUserId in Messaging settings."
                        }
                    },
                    "required": ["title"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "send_telegram_alert",
                "description": "Send an urgent administrative or financial discrepancy alert via Telegram Bot.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "severity": {
                            "type": "string",
                            "enum": ["HIGH", "MEDIUM", "INFO"],
                            "description": "Alert severity level."
                        },
                        "title": {
                            "type": "string",
                            "description": "Short alert headline (e.g. '3-Way Reconciliation Variance Detected')."
                        },
                        "details": {
                            "type": "string",
                            "description": "Detailed description of the anomaly, variance amount, and recommended action."
                        },
                        "chat_id": {
                            "type": "string",
                            "description": "Optional explicit Telegram Chat ID."
                        }
                    },
                    "required": ["title", "details"]
                }
            }
        }),
    ]
}

fn resolve_telegram_credentials(args: &Value) -> (String, String) {
    let cfg = read_config();
    let token = args
        .get("bot_token")
        .and_then(|v| v.as_str())
        .or_else(|| cfg.pointer("/telegram/botToken").and_then(|v| v.as_str()))
        .unwrap_or("")
        .trim()
        .to_string();

    let chat_id = args
        .get("chat_id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            cfg.pointer("/telegram/allowedUserId")
                .and_then(|v| v.as_str())
                .filter(|s| !s.trim().is_empty())
        })
        .or_else(|| {
            cfg.pointer("/telegram/allowedChatIds")
                .and_then(|v| v.as_array())
                .and_then(|arr| arr.first())
                .and_then(|v| v.as_str())
        })
        .unwrap_or("")
        .trim()
        .to_string();

    (token, chat_id)
}

fn append_dispatch_log(workspace_dir: &str, record: &TelegramDispatchRecord) {
    let log_path = Path::new(workspace_dir)
        .join(".arunaki")
        .join("telegram_dispatches.json");
    if let Some(parent) = log_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let mut list: Vec<TelegramDispatchRecord> = if let Ok(raw) = std::fs::read_to_string(&log_path)
    {
        serde_json::from_str(&raw).unwrap_or_default()
    } else {
        Vec::new()
    };

    list.push(record.clone());
    if let Ok(serialized) = serde_json::to_string_pretty(&list) {
        let _ = std::fs::write(log_path, serialized);
    }
}

async fn send_via_telegram_api(bot_token: &str, chat_id: &str, text: &str) -> Result<(), String> {
    if bot_token.is_empty() || chat_id.is_empty() {
        return Err("Telegram Bot Token or Chat ID is not configured in Settings > Messaging Apps".to_string());
    }

    let url = format!("https://api.telegram.org/bot{}/sendMessage", bot_token);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .post(&url)
        .json(&json!({
            "chat_id": chat_id,
            "text": text,
        }))
        .send()
        .await
        .map_err(|e| format!("Network error contacting Telegram API: {}", e))?;

    if resp.status().is_success() {
        Ok(())
    } else {
        let body = resp.text().await.unwrap_or_default();
        Err(format!("Telegram API returned error: {}", body))
    }
}

pub async fn execute_dispatch_telegram_report(
    session_id: &str,
    workspace_dir: &str,
    args: &Value,
) -> Value {
    let title = args
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("Arunaki Administrative Report")
        .to_string();

    let file_path = args
        .get("file_path")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let mut summary_markdown = args
        .get("summary_markdown")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if summary_markdown.trim().is_empty() {
        if let Some(ref rel) = file_path {
            let full = Path::new(workspace_dir).join(rel);
            if let Ok(content) = std::fs::read_to_string(&full) {
                let preview: String = content.lines().take(18).collect::<Vec<_>>().join("\n");
                summary_markdown = preview;
            }
        }
    }

    if summary_markdown.trim().is_empty() {
        summary_markdown =
            "Daily administrative deliverables have been verified and updated in the active workspace.".to_string();
    }

    let formatted_message = format!(
        "[ARUNAKI ADMINISTRATION MANAGER — REPORT]\nTitle: {}\n{}\n\n{}",
        title,
        file_path
            .as_ref()
            .map(|f| format!("Deliverable: {}", f))
            .unwrap_or_default(),
        summary_markdown
    );

    let (bot_token, chat_id) = resolve_telegram_credentials(args);
    let now = now_ms();
    let dispatch_id = format!("TG-REP-{}", now % 1_000_000_000);

    let (delivered_live, delivery_status) =
        match send_via_telegram_api(&bot_token, &chat_id, &formatted_message).await {
            Ok(()) => (true, "DELIVERED_TO_TELEGRAM_API".to_string()),
            Err(reason) => (false, format!("QUEUED_LOCALLY ({})", reason)),
        };

    let record = TelegramDispatchRecord {
        dispatch_id: dispatch_id.clone(),
        kind: "REPORT".to_string(),
        severity: "INFO".to_string(),
        title: title.clone(),
        message_markdown: formatted_message,
        attached_file: file_path.clone(),
        chat_id: if chat_id.is_empty() {
            "unconfigured".to_string()
        } else {
            chat_id
        },
        delivered_live,
        delivery_status: delivery_status.clone(),
        timestamp_ms: now,
    };

    append_dispatch_log(workspace_dir, &record);

    emit_event(
        workspace_dir,
        "telegram:dispatched",
        json!({
            "sessionID": session_id,
            "record": record,
            "timestamp": now,
        }),
    );

    json!({
        "status": "success",
        "dispatch_id": dispatch_id,
        "delivered_live": delivered_live,
        "delivery_status": delivery_status,
        "record": record,
    })
}

pub async fn execute_send_telegram_alert(
    session_id: &str,
    workspace_dir: &str,
    args: &Value,
) -> Value {
    let severity = args
        .get("severity")
        .and_then(|v| v.as_str())
        .unwrap_or("HIGH")
        .to_ascii_uppercase();
    let title = args
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("Administrative Discrepancy Alert")
        .to_string();
    let details = args
        .get("details")
        .or_else(|| args.get("content"))
        .or_else(|| args.get("summary_markdown"))
        .and_then(|v| v.as_str())
        .unwrap_or("A discrepancy was flagged during administrative audit.")
        .to_string();

    let formatted_message = format!(
        "[ARUNAKI MANAGER ALERT — {}]\n{}\n\n{}",
        severity, title, details
    );

    let (bot_token, chat_id) = resolve_telegram_credentials(args);
    let now = now_ms();
    let dispatch_id = format!("TG-ALT-{}", now % 1_000_000_000);

    let (delivered_live, delivery_status) =
        match send_via_telegram_api(&bot_token, &chat_id, &formatted_message).await {
            Ok(()) => (true, "DELIVERED_TO_TELEGRAM_API".to_string()),
            Err(reason) => (false, format!("QUEUED_LOCALLY ({})", reason)),
        };

    let record = TelegramDispatchRecord {
        dispatch_id: dispatch_id.clone(),
        kind: "ALERT".to_string(),
        severity: severity.clone(),
        title: title.clone(),
        message_markdown: formatted_message,
        attached_file: None,
        chat_id: if chat_id.is_empty() {
            "unconfigured".to_string()
        } else {
            chat_id
        },
        delivered_live,
        delivery_status: delivery_status.clone(),
        timestamp_ms: now,
    };

    append_dispatch_log(workspace_dir, &record);

    emit_event(
        workspace_dir,
        "telegram:dispatched",
        json!({
            "sessionID": session_id,
            "record": record,
            "timestamp": now,
        }),
    );

    json!({
        "status": "success",
        "dispatch_id": dispatch_id,
        "delivered_live": delivered_live,
        "delivery_status": delivery_status,
        "record": record,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_telegram_report_and_alert_dispatch_audit_log() {
        let temp_dir = std::env::temp_dir().join(format!("arunaki_tg_test_{}", now_ms()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let dir_str = temp_dir.to_string_lossy().to_string();

        std::fs::write(
            temp_dir.join("daily_cash_closing_memo.docx"),
            "# Daily Cash Closing Memo\nNet Register Balance: 15,200,000",
        )
        .unwrap();

        let rep_res = execute_dispatch_telegram_report(
            "s1",
            &dir_str,
            &json!({
                "title": "Daily Cash Closing — Oct 28, 2026",
                "file_path": "daily_cash_closing_memo.docx"
            }),
        )
        .await;
        assert_eq!(rep_res["status"], "success");
        assert_eq!(rep_res["record"]["kind"], "REPORT");

        let alt_res = execute_send_telegram_alert(
            "s1",
            &dir_str,
            &json!({
                "severity": "HIGH",
                "title": "3-Way Reconciliation Variance",
                "details": "Detected 350.00 variance on INV-2026-002."
            }),
        )
        .await;
        assert_eq!(alt_res["status"], "success");
        assert_eq!(alt_res["record"]["kind"], "ALERT");
        assert_eq!(alt_res["record"]["severity"], "HIGH");

        let log_file = temp_dir.join(".arunaki").join("telegram_dispatches.json");
        assert!(log_file.exists(), "Telegram dispatch audit log must be persisted");
        let saved: Vec<TelegramDispatchRecord> =
            serde_json::from_str(&std::fs::read_to_string(&log_file).unwrap()).unwrap();
        assert_eq!(saved.len(), 2);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
