//! Session Prompt HTTP Handlers & Synchronous Dispatcher.
//!
//! Exposes Axum HTTP routes for prompt submission, session title updating,
//! and background task dispatch. Re-exports core runner submodules.

pub use super::agent_turn::run_agent_turn;
pub use super::model::{default_model_ref, handle_abort, handle_switch_model};
pub use super::title::{derive_session_title, is_emoji_char};

use crate::files::urlencoding_decode;
use crate::paths::{gen_id, normalize_workspace_path, now_ms};
use crate::session::message::emit_event;
use crate::session::session::{save_store, with_store};
use axum::{
    extract::Path as AxumPath,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Value};
use std::collections::HashMap;

/// Axum HTTP handler for `/api/session/:id/prompt`.
/// Records the user prompt into store, derives session title on first turn,
/// and dispatches the autonomous agent turn in the background.
pub async fn handle_prompt(
    AxumPath(session_id): AxumPath<String>,
    q: HashMap<String, String>,
    headers: HeaderMap,
    body: Value,
) -> Response {
    let raw_dir = q
        .get("directory")
        .map(|s| s.to_string())
        .or_else(|| {
            headers
                .get("x-arunaki-directory")
                .and_then(|h| h.to_str().ok())
                .map(|s| s.to_string())
        })
        .unwrap_or_default();
    let workspace_dir = normalize_workspace_path(&urlencoding_decode(&raw_dir));

    let prompt_text = body
        .get("prompt")
        .and_then(|p| p.get("text").or(Some(p)))
        .and_then(|v| v.as_str())
        .or_else(|| body.get("text").and_then(|v| v.as_str()))
        .unwrap_or("")
        .to_string();

    let files_val = body
        .get("prompt")
        .and_then(|p| p.get("files"))
        .or_else(|| body.get("files"))
        .cloned();

    let session_val = with_store(|store| store.sessions.get(&session_id).cloned());
    let Some(session) = session_val else {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Session not found" })),
        )
            .into_response();
    };

    let model_val = session.get("model").cloned().unwrap_or_else(default_model_ref);
    let provider_id = model_val
        .get("providerID")
        .and_then(|v| v.as_str())
        .unwrap_or("local-cli")
        .to_string();
    let model_id = model_val
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("kiro/auto")
        .to_string();

    let user_msg_id = gen_id("msg");
    let created_ms = now_ms();
    let mut user_msg = json!({
        "id": user_msg_id,
        "type": "user",
        "role": "user",
        "agent": "default",
        "model": {
            "providerID": provider_id,
            "id": model_id
        },
        "text": prompt_text,
        "content": [{ "type": "text", "text": prompt_text }],
        "time": { "created": created_ms }
    });
    if let Some(ref f) = files_val {
        user_msg["files"] = f.clone();
    }

    let mut updated_title: Option<String> = None;
    let history = with_store(|store| {
        if let Some(sess) = store.sessions.get_mut(&session_id) {
            let current_title = sess.get("title").and_then(|v| v.as_str()).unwrap_or("");
            if current_title.is_empty()
                || current_title.eq_ignore_ascii_case("New Session")
                || current_title.eq_ignore_ascii_case("Chat")
                || current_title.starts_with("New session -")
                || current_title.starts_with("New Session -")
            {
                let auto_title = derive_session_title(&prompt_text);
                if auto_title != "New Session" {
                    sess["title"] = json!(&auto_title);
                    sess["time"]["updated"] = json!(created_ms);
                    updated_title = Some(auto_title);
                }
            }
        }
        let msgs = store.messages.entry(session_id.clone()).or_default();
        let hist = msgs.clone();
        msgs.push(user_msg.clone());
        save_store(store);
        hist
    });

    if let Some(ref title) = updated_title {
        emit_event(
            &workspace_dir,
            "session.updated",
            json!({
                "sessionID": session_id,
                "title": title
            }),
        );
    }

    emit_event(
        &workspace_dir,
        "session.prompt.started",
        json!({
            "sessionID": session_id,
            "messageID": user_msg_id,
            "prompt": prompt_text
        }),
    );

    let sid_c = session_id.clone();
    let ws_c = workspace_dir.clone();
    let pid_c = provider_id.clone();
    let mid_c = model_id.clone();
    let ptxt_c = prompt_text.clone();

    let p_preview: String = if prompt_text.chars().count() > 60 {
        format!("{}...", prompt_text.chars().take(60).collect::<String>())
    } else {
        prompt_text.clone()
    };
    crate::paths::log_engine(
        "chat",
        &format!("📥 User prompt [{}]: \"{}\"", session_id, p_preview),
    );
    crate::paths::log_engine(
        "chat",
        &format!("🎯 Routing request to Model: '{}' (Provider: '{}')", model_id, provider_id),
    );

    let files_c = files_val.clone();
    tokio::spawn(async move {
        run_agent_turn(
            &sid_c,
            &ws_c,
            &pid_c,
            &mid_c,
            &history,
            &ptxt_c,
            files_c.as_ref(),
        )
        .await;
    });

    Json(json!({
        "data": {
            "id": user_msg_id,
            "sessionID": session_id,
            "prompt": {
                "text": prompt_text,
                "files": [],
                "agents": []
            },
            "delivery": "interrupt",
            "timeCreated": created_ms
        }
    }))
    .into_response()
}

/// Synchronous runner for headless or CLI bridge execution.
/// Awaits completion and returns the final assistant text.
pub async fn run_session_prompt_sync(
    session_id: &str,
    workspace_dir: &str,
    prompt_text: &str,
    user_tag: Option<&str>,
) -> String {
    let dir = normalize_workspace_path(workspace_dir);
    let model_ref = default_model_ref();
    let provider_id = model_ref
        .get("providerID")
        .and_then(|v| v.as_str())
        .unwrap_or("antigravity")
        .to_string();
    let model_id = model_ref
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("gemini-3.8-flash-low")
        .to_string();

    let user_msg_id = gen_id("msg");
    let created_ms = now_ms();
    let display_prompt = if let Some(tag) = user_tag {
        format!("{}: {}", tag, prompt_text)
    } else {
        prompt_text.to_string()
    };

    let user_msg = json!({
        "id": user_msg_id,
        "type": "user",
        "role": "user",
        "agent": "default",
        "model": {
            "providerID": provider_id,
            "id": model_id
        },
        "text": display_prompt,
        "content": [{ "type": "text", "text": display_prompt }],
        "time": { "created": created_ms }
    });

    let full_prompt = prompt_text.to_string();

    // 1. Record user message in store and retrieve history
    let history = with_store(|store| {
        // Ensure session exists in store.sessions so it appears in sidebar history
        if !store.sessions.contains_key(session_id) {
            let p_preview: String = if prompt_text.chars().count() > 40 {
                format!("{}...", prompt_text.chars().take(40).collect::<String>())
            } else {
                prompt_text.to_string()
            };
            let title = if let Some(tag) = user_tag {
                format!("{}: {}", tag, p_preview)
            } else {
                p_preview
            };
            store.sessions.insert(
                session_id.to_string(),
                json!({
                    "id": session_id,
                    "title": title,
                    "model": {
                        "providerID": provider_id,
                        "id": model_id
                    },
                    "time": {
                        "created": created_ms,
                        "updated": created_ms
                    }
                }),
            );
        }

        let msgs = store.messages.entry(session_id.to_string()).or_default();
        let hist = msgs.clone();
        msgs.push(user_msg);
        save_store(store);
        hist
    });

    // 2. Emit UI events so desktop workstation updates in real-time
    emit_event(
        &dir,
        "session.prompt.started",
        json!({
            "sessionID": session_id,
            "messageID": user_msg_id,
            "prompt": full_prompt
        }),
    );

    // 3. Execute agent turn
    run_agent_turn(
        session_id,
        &dir,
        &provider_id,
        &model_id,
        &history,
        &full_prompt,
        None,
    )
    .await;

    // 4. Retrieve final response text
    with_store(|store| {
        store
            .messages
            .get(session_id)
            .and_then(|msgs| msgs.last())
            .and_then(|last| last.get("content"))
            .and_then(|c| c.as_array())
            .and_then(|arr| {
                arr.iter()
                    .find_map(|p| p.get("text").and_then(|t| t.as_str()))
            })
            .unwrap_or("Done.")
            .to_string()
    })
}

/// Executes a direct prompt without persistent user session history.
pub async fn run_direct_prompt(workspace_dir: &str, prompt_text: &str) -> String {
    let session_id = format!("ses_tg_{}", now_ms());
    run_session_prompt_sync(&session_id, workspace_dir, prompt_text, None).await
}
