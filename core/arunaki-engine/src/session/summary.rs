//! Session summary module — mirrors `packages/engine/engine/src/session/summary.ts`.
//! Handles session summarization, diff tracking, and title generation.

use axum::{
    extract::Path as AxumPath,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Value};

use crate::bridge::LOCAL_CLI_BRIDGE_PORT;
use crate::paths::{gen_id, now_ms};
use crate::provider::config::read_arunaki_config;
use crate::session::message::emit_event;
use crate::session::session::{save_store, with_store};

pub async fn handle_summarize(
    AxumPath(sid): AxumPath<String>,
    Json(body): Json<Value>,
) -> Response {
    let messages = with_store(|s| s.messages.get(&sid).cloned().unwrap_or_default());
    if messages.is_empty() {
        return Json(json!({
            "ok": true,
            "message": "No messages in session to summarize",
            "summary": "No conversation history available to summarize."
        }))
        .into_response();
    }

    // Format conversation history for summarizer
    let mut history_text = String::new();
    for msg in &messages {
        let role = msg.get("role").and_then(|v| v.as_str()).unwrap_or("user");
        let text = msg
            .get("text")
            .or_else(|| msg.get("content"))
            .and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s.to_string())
                } else if let Some(arr) = v.as_array() {
                    let mut parts = Vec::new();
                    for part in arr {
                        if let Some(t) = part.get("text").and_then(|t| t.as_str()) {
                            parts.push(t);
                        }
                    }
                    Some(parts.join(" "))
                } else {
                    None
                }
            })
            .unwrap_or_default();

        if !text.trim().is_empty() {
            history_text.push_str(&format!("{}: {}\n\n", role.to_uppercase(), text.trim()));
        }
    }

    let provider_id = body
        .get("providerID")
        .or_else(|| body.get("provider_id"))
        .and_then(|v| v.as_str())
        .unwrap_or("default");

    let model_id = body
        .get("modelID")
        .or_else(|| body.get("model_id"))
        .and_then(|v| v.as_str())
        .unwrap_or("gemini-2.5-flash");

    let cfg = read_arunaki_config();
    let base_url = cfg
        .pointer(&format!("/provider/{}/options/baseURL", provider_id))
        .or_else(|| cfg.pointer(&format!("/provider/{}/api", provider_id)))
        .and_then(|v| v.as_str())
        .map(|s| s.trim_end_matches('/').to_string())
        .unwrap_or_else(|| format!("http://127.0.0.1:{}/v1", LOCAL_CLI_BRIDGE_PORT));

    let api_key = cfg
        .pointer(&format!("/provider/{}/options/apiKey", provider_id))
        .and_then(|v| v.as_str())
        .unwrap_or("local-cli-bridge");

    let system_prompt = concat!(
        include_str!("prompt/summary.txt"),
        "\n\nFormat your summary clearly in 2-4 bullet points highlighting the documents affected, calculations made, and current status. Use the same language as the conversation."
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap_or_default();

    let req_body = json!({
        "model": model_id,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": format!("Here is the conversation history to summarize:\n\n{}", history_text) }
        ],
        "temperature": 0.2
    });

    let resp = client
        .post(format!("{}/chat/completions", base_url))
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&req_body)
        .send()
        .await;

    let summary_text = match resp {
        Ok(r) if r.status().is_success() => {
            let data: Value = r.json().await.unwrap_or_default();
            data.pointer("/choices/0/message/content")
                .and_then(|v| v.as_str())
                .unwrap_or("Conversation summarized.")
                .trim()
                .to_string()
        }
        _ => "Session summary recorded: previous document operations and context have been compacted.".to_string(),
    };

    let summary_msg_id = gen_id("msg");
    let now = now_ms();
    let summary_msg = json!({
        "id": summary_msg_id,
        "sessionID": sid,
        "role": "assistant",
        "type": "compaction",
        "summary": true,
        "info": {
            "summary": true,
            "compacted": true
        },
        "text": format!("**Conversation Summary (Compacted Memory):**\n\n{}", summary_text),
        "content": [
            {
                "type": "text",
                "text": format!("**Conversation Summary (Compacted Memory):**\n\n{}", summary_text)
            }
        ],
        "time": {
            "created": now,
            "completed": now
        }
    });

    // Compact message history in store
    let (compacted_count, directory) = with_store(|s| {
        let dir = s.sessions.get(&sid)
            .and_then(|sess| sess.get("directory").or_else(|| sess.get("workspacePath")))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let mut count = 0;
        if let Some(list) = s.messages.get_mut(&sid) {
            let total_orig = list.len();
            if total_orig > 3 {
                let first_user = list.first().cloned();
                let last_messages: Vec<Value> = list.iter().rev().take(2).cloned().collect();
                let mut new_list = Vec::new();
                if let Some(fu) = first_user {
                    new_list.push(fu);
                }
                new_list.push(summary_msg.clone());
                for lm in last_messages.into_iter().rev() {
                    new_list.push(lm);
                }
                *list = new_list;
            } else {
                list.push(summary_msg.clone());
            }
            count = list.len();
        }
        if count > 0 {
            save_store(s);
        }
        (count, dir)
    });

    emit_event(&directory, "session.compacted", json!({
        "sessionID": sid,
        "summary": summary_text,
        "message": summary_msg
    }));

    Json(json!({
        "ok": true,
        "summary": summary_text,
        "compacted": true,
        "remainingMessages": compacted_count
    }))
    .into_response()
}
