//! Session data model, persistent store & run lifecycle.
use crate::paths::arunaki_data_dir;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SessionStoreData {
    #[serde(default)]
    pub sessions: HashMap<String, Value>,
    #[serde(default)]
    pub messages: HashMap<String, Vec<Value>>,
}

static SESSION_STORE: OnceLock<Mutex<SessionStoreData>> = OnceLock::new();
pub static ACTIVE_RUNS: OnceLock<Mutex<HashMap<String, bool>>> = OnceLock::new();

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

