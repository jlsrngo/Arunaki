//! Interactive Question module — mirrors `packages/engine/engine/src/question`.
//! Manages pending user prompts/questions asked by tools, broadcasting SSE events,
//! and resolving user replies/rejections.

use axum::{
    extract::Path as AxumPath,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use tokio::sync::oneshot;

use crate::paths::gen_id;
use crate::session::message::emit_event;

pub struct PendingQuestion {
    pub id: String,
    pub session_id: String,
    pub directory: String,
    pub questions: Vec<Value>,
    pub tool: Value,
    pub reply_tx: Option<oneshot::Sender<Option<Vec<Vec<String>>>>>,
}

pub static PENDING_QUESTIONS: OnceLock<Mutex<HashMap<String, PendingQuestion>>> = OnceLock::new();

pub fn router() -> Router {
    Router::new()
        .route("/api/question", get(handle_question_list_all))
        .route("/question", get(handle_question_list_all))
        .route("/api/session/:id/question", get(handle_question_list_session))
        .route("/session/:id/question", get(handle_question_list_session))
        .route(
            "/api/session/:id/question/:reqId/reply",
            post(handle_question_reply_session),
        )
        .route(
            "/session/:id/question/:reqId/reply",
            post(handle_question_reply_session),
        )
        .route(
            "/api/question/:reqId/reply",
            post(handle_question_reply_global),
        )
        .route("/question/:reqId/reply", post(handle_question_reply_global))
        .route(
            "/api/session/:id/question/:reqId/reject",
            post(handle_question_reject_session),
        )
        .route(
            "/session/:id/question/:reqId/reject",
            post(handle_question_reject_session),
        )
        .route(
            "/api/question/:reqId/reject",
            post(handle_question_reject_global),
        )
        .route("/question/:reqId/reject", post(handle_question_reject_global))
}

pub fn resolve_question_reply(req_id: &str, body_opt: Option<&Value>) -> Response {
    let m = PENDING_QUESTIONS.get_or_init(|| Mutex::new(HashMap::new()));
    let removed = m.lock().ok().and_then(|mut g| g.remove(req_id));
    if let Some(mut pq) = removed {
        if let Some(body) = body_opt {
            let answers: Vec<Vec<String>> = body
                .get("answers")
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();
            emit_event(
                &pq.directory,
                "question.v2.replied",
                json!({
                    "sessionID": pq.session_id,
                    "requestID": pq.id,
                    "answers": answers
                }),
            );
            if let Some(tx) = pq.reply_tx.take() {
                let _ = tx.send(Some(answers));
            }
        } else {
            emit_event(
                &pq.directory,
                "question.v2.rejected",
                json!({
                    "sessionID": pq.session_id,
                    "requestID": pq.id
                }),
            );
            if let Some(tx) = pq.reply_tx.take() {
                let _ = tx.send(None);
            }
        }
    }
    Json(json!(true)).into_response()
}

pub async fn ask_question(
    session_id: &str,
    assistant_msg_id: &str,
    call_id: &str,
    questions: Vec<Value>,
    workspace_dir: &str,
) -> Value {
    let req_id = gen_id("req");
    let tool_val = json!({
        "callID": call_id,
        "messageID": assistant_msg_id,
        "sessionID": session_id,
        "name": "question",
        "args": { "questions": questions }
    });

    let (tx, rx) = oneshot::channel();
    {
        let m = PENDING_QUESTIONS.get_or_init(|| Mutex::new(HashMap::new()));
        if let Ok(mut g) = m.lock() {
            g.insert(
                req_id.clone(),
                PendingQuestion {
                    id: req_id.clone(),
                    session_id: session_id.to_string(),
                    directory: workspace_dir.to_string(),
                    questions: questions.clone(),
                    tool: tool_val.clone(),
                    reply_tx: Some(tx),
                },
            );
        }
    }

    emit_event(
        workspace_dir,
        "question.v2.asked",
        json!({
            "id": req_id,
            "sessionID": session_id,
            "questions": questions,
            "tool": tool_val
        }),
    );

    // Wait for user answer up to 10 minutes
    let ans = tokio::time::timeout(std::time::Duration::from_secs(600), rx).await;
    match ans {
        Ok(Ok(Some(answers))) => json!({ "answers": answers }),
        Ok(Ok(None)) => {
            json!({ "rejected": true, "message": "User declined or cancelled question." })
        }
        _ => json!({ "timed_out": true, "message": "User question timed out." }),
    }
}

async fn handle_question_list_all() -> Response {
    let m = PENDING_QUESTIONS.get_or_init(|| Mutex::new(HashMap::new()));
    let list: Vec<Value> = m
        .lock()
        .map(|g| {
            g.values()
                .map(|pq| {
                    json!({
                        "id": pq.id,
                        "sessionID": pq.session_id,
                        "questions": pq.questions,
                        "tool": pq.tool
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    Json(json!({ "data": list })).into_response()
}

async fn handle_question_list_session(AxumPath(sid): AxumPath<String>) -> Response {
    let m = PENDING_QUESTIONS.get_or_init(|| Mutex::new(HashMap::new()));
    let list: Vec<Value> = m
        .lock()
        .map(|g| {
            g.values()
                .filter(|pq| pq.session_id == sid)
                .map(|pq| {
                    json!({
                        "id": pq.id,
                        "sessionID": pq.session_id,
                        "questions": pq.questions,
                        "tool": pq.tool
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    Json(json!({ "data": list })).into_response()
}

async fn handle_question_reply_session(
    AxumPath((_sid, req_id)): AxumPath<(String, String)>,
    Json(body): Json<Value>,
) -> Response {
    resolve_question_reply(&req_id, Some(&body))
}

async fn handle_question_reply_global(
    AxumPath(req_id): AxumPath<String>,
    Json(body): Json<Value>,
) -> Response {
    resolve_question_reply(&req_id, Some(&body))
}

async fn handle_question_reject_session(
    AxumPath((_sid, req_id)): AxumPath<(String, String)>,
) -> Response {
    resolve_question_reply(&req_id, None)
}

async fn handle_question_reject_global(AxumPath(req_id): AxumPath<String>) -> Response {
    resolve_question_reply(&req_id, None)
}
