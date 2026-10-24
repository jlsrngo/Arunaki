//! Document Glob/List Tool â€” mirrors `packages/engine/engine/src/tool/glob.ts`.
//! Recursively lists files within the isolated active project folder.

use serde_json::{json, Value};
use std::path::Path;

use crate::files::collect_files_recursive;

pub fn glob_tool_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "glob",
            "description": include_str!("prompt/glob.txt"),
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": { "type": "string", "description": "Optional substring or wildcard pattern to filter files by." }
                }
            }
        }
    })
}

pub fn execute_glob(workspace_dir: &str, arguments: &Value) -> Value {
    let mut out_paths = Vec::new();
    let base_p = Path::new(workspace_dir);
    collect_files_recursive(base_p, base_p, &mut out_paths, 500);
    let files: Vec<String> = out_paths
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    let pattern = arguments
        .get("pattern")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_lowercase();
    let filtered: Vec<String> = if pattern.is_empty() {
        files
    } else {
        files
            .into_iter()
            .filter(|f| f.to_lowercase().contains(&pattern))
            .collect()
    };
    json!({ "files": filtered })
}
