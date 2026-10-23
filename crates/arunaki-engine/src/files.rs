use crate::paths::{contains_path, normalize_workspace_path};
use axum::{
    extract::Query,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use base64::Engine as _;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

pub fn router() -> Router {
    Router::new()
        .route("/file", get(handle_list))
        .route("/api/file", get(handle_list))
        .route(
            "/file/content",
            get(handle_content).post(handle_write_content),
        )
        .route(
            "/api/file/content",
            get(handle_content).post(handle_write_content),
        )
        .route("/file/status", get(handle_status))
        .route("/api/file/status", get(handle_status))
        .route("/find", get(handle_find_text))
        .route("/api/find", get(handle_find_text))
        .route("/find/file", get(handle_find_file))
        .route("/api/find/file", get(handle_find_file))
        .route("/find/symbol", get(handle_status))
        .route("/api/find/symbol", get(handle_status))
}

fn resolve_base_dir(q: &HashMap<String, String>, headers: &HeaderMap) -> PathBuf {
    if let Some(dir) = q.get("directory").or_else(|| q.get("workspacePath")) {
        if !dir.trim().is_empty() {
            return PathBuf::from(normalize_workspace_path(dir));
        }
    }
    if let Some(hdr) = headers
        .get("x-arunaki-directory")
        .or_else(|| headers.get("x-opencode-directory"))
        .and_then(|v| v.to_str().ok())
    {
        if !hdr.trim().is_empty() {
            let decoded = urlencoding_decode(hdr);
            return PathBuf::from(normalize_workspace_path(&decoded));
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

pub fn urlencoding_decode(s: &str) -> String {
    let mut out = Vec::new();
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(hex_str) = std::str::from_utf8(&bytes[i + 1..i + 3]) {
                if let Ok(b) = u8::from_str_radix(hex_str, 16) {
                    out.push(b);
                    i += 3;
                    continue;
                }
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

async fn handle_list(
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    let base_dir = resolve_base_dir(&q, &headers);
    let req_path = q.get("path").map(|s| s.as_str()).unwrap_or("");
    let target = if req_path.is_empty() || req_path == "." || req_path == "/" {
        base_dir.clone()
    } else {
        let p = Path::new(req_path);
        if p.is_absolute() {
            p.to_path_buf()
        } else {
            base_dir.join(req_path)
        }
    };

    if !contains_path(&base_dir, &target) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Access denied: path outside project folder" })),
        )
            .into_response();
    }

    let mut nodes = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&target) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name == ".git" || name == ".DS_Store" || name == "node_modules" {
                continue;
            }
            let full = entry.path();
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            let rel = full
                .strip_prefix(&base_dir)
                .unwrap_or(&full)
                .to_string_lossy()
                .replace('\\', "/");
            nodes.push(json!({
                "name": name,
                "path": rel,
                "absolute": full.to_string_lossy().replace('\\', "/"),
                "type": if is_dir { "directory" } else { "file" },
                "ignored": name.starts_with('.')
            }));
        }
    }

    nodes.sort_by(|a, b| {
        let ta = a.get("type").and_then(|v| v.as_str()).unwrap_or("file");
        let tb = b.get("type").and_then(|v| v.as_str()).unwrap_or("file");
        if ta != tb {
            if ta == "directory" {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            }
        } else {
            let na = a
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_lowercase();
            let nb = b
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_lowercase();
            na.cmp(&nb)
        }
    });

    Json(Value::Array(nodes)).into_response()
}

async fn handle_content(
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    let base_dir = resolve_base_dir(&q, &headers);
    let Some(req_path) = q.get("path") else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "path is required" })),
        )
            .into_response();
    };
    let p = Path::new(req_path);
    let target = if p.is_absolute() {
        p.to_path_buf()
    } else {
        base_dir.join(req_path)
    };

    if !contains_path(&base_dir, &target) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Access denied: path outside project folder" })),
        )
            .into_response();
    }

    let Ok(bytes) = std::fs::read(&target) else {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "File not found" })),
        )
            .into_response();
    };

    let ext = target
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let is_binary = matches!(
        ext.as_str(),
        "xlsx" | "xls" | "docx" | "pptx" | "pdf" | "png" | "jpg" | "jpeg" | "gif" | "webp" | "zip"
    ) || bytes.iter().take(512).any(|&b| b == 0);

    if is_binary {
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        let mime = match ext.as_str() {
            "pdf" => "application/pdf",
            "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            _ => "application/octet-stream",
        };
        let payload = json!({
            "type": "binary",
            "content": b64,
            "encoding": "base64",
            "mimeType": mime
        });
        return Json(json!({
            "data": payload,
            "type": "binary",
            "content": payload["content"],
            "encoding": "base64",
            "mimeType": mime
        }))
        .into_response();
    }

    let text = String::from_utf8_lossy(&bytes).to_string();
    let payload = json!({
        "type": "text",
        "content": text
    });
    Json(json!({
        "data": payload,
        "type": "text",
        "content": text
    }))
    .into_response()
}

async fn handle_write_content(
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    let base_dir = resolve_base_dir(&q, &headers);
    let req_path = q
        .get("path")
        .map(|s| s.as_str())
        .or_else(|| body.get("path").and_then(|v| v.as_str()));
    let Some(req_path) = req_path else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "path is required" })),
        )
            .into_response();
    };

    let p = Path::new(req_path);
    let target = if p.is_absolute() {
        p.to_path_buf()
    } else {
        base_dir.join(req_path)
    };

    if !contains_path(&base_dir, &target) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Access denied: path outside project folder" })),
        )
            .into_response();
    }

    let content = body
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if let Some(parent) = target.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    if let Err(e) = std::fs::write(&target, content) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    Json(json!({
        "success": true,
        "data": { "success": true }
    }))
    .into_response()
}

async fn handle_status() -> Response {
    Json(json!([])).into_response()
}

pub fn collect_files_recursive(dir: &Path, base: &Path, out: &mut Vec<PathBuf>, max_files: usize) {
    if out.len() >= max_files {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if out.len() >= max_files {
            break;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name == "node_modules" || name == "target" || name == "dist" {
            continue;
        }
        let path = entry.path();
        if !contains_path(base, &path) {
            continue;
        }
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            collect_files_recursive(&path, base, out, max_files);
        } else {
            out.push(path);
        }
    }
}

async fn handle_find_file(
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    let base_dir = resolve_base_dir(&q, &headers);
    let query_str = q
        .get("query")
        .map(|s| s.to_lowercase())
        .unwrap_or_default();
    let limit = q
        .get("limit")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(50);

    let mut all_files = Vec::new();
    collect_files_recursive(&base_dir, &base_dir, &mut all_files, 1500);

    let mut matches = Vec::new();
    for f in all_files {
        let rel = f
            .strip_prefix(&base_dir)
            .unwrap_or(&f)
            .to_string_lossy()
            .replace('\\', "/");
        if query_str.is_empty() || rel.to_lowercase().contains(&query_str) {
            matches.push(Value::String(rel));
            if matches.len() >= limit {
                break;
            }
        }
    }

    Json(Value::Array(matches)).into_response()
}

async fn handle_find_text(
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    let base_dir = resolve_base_dir(&q, &headers);
    let pattern = q
        .get("pattern")
        .map(|s| s.to_lowercase())
        .unwrap_or_default();
    if pattern.is_empty() {
        return Json(json!([])).into_response();
    }

    let mut all_files = Vec::new();
    collect_files_recursive(&base_dir, &base_dir, &mut all_files, 500);

    let mut results = Vec::new();
    for f in all_files {
        if results.len() >= 100 {
            break;
        }
        if let Ok(txt) = std::fs::read_to_string(&f) {
            let rel = f
                .strip_prefix(&base_dir)
                .unwrap_or(&f)
                .to_string_lossy()
                .replace('\\', "/");
            for (idx, line) in txt.lines().enumerate() {
                if line.to_lowercase().contains(&pattern) {
                    results.push(json!({
                        "path": { "text": rel },
                        "lines": { "text": line },
                        "line_number": idx + 1,
                        "absolute_offset": 0,
                        "submatches": []
                    }));
                    if results.len() >= 100 {
                        break;
                    }
                }
            }
        }
    }

    Json(Value::Array(results)).into_response()
}
