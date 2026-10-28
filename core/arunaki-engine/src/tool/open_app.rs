//! Document App Launch Tool — opens in-app document applications in Arunaki Center Panel.
//! Supports WordCraft, GridCraft, PdfCraft, and DeckCraft.

use std::path::Path;
use serde_json::{json, Value};
use crate::session::message::emit_event;

pub fn open_app_tool_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "open_document_app",
            "description": include_str!("prompt/open_document_app.txt"),
            "parameters": {
                "type": "object",
                "properties": {
                    "app": {
                        "type": "string",
                        "enum": ["wordcraft", "gridcraft", "pdfcraft", "deckcraft"],
                        "description": "The ArtCraft document application to open in the Center Panel: 'wordcraft', 'gridcraft', 'pdfcraft', or 'deckcraft'."
                    },
                    "title": {
                        "type": "string",
                        "description": "Optional title/document name (e.g. 'Kata-Kata Hari Ini', 'Laporan Keuangan', 'Project Proposal')."
                    },
                    "path": {
                        "type": "string",
                        "description": "Optional relative file path inside active project folder (e.g. 'kata_kata_hari_ini.docx', 'laporan.xlsx'). If provided, the document is linked to this file."
                    },
                    "content": {
                        "type": "string",
                        "description": "Optional initial document text, markdown, or CSV content to load."
                    }
                },
                "required": ["app"]
            }
        }
    })
}

pub fn execute_open_app(session_id: &str, workspace_dir: &str, arguments: &Value) -> Value {
    let raw_app = arguments
        .get("app")
        .or_else(|| arguments.get("name"))
        .or_else(|| arguments.get("application"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_lowercase();

    let app = match raw_app.as_str() {
        "word" | "wordcraft" | "doc" | "docx" | "document" => "wordcraft",
        "grid" | "gridcraft" | "excel" | "xlsx" | "csv" | "spreadsheet" => "gridcraft",
        "pdf" | "pdfcraft" => "pdfcraft",
        "deck" | "deckcraft" | "ppt" | "pptx" | "slides" | "presentation" => "deckcraft",
        _ => "wordcraft",
    };

    let default_title = match app {
        "wordcraft" => "WordCraft",
        "gridcraft" => "GridCraft",
        "pdfcraft" => "PdfCraft",
        "deckcraft" => "DeckCraft",
        _ => "Document",
    };

    let default_ext = match app {
        "wordcraft" => "docx",
        "gridcraft" => "xlsx",
        "pdfcraft" => "pdf",
        "deckcraft" => "pptx",
        _ => "txt",
    };

    let raw_title = arguments
        .get("title")
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());

    let raw_path = arguments
        .get("path")
        .or_else(|| arguments.get("filePath"))
        .or_else(|| arguments.get("file"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());

    let (final_title, final_path) = match (raw_path, raw_title) {
        (Some(p), Some(t)) => {
            let title_with_ext = if t.contains('.') {
                t.to_string()
            } else {
                format!("{}.{}", t, default_ext)
            };
            (title_with_ext, p.to_string())
        }
        (Some(p), None) => {
            let fname = Path::new(p)
                .file_name()
                .and_then(|f| f.to_str())
                .unwrap_or(p);
            (fname.to_string(), p.to_string())
        }
        (None, Some(t)) if !t.eq_ignore_ascii_case(default_title) => {
            let with_ext = if t.contains('.') {
                t.to_string()
            } else {
                format!("{}.{}", t, default_ext)
            };
            (with_ext.clone(), with_ext)
        }
        _ => (
            default_title.to_string(),
            format!("{}.{}", default_title, default_ext),
        ),
    };

    let content = arguments
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    // If workspace_dir is valid and content or a specific document file is specified,
    // write the file to the workspace folder so it physically exists in File Explorer!
    if !workspace_dir.trim().is_empty() && (!content.trim().is_empty() || final_title != default_title) {
        let target_file_path = Path::new(workspace_dir).join(&final_path);
        if let Some(parent) = target_file_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if !target_file_path.exists() || !content.trim().is_empty() {
            let initial_text = if content.is_empty() {
                format!("# {}\n\nCreated with Arunaki.\n", final_title)
            } else {
                content.to_string()
            };
            let ext = target_file_path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            if ext == "docx" {
                if let Ok(docx_bytes) = arunaki_docs::create_docx_from_markdown(&initial_text) {
                    let _ = std::fs::write(&target_file_path, docx_bytes);
                } else {
                    let _ = std::fs::write(&target_file_path, &initial_text);
                }
            } else {
                let _ = std::fs::write(&target_file_path, &initial_text);
            }
            emit_event(
                workspace_dir,
                "file.edited",
                json!({ "file": final_path, "sessionID": session_id }),
            );
        }
    }

    emit_event(
        workspace_dir,
        "open_document_app",
        json!({
            "app": app,
            "title": final_title,
            "path": final_path,
            "content": content,
            "sessionID": session_id,
        }),
    );

    json!({
        "ok": true,
        "app": app,
        "title": final_title,
        "path": final_path,
        "message": format!("Successfully launched {} in the Center Panel Workstation.", final_title)
    })
}
