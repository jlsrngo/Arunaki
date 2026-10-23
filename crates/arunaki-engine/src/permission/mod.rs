#![allow(dead_code)]
//! Permission module â€” mirrors `packages/engine/engine/src/permission`.
//! Evaluates permission rules (wildcard pattern matching) and coordinates
//! interactive permissions for file operations and document tools.

use axum::{
    extract::Path as AxumPath,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use tokio::sync::oneshot;

use crate::paths::gen_id;
use crate::session::message::emit_event;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionRule {
    pub permission: String,
    pub pattern: String,
    pub action: String, // "allow", "deny", "ask"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionRequest {
    pub id: String,
    pub session_id: String,
    pub permission: String,
    pub patterns: Vec<String>,
    pub metadata: Value,
    pub always: Vec<String>,
    pub tool: Option<Value>,
}

pub struct PendingPermission {
    pub request: PermissionRequest,
    pub directory: String,
    pub reply_tx: Option<oneshot::Sender<PermissionReply>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionReply {
    pub reply: String, // "once", "always", "reject"
    pub message: Option<String>,
}

static PENDING_PERMISSIONS: OnceLock<Mutex<HashMap<String, PendingPermission>>> = OnceLock::new();
static APPROVED_RULES: OnceLock<Mutex<Vec<PermissionRule>>> = OnceLock::new();

pub fn router() -> Router {
    Router::new()
        .route("/api/permission", get(handle_permission_list))
        .route("/permission", get(handle_permission_list))
        .route(
            "/api/permission/:reqId/reply",
            post(handle_permission_reply_global),
        )
        .route(
            "/permission/:reqId/reply",
            post(handle_permission_reply_global),
        )
        .route(
            "/api/session/:id/permission",
            post(handle_session_permission_respond),
        )
        .route(
            "/session/:id/permission",
            post(handle_session_permission_respond),
        )
        .route(
            "/api/session/:id/permissions/:permissionID",
            post(handle_session_permission_respond),
        )
        .route(
            "/session/:id/permissions/:permissionID",
            post(handle_session_permission_respond),
        )
}

/// Matches simple wildcard expressions (e.g. `*`, `file/*`, `*.txt`).
pub fn wildcard_match(pattern: &str, target: &str) -> bool {
    if pattern == "*" || pattern.is_empty() {
        return true;
    }
    if !pattern.contains('*') {
        return pattern == target;
    }
    let parts: Vec<&str> = pattern.split('*').collect();
    if parts.len() == 2 {
        let prefix = parts[0];
        let suffix = parts[1];
        return target.starts_with(prefix) && target.ends_with(suffix);
    }
    target.contains(parts[0])
}

pub fn evaluate(permission: &str, pattern: &str) -> String {
    let m = APPROVED_RULES.get_or_init(|| Mutex::new(Vec::new()));
    if let Ok(guard) = m.lock() {
        for rule in guard.iter().rev() {
            if wildcard_match(&rule.permission, permission)
                && wildcard_match(&rule.pattern, pattern)
            {
                return rule.action.clone();
            }
        }
    }
    "allow".to_string() // Default to allow within isolated workspace
}

pub async fn ask_permission(
    session_id: &str,
    permission: &str,
    patterns: Vec<String>,
    metadata: Value,
    workspace_dir: &str,
) -> Result<(), String> {
    // Check if all patterns are already allowed
    let mut needs_ask = false;
    for pat in &patterns {
        let action = evaluate(permission, pat);
        if action == "deny" {
            return Err(format!("Permission denied by rule for pattern '{}'", pat));
        }
        if action == "ask" {
            needs_ask = true;
        }
    }

    if !needs_ask {
        return Ok(());
    }

    let req_id = gen_id("perm");
    let req = PermissionRequest {
        id: req_id.clone(),
        session_id: session_id.to_string(),
        permission: permission.to_string(),
        patterns: patterns.clone(),
        metadata,
        always: patterns.clone(),
        tool: None,
    };

    let (tx, rx) = oneshot::channel();
    {
        let m = PENDING_PERMISSIONS.get_or_init(|| Mutex::new(HashMap::new()));
        if let Ok(mut g) = m.lock() {
            g.insert(
                req_id.clone(),
                PendingPermission {
                    request: req.clone(),
                    directory: workspace_dir.to_string(),
                    reply_tx: Some(tx),
                },
            );
        }
    }

    emit_event(
        workspace_dir,
        "permission.asked",
        serde_json::to_value(&req).unwrap_or_default(),
    );

    let reply = tokio::time::timeout(std::time::Duration::from_secs(300), rx).await;
    match reply {
        Ok(Ok(rep)) => {
            if rep.reply == "reject" {
                Err(rep
                    .message
                    .unwrap_or_else(|| "Permission rejected by user".to_string()))
            } else {
                if rep.reply == "always" {
                    let m = APPROVED_RULES.get_or_init(|| Mutex::new(Vec::new()));
                    if let Ok(mut g) = m.lock() {
                        for pat in patterns {
                            g.push(PermissionRule {
                                permission: permission.to_string(),
                                pattern: pat,
                                action: "allow".to_string(),
                            });
                        }
                    }
                }
                Ok(())
            }
        }
        _ => Err("Permission request timed out".to_string()),
    }
}

async fn handle_permission_list() -> Response {
    let m = PENDING_PERMISSIONS.get_or_init(|| Mutex::new(HashMap::new()));
    let list: Vec<PermissionRequest> = m
        .lock()
        .map(|g| g.values().map(|p| p.request.clone()).collect())
        .unwrap_or_default();
    Json(json!({ "data": list })).into_response()
}

async fn handle_permission_reply_global(
    AxumPath(req_id): AxumPath<String>,
    Json(body): Json<Value>,
) -> Response {
    let m = PENDING_PERMISSIONS.get_or_init(|| Mutex::new(HashMap::new()));
    let removed = m.lock().ok().and_then(|mut g| g.remove(&req_id));
    if let Some(mut pend) = removed {
        let reply_str = body
            .get("reply")
            .and_then(|v| v.as_str())
            .unwrap_or("once")
            .to_string();
        let message = body
            .get("message")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        emit_event(
            &pend.directory,
            "permission.replied",
            json!({
                "sessionID": pend.request.session_id,
                "requestID": pend.request.id,
                "reply": reply_str
            }),
        );
        if let Some(tx) = pend.reply_tx.take() {
            let _ = tx.send(PermissionReply {
                reply: reply_str,
                message,
            });
        }
    }
    Json(json!(true)).into_response()
}

pub async fn handle_session_permission_respond(
    AxumPath(_sid): AxumPath<String>,
    Json(body): Json<Value>,
) -> Response {
    let req_id = body
        .get("requestID")
        .or_else(|| body.get("id"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    handle_permission_reply_global(AxumPath(req_id.to_string()), Json(body)).await
}
