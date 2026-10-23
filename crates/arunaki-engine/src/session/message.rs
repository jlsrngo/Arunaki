//! Message/event emitter & pending question delegation.
use crate::paths::{gen_id, now_ms};
use serde_json::{json, Value};
use std::sync::OnceLock;
use tokio::sync::broadcast;

#[allow(unused_imports)]
pub use crate::question::{resolve_question_reply, PendingQuestion, PENDING_QUESTIONS};

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
