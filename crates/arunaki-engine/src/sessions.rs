use crate::bridge::LOCAL_CLI_BRIDGE_PORT;
use crate::files::{collect_files_recursive, urlencoding_decode};
use crate::knowledge::get_active_knowledge_for_workspace;
use crate::paths::{
    arunaki_data_dir, contains_path, gen_id, normalize_workspace_path, now_ms,
};
use crate::providers::read_arunaki_config;
use axum::{
    extract::{Path as AxumPath, Query},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tokio::sync::{broadcast, oneshot};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SessionStoreData {
    #[serde(default)]
    pub sessions: HashMap<String, Value>,
    #[serde(default)]
    pub messages: HashMap<String, Vec<Value>>,
}

pub struct PendingQuestion {
    pub id: String,
    pub session_id: String,
    pub directory: String,
    pub questions: Vec<Value>,
    pub tool: Value,
    pub reply_tx: Option<oneshot::Sender<Option<Vec<Vec<String>>>>>,
}

static SESSION_STORE: OnceLock<Mutex<SessionStoreData>> = OnceLock::new();
static ACTIVE_RUNS: OnceLock<Mutex<HashMap<String, bool>>> = OnceLock::new();
static PENDING_QUESTIONS: OnceLock<Mutex<HashMap<String, PendingQuestion>>> = OnceLock::new();
static EVENT_BUS: OnceLock<broadcast::Sender<Value>> = OnceLock::new();

pub fn get_event_sender() -> broadcast::Sender<Value> {
    EVENT_BUS
        .get_or_init(|| {
            let (tx, _) = broadcast::channel(512);
            tx
        })
        .clone()
}

pub fn emit_event(directory: &str, event_type: &str, properties: Value) {
    let tx = get_event_sender();
    let payload = json!({
        "directory": directory,
        "payload": {
            "id": gen_id("evt"),
            "type": event_type,
            "time": now_ms(),
            "properties": properties
        }
    });
    let _ = tx.send(payload);
}

fn store_file_path() -> PathBuf {
    arunaki_data_dir().join("sessions-store.json")
}

fn load_store() -> SessionStoreData {
    let p = store_file_path();
    if let Ok(raw) = std::fs::read_to_string(&p) {
        if let Ok(parsed) = serde_json::from_str::<SessionStoreData>(&raw) {
            if !parsed.sessions.is_empty() {
                return parsed;
            }
        }
    }
    // Auto-migrate from SQLite Arunaki-local.db if available
    let db_path = arunaki_data_dir().join("Arunaki-local.db");
    if db_path.exists() {
        let _ = std::process::Command::new("bun")
            .arg("scripts/migrate-sqlite-to-json.cjs")
            .output();
        if let Ok(raw) = std::fs::read_to_string(&p) {
            if let Ok(parsed) = serde_json::from_str::<SessionStoreData>(&raw) {
                if !parsed.sessions.is_empty() {
                    return parsed;
                }
            }
        }
    }
    SessionStoreData::default()
}

fn save_store(store: &SessionStoreData) {
    let p = store_file_path();
    if let Ok(raw) = serde_json::to_string(store) {
        let _ = std::fs::write(p, raw);
    }
}

fn with_store<F, R>(f: F) -> R
where
    F: FnOnce(&mut SessionStoreData) -> R,
{
    let m = SESSION_STORE.get_or_init(|| Mutex::new(load_store()));
    let mut guard = m.lock().unwrap_or_else(|e| e.into_inner());
    f(&mut guard)
}

fn set_active_run(session_id: &str, running: bool) {
    let m = ACTIVE_RUNS.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(mut guard) = m.lock() {
        if running {
            guard.insert(session_id.to_string(), true);
        } else {
            guard.remove(session_id);
        }
    }
}

pub fn router() -> Router {
    Router::new()
        .route("/api/session", get(handle_list).post(handle_create))
        .route("/session", get(handle_list).post(handle_create))
        .route("/api/session/active", get(handle_active))
        .route("/session/status", get(handle_active))
        .route(
            "/api/session/:id",
            get(handle_get).patch(handle_patch).delete(handle_delete),
        )
        .route(
            "/session/:id",
            get(handle_get).patch(handle_patch).delete(handle_delete),
        )
        .route("/api/session/:id/abort", post(handle_abort))
        .route("/session/:id/abort", post(handle_abort))
        .route(
            "/api/session/:id/message",
            get(handle_messages).post(handle_prompt),
        )
        .route(
            "/session/:id/message",
            get(handle_messages).post(handle_prompt),
        )
        .route("/api/session/:id/prompt", post(handle_prompt))
        .route("/session/:id/prompt", post(handle_prompt))
        .route("/session/:id/prompt_async", post(handle_prompt))
        .route("/api/session/:id/todo", get(handle_empty_list))
        .route("/session/:id/todo", get(handle_empty_list))
        .route("/api/session/:id/diff", get(handle_empty_list))
        .route("/session/:id/diff", get(handle_empty_list))
        // Interactive question clarification routes
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
        .route("/api/question/:reqId/reply", post(handle_question_reply_global))
        .route("/question/:reqId/reply", post(handle_question_reply_global))
        .route(
            "/api/session/:id/question/:reqId/reject",
            post(handle_question_reject_session),
        )
        .route(
            "/session/:id/question/:reqId/reject",
            post(handle_question_reject_session),
        )
        .route("/api/question/:reqId/reject", post(handle_question_reject_global))
        .route("/question/:reqId/reject", post(handle_question_reject_global))
}

fn resolve_dir(q: &HashMap<String, String>, headers: &HeaderMap) -> String {
    if let Some(d) = q.get("directory").or_else(|| q.get("workspacePath")) {
        if !d.trim().is_empty() {
            return normalize_workspace_path(&urlencoding_decode(d));
        }
    }
    if let Some(h) = headers
        .get("x-arunaki-directory")
        .or_else(|| headers.get("x-opencode-directory"))
        .and_then(|v| v.to_str().ok())
    {
        if !h.trim().is_empty() {
            return normalize_workspace_path(&urlencoding_decode(h));
        }
    }
    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .to_string_lossy()
        .to_string()
}

fn default_model_ref() -> Value {
    let cfg = read_arunaki_config();
    if let Some(m_str) = cfg.get("model").and_then(|v| v.as_str()) {
        if let Some((prov, mid)) = m_str.split_once('/') {
            return json!({ "providerID": prov, "id": mid });
        }
    }
    json!({ "providerID": "local-cli", "id": "kiro/auto" })
}

async fn handle_empty_list() -> Response {
    Json(json!([])).into_response()
}

async fn handle_question_list_all() -> Response {
    let m = PENDING_QUESTIONS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut list = Vec::new();
    if let Ok(guard) = m.lock() {
        for q in guard.values() {
            list.push(json!({
                "id": q.id,
                "sessionID": q.session_id,
                "questions": q.questions,
                "tool": q.tool
            }));
        }
    }
    Json(json!({ "data": list })).into_response()
}

async fn handle_question_list_session(AxumPath(sid): AxumPath<String>) -> Response {
    let m = PENDING_QUESTIONS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut list = Vec::new();
    if let Ok(guard) = m.lock() {
        for q in guard.values() {
            if q.session_id == sid {
                list.push(json!({
                    "id": q.id,
                    "sessionID": q.session_id,
                    "questions": q.questions,
                    "tool": q.tool
                }));
            }
        }
    }
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

fn resolve_question_reply(req_id: &str, body_opt: Option<&Value>) -> Response {
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

async fn handle_list(
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    let filter_dir = q
        .get("directory")
        .map(|d| normalize_workspace_path(&urlencoding_decode(d)).to_lowercase())
        .or_else(|| {
            headers
                .get("x-arunaki-directory")
                .or_else(|| headers.get("x-opencode-directory"))
                .and_then(|v| v.to_str().ok())
                .filter(|s| !s.trim().is_empty())
                .map(|d| normalize_workspace_path(&urlencoding_decode(d)).to_lowercase())
        });

    let limit = q
        .get("limit")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(200)
        .clamp(1, 500);

    let list = with_store(|store| {
        let mut items: Vec<Value> = store
            .sessions
            .values()
            .filter(|s| {
                if let Some(ref fd) = filter_dir {
                    let s_dir = s
                        .pointer("/location/directory")
                        .or_else(|| s.get("directory"))
                        .and_then(|v| v.as_str())
                        .map(|d| normalize_workspace_path(d).to_lowercase())
                        .unwrap_or_default();
                    s_dir == *fd
                } else {
                    true
                }
            })
            .map(|s| {
                let mut obj = s.clone();
                let sid = obj.get("id").and_then(|v| v.as_str()).unwrap_or("");
                let msgs = store.messages.get(sid);
                let msg_count = msgs.map(|m| m.len()).unwrap_or(0);
                let preview = msgs
                    .and_then(|m| m.last())
                    .and_then(|last| {
                        last.get("text")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                            .or_else(|| {
                                last.get("content")
                                    .and_then(|v| v.as_array())
                                    .and_then(|arr| {
                                        arr.iter().find_map(|p| {
                                            p.get("text").and_then(|t| t.as_str()).map(|s| s.to_string())
                                        })
                                    })
                            })
                    })
                    .unwrap_or_default();
                let short_preview: String = preview.chars().take(95).collect();
                obj["messageCount"] = json!(msg_count);
                obj["lastMessagePreview"] = Value::String(short_preview);
                obj
            })
            .collect();
        items.sort_by(|a, b| {
            let ta = a
                .pointer("/time/updated")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let tb = b
                .pointer("/time/updated")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            tb.cmp(&ta)
        });
        if items.len() > limit {
            items.truncate(limit);
        }
        items
    });

    Json(json!({ "data": list, "cursor": {} })).into_response()
}

async fn handle_create(
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
    body_bytes: axum::body::Bytes,
) -> Response {
    let body: Value = serde_json::from_slice(&body_bytes).unwrap_or_else(|_| json!({}));
    let dir = body
        .pointer("/location/directory")
        .or_else(|| body.get("directory"))
        .and_then(|v| v.as_str())
        .map(normalize_workspace_path)
        .unwrap_or_else(|| resolve_dir(&q, &headers));

    let id = gen_id("ses");
    let now = now_ms();
    let model = body
        .get("model")
        .filter(|v| v.is_object())
        .cloned()
        .unwrap_or_else(default_model_ref);
    let agent = body
        .get("agent")
        .and_then(|v| v.as_str())
        .unwrap_or("default");
    let title = body
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("New Session");

    let session = json!({
        "id": id,
        "projectID": "proj_default",
        "agent": agent,
        "model": model,
        "cost": 0,
        "tokens": {
            "input": 0,
            "output": 0,
            "reasoning": 0,
            "cache": { "read": 0, "write": 0 }
        },
        "time": {
            "created": now,
            "updated": now
        },
        "title": title,
        "directory": dir,
        "location": {
            "directory": dir
        }
    });

    with_store(|store| {
        store.sessions.insert(id.clone(), session.clone());
        store.messages.entry(id.clone()).or_default();
        save_store(store);
    });

    emit_event(&dir, "session.created", json!({ "session": session }));
    Json(json!({ "data": session })).into_response()
}

async fn handle_active() -> Response {
    let m = ACTIVE_RUNS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut data = serde_json::Map::new();
    if let Ok(guard) = m.lock() {
        for (sid, &running) in guard.iter() {
            if running {
                data.insert(sid.clone(), json!({ "type": "running" }));
            }
        }
    }
    Json(json!({ "data": data })).into_response()
}

async fn handle_get(AxumPath(id): AxumPath<String>) -> Response {
    let found = with_store(|store| store.sessions.get(&id).cloned());
    if let Some(s) = found {
        Json(json!({ "data": s })).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": format!("Session not found: {}", id) })),
        )
            .into_response()
    }
}

async fn handle_patch(AxumPath(id): AxumPath<String>, Json(body): Json<Value>) -> Response {
    let updated = with_store(|store| {
        if let Some(s) = store.sessions.get_mut(&id) {
            if let Some(t) = body.get("title").and_then(|v| v.as_str()) {
                s["title"] = Value::String(t.to_string());
            }
            s["time"]["updated"] = json!(now_ms());
            let cloned = s.clone();
            save_store(store);
            Some(cloned)
        } else {
            None
        }
    });
    if let Some(s) = updated {
        Json(json!({ "data": s })).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Session not found" })),
        )
            .into_response()
    }
}

async fn handle_delete(AxumPath(id): AxumPath<String>) -> Response {
    with_store(|store| {
        store.sessions.remove(&id);
        store.messages.remove(&id);
        save_store(store);
    });
    Json(json!({ "data": { "ok": true } })).into_response()
}

async fn handle_abort(AxumPath(id): AxumPath<String>) -> Response {
    set_active_run(&id, false);
    Json(json!({ "data": { "aborted": true } })).into_response()
}

async fn handle_messages(
    AxumPath(id): AxumPath<String>,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let mut msgs = with_store(|store| store.messages.get(&id).cloned().unwrap_or_default());
    let total = msgs.len();
    let order = q.get("order").map(|s| s.as_str()).unwrap_or("desc");
    if order == "desc" {
        msgs.reverse();
    }
    let offset = q
        .get("cursor")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(0);
    let limit = q
        .get("limit")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(200)
        .clamp(1, 500);

    let slice: Vec<Value> = if offset < msgs.len() {
        let end = (offset + limit).min(msgs.len());
        msgs[offset..end].to_vec()
    } else {
        Vec::new()
    };
    let next_cursor = if offset + slice.len() < total {
        Some((offset + slice.len()).to_string())
    } else {
        None
    };

    Json(json!({
        "data": slice,
        "total": total,
        "cursor": { "next": next_cursor }
    }))
    .into_response()
}

async fn handle_prompt(
    AxumPath(session_id): AxumPath<String>,
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    let prompt_text = body
        .pointer("/prompt/text")
        .and_then(|v| v.as_str())
        .or_else(|| body.get("prompt").and_then(|v| v.as_str()))
        .or_else(|| {
            body.get("parts")
                .and_then(|v| v.as_array())
                .and_then(|arr| {
                    arr.iter()
                        .find_map(|p| p.get("text").and_then(|v| v.as_str()))
                })
        })
        .unwrap_or("")
        .to_string();

    let (session, history) = with_store(|store| {
        let s = store.sessions.get(&session_id).cloned().unwrap_or_else(|| {
            let dir = resolve_dir(&q, &headers);
            let now = now_ms();
            let new_s = json!({
                "id": session_id,
                "projectID": "proj_default",
                "agent": "default",
                "model": default_model_ref(),
                "cost": 0,
                "tokens": { "input": 0, "output": 0, "reasoning": 0, "cache": { "read": 0, "write": 0 } },
                "time": { "created": now, "updated": now },
                "title": "Session",
                "directory": dir,
                "location": { "directory": dir }
            });
            store.sessions.insert(session_id.clone(), new_s.clone());
            new_s
        });
        let h = store
            .messages
            .get(&session_id)
            .cloned()
            .unwrap_or_default();
        (s, h)
    });

    let workspace_dir = session
        .pointer("/location/directory")
        .or_else(|| session.get("directory"))
        .and_then(|v| v.as_str())
        .map(normalize_workspace_path)
        .unwrap_or_else(|| resolve_dir(&q, &headers));

    let model_ref = body
        .get("model")
        .filter(|v| v.is_object() && v.get("id").is_some())
        .cloned()
        .or_else(|| {
            session
                .get("model")
                .filter(|v| v.is_object() && v.get("id").is_some())
                .cloned()
        })
        .unwrap_or_else(default_model_ref);

    let provider_id = model_ref
        .get("providerID")
        .and_then(|v| v.as_str())
        .unwrap_or("local-cli")
        .to_string();
    let model_id = model_ref
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("kiro/auto")
        .to_string();

    let user_msg_id = body
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| gen_id("msg"));
    let created_ms = now_ms();

    let user_msg = json!({
        "id": user_msg_id,
        "type": "user",
        "role": "user",
        "text": prompt_text,
        "files": body.pointer("/prompt/files").and_then(|v| v.as_array()).cloned().unwrap_or_default(),
        "agents": body.pointer("/prompt/agents").and_then(|v| v.as_array()).cloned().unwrap_or_default(),
        "time": { "created": created_ms }
    });

    with_store(|store| {
        if let Some(s) = store.sessions.get_mut(&session_id) {
            s["model"] = json!({ "providerID": provider_id, "id": model_id });
            s["time"]["updated"] = json!(created_ms);
            if s.get("title").and_then(|v| v.as_str()) == Some("New Session")
                && !prompt_text.trim().is_empty()
            {
                let short_title: String = prompt_text.chars().take(48).collect();
                s["title"] = Value::String(short_title);
            }
        }
        store
            .messages
            .entry(session_id.clone())
            .or_default()
            .push(user_msg);
        save_store(store);
    });

    emit_event(
        &workspace_dir,
        "session.next.prompt.admitted",
        json!({
            "admittedSeq": 1,
            "id": user_msg_id,
            "sessionID": session_id,
            "prompt": {
                "text": prompt_text,
                "files": [],
                "agents": []
            },
            "delivery": "interrupt",
            "timeCreated": created_ms
        }),
    );

    // Run agentic turn synchronously so both SSE listeners and direct HTTP callers receive the completed reply
    set_active_run(&session_id, true);
    run_agent_turn(
        &session_id,
        &workspace_dir,
        &provider_id,
        &model_id,
        &history,
        &prompt_text,
    )
    .await;
    set_active_run(&session_id, false);

    Json(json!({
        "data": {
            "admittedSeq": 1,
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

fn should_attach_document_tools(prompt_text: &str, history: &[Value]) -> bool {
    let lower = prompt_text.to_lowercase();
    // Skip attaching heavy tool schemas for simple greetings or pure arithmetic questions
    let doc_keywords = [
        "excel", "xlsx", "xls", "csv", "word", "docx", "doc", "ppt", "pptx", "slide", "pdf",
        "file", "folder", "dokumen", "laporan", "rekap", "tabel", "sheet", "kolom", "baris",
        "cell", "baca", "tulis", "buat", "edit", "ubah", "format", "cari", "read", "write",
        "update", "open", "buka", "hitung", "total", "daftar", "list", "cek", "check", "isi",
    ];
    if doc_keywords.iter().any(|k| lower.contains(k)) {
        return true;
    }
    // Also attach if history had tool calls
    history.iter().any(|m| {
        m.get("content")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().any(|p| p.get("type").and_then(|t| t.as_str()) == Some("tool")))
            .unwrap_or(false)
    })
}

fn build_tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "type": "function",
            "function": {
                "name": "glob",
                "description": "List files in the active workspace folder",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pattern": { "type": "string", "description": "Optional filename filter" }
                    }
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "read",
                "description": "Read a text file inside the workspace folder",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "filePath": { "type": "string", "description": "Relative or absolute path inside workspace" }
                    },
                    "required": ["filePath"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "write",
                "description": "Write or create a text file inside the workspace folder",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "filePath": { "type": "string" },
                        "content": { "type": "string" }
                    },
                    "required": ["filePath", "content"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "excel_read",
                "description": "Read an Excel (.xlsx) or CSV (.csv) file and return its sheets, headers, sample rows, and formulas",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": { "type": "string", "description": "Path to .xlsx or .csv file" },
                        "max_rows": { "type": "number", "description": "Max sample rows per sheet (default 50)" }
                    },
                    "required": ["file"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "excel_com",
                "description": "Create or edit an Excel (.xlsx) workbook using live Microsoft Excel COM automation",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": { "type": "string", "description": "Target .xlsx file path" },
                        "visible": { "type": "boolean" },
                        "save": { "type": "boolean" },
                        "operations": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "op": { "type": "string" },
                                    "sheet": { "type": "string" },
                                    "cell": { "type": "string" },
                                    "range": { "type": "string" },
                                    "value": {},
                                    "values": { "type": "array", "items": { "type": "array", "items": {} } },
                                    "formula": { "type": "string" }
                                },
                                "required": ["op"]
                            }
                        }
                    },
                    "required": ["file", "operations"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "word_read",
                "description": "Read a Word (.docx) document and return its paragraphs, headings, and tables",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": { "type": "string", "description": "Path to .docx file" }
                    },
                    "required": ["file"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "word_com",
                "description": "Create or edit a Word (.docx) document using live Microsoft Word COM automation",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": { "type": "string" },
                        "visible": { "type": "boolean" },
                        "save": { "type": "boolean" },
                        "operations": { "type": "array", "items": { "type": "object" } }
                    },
                    "required": ["file", "operations"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "ppt_read",
                "description": "Read a PowerPoint (.pptx) presentation and return its slides, text shapes, and tables",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": { "type": "string", "description": "Path to .pptx file" }
                    },
                    "required": ["file"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "ppt_com",
                "description": "Create or edit a PowerPoint (.pptx) presentation using live PowerPoint COM automation",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": { "type": "string" },
                        "visible": { "type": "boolean" },
                        "save": { "type": "boolean" },
                        "operations": { "type": "array", "items": { "type": "object" } }
                    },
                    "required": ["file", "operations"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "pdf_read",
                "description": "Read a PDF (.pdf) document and return its extracted page text",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": { "type": "string", "description": "Path to .pdf file" },
                        "max_pages": { "type": "number" }
                    },
                    "required": ["file"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "question",
                "description": "Ask the user an interactive multiple-choice question when clarification is required",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "questions": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "header": { "type": "string" },
                                    "question": { "type": "string" },
                                    "multiple": { "type": "boolean" },
                                    "options": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "label": { "type": "string" },
                                                "description": { "type": "string" }
                                            },
                                            "required": ["label"]
                                        }
                                    }
                                },
                                "required": ["question", "options"]
                            }
                        }
                    },
                    "required": ["questions"]
                }
            }
        }),
    ]
}

fn resolve_isolated_path(workspace_dir: &str, raw_file: &str) -> Result<PathBuf, String> {
    let base = Path::new(workspace_dir);
    let candidate = Path::new(raw_file);
    let resolved = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        base.join(raw_file)
    };
    if !contains_path(base, &resolved) {
        return Err(format!(
            "Project Folder Isolation Error: '{}' is outside the active project folder '{}'",
            raw_file, workspace_dir
        ));
    }
    Ok(resolved)
}

async fn execute_tool_call(
    session_id: &str,
    assistant_msg_id: &str,
    call_id: &str,
    workspace_dir: &str,
    name: &str,
    args: &Value,
) -> Value {
    match name {
        "question" => {
            let req_id = gen_id("que");
            let questions = args
                .get("questions")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let tool_ref = json!({
                "messageID": assistant_msg_id,
                "callID": call_id
            });
            let (tx, rx) = oneshot::channel();
            {
                let m = PENDING_QUESTIONS.get_or_init(|| Mutex::new(HashMap::new()));
                if let Ok(mut guard) = m.lock() {
                    guard.insert(
                        req_id.clone(),
                        PendingQuestion {
                            id: req_id.clone(),
                            session_id: session_id.to_string(),
                            directory: workspace_dir.to_string(),
                            questions: questions.clone(),
                            tool: tool_ref.clone(),
                            reply_tx: Some(tx),
                        },
                    );
                }
            }
            emit_event(
                workspace_dir,
                "question.asked",
                json!({
                    "id": req_id,
                    "sessionID": session_id,
                    "questions": questions,
                    "tool": tool_ref
                }),
            );
            match tokio::time::timeout(std::time::Duration::from_secs(120), rx).await {
                Ok(Ok(Some(answers))) => json!({ "ok": true, "answers": answers }),
                Ok(Ok(None)) => json!({ "rejected": true }),
                _ => {
                    let m = PENDING_QUESTIONS.get_or_init(|| Mutex::new(HashMap::new()));
                    if let Ok(mut guard) = m.lock() {
                        guard.remove(&req_id);
                    }
                    json!({ "timeout": true })
                }
            }
        }
        "glob" => {
            let pattern = args
                .get("pattern")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_lowercase();
            let base = Path::new(workspace_dir);
            let mut files = Vec::new();
            collect_files_recursive(base, base, &mut files, 500);
            let matched: Vec<String> = files
                .into_iter()
                .map(|f| {
                    f.strip_prefix(base)
                        .unwrap_or(&f)
                        .to_string_lossy()
                        .replace('\\', "/")
                })
                .filter(|rel| pattern.is_empty() || rel.to_lowercase().contains(&pattern))
                .collect();
            json!({ "workspace": workspace_dir, "files": matched })
        }
        "read" => {
            let fp = args
                .get("filePath")
                .or_else(|| args.get("file"))
                .or_else(|| args.get("path"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            match resolve_isolated_path(workspace_dir, fp) {
                Ok(p) => match std::fs::read_to_string(&p) {
                    Ok(txt) => json!({ "file": p.to_string_lossy(), "content": txt }),
                    Err(e) => json!({ "error": format!("Failed to read file: {}", e) }),
                },
                Err(e) => json!({ "error": e }),
            }
        }
        "write" => {
            let fp = args
                .get("filePath")
                .or_else(|| args.get("file"))
                .or_else(|| args.get("path"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");
            match resolve_isolated_path(workspace_dir, fp) {
                Ok(p) => {
                    if let Some(parent) = p.parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }
                    match std::fs::write(&p, content) {
                        Ok(_) => json!({ "ok": true, "file": p.to_string_lossy(), "bytes": content.len() }),
                        Err(e) => json!({ "error": format!("Failed to write file: {}", e) }),
                    }
                }
                Err(e) => json!({ "error": e }),
            }
        }
        "excel_read" => {
            let fp = args
                .get("file")
                .or_else(|| args.get("filePath"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            match resolve_isolated_path(workspace_dir, fp) {
                Ok(p) => match arunaki_docs::build_excel_map(&p.to_string_lossy()) {
                    Ok(s) => serde_json::from_str(&s).unwrap_or_else(|_| Value::String(s)),
                    Err(e) => json!({ "error": e }),
                },
                Err(e) => json!({ "error": e }),
            }
        }
        "word_read" => {
            let fp = args
                .get("file")
                .or_else(|| args.get("filePath"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            match resolve_isolated_path(workspace_dir, fp) {
                Ok(p) => match arunaki_docs::build_word_map(&p.to_string_lossy()) {
                    Ok(s) => serde_json::from_str(&s).unwrap_or_else(|_| Value::String(s)),
                    Err(e) => json!({ "error": e }),
                },
                Err(e) => json!({ "error": e }),
            }
        }
        "ppt_read" => {
            let fp = args
                .get("file")
                .or_else(|| args.get("filePath"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            match resolve_isolated_path(workspace_dir, fp) {
                Ok(p) => match arunaki_docs::build_ppt_map(&p.to_string_lossy()) {
                    Ok(s) => serde_json::from_str(&s).unwrap_or_else(|_| Value::String(s)),
                    Err(e) => json!({ "error": e }),
                },
                Err(e) => json!({ "error": e }),
            }
        }
        "pdf_read" => {
            let fp = args
                .get("file")
                .or_else(|| args.get("filePath"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let max_pages = args
                .get("max_pages")
                .and_then(|v| v.as_u64())
                .unwrap_or(30) as usize;
            match resolve_isolated_path(workspace_dir, fp) {
                Ok(p) => match arunaki_docs::build_pdf_map(&p.to_string_lossy(), Some(max_pages)) {
                    Ok(s) => serde_json::from_str(&s).unwrap_or_else(|_| Value::String(s)),
                    Err(e) => json!({ "error": e }),
                },
                Err(e) => json!({ "error": e }),
            }
        }
        "excel_com" | "word_com" | "ppt_com" => {
            let fp = args
                .get("file")
                .or_else(|| args.get("filePath"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let action = args
                .get("action")
                .or_else(|| args.pointer("/operations/0/op"))
                .and_then(|v| v.as_str())
                .unwrap_or("write_cell")
                .to_string();
            match resolve_isolated_path(workspace_dir, fp) {
                Ok(p) => {
                    let abs = p.to_string_lossy().to_string();
                    let script = if name == "excel_com" {
                        let params = arunaki_docs::ExcelComParams {
                            action,
                            file_path: Some(abs),
                            sheet_name: args.get("sheet").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            cell: args.get("cell").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            value: args.get("value").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            cells: Vec::new(),
                            bold: args.get("bold").and_then(|v| v.as_bool()),
                            italic: args.get("italic").and_then(|v| v.as_bool()),
                            font_size: args.get("fontSize").and_then(|v| v.as_f64()),
                            bg_color: None,
                            alignment: None,
                            source_sheet: None,
                            new_sheet_name: None,
                        };
                        arunaki_docs::build_excel_com_script(&params)
                    } else if name == "word_com" {
                        let params = arunaki_docs::WordComParams {
                            action,
                            file_path: Some(abs),
                            text: args.get("text").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            paragraph_index: args.get("paragraphIndex").and_then(|v| v.as_u64()).map(|n| n as usize),
                            find_text: args.get("findText").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            replace_text: args.get("replaceText").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            bold: args.get("bold").and_then(|v| v.as_bool()),
                            font_size: args.get("fontSize").and_then(|v| v.as_f64()),
                            alignment: None,
                        };
                        arunaki_docs::build_word_com_script(&params)
                    } else {
                        let params = arunaki_docs::PptComParams {
                            action,
                            file_path: Some(abs),
                            slide_number: args.get("slideNumber").and_then(|v| v.as_u64()).map(|n| n as usize),
                            shape_index: args.get("shapeIndex").and_then(|v| v.as_u64()).map(|n| n as usize),
                            shape_name: args.get("shapeName").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            text: args.get("text").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            title: args.get("title").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            layout: None,
                        };
                        arunaki_docs::build_ppt_com_script(&params)
                    };
                    let prefix = name.to_string();
                    let res = tokio::task::spawn_blocking(move || {
                        arunaki_docs::run_powershell_script(&prefix, &script)
                    })
                    .await
                    .unwrap_or_else(|e| Err(e.to_string()));
                    match res {
                        Ok(out) => json!({ "ok": true, "output": out }),
                        Err(e) => json!({ "error": e }),
                    }
                }
                Err(e) => json!({ "error": e }),
            }
        }
        _ => json!({ "error": format!("Unknown tool: {}", name) }),
    }
}

async fn run_agent_turn(
    session_id: &str,
    workspace_dir: &str,
    provider_id: &str,
    model_id: &str,
    history: &[Value],
    prompt_text: &str,
) {
    let assistant_msg_id = gen_id("msg");
    let started_ms = now_ms();

    emit_event(
        workspace_dir,
        "session.next.step.started",
        json!({
            "sessionID": session_id,
            "messageID": assistant_msg_id,
            "agent": "default",
            "model": { "providerID": provider_id, "id": model_id }
        }),
    );

    // Build system prompt with active workspace & knowledge context
    let mut sys_prompt = format!(
        "You are Arunaki, a Desktop Document AI Agent operating strictly inside the active project folder: {}\n\
        Respond concisely and accurately.",
        workspace_dir
    );
    let active_kn = get_active_knowledge_for_workspace(workspace_dir);
    if !active_kn.is_empty() {
        sys_prompt.push_str("\n\nActive Project Knowledge:\n");
        for n in active_kn.iter().take(10) {
            let t = n.get("title").and_then(|v| v.as_str()).unwrap_or("Note");
            let c = n.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let snippet: String = c.chars().take(4000).collect();
            sys_prompt.push_str(&format!("--- {} ---\n{}\n", t, snippet));
        }
    }

    let mut chat_messages = vec![json!({ "role": "system", "content": sys_prompt })];
    for m in history {
        let mtype = m.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if mtype == "user" {
            let txt = m.get("text").and_then(|v| v.as_str()).unwrap_or("");
            chat_messages.push(json!({ "role": "user", "content": txt }));
        } else if mtype == "assistant" {
            let txt = m
                .get("content")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|p| {
                            if p.get("type").and_then(|t| t.as_str()) == Some("text") {
                                p.get("text").and_then(|t| t.as_str())
                            } else {
                                None
                            }
                        })
                        .collect::<Vec<_>>()
                        .join("")
                })
                .unwrap_or_default();
            if !txt.is_empty() {
                chat_messages.push(json!({ "role": "assistant", "content": txt }));
            }
        }
    }
    chat_messages.push(json!({ "role": "user", "content": prompt_text }));

    // Determine target base URL & API key
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
        .unwrap_or("local-cli-bridge")
        .to_string();

    let attach_tools = should_attach_document_tools(prompt_text, history);
    let tools_def = if attach_tools {
        build_tool_definitions()
    } else {
        Vec::new()
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .unwrap();

    let mut content_parts: Vec<Value> = Vec::new();
    let mut final_text = String::new();

    for _step in 0..6 {
        let mut req_body = json!({
            "model": model_id,
            "messages": chat_messages,
            "stream": false
        });
        if !tools_def.is_empty() {
            req_body["tools"] = Value::Array(tools_def.clone());
        }

        let resp = client
            .post(format!("{}/chat/completions", base_url))
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&req_body)
            .send()
            .await;

        let Ok(r) = resp else {
            final_text = "Error: Failed to reach AI provider.".to_string();
            break;
        };
        if !r.status().is_success() {
            let err_txt = r.text().await.unwrap_or_default();
            final_text = format!("Error from AI provider: {}", err_txt);
            break;
        }
        let data: Value = r.json().await.unwrap_or_else(|_| json!({}));
        let msg = data
            .pointer("/choices/0/message")
            .cloned()
            .unwrap_or_else(|| json!({}));
        let msg_text = msg
            .get("content")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let tool_calls = msg
            .get("tool_calls")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        if tool_calls.is_empty() {
            final_text = msg_text;
            break;
        }

        // Append assistant message with tool_calls to conversation
        chat_messages.push(msg.clone());

        for tc in tool_calls {
            let call_id = tc
                .get("id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| gen_id("call"));
            let fn_name = tc
                .pointer("/function/name")
                .and_then(|v| v.as_str())
                .unwrap_or("tool")
                .to_string();
            let args_str = tc
                .pointer("/function/arguments")
                .and_then(|v| v.as_str())
                .unwrap_or("{}");
            let args_val: Value =
                serde_json::from_str(args_str).unwrap_or_else(|_| json!({}));
            let tool_start = now_ms();

            emit_event(
                workspace_dir,
                "session.next.tool.called",
                json!({
                    "sessionID": session_id,
                    "messageID": assistant_msg_id,
                    "id": call_id,
                    "name": fn_name,
                    "input": args_val
                }),
            );

            let tool_out = execute_tool_call(
                session_id,
                &assistant_msg_id,
                &call_id,
                workspace_dir,
                &fn_name,
                &args_val,
            )
            .await;
            let tool_out_str =
                serde_json::to_string_pretty(&tool_out).unwrap_or_else(|_| "{}".to_string());
            let tool_end = now_ms();

            emit_event(
                workspace_dir,
                "session.next.tool.success",
                json!({
                    "sessionID": session_id,
                    "messageID": assistant_msg_id,
                    "id": call_id,
                    "name": fn_name,
                    "content": [{ "type": "text", "text": tool_out_str }],
                    "structured": tool_out
                }),
            );

            content_parts.push(json!({
                "type": "tool",
                "id": call_id,
                "name": fn_name,
                "state": {
                    "status": "completed",
                    "input": args_val,
                    "structured": tool_out,
                    "content": [{ "type": "text", "text": tool_out_str }],
                    "attachments": []
                },
                "time": { "created": tool_start, "completed": tool_end }
            }));

            chat_messages.push(json!({
                "role": "tool",
                "tool_call_id": call_id,
                "name": fn_name,
                "content": tool_out_str
            }));
        }
    }

    let txt_part_id = gen_id("txt");
    emit_event(
        workspace_dir,
        "session.next.text.started",
        json!({
            "sessionID": session_id,
            "messageID": assistant_msg_id,
            "id": txt_part_id
        }),
    );
    if !final_text.is_empty() {
        emit_event(
            workspace_dir,
            "session.next.text.delta",
            json!({
                "sessionID": session_id,
                "messageID": assistant_msg_id,
                "id": txt_part_id,
                "delta": final_text
            }),
        );
    }
    emit_event(
        workspace_dir,
        "session.next.text.ended",
        json!({
            "sessionID": session_id,
            "messageID": assistant_msg_id,
            "id": txt_part_id,
            "text": final_text
        }),
    );

    content_parts.push(json!({
        "type": "text",
        "id": txt_part_id,
        "text": final_text
    }));

    let completed_ms = now_ms();
    let assistant_msg = json!({
        "id": assistant_msg_id,
        "type": "assistant",
        "role": "assistant",
        "agent": "default",
        "model": {
            "providerID": provider_id,
            "id": model_id
        },
        "content": content_parts,
        "finish": "stop",
        "cost": 0,
        "tokens": {
            "input": 0,
            "output": 0,
            "reasoning": 0,
            "cache": { "read": 0, "write": 0 }
        },
        "time": {
            "created": started_ms,
            "completed": completed_ms
        }
    });

    with_store(|store| {
        if let Some(s) = store.sessions.get_mut(session_id) {
            s["time"]["updated"] = json!(completed_ms);
        }
        store
            .messages
            .entry(session_id.to_string())
            .or_default()
            .push(assistant_msg);
        save_store(store);
    });

    emit_event(
        workspace_dir,
        "session.next.step.ended",
        json!({
            "sessionID": session_id,
            "messageID": assistant_msg_id,
            "finish": "stop",
            "cost": 0,
            "tokens": { "input": 0, "output": 0, "reasoning": 0, "cache": { "read": 0, "write": 0 } }
        }),
    );
    emit_event(
        workspace_dir,
        "session.idle",
        json!({ "sessionID": session_id }),
    );
}

pub async fn run_direct_prompt(workspace_dir: &str, prompt_text: &str) -> String {
    let dir = normalize_workspace_path(workspace_dir);
    let session_id = format!("ses_tg_{}", now_ms());
    let model_ref = default_model_ref();
    let provider_id = model_ref
        .get("providerID")
        .and_then(|v| v.as_str())
        .unwrap_or("local-cli")
        .to_string();
    let model_id = model_ref
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("kiro/auto")
        .to_string();

    run_agent_turn(&session_id, &dir, &provider_id, &model_id, &[], prompt_text).await;

    with_store(|store| {
        store
            .messages
            .get(&session_id)
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
