//! Document App Launch Tool — opens in-app document applications in Arunaki Center Panel.
//! Supports WordCraft, GridCraft, PdfCraft, and DeckCraft.

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
                        "description": "Optional title for the document tab (e.g. 'WordCraft', 'Laporan Keuangan', 'Project Proposal')."
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

    let title = arguments
        .get("title")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(default_title);

    let content = arguments
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    emit_event(
        workspace_dir,
        "open_document_app",
        json!({
            "app": app,
            "title": title,
            "content": content,
            "sessionID": session_id,
        }),
    );

    json!({
        "ok": true,
        "app": app,
        "title": title,
        "message": format!("Successfully launched {} in the Center Panel Workstation.", default_title)
    })
}
