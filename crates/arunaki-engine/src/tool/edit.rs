//! Document Edit Tool — mirrors `packages/engine/engine/src/tool/edit.ts`.
//! Modifies existing files by replacing exact target text with replacement text.

use serde_json::{json, Value};

use super::resolve_isolated_path;
use crate::session::message::emit_event;

pub fn edit_tool_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "edit",
            "description": include_str!("prompt/edit.txt"),
            "parameters": {
                "type": "object",
                "properties": {
                    "filePath": { "type": "string", "description": "Relative path to the file inside workspace." },
                    "target": { "type": "string", "description": "The exact existing character sequence to replace." },
                    "replacement": { "type": "string", "description": "The replacement string." }
                },
                "required": ["filePath", "target", "replacement"]
            }
        }
    })
}

pub fn execute_edit(session_id: &str, workspace_dir: &str, arguments: &Value) -> Value {
    let fp = arguments
        .get("filePath")
        .or_else(|| arguments.get("path"))
        .or_else(|| arguments.get("file"))
        .or_else(|| arguments.get("targetFile"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let target = arguments
        .get("target")
        .or_else(|| arguments.get("oldString"))
        .or_else(|| arguments.get("old_string"))
        .or_else(|| arguments.get("find"))
        .or_else(|| arguments.get("search"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let replacement = arguments
        .get("replacement")
        .or_else(|| arguments.get("newString"))
        .or_else(|| arguments.get("new_string"))
        .or_else(|| arguments.get("replace"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if target.is_empty() {
        return json!({ "error": "Target string cannot be empty." });
    }

    match resolve_isolated_path(workspace_dir, fp) {
        Ok(p) => match std::fs::read_to_string(&p) {
            Ok(content) => {
                if !content.contains(target) {
                    return json!({
                        "error": format!("Target string not found in '{}'", fp)
                    });
                }
                let count = content.matches(target).count();
                let updated = content.replace(target, replacement);
                match std::fs::write(&p, updated) {
                    Ok(_) => {
                        emit_event(
                            workspace_dir,
                            "file.edited",
                            json!({ "file": fp, "sessionID": session_id }),
                        );
                        json!({ "ok": true, "occurrencesReplaced": count })
                    }
                    Err(e) => json!({ "error": format!("Write error: {}", e) }),
                }
            }
            Err(e) => json!({ "error": format!("Read error: {}", e) }),
        },
        Err(e) => json!({ "error": e }),
    }
}
