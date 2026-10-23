use crate::paths::{arunaki_data_dir, gen_id, now_ms};
use axum::{response::{IntoResponse, Response}, Json};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
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
pub static ACTIVE_RUNS: OnceLock<Mutex<HashMap<String, bool>>> = OnceLock::new();
pub static PENDING_QUESTIONS: OnceLock<Mutex<HashMap<String, PendingQuestion>>> = OnceLock::new();
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
    let id = gen_id("evt");
    let now = now_ms();
    let mut payload = json!({
        "id": id,
        "type": event_type,
        "time": now,
        "directory": directory,
        "properties": properties.clone(),
        "data": properties.clone(),
        "payload": {
            "id": id,
            "type": event_type,
            "time": now,
            "properties": properties.clone(),
            "data": properties.clone(),
        }
    });
    if let Some(obj) = properties.as_object() {
        if let Some(map) = payload.as_object_mut() {
            for (k, v) in obj {
                map.insert(k.clone(), v.clone());
            }
        }
    }
    let _ = tx.send(payload);
}

pub fn store_file_path() -> PathBuf {
    arunaki_data_dir().join("sessions-store.json")
}

pub fn load_store() -> SessionStoreData {
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

pub fn save_store(store: &SessionStoreData) {
    let p = store_file_path();
    if let Ok(raw) = serde_json::to_string(store) {
        let _ = std::fs::write(p, raw);
    }
}

pub fn with_store<F, R>(f: F) -> R
where
    F: FnOnce(&mut SessionStoreData) -> R,
{
    let m = SESSION_STORE.get_or_init(|| Mutex::new(load_store()));
    let mut guard = m.lock().unwrap_or_else(|e| e.into_inner());
    f(&mut guard)
}

pub fn set_active_run(session_id: &str, running: bool) {
    let m = ACTIVE_RUNS.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(mut guard) = m.lock() {
        if running {
            guard.insert(session_id.to_string(), true);
        } else {
            guard.remove(session_id);
        }
    }
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
