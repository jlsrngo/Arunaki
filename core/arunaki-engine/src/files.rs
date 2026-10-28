use crate::paths::{contains_path, normalize_workspace_path};
use axum::{
    extract::Query,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
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
        .route("/file/revert", post(handle_revert))
        .route("/api/file/revert", post(handle_revert))
        .route("/file/accept", post(handle_accept))
        .route("/api/file/accept", post(handle_accept))
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
            if name.starts_with('.')
                || name.starts_with("~$")
                || name == "node_modules"
            {
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

    let Ok(mut bytes) = std::fs::read(&target) else {
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

    if ext == "docx" && !bytes.starts_with(b"PK\x03\x04") {
        let text = String::from_utf8_lossy(&bytes).to_string();
        if let Ok(repaired) = arunaki_docs::create_docx_from_markdown(&text) {
            let _ = std::fs::write(&target, &repaired);
            bytes = repaired;
        }
    }

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

use std::sync::{Mutex, OnceLock};

pub static DOCUMENT_CHANGES: OnceLock<Mutex<HashMap<String, (String, String, u64)>>> =
    OnceLock::new();

fn is_ignored_change_path(rel_path: &str) -> bool {
    let norm = rel_path.replace('\\', "/");
    let trimmed = norm.trim_start_matches("./").trim_start_matches('/');
    if trimmed.is_empty()
        || trimmed.starts_with('.')
        || trimmed.starts_with("~$")
        || trimmed.contains("/.")
        || trimmed.contains("/~$")
    {
        return true;
    }
    let fname = Path::new(trimmed)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(trimmed);
    if fname.starts_with('.') || fname.starts_with("~$") {
        return true;
    }
    let ext = Path::new(fname)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    matches!(ext.as_str(), "py" | "ps1" | "sh" | "bat" | "cmd" | "bak" | "tmp")
}

pub fn record_document_change(workspace_dir: &str, file: &str, before: &str, after: &str) {
    if is_ignored_change_path(file) {
        return;
    }
    let store = DOCUMENT_CHANGES.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(mut lock) = store.lock() {
        lock.insert(
            file.to_string(),
            (
                before.to_string(),
                after.to_string(),
                crate::paths::now_ms(),
            ),
        );
    }

    // Persist baseline snapshot in .arunaki/baseline/<file>
    if !workspace_dir.trim().is_empty() {
        let base = Path::new(workspace_dir);
        let baseline_file = base.join(".arunaki").join("baseline").join(file);
        if !baseline_file.exists() {
            if let Some(parent) = baseline_file.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::write(&baseline_file, before);
        }
    }
}

pub fn remove_document_change(file: &str) {
    let store = DOCUMENT_CHANGES.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(mut lock) = store.lock() {
        lock.remove(file);
    }
}

async fn handle_status(
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    let base_dir = resolve_base_dir(&q, &headers);
    let store = DOCUMENT_CHANGES.get_or_init(|| Mutex::new(HashMap::new()));
    let mut items = Vec::new();

    // 1. Scan persistent baseline directory .arunaki/baseline/
    let baseline_dir = base_dir.join(".arunaki").join("baseline");
    if baseline_dir.exists() {
        let _ = std::fs::remove_dir_all(baseline_dir.join(".arunaki"));
        let mut baseline_files = Vec::new();
        collect_files_recursive(&baseline_dir, &baseline_dir, &mut baseline_files, 200);
        for bf in baseline_files {
            if let Ok(rel) = bf.strip_prefix(&baseline_dir) {
                let rel_str = rel.to_string_lossy().replace('\\', "/");
                if is_ignored_change_path(&rel_str) {
                    let _ = std::fs::remove_file(&bf);
                    continue;
                }
                let current_file = base_dir.join(&rel);
                if current_file.exists() {
                    let before = std::fs::read_to_string(&bf).unwrap_or_default();
                    let after = std::fs::read_to_string(&current_file).unwrap_or_default();
                    if before != after {
                        let file_name = rel
                            .file_name()
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_else(|| rel_str.clone());
                        let is_new = before.trim().is_empty();
                        items.push(json!({
                            "path": rel_str,
                            "name": file_name,
                            "status": if is_new { "new" } else { "modified" },
                            "before": before,
                            "after": after,
                            "before_content": before,
                            "after_content": after,
                            "timestamp": crate::paths::now_ms(),
                        }));
                    } else {
                        // Working copy matches baseline; clean up snapshot
                        let _ = std::fs::remove_file(&bf);
                    }
                }
            }
        }
    }

    // 2. Supplement with active in-memory edits
    if let Ok(lock) = store.lock() {
        for (file, (before, after, ts)) in lock.iter() {
            if before == after || is_ignored_change_path(file) {
                continue;
            }
            if items.iter().any(|it| it.get("path").and_then(|v| v.as_str()) == Some(file)) {
                continue;
            }
            let file_name = Path::new(file)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| file.clone());
            let is_new = before.trim().is_empty();
            items.push(json!({
                "path": file,
                "name": file_name,
                "status": if is_new { "new" } else { "modified" },
                "before": before,
                "after": after,
                "before_content": before,
                "after_content": after,
                "timestamp": ts,
            }));
        }
    }

    // 3. Scan for any existing .bak files in the active workspace
    if let Ok(entries) = std::fs::read_dir(&base_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if let Some(ext) = p.extension() {
                if ext == "bak" {
                    let orig_name = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
                    let orig_path = base_dir.join(orig_name);
                    if orig_path.exists() {
                        let rel_name = orig_name.to_string();
                        if !items.iter().any(|it| it.get("path").and_then(|v| v.as_str()) == Some(&rel_name)) {
                            let before = std::fs::read_to_string(&p).unwrap_or_default();
                            let after = std::fs::read_to_string(&orig_path).unwrap_or_default();
                            if before != after {
                                items.push(json!({
                                    "path": rel_name,
                                    "name": rel_name,
                                    "status": "modified",
                                    "before": before,
                                    "after": after,
                                    "before_content": before,
                                    "after_content": after,
                                    "timestamp": crate::paths::now_ms(),
                                }));
                            }
                        }
                    }
                }
            }
        }
    }

    Json(json!({ "data": items })).into_response()
}

async fn handle_revert(
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    let base_dir = resolve_base_dir(&q, &headers);
    let req_path = body
        .get("path")
        .or_else(|| body.get("filePath"))
        .or_else(|| body.get("file"))
        .and_then(|v| v.as_str())
        .or_else(|| q.get("path").map(|s| s.as_str()));

    let Some(file_rel) = req_path else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "path is required" })),
        )
            .into_response();
    };

    let target_file = base_dir.join(file_rel);
    let baseline_file = base_dir.join(".arunaki").join("baseline").join(file_rel);
    let bak_file = base_dir.join(format!("{}.bak", file_rel));

    // 1. Look up before content from baseline file, memory store, or .bak
    let store = DOCUMENT_CHANGES.get_or_init(|| Mutex::new(HashMap::new()));
    let before_from_store = if let Ok(lock) = store.lock() {
        lock.get(file_rel).map(|(b, _, _)| b.clone())
    } else {
        None
    };

    let restored_content = if baseline_file.exists() {
        std::fs::read_to_string(&baseline_file).ok()
    } else if let Some(b) = before_from_store {
        Some(b)
    } else if bak_file.exists() {
        std::fs::read_to_string(&bak_file).ok()
    } else {
        None
    };

    if let Some(content) = restored_content {
        let _ = std::fs::write(&target_file, &content);
        if baseline_file.exists() {
            let _ = std::fs::remove_file(&baseline_file);
        }
        if bak_file.exists() {
            let _ = std::fs::remove_file(&bak_file);
        }
        remove_document_change(file_rel);
        crate::session::message::emit_event(
            &base_dir.to_string_lossy(),
            "file.edited",
            json!({ "file": file_rel, "reverted": true }),
        );
        Json(json!({ "success": true, "path": file_rel })).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "No baseline snapshot found for file" })),
        )
            .into_response()
    }
}

async fn handle_accept(
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Response {
    let base_dir = resolve_base_dir(&q, &headers);
    let req_path = body
        .get("path")
        .or_else(|| body.get("filePath"))
        .or_else(|| body.get("file"))
        .and_then(|v| v.as_str())
        .or_else(|| q.get("path").map(|s| s.as_str()));

    let Some(file_rel) = req_path else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "path is required" })),
        )
            .into_response();
    };

    let baseline_file = base_dir.join(".arunaki").join("baseline").join(file_rel);
    if baseline_file.exists() {
        let _ = std::fs::remove_file(&baseline_file);
    }
    let bak_file = base_dir.join(format!("{}.bak", file_rel));
    if bak_file.exists() {
        let _ = std::fs::remove_file(&bak_file);
    }
    remove_document_change(file_rel);

    Json(json!({ "success": true, "path": file_rel })).into_response()
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
