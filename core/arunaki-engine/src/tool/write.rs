//! Document Write Tool — mirrors `packages/engine/engine/src/tool/write.ts`.
//! Creates or updates a file inside the isolated active project folder.

use serde_json::{json, Value};

use super::resolve_isolated_path;
use crate::session::message::emit_event;

pub fn write_tool_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "write",
            "description": include_str!("prompt/write.txt"),
            "parameters": {
                "type": "object",
                "properties": {
                    "filePath": { "type": "string", "description": "Relative path to the file inside workspace." },
                    "content": { "type": "string", "description": "Full file content to write." }
                },
                "required": ["filePath", "content"]
            }
        }
    })
}

pub fn execute_write(session_id: &str, workspace_dir: &str, arguments: &Value) -> Value {
    let fp = arguments
        .get("filePath")
        .or_else(|| arguments.get("path"))
        .or_else(|| arguments.get("file"))
        .or_else(|| arguments.get("target"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let content = arguments
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    match resolve_isolated_path(workspace_dir, fp) {
        Ok(p) => {
            let before_content = std::fs::read_to_string(&p).unwrap_or_default();
            if let Some(parent) = p.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if !before_content.is_empty() {
                crate::files::record_document_change(fp, &before_content, content);
            }
            match std::fs::write(&p, content) {
                Ok(_) => {
                    emit_event(
                        workspace_dir,
                        "file.edited",
                        json!({
                            "file": fp,
                            "sessionID": session_id,
                            "before": before_content,
                            "after": content
                        }),
                    );
                    json!({ "ok": true, "bytesWritten": content.len() })
                }
                Err(e) => json!({ "error": format!("Write error: {}", e) }),
            }
        }
        Err(e) => json!({ "error": e }),
    }
}
