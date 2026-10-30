//! Modular session statistics & batch empty-session cleanup for the History view.
//!
//! Computes conversational `messageCount` and normalized `lastMessagePreview` in a single
//! pass on the Rust engine side, eliminating N+1 HTTP pagination loops in the React UI.

use crate::session::{save_store, with_store};
use axum::{
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Value};

/// Returns `true` if a stored message represents a real user/assistant conversational turn
/// rather than internal telemetry (`system`, `compaction`, `model-switched`, `plan`, or `summary`).
pub fn is_conversational_message(msg: &Value) -> bool {
    let msg_type = msg.get("type").and_then(|v| v.as_str()).unwrap_or("");
    if matches!(
        msg_type,
        "system" | "compaction" | "model-switched" | "plan"
    ) {
        return false;
    }

    if msg.get("agent").and_then(|v| v.as_str()) == Some("compaction") {
        return false;
    }

    if msg.get("summary").and_then(|v| v.as_bool()) == Some(true) {
        return false;
    }

    if msg
        .pointer("/info/summary")
        .and_then(|v| v.as_bool())
        == Some(true)
    {
        return false;
    }

    true
}

/// Extracts plain text from a single message object (`content` string, `text` string, or `content` parts array).
pub fn extract_message_text(msg: &Value) -> Option<String> {
    if let Some(s) = msg.get("content").and_then(|v| v.as_str()) {
        let trimmed = s.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    if let Some(s) = msg.get("text").and_then(|v| v.as_str()) {
        let trimmed = s.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    if let Some(arr) = msg.get("content").and_then(|v| v.as_array()) {
        for part in arr {
            let part_type = part.get("type").and_then(|v| v.as_str()).unwrap_or("text");
            if part_type == "text" || part_type.is_empty() {
                if let Some(t) = part.get("text").and_then(|v| v.as_str()) {
                    let trimmed = t.trim();
                    if !trimmed.is_empty() {
                        return Some(trimmed.to_string());
                    }
                }
            }
        }
    }

    None
}

/// Normalizes whitespace and truncates a preview snippet to at most `max_chars` characters.
pub fn normalize_preview(raw: &str, max_chars: usize) -> String {
    let collapsed = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed.chars().take(max_chars).collect()
}

/// Computes `(message_count, last_message_preview)` for a session's message slice.
pub fn compute_session_stats(messages: Option<&Vec<Value>>) -> (usize, String) {
    let Some(msgs) = messages else {
        return (0, String::new());
    };
    if msgs.is_empty() {
        return (0, String::new());
    }

    let chat_msgs: Vec<&Value> = msgs
        .iter()
        .filter(|m| is_conversational_message(m))
        .collect();

    let count = if !chat_msgs.is_empty() {
        chat_msgs.len()
    } else {
        0
    };

    // Walk from newest to oldest conversational message (or fallback to raw messages)
    let preview = chat_msgs
        .iter()
        .rev()
        .find_map(|m| extract_message_text(m))
        .or_else(|| msgs.iter().rev().find_map(extract_message_text))
        .map(|s| normalize_preview(&s, 95))
        .unwrap_or_default();

    (count, preview)
}

/// `POST /api/session/cleanup-empty` — Atomically deletes all sessions that have 0 conversational messages.
pub async fn handle_cleanup_empty() -> Response {
    let (deleted_ids, deleted_count) = with_store(|store| {
        let empty_ids: Vec<String> = store
            .sessions
            .keys()
            .filter(|sid| {
                let (count, _) = compute_session_stats(store.messages.get(*sid));
                count == 0
            })
            .cloned()
            .collect();

        let count = empty_ids.len();
        if count > 0 {
            for id in &empty_ids {
                store.sessions.remove(id);
                store.messages.remove(id);
            }
            save_store(store);
        }
        (empty_ids, count)
    });

    Json(json!({
        "ok": true,
        "deletedCount": deleted_count,
        "deletedIds": deleted_ids,
    }))
    .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn filters_non_conversational_messages() {
        assert!(!is_conversational_message(&json!({ "type": "system", "text": "init" })));
        assert!(!is_conversational_message(&json!({ "type": "compaction", "text": "compact" })));
        assert!(!is_conversational_message(&json!({ "agent": "compaction", "text": "compact" })));
        assert!(!is_conversational_message(&json!({ "summary": true, "text": "sum" })));
        assert!(is_conversational_message(&json!({ "role": "user", "text": "Halo Arunaki" })));
    }

    #[test]
    fn computes_stats_and_normalizes_preview() {
        let msgs = vec![
            json!({ "type": "system", "text": "System prompt" }),
            json!({ "role": "user", "content": "  Rekap   laporan\n\nharian   ke excel  " }),
            json!({
                "role": "assistant",
                "content": [
                    { "type": "tool_use", "name": "read_file" },
                    { "type": "text", "text": "Baik,   saya sudah\nmembuka file laporan.xlsx" }
                ]
            }),
        ];

        let (count, preview) = compute_session_stats(Some(&msgs));
        assert_eq!(count, 2);
        assert_eq!(preview, "Baik, saya sudah membuka file laporan.xlsx");
    }

    #[test]
    fn empty_when_only_system_messages_exist() {
        let msgs = vec![json!({ "type": "system", "text": "boot" })];
        let (count, _) = compute_session_stats(Some(&msgs));
        assert_eq!(count, 0);
    }
}

