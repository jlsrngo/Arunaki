//! Document Extraction Tool — specialized readers for Excel, Word, PowerPoint, and PDF files.
//! Integrates native parser sidecar `arunaki_docs`.

use serde_json::{json, Value};

use super::resolve_isolated_path;

pub fn doc_read_tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "type": "function",
            "function": {
                "name": "excel_read",
                "description": "Read sheet names, tables, and data cells from an Excel workbook (.xlsx / .xls).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": { "type": "string", "description": "Relative path to Excel file." }
                    },
                    "required": ["file"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "word_read",
                "description": "Read paragraphs, headings, and tables from a Word document (.docx).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": { "type": "string", "description": "Relative path to Word file." }
                    },
                    "required": ["file"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "ppt_read",
                "description": "Read slide titles, shapes, notes, and text from a PowerPoint presentation (.pptx).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": { "type": "string", "description": "Relative path to PowerPoint file." }
                    },
                    "required": ["file"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "pdf_read",
                "description": "Extract plain text and structured pages from a PDF document.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": { "type": "string", "description": "Relative path to PDF file." },
                        "max_pages": { "type": "number", "description": "Maximum number of pages to read (default: 30)." }
                    },
                    "required": ["file"]
                }
            }
        }),
    ]
}

pub fn execute_excel_read(workspace_dir: &str, arguments: &Value) -> Value {
    let fp = arguments.get("file").and_then(|v| v.as_str()).unwrap_or("");
    match resolve_isolated_path(workspace_dir, fp) {
        Ok(p) => match arunaki_docs::build_excel_map(&p.to_string_lossy()) {
            Ok(s) => serde_json::from_str(&s).unwrap_or_else(|_| Value::String(s)),
            Err(e) => json!({ "error": e }),
        },
        Err(e) => json!({ "error": e }),
    }
}

pub fn execute_word_read(workspace_dir: &str, arguments: &Value) -> Value {
    let fp = arguments.get("file").and_then(|v| v.as_str()).unwrap_or("");
    match resolve_isolated_path(workspace_dir, fp) {
        Ok(p) => match arunaki_docs::build_word_map(&p.to_string_lossy()) {
            Ok(s) => serde_json::from_str(&s).unwrap_or_else(|_| Value::String(s)),
            Err(e) => json!({ "error": e }),
        },
        Err(e) => json!({ "error": e }),
    }
}

pub fn execute_ppt_read(workspace_dir: &str, arguments: &Value) -> Value {
    let fp = arguments.get("file").and_then(|v| v.as_str()).unwrap_or("");
    match resolve_isolated_path(workspace_dir, fp) {
        Ok(p) => match arunaki_docs::build_ppt_map(&p.to_string_lossy()) {
            Ok(s) => serde_json::from_str(&s).unwrap_or_else(|_| Value::String(s)),
            Err(e) => json!({ "error": e }),
        },
        Err(e) => json!({ "error": e }),
    }
}

pub fn execute_pdf_read(workspace_dir: &str, arguments: &Value) -> Value {
    let fp = arguments.get("file").and_then(|v| v.as_str()).unwrap_or("");
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
