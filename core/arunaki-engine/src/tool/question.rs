//! Question Tool â€” mirrors `packages/engine/engine/src/tool/question.ts`.
//! Pauses turn execution and asks the user interactive questions via `crate::question`.

use serde_json::{json, Value};

use crate::question::ask_question;

pub fn question_tool_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "question",
            "description": include_str!("prompt/question.txt"),
            "parameters": {
                "type": "object",
                "properties": {
                    "questions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "question": { "type": "string" },
                                "options": { "type": "array", "items": { "type": "string" } },
                                "is_multi_select": { "type": "boolean" }
                            },
                            "required": ["question", "options"]
                        }
                    }
                },
                "required": ["questions"]
            }
        }
    })
}

pub async fn execute_question(
    session_id: &str,
    assistant_msg_id: &str,
    call_id: &str,
    workspace_dir: &str,
    arguments: &Value,
) -> Value {
    let questions = arguments
        .get("questions")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    ask_question(
        session_id,
        assistant_msg_id,
        call_id,
        questions,
        workspace_dir,
    )
    .await
}
