//! Document Grep Tool — mirrors `packages/engine/engine/src/tool/grep.ts`.
//! Fast file content search using regex or substring matching within the workspace.

use serde_json::{json, Value};
use std::path::Path;

use super::resolve_isolated_path;
use crate::files::collect_files_recursive;

pub fn grep_tool_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "grep",
            "description": include_str!("prompt/grep.txt"),
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": { "type": "string", "description": "The regex or literal pattern to search for in file contents." },
                    "path": { "type": "string", "description": "Optional subdirectory or file to search in. Defaults to workspace root." },
                    "include": { "type": "string", "description": "Optional file pattern to include (e.g. '*.txt', '*.json', '*.csv')." }
                },
                "required": ["pattern"]
            }
        }
    })
}

pub fn execute_grep(workspace_dir: &str, arguments: &Value) -> Value {
    let pattern_str = arguments
        .get("pattern")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if pattern_str.is_empty() {
        return json!({ "error": "Pattern is required for grep." });
    }

    let sub_path = arguments
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or(".");
    let include_pattern = arguments
        .get("include")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_lowercase();

    let target_dir = match resolve_isolated_path(workspace_dir, sub_path) {
        Ok(p) => p,
        Err(e) => return json!({ "error": e }),
    };

    let mut all_files = Vec::new();
    let base = Path::new(workspace_dir);
    if target_dir.is_file() {
        all_files.push(target_dir.clone());
    } else {
        collect_files_recursive(base, &target_dir, &mut all_files, 300);
    }

    let mut matches = Vec::new();
    let mut files_scanned = 0usize;

    for fpath in all_files {
        let rel_name = fpath.to_string_lossy().to_string();
        if !include_pattern.is_empty() {
            let clean_filter = include_pattern.trim_start_matches('*');
            if !rel_name.to_lowercase().ends_with(clean_filter) {
                continue;
            }
        }

        files_scanned += 1;
        if let Ok(content) = std::fs::read_to_string(&fpath) {
            for (line_idx, line) in content.lines().enumerate() {
                if line.contains(pattern_str) {
                    matches.push(json!({
                        "file": rel_name,
                        "line": line_idx + 1,
                        "text": line.trim()
                    }));
                    if matches.len() >= 100 {
                        break;
                    }
                }
            }
        }
        if matches.len() >= 100 {
            break;
        }
    }

    if matches.is_empty() {
        return json!({
            "title": pattern_str,
            "matches": 0,
            "output": format!("No matches found for '{}' across {} files.", pattern_str, files_scanned)
        });
    }

    let total = matches.len();
    let mut output_lines = vec![format!("Found {} matches:", total)];
    let mut current_file = String::new();

    for m in &matches {
        let f = m["file"].as_str().unwrap_or("");
        let line_num = m["line"].as_u64().unwrap_or(0);
        let text = m["text"].as_str().unwrap_or("");
        if f != current_file {
            current_file = f.to_string();
            output_lines.push(format!("\n{}:", f));
        }
        output_lines.push(format!("  Line {}: {}", line_num, text));
    }

    json!({
        "title": pattern_str,
        "matches": total,
        "output": output_lines.join("\n"),
        "results": matches
    })
}
