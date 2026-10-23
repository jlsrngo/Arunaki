//! Todo Checklist Tool — mirrors `packages/engine/engine/src/tool/todo.ts`.
//! Maintains structured checklist items for multi-step task execution.

use serde_json::{json, Value};

use crate::session::message::emit_event;

pub fn todo_tool_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "todowrite",
            "description": include_str!("prompt/todowrite.txt"),
            "parameters": {
                "type": "object",
                "properties": {
                    "todos": {
                        "type": "array",
                        "description": "The updated list of todo items.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": { "type": "string" },
                                "content": { "type": "string" },
                                "status": { "type": "string", "enum": ["pending", "in_progress", "completed"] }
                            },
                            "required": ["content", "status"]
                        }
                    }
                },
                "required": ["todos"]
            }
        }
    })
}

pub fn execute_todowrite(
    session_id: &str,
    workspace_dir: &str,
    arguments: &Value,
) -> Value {
    let todos = arguments
        .get("todos")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    emit_event(
        workspace_dir,
        "todo.updated",
        json!({
            "sessionID": session_id,
            "todos": todos
        }),
    );

    let pending_count = todos
        .iter()
        .filter(|x| x.get("status").and_then(|s| s.as_str()) != Some("completed"))
        .count();

    json!({
        "title": format!("{} todos remaining", pending_count),
        "todos": todos,
        "output": format!("Updated todo checklist: {} total items, {} pending.", todos.len(), pending_count)
    })
}
