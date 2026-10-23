use crate::files::collect_files_recursive;
use crate::paths::{contains_path, gen_id};
use crate::sessions::storage::{emit_event, PendingQuestion, PENDING_QUESTIONS};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tokio::sync::oneshot;

pub fn should_attach_document_tools(prompt_text: &str, history: &[Value]) -> bool {
    let lower = prompt_text.to_lowercase();
    // Skip attaching heavy tool schemas for simple greetings or pure arithmetic questions
    let doc_keywords = [
        "excel", "xlsx", "xls", "csv", "word", "docx", "doc", "ppt", "pptx", "slide", "pdf",
        "file", "folder", "dokumen", "laporan", "rekap", "tabel", "sheet", "kolom", "baris",
        "cell", "baca", "tulis", "buat", "edit", "ubah", "format", "cari", "read", "write",
        "update", "open", "buka", "hitung", "total", "daftar", "list", "cek", "check", "isi",
    ];
    if doc_keywords.iter().any(|k| lower.contains(k)) {
        return true;
    }
    // Also attach if history had tool calls
    history.iter().any(|m| {
        m.get("content")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().any(|p| p.get("type").and_then(|t| t.as_str()) == Some("tool")))
            .unwrap_or(false)
    })
}

pub fn build_tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "type": "function",
            "function": {
                "name": "glob",
                "description": "List files in the active workspace folder",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pattern": { "type": "string", "description": "Optional filename filter" }
                    }
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "read",
                "description": "Read a text file inside the workspace folder",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "filePath": { "type": "string", "description": "Relative or absolute path inside workspace" }
                    },
                    "required": ["filePath"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "write",
                "description": "Write or create a text file inside the workspace folder",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "filePath": { "type": "string" },
                        "content": { "type": "string" }
                    },
                    "required": ["filePath", "content"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "excel_read",
                "description": "Read an Excel (.xlsx) or CSV (.csv) file and return its sheets, headers, sample rows, and formulas",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": { "type": "string", "description": "Path to .xlsx or .csv file" },
                        "max_rows": { "type": "number", "description": "Max sample rows per sheet (default 50)" }
                    },
                    "required": ["file"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "excel_com",
                "description": "Create or edit an Excel (.xlsx) workbook using live Microsoft Excel COM automation",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": { "type": "string", "description": "Target .xlsx file path" },
                        "visible": { "type": "boolean" },
                        "save": { "type": "boolean" },
                        "operations": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "op": { "type": "string" },
                                    "sheet": { "type": "string" },
                                    "cell": { "type": "string" },
                                    "range": { "type": "string" },
                                    "value": {},
                                    "values": { "type": "array", "items": { "type": "array", "items": {} } },
                                    "formula": { "type": "string" }
                                },
                                "required": ["op"]
                            }
                        }
                    },
                    "required": ["file", "operations"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "word_read",
                "description": "Read a Word (.docx) document and return its paragraphs, headings, and tables",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": { "type": "string", "description": "Path to .docx file" }
                    },
                    "required": ["file"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "word_com",
                "description": "Create or edit a Word (.docx) document using live Microsoft Word COM automation",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": { "type": "string" },
                        "visible": { "type": "boolean" },
                        "save": { "type": "boolean" },
                        "operations": { "type": "array", "items": { "type": "object" } }
                    },
                    "required": ["file", "operations"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "ppt_read",
                "description": "Read a PowerPoint (.pptx) presentation and return its slides, text shapes, and tables",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": { "type": "string", "description": "Path to .pptx file" }
                    },
                    "required": ["file"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "ppt_com",
                "description": "Create or edit a PowerPoint (.pptx) presentation using live PowerPoint COM automation",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": { "type": "string" },
                        "visible": { "type": "boolean" },
                        "save": { "type": "boolean" },
                        "operations": { "type": "array", "items": { "type": "object" } }
                    },
                    "required": ["file", "operations"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "pdf_read",
                "description": "Read a PDF (.pdf) document and return its extracted page text",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": { "type": "string", "description": "Path to .pdf file" },
                        "max_pages": { "type": "number" }
                    },
                    "required": ["file"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "question",
                "description": "Ask the user an interactive multiple-choice question when clarification is required",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "questions": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "header": { "type": "string" },
                                    "question": { "type": "string" },
                                    "multiple": { "type": "boolean" },
                                    "options": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "label": { "type": "string" },
                                                "description": { "type": "string" }
                                            },
                                            "required": ["label"]
                                        }
                                    }
                                },
                                "required": ["question", "options"]
                            }
                        }
                    },
                    "required": ["questions"]
                }
            }
        }),
    ]
}

pub fn resolve_isolated_path(workspace_dir: &str, raw_file: &str) -> Result<PathBuf, String> {
    let base = Path::new(workspace_dir);
    let candidate = Path::new(raw_file);
    let resolved = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        base.join(raw_file)
    };
    if !contains_path(base, &resolved) {
        return Err(format!(
            "Project Folder Isolation Error: '{}' is outside the active project folder '{}'",
            raw_file, workspace_dir
        ));
    }
    Ok(resolved)
}

pub async fn execute_tool_call(
    session_id: &str,
    assistant_msg_id: &str,
    call_id: &str,
    name: &str,
    arguments: &Value,
    workspace_dir: &str,
) -> Value {
    match name {
        "question" => {
            let questions = arguments
                .get("questions")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let req_id = gen_id("req");
            let tool_val = json!({
                "callID": call_id,
                "messageID": assistant_msg_id,
                "sessionID": session_id,
                "name": name,
                "args": arguments
            });

            let (tx, rx) = oneshot::channel();
            {
                let m = PENDING_QUESTIONS.get_or_init(|| Mutex::new(std::collections::HashMap::new()));
                if let Ok(mut g) = m.lock() {
                    g.insert(
                        req_id.clone(),
                        PendingQuestion {
                            id: req_id.clone(),
                            session_id: session_id.to_string(),
                            directory: workspace_dir.to_string(),
                            questions: questions.clone(),
                            tool: tool_val.clone(),
                            reply_tx: Some(tx),
                        },
                    );
                }
            }

            emit_event(
                workspace_dir,
                "question.v2.asked",
                json!({
                    "id": req_id,
                    "sessionID": session_id,
                    "questions": questions,
                    "tool": tool_val
                }),
            );

            // Wait for user answer up to 10 minutes
            let ans = tokio::time::timeout(std::time::Duration::from_secs(600), rx).await;
            match ans {
                Ok(Ok(Some(answers))) => json!({ "answers": answers }),
                Ok(Ok(None)) => json!({ "rejected": true, "message": "User declined or cancelled question." }),
                _ => json!({ "timed_out": true, "message": "User question timed out." }),
            }
        }
        "glob" => {
            let mut out_paths = Vec::new();
            let base_p = Path::new(workspace_dir);
            collect_files_recursive(base_p, base_p, &mut out_paths, 500);
            let files: Vec<String> = out_paths.into_iter().map(|p| p.to_string_lossy().to_string()).collect();
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
        "read" => {
            let fp = arguments
                .get("filePath")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            match resolve_isolated_path(workspace_dir, fp) {
                Ok(p) => match std::fs::read_to_string(&p) {
                    Ok(content) => json!({ "content": content }),
                    Err(e) => json!({ "error": format!("Read error: {}", e) }),
                },
                Err(e) => json!({ "error": e }),
            }
        }
        "write" => {
            let fp = arguments
                .get("filePath")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let content = arguments
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            match resolve_isolated_path(workspace_dir, fp) {
                Ok(p) => {
                    if let Some(parent) = p.parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }
                    match std::fs::write(&p, content) {
                        Ok(_) => {
                            emit_event(
                                workspace_dir,
                                "file.edited",
                                json!({ "file": fp, "sessionID": session_id }),
                            );
                            json!({ "ok": true, "bytesWritten": content.len() })
                        }
                        Err(e) => json!({ "error": format!("Write error: {}", e) }),
                    }
                }
                Err(e) => json!({ "error": e }),
            }
        }
        "excel_read" => {
            let fp = arguments
                .get("file")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            match resolve_isolated_path(workspace_dir, fp) {
                Ok(p) => match arunaki_docs::build_excel_map(&p.to_string_lossy()) {
                    Ok(s) => serde_json::from_str(&s).unwrap_or_else(|_| Value::String(s)),
                    Err(e) => json!({ "error": e }),
                },
                Err(e) => json!({ "error": e }),
            }
        }
        "word_read" => {
            let fp = arguments
                .get("file")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            match resolve_isolated_path(workspace_dir, fp) {
                Ok(p) => match arunaki_docs::build_word_map(&p.to_string_lossy()) {
                    Ok(s) => serde_json::from_str(&s).unwrap_or_else(|_| Value::String(s)),
                    Err(e) => json!({ "error": e }),
                },
                Err(e) => json!({ "error": e }),
            }
        }
        "ppt_read" => {
            let fp = arguments
                .get("file")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            match resolve_isolated_path(workspace_dir, fp) {
                Ok(p) => match arunaki_docs::build_ppt_map(&p.to_string_lossy()) {
                    Ok(s) => serde_json::from_str(&s).unwrap_or_else(|_| Value::String(s)),
                    Err(e) => json!({ "error": e }),
                },
                Err(e) => json!({ "error": e }),
            }
        }
        "pdf_read" => {
            let fp = arguments
                .get("file")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let max_pages = arguments
                .get("max_pages")
                .and_then(|v| v.as_u64())
                .unwrap_or(30) as usize;
            match resolve_isolated_path(workspace_dir, fp) {
                Ok(p) => match arunaki_docs::build_pdf_map(&p.to_string_lossy(), Some(max_pages)) {
                    Ok(s) => serde_json::from_str(&s).unwrap_or_else(|_| Value::String(s)),
                    Err(e) => json!({ "error": e }),
                },
                Err(e) => json!({ "error": e }),
            }
        }
        "excel_com" | "word_com" | "ppt_com" => {
            let fp = arguments
                .get("file")
                .and_then(|v| v.as_str())
                .unwrap_or("");
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
                            sheet_name: arguments.get("sheet").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            cell: arguments.get("cell").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            value: arguments.get("value").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            cells: vec![],
                            bold: arguments.get("bold").and_then(|v| v.as_bool()),
                            italic: arguments.get("italic").and_then(|v| v.as_bool()),
                            font_size: arguments.get("fontSize").and_then(|v| v.as_f64()),
                            bg_color: arguments.get("bgColor").and_then(|v| v.as_i64()),
                            alignment: arguments.get("alignment").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            source_sheet: arguments.get("sourceSheet").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            new_sheet_name: None,
                        };
                        arunaki_docs::build_excel_com_script(&params)
                    } else if name == "word_com" {
                        let params = arunaki_docs::WordComParams {
                            action,
                            file_path: Some(abs),
                            text: arguments.get("text").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            paragraph_index: arguments.get("paragraphIndex").and_then(|v| v.as_u64()).map(|n| n as usize),
                            find_text: arguments.get("findText").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            replace_text: arguments.get("replaceText").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            bold: arguments.get("bold").and_then(|v| v.as_bool()),
                            font_size: arguments.get("fontSize").and_then(|v| v.as_f64()),
                            alignment: arguments.get("alignment").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        };
                        arunaki_docs::build_word_com_script(&params)
                    } else {
                        let params = arunaki_docs::PptComParams {
                            action,
                            file_path: Some(abs),
                            slide_number: arguments.get("slideNumber").and_then(|v| v.as_u64()).map(|n| n as usize),
                            shape_index: arguments.get("shapeIndex").and_then(|v| v.as_u64()).map(|n| n as usize),
                            shape_name: arguments.get("shapeName").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            text: arguments.get("text").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            title: arguments.get("title").and_then(|v| v.as_str()).map(|s| s.to_string()),
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
                        Ok(out) => json!({ "ok": true, "output": out }),
                        Err(e) => json!({ "error": e }),
                    }
                }
                Err(e) => json!({ "error": e }),
            }
        }
        _ => json!({ "error": format!("Unknown tool: {}", name) }),
    }
}
