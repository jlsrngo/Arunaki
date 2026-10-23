//! Document Read Tool — mirrors `packages/engine/engine/src/tool/read.ts`.
//! Reads text files within the isolated active project folder.

use serde_json::{json, Value};

use super::resolve_isolated_path;

pub fn read_tool_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "read",
            "description": include_str!("prompt/read.txt"),
            "parameters": {
                "type": "object",
                "properties": {
                    "filePath": { "type": "string", "description": "Relative path to the file inside workspace." },
                    "offset": { "type": "number", "description": "Optional line offset to begin reading from." },
                    "limit": { "type": "number", "description": "Optional maximum number of lines to read." }
                },
                "required": ["filePath"]
            }
        }
    })
}

pub fn execute_read(workspace_dir: &str, arguments: &Value) -> Value {
    let fp = arguments
        .get("filePath")
        .or_else(|| arguments.get("path"))
        .or_else(|| arguments.get("file"))
        .or_else(|| arguments.get("target"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    match resolve_isolated_path(workspace_dir, fp) {
        Ok(p) => match std::fs::read_to_string(&p) {
            Ok(content) => {
                let offset = arguments.get("offset").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                let limit = arguments.get("limit").and_then(|v| v.as_u64()).map(|n| n as usize);

                if offset > 0 || limit.is_some() {
                    let lines: Vec<&str> = content.lines().collect();
                    let start = offset.min(lines.len());
                    let end = match limit {
                        Some(lim) => (start + lim).min(lines.len()),
                        None => lines.len(),
                    };
                    let sliced = lines[start..end].join("\n");
                    json!({ "content": sliced, "linesTotal": lines.len(), "offset": start, "linesReturned": end - start })
                } else {
                    json!({ "content": content })
                }
            }
            Err(e) => json!({ "error": format!("Read error: {}", e) }),
        },
        Err(e) => json!({ "error": e }),
    }
}
