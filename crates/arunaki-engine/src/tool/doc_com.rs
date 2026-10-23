//! Document COM Automation Tool — Windows COM automation for Excel, Word, PowerPoint.
//! Controls desktop applications for high-fidelity formatting, tables, and editing.

use serde_json::{json, Value};

use super::resolve_isolated_path;

pub fn doc_com_tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "type": "function",
            "function": {
                "name": "excel_com",
                "description": include_str!("prompt/excel_com.txt"),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": { "type": "string", "description": "Relative path to Excel file." },
                        "action": { "type": "string", "enum": ["open", "format", "write", "summary"], "description": "Action to perform." },
                        "sheet": { "type": "string", "description": "Sheet name to target." },
                        "cell": { "type": "string", "description": "Target cell (e.g. A1, B5)." },
                        "value": { "type": "string", "description": "Value or formula to write." },
                        "bold": { "type": "boolean" },
                        "italic": { "type": "boolean" },
                        "fontSize": { "type": "number" },
                        "bgColor": { "type": "number", "description": "RGB integer color." },
                        "alignment": { "type": "string", "enum": ["left", "center", "right"] },
                        "sourceSheet": { "type": "string" }
                    },
                    "required": ["file", "action"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "word_com",
                "description": include_str!("prompt/word_com.txt"),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": { "type": "string", "description": "Relative path to Word document." },
                        "action": { "type": "string", "enum": ["open", "append", "replace", "format"], "description": "Action to perform." },
                        "text": { "type": "string", "description": "Text content to insert." },
                        "paragraphIndex": { "type": "number" },
                        "findText": { "type": "string" },
                        "replaceText": { "type": "string" },
                        "bold": { "type": "boolean" },
                        "fontSize": { "type": "number" },
                        "alignment": { "type": "string", "enum": ["left", "center", "right"] }
                    },
                    "required": ["file", "action"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "ppt_com",
                "description": include_str!("prompt/ppt_com.txt"),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": { "type": "string", "description": "Relative path to PowerPoint presentation." },
                        "action": { "type": "string", "enum": ["open", "add_slide", "set_text"], "description": "Action to perform." },
                        "slideNumber": { "type": "number" },
                        "shapeIndex": { "type": "number" },
                        "shapeName": { "type": "string" },
                        "text": { "type": "string" },
                        "title": { "type": "string" }
                    },
                    "required": ["file", "action"]
                }
            }
        }),
    ]
}

pub async fn execute_doc_com(
    name: &str,
    workspace_dir: &str,
    arguments: &Value,
) -> Value {
    let fp = arguments.get("file").and_then(|v| v.as_str()).unwrap_or("");
    let action = arguments
        .get("action")
        .and_then(|v| v.as_str())
        .unwrap_or("open")
        .to_string();

    match resolve_isolated_path(workspace_dir, fp) {
        Ok(p) => {
            let abs = p.to_string_lossy().to_string();
            let script = if name == "excel_com" {
                let params = arunaki_docs::ExcelComParams {
                    action,
                    file_path: Some(abs),
                    sheet_name: arguments
                        .get("sheet")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    cell: arguments
                        .get("cell")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    value: arguments
                        .get("value")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    cells: vec![],
                    bold: arguments.get("bold").and_then(|v| v.as_bool()),
                    italic: arguments.get("italic").and_then(|v| v.as_bool()),
                    font_size: arguments.get("fontSize").and_then(|v| v.as_f64()),
                    bg_color: arguments.get("bgColor").and_then(|v| v.as_i64()),
                    alignment: arguments
                        .get("alignment")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    source_sheet: arguments
                        .get("sourceSheet")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    new_sheet_name: None,
                };
                arunaki_docs::build_excel_com_script(&params)
            } else if name == "word_com" {
                let params = arunaki_docs::WordComParams {
                    action,
                    file_path: Some(abs),
                    text: arguments
                        .get("text")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    paragraph_index: arguments
                        .get("paragraphIndex")
                        .and_then(|v| v.as_u64())
                        .map(|n| n as usize),
                    find_text: arguments
                        .get("findText")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    replace_text: arguments
                        .get("replaceText")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    bold: arguments.get("bold").and_then(|v| v.as_bool()),
                    font_size: arguments.get("fontSize").and_then(|v| v.as_f64()),
                    alignment: arguments
                        .get("alignment")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                };
                arunaki_docs::build_word_com_script(&params)
            } else {
                let params = arunaki_docs::PptComParams {
                    action,
                    file_path: Some(abs),
                    slide_number: arguments
                        .get("slideNumber")
                        .and_then(|v| v.as_u64())
                        .map(|n| n as usize),
                    shape_index: arguments
                        .get("shapeIndex")
                        .and_then(|v| v.as_u64())
                        .map(|n| n as usize),
                    shape_name: arguments
                        .get("shapeName")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    text: arguments
                        .get("text")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    title: arguments
                        .get("title")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    layout: None,
                };
                arunaki_docs::build_ppt_com_script(&params)
            };

            let prefix = name.to_string();
            let res = tokio::task::spawn_blocking(move || {
                arunaki_docs::run_powershell_script(&prefix, &script)
            })
            .await
            .unwrap_or_else(|e| Err(e.to_string()));

            match res {
                Ok(out) => {
                    if out.starts_with("ERROR:") {
                        json!({ "error": out })
                    } else {
                        json!({ "ok": true, "output": out })
                    }
                }
                Err(e) => json!({ "error": e }),
            }
        }
        Err(e) => json!({ "error": e }),
    }
}
