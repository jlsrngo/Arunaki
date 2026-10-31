pub mod formula_eval;
pub mod doc_locator;
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
        .route("/api/files/spreadsheet/calculate", post(formula_eval::handle_calculate_range))
        .route("/files/spreadsheet/calculate", post(formula_eval::handle_calculate_range))
        .route("/api/files/table/parse-and-stats", post(formula_eval::handle_parse_and_stats))
        .route("/files/table/parse-and-stats", post(formula_eval::handle_parse_and_stats))
}

fn resolve_base_dir(q: &HashMap<String, String>, headers: &HeaderMap) -> PathBuf {
    if let Some(dir) = q.get("directory").or_else(|| q.get("workspacePath")) {
        if !dir.trim().is_empty() {
            let norm = normalize_workspace_path(dir);
            crate::desktop::set_active_workspace_root(&norm);
            return PathBuf::from(norm);
        }
    }
    if let Some(hdr) = headers
        .get("x-arunaki-directory")
        .or_else(|| headers.get("x-opencode-directory"))
        .and_then(|v| v.to_str().ok())
    {
        if !hdr.trim().is_empty() {
            let decoded = urlencoding_decode(hdr);
            let norm = normalize_workspace_path(&decoded);
            crate::desktop::set_active_workspace_root(&norm);
            return PathBuf::from(norm);
        }
    }
    if let Some(root) = crate::desktop::get_active_workspace_root() {
        if !root.trim().is_empty() {
            return PathBuf::from(root);
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

    capture_baseline_before_write(&base_dir.to_string_lossy(), req_path);

    if let Err(e) = std::fs::write(&target, content) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    let rel_file = normalize_rel_file(&base_dir, req_path);
    crate::session::message::emit_event(
        &base_dir.to_string_lossy(),
        "file.edited",
        json!({ "file": rel_file }),
    );

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
        || trimmed.ends_with(".__new__")
    {
        return true;
    }
    let fname = Path::new(trimmed)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(trimmed);
    if fname.starts_with('.') || fname.starts_with("~$") || fname.ends_with(".__new__") {
        return true;
    }
    let ext = Path::new(fname)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    matches!(ext.as_str(), "py" | "ps1" | "sh" | "bat" | "cmd" | "bak" | "tmp")
}

pub fn is_binary_doc_ext(path: &Path) -> bool {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    matches!(
        ext.as_str(),
        "xlsx" | "xls" | "xlsm" | "xlsb" | "docx" | "doc" | "pptx" | "ppt" | "pdf" | "png" | "jpg" | "jpeg" | "gif" | "webp" | "zip"
    )
}

pub fn extract_diffable_text(file_path: &Path) -> String {
    let Ok(bytes) = std::fs::read(file_path) else {
        return String::new();
    };
    extract_diffable_text_from_bytes(file_path, &bytes)
}

pub fn extract_diffable_text_from_bytes(file_path: &Path, bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return String::new();
    }
    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let path_str = file_path.to_string_lossy().to_string();

    match ext.as_str() {
        "docx" | "doc" => {
            if bytes.starts_with(b"PK\x03\x04") {
                if let Ok(json_str) = arunaki_docs::build_word_map_from_bytes(&path_str, bytes) {
                    if let Ok(val) = serde_json::from_str::<Value>(&json_str) {
                        let mut lines = Vec::new();
                        if let Some(paras) = val.get("paragraphs").and_then(|v| v.as_array()) {
                            for p in paras {
                                if let Some(txt) = p.get("text").and_then(|v| v.as_str()) {
                                    let trimmed = txt.trim();
                                    if !trimmed.is_empty() {
                                        lines.push(trimmed.to_string());
                                    }
                                }
                            }
                        }
                        if let Some(tables) = val.get("tables").and_then(|v| v.as_array()) {
                            for (t_idx, tbl) in tables.iter().enumerate() {
                                if let Some(rows) = tbl.get("rows").and_then(|v| v.as_array()) {
                                    if !lines.is_empty() {
                                        lines.push(String::new());
                                    }
                                    lines.push(format!("[Table {}]", t_idx + 1));
                                    for (r_idx, row) in rows.iter().enumerate() {
                                        if let Some(cols) = row.as_array() {
                                            let cells: Vec<String> = cols
                                                .iter()
                                                .map(|c| {
                                                    c.as_str()
                                                        .map(|s| s.to_string())
                                                        .unwrap_or_else(|| c.to_string())
                                                })
                                                .collect();
                                            lines.push(format!("| {} |", cells.join(" | ")));
                                            if r_idx == 0 && !cells.is_empty() {
                                                let sep: Vec<&str> =
                                                    cells.iter().map(|_| "---").collect();
                                                lines.push(format!("| {} |", sep.join(" | ")));
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if lines.is_empty() {
                            return "[Empty Word Document]".to_string();
                        }
                        return lines.join("\n");
                    }
                }
            }
            String::from_utf8_lossy(bytes).replace("\r\n", "\n")
        }
        "xlsx" | "xls" | "xlsm" | "xlsb" => {
            if bytes.starts_with(b"PK\x03\x04") {
                if let Ok(json_str) = arunaki_docs::build_excel_map_from_bytes(&path_str, bytes) {
                    if let Ok(val) = serde_json::from_str::<Value>(&json_str) {
                        let mut lines = Vec::new();
                        if let Some(sheets) = val.get("sheets").and_then(|v| v.as_array()) {
                            for sh in sheets {
                                let sname = sh
                                    .get("name")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("Sheet1");
                                if !lines.is_empty() {
                                    lines.push(String::new());
                                }
                                lines.push(format!("=== Sheet: {} ===", sname));

                                let mut rows_map: std::collections::BTreeMap<
                                    usize,
                                    std::collections::BTreeMap<usize, String>,
                                > = std::collections::BTreeMap::new();

                                if let Some(cells) = sh.get("cells").and_then(|v| v.as_array()) {
                                    for cell in cells {
                                        let Some(cref) = cell.get("ref").and_then(|v| v.as_str())
                                        else {
                                            continue;
                                        };
                                        let Some((r, c)) = arunaki_docs::parse_cell_ref(cref)
                                        else {
                                            continue;
                                        };
                                        let txt = cell
                                            .get("text")
                                            .and_then(|v| v.as_str())
                                            .map(|s| s.to_string())
                                            .or_else(|| {
                                                cell.get("value").map(|v| {
                                                    if v.is_null() {
                                                        String::new()
                                                    } else if let Some(s) = v.as_str() {
                                                        s.to_string()
                                                    } else {
                                                        v.to_string()
                                                    }
                                                })
                                            })
                                            .unwrap_or_default();
                                        let formula = cell
                                            .get("formula")
                                            .and_then(|v| v.as_str())
                                            .filter(|f| !f.is_empty());

                                        let entry_str = if let Some(f) = formula {
                                            let f_clean = f.trim_start_matches('=');
                                            if txt.is_empty() {
                                                format!("{}: ={}", cref, f_clean)
                                            } else {
                                                format!("{}: {} [={}]", cref, txt, f_clean)
                                            }
                                        } else {
                                            format!("{}: {}", cref, txt)
                                        };
                                        rows_map.entry(r).or_default().insert(c, entry_str);
                                    }
                                }

                                if rows_map.is_empty() {
                                    lines.push("(Empty Sheet)".to_string());
                                } else {
                                    for (r, cols) in rows_map {
                                        let row_cells: Vec<String> =
                                            cols.into_values().collect();
                                        lines.push(format!(
                                            "Row {:>3} | {}",
                                            r + 1,
                                            row_cells.join(" | ")
                                        ));
                                    }
                                }
                            }
                        }
                        if lines.is_empty() {
                            return "[Empty Excel Workbook]".to_string();
                        }
                        return lines.join("\n");
                    }
                }
            }
            String::from_utf8_lossy(bytes).replace("\r\n", "\n")
        }
        "pptx" | "ppt" => {
            if bytes.starts_with(b"PK\x03\x04") {
                if let Ok(json_str) = arunaki_docs::build_ppt_map_from_bytes(&path_str, bytes) {
                    if let Ok(val) = serde_json::from_str::<Value>(&json_str) {
                        let mut lines = Vec::new();
                        if let Some(slides) = val.get("slides").and_then(|v| v.as_array()) {
                            for sl in slides {
                                let num =
                                    sl.get("number").and_then(|v| v.as_u64()).unwrap_or(1);
                                if !lines.is_empty() {
                                    lines.push(String::new());
                                }
                                lines.push(format!("=== Slide {} ===", num));
                                if let Some(shapes) =
                                    sl.get("shapes").and_then(|v| v.as_array())
                                {
                                    for sp in shapes {
                                        if let Some(txt) =
                                            sp.get("text").and_then(|v| v.as_str())
                                        {
                                            let trimmed = txt.trim();
                                            if !trimmed.is_empty() {
                                                let sname = sp
                                                    .get("name")
                                                    .and_then(|v| v.as_str())
                                                    .unwrap_or("Shape");
                                                lines.push(format!("[{}] {}", sname, trimmed));
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if lines.is_empty() {
                            return "[Empty PowerPoint Presentation]".to_string();
                        }
                        return lines.join("\n");
                    }
                }
            }
            String::from_utf8_lossy(bytes).replace("\r\n", "\n")
        }
        "pdf" => {
            if bytes.starts_with(b"%PDF") {
                if let Ok(json_str) =
                    arunaki_docs::build_pdf_map_from_bytes(&path_str, bytes, Some(50))
                {
                    if let Ok(val) = serde_json::from_str::<Value>(&json_str) {
                        let mut lines = Vec::new();
                        if let Some(pages) = val.get("pages").and_then(|v| v.as_array()) {
                            for pg in pages {
                                let pnum =
                                    pg.get("page").and_then(|v| v.as_u64()).unwrap_or(1);
                                let txt = pg
                                    .get("text")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .trim();
                                if !lines.is_empty() {
                                    lines.push(String::new());
                                }
                                lines.push(format!("=== Page {} ===", pnum));
                                if !txt.is_empty() {
                                    lines.push(txt.replace("\r\n", "\n"));
                                }
                            }
                        }
                        if !lines.is_empty() {
                            return lines.join("\n");
                        }
                    }
                }
            }
            String::from_utf8_lossy(bytes).replace("\r\n", "\n")
        }
        _ => {
            let is_opaque_binary = matches!(
                ext.as_str(),
                "png" | "jpg" | "jpeg" | "gif" | "webp" | "zip" | "exe" | "dll"
            ) || bytes.iter().take(512).any(|&b| b == 0);

            if is_opaque_binary {
                let mut hash: u64 = 0xcbf29ce484222325;
                for &b in bytes {
                    hash ^= b as u64;
                    hash = hash.wrapping_mul(0x100000001b3);
                }
                let fname = file_path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("binary");
                format!(
                    "[Binary File: {}]\nSize: {} bytes\nChecksum: {:016x}",
                    fname,
                    bytes.len(),
                    hash
                )
            } else {
                String::from_utf8_lossy(bytes).replace("\r\n", "\n")
            }
        }
    }
}

pub fn ensure_workspace_baseline(base_dir: &Path) {
    if !base_dir.exists() {
        return;
    }
    let baseline_root = base_dir.join(".arunaki").join("baseline");
    let init_marker = baseline_root.join(".initialized");
    if init_marker.exists() {
        return;
    }
    let _ = std::fs::create_dir_all(&baseline_root);
    let mut existing_files = Vec::new();
    collect_files_recursive(base_dir, base_dir, &mut existing_files, 1500);
    for f in existing_files {
        let Ok(rel) = f.strip_prefix(base_dir) else {
            continue;
        };
        let rel_str = rel.to_string_lossy().replace('\\', "/");
        if is_ignored_change_path(&rel_str) {
            continue;
        }
        let size = f.metadata().map(|m| m.len()).unwrap_or(0);
        if size > 25 * 1024 * 1024 {
            continue;
        }
        let bf = baseline_root.join(&rel_str);
        let new_marker = baseline_root.join(format!("{}.__new__", rel_str));
        if !bf.exists() && !new_marker.exists() {
            if let Some(parent) = bf.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::copy(&f, &bf);
        }
    }
    let _ = std::fs::write(&init_marker, b"1");
}

pub fn capture_baseline_before_write(workspace_dir: &str, file: &str) {
    if workspace_dir.trim().is_empty() || is_ignored_change_path(file) {
        return;
    }
    let base = Path::new(workspace_dir);
    ensure_workspace_baseline(base);
    let rel = normalize_rel_file(base, file);
    if is_ignored_change_path(&rel) {
        return;
    }
    let target = base.join(&rel);
    let baseline_root = base.join(".arunaki").join("baseline");
    let baseline_file = baseline_root.join(&rel);
    let new_marker = baseline_root.join(format!("{}.__new__", rel));

    if !contains_path(&baseline_root, &baseline_file) {
        return;
    }
    if !baseline_file.exists() && !new_marker.exists() {
        if let Some(parent) = baseline_file.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if target.exists() {
            let _ = std::fs::copy(&target, &baseline_file);
        } else {
            let _ = std::fs::write(&new_marker, b"");
        }
    }
}

pub fn remove_baseline_for_path(workspace_dir: &str, file: &str) {
    if workspace_dir.trim().is_empty() {
        return;
    }
    let base = Path::new(workspace_dir);
    let rel = normalize_rel_file(base, file);
    let baseline_root = base.join(".arunaki").join("baseline");
    let baseline_file = baseline_root.join(&rel);
    let new_marker = baseline_root.join(format!("{}.__new__", rel));
    if contains_path(&baseline_root, &baseline_file) {
        let _ = std::fs::remove_file(&baseline_file);
        let _ = std::fs::remove_file(&new_marker);
    }
    remove_document_change(&rel);
}

pub fn record_document_change(workspace_dir: &str, file: &str, before: &str, after: &str) {
    if is_ignored_change_path(file) {
        return;
    }
    capture_baseline_before_write(workspace_dir, file);

    let base = Path::new(workspace_dir);
    let rel = if !workspace_dir.trim().is_empty() {
        normalize_rel_file(base, file)
    } else {
        file.replace('\\', "/")
    };

    if !is_binary_doc_ext(Path::new(&rel)) {
        let store = DOCUMENT_CHANGES.get_or_init(|| Mutex::new(HashMap::new()));
        if let Ok(mut lock) = store.lock() {
            lock.insert(
                rel.clone(),
                (
                    before.to_string(),
                    after.to_string(),
                    crate::paths::now_ms(),
                ),
            );
        }
    }

    if !workspace_dir.trim().is_empty() {
        let baseline_root = base.join(".arunaki").join("baseline");
        let baseline_file = baseline_root.join(&rel);
        let new_marker = baseline_root.join(format!("{}.__new__", rel));
        if contains_path(&baseline_root, &baseline_file)
            && !baseline_file.exists()
            && !new_marker.exists()
        {
            if let Some(parent) = baseline_file.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if before.is_empty() {
                let _ = std::fs::write(&new_marker, b"");
            } else {
                let _ = std::fs::write(&baseline_file, before);
            }
        }
    }
}

fn normalize_rel_file(base_dir: &Path, raw: &str) -> String {
    let base_norm = base_dir
        .to_string_lossy()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_string();
    let raw_norm = raw.replace('\\', "/");
    let raw_lower = raw_norm.to_ascii_lowercase();
    let prefix_lower = format!("{}/", base_norm.to_ascii_lowercase());
    let rel = if raw_lower.starts_with(&prefix_lower) {
        &raw_norm[prefix_lower.len()..]
    } else {
        raw_norm.as_str()
    };
    rel.trim_start_matches("./").trim_start_matches('/').to_string()
}

pub fn remove_document_change(file: &str) {
    let store = DOCUMENT_CHANGES.get_or_init(|| Mutex::new(HashMap::new()));
    let norm_target = file.replace('\\', "/");
    let fname_target = Path::new(&norm_target)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(&norm_target)
        .to_ascii_lowercase();
    if let Ok(mut lock) = store.lock() {
        lock.retain(|k, _| {
            let k_norm = k.replace('\\', "/");
            let k_fname = Path::new(&k_norm)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(&k_norm)
                .to_ascii_lowercase();
            !k_norm.eq_ignore_ascii_case(&norm_target) && k_fname != fname_target
        });
    }
}

async fn handle_status(
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    let base_dir = resolve_base_dir(&q, &headers);
    ensure_workspace_baseline(&base_dir);

    let store = DOCUMENT_CHANGES.get_or_init(|| Mutex::new(HashMap::new()));
    let mut items = Vec::new();
    let baseline_dir = base_dir.join(".arunaki").join("baseline");
    let _ = std::fs::remove_dir_all(baseline_dir.join(".arunaki"));

    // 1. Scan all current files in active workspace against .arunaki/baseline/
    let mut current_files = Vec::new();
    collect_files_recursive(&base_dir, &base_dir, &mut current_files, 1500);
    for current_file in current_files {
        let Ok(rel) = current_file.strip_prefix(&base_dir) else {
            continue;
        };
        let rel_str = rel.to_string_lossy().replace('\\', "/");
        if is_ignored_change_path(&rel_str) {
            continue;
        }
        let bf = baseline_dir.join(&rel_str);
        let new_marker = baseline_dir.join(format!("{}.__new__", rel_str));
        let file_name = rel
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| rel_str.clone());

        let is_legacy_empty_new = if bf.exists() {
            bf.metadata().map(|m| m.len() == 0).unwrap_or(false)
                && current_file.metadata().map(|m| m.len() > 0).unwrap_or(false)
        } else {
            false
        };

        if new_marker.exists() || !bf.exists() || is_legacy_empty_new {
            if !new_marker.exists() {
                if let Some(parent) = new_marker.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                let _ = std::fs::write(&new_marker, b"");
            }
            if is_legacy_empty_new {
                let _ = std::fs::remove_file(&bf);
            }
            let after = extract_diffable_text(&current_file);
            if !after.trim().is_empty() {
                items.push(json!({
                    "path": rel_str,
                    "name": file_name,
                    "status": "new",
                    "before": "",
                    "after": after,
                    "before_content": "",
                    "after_content": after,
                    "timestamp": crate::paths::now_ms(),
                }));
            }
        } else if let (Ok(before_bytes), Ok(after_bytes)) =
            (std::fs::read(&bf), std::fs::read(&current_file))
        {
            if before_bytes != after_bytes {
                let before = extract_diffable_text_from_bytes(&current_file, &before_bytes);
                let after = extract_diffable_text_from_bytes(&current_file, &after_bytes);
                if before != after {
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
            let rel_norm = normalize_rel_file(&base_dir, file);
            if items.iter().any(|it| {
                let p = it.get("path").and_then(|v| v.as_str()).unwrap_or("");
                p.eq_ignore_ascii_case(file) || p.eq_ignore_ascii_case(&rel_norm)
            }) {
                continue;
            }
            let file_name = Path::new(&rel_norm)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| rel_norm.clone());
            let is_new = before.trim().is_empty();
            items.push(json!({
                "path": rel_norm,
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
                            let before = extract_diffable_text(&p);
                            let after = extract_diffable_text(&orig_path);
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

    let Some(raw_rel) = req_path else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "path is required" })),
        )
            .into_response();
    };

    let file_rel = normalize_rel_file(&base_dir, raw_rel);
    let target_file = base_dir.join(&file_rel);
    let baseline_root = base_dir.join(".arunaki").join("baseline");
    let baseline_file = baseline_root.join(&file_rel);
    let new_marker = baseline_root.join(format!("{}.__new__", file_rel));
    let is_valid_baseline = contains_path(&baseline_root, &baseline_file);
    let bak_file = base_dir.join(format!("{}.bak", file_rel));

    // Case 1: Newly created file — reverting deletes the file from the working tree
    let is_empty_baseline = is_valid_baseline
        && baseline_file.exists()
        && baseline_file.metadata().map(|m| m.len() == 0).unwrap_or(false);
    if is_valid_baseline && (new_marker.exists() || is_empty_baseline) {
        if contains_path(&base_dir, &target_file) && target_file.exists() {
            let _ = std::fs::remove_file(&target_file);
        }
        let _ = std::fs::remove_file(&new_marker);
        let _ = std::fs::remove_file(&baseline_file);
        if bak_file.exists() {
            let _ = std::fs::remove_file(&bak_file);
        }
        remove_document_change(&file_rel);
        crate::session::message::emit_event(
            &base_dir.to_string_lossy(),
            "file.edited",
            json!({ "file": file_rel, "reverted": true, "deleted": true }),
        );
        return Json(json!({ "success": true, "path": file_rel, "deleted": true })).into_response();
    }

    // Case 2: Restore exact raw bytes from baseline_file or .bak (100% binary-safe for .xlsx/.docx/.pdf)
    let restored_bytes = if is_valid_baseline && baseline_file.exists() {
        std::fs::read(&baseline_file).ok()
    } else if bak_file.exists() {
        std::fs::read(&bak_file).ok()
    } else {
        let store = DOCUMENT_CHANGES.get_or_init(|| Mutex::new(HashMap::new()));
        let before_from_store = if let Ok(lock) = store.lock() {
            lock.get(&file_rel)
                .or_else(|| lock.get(raw_rel))
                .map(|(b, _, _)| b.as_bytes().to_vec())
        } else {
            None
        };
        before_from_store.or_else(|| {
            if !is_binary_doc_ext(&target_file) {
                body.get("beforeContent")
                    .and_then(|v| v.as_str())
                    .map(|s| s.as_bytes().to_vec())
            } else {
                None
            }
        })
    };

    if let Some(bytes) = restored_bytes {
        if contains_path(&base_dir, &target_file) {
            let _ = std::fs::write(&target_file, &bytes);
            if is_valid_baseline && !baseline_file.exists() {
                if let Some(parent) = baseline_file.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                let _ = std::fs::write(&baseline_file, &bytes);
            }
        }
        if bak_file.exists() {
            let _ = std::fs::remove_file(&bak_file);
        }
        remove_document_change(&file_rel);
        crate::session::message::emit_event(
            &base_dir.to_string_lossy(),
            "file.edited",
            json!({ "file": file_rel, "reverted": true }),
        );
        Json(json!({ "success": true, "path": file_rel })).into_response()
    } else {
        remove_document_change(&file_rel);
        Json(json!({ "success": true, "path": file_rel })).into_response()
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

    let Some(raw_rel) = req_path else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "path is required" })),
        )
            .into_response();
    };

    let file_rel = normalize_rel_file(&base_dir, raw_rel);
    let target_file = base_dir.join(&file_rel);

    // Only write plain text content for non-binary documents; binary docs (.xlsx, .docx, .pptx, .pdf)
    // already have their real binary bytes written to target_file on disk.
    if !is_binary_doc_ext(&target_file) {
        if let Some(content) = body.get("content").and_then(|v| v.as_str()) {
            if !content.is_empty() && contains_path(&base_dir, &target_file) {
                let _ = std::fs::write(&target_file, content);
            }
        }
    }

    let baseline_root = base_dir.join(".arunaki").join("baseline");
    let baseline_file = baseline_root.join(&file_rel);
    let new_marker = baseline_root.join(format!("{}.__new__", file_rel));
    if contains_path(&baseline_root, &baseline_file) {
        let _ = std::fs::remove_file(&new_marker);
        if target_file.exists() {
            if let Some(parent) = baseline_file.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::copy(&target_file, &baseline_file);
        } else if baseline_file.exists() {
            let _ = std::fs::remove_file(&baseline_file);
        }
    }
    let bak_file = base_dir.join(format!("{}.bak", file_rel));
    if bak_file.exists() {
        let _ = std::fs::remove_file(&bak_file);
    }
    remove_document_change(&file_rel);

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
    let raw_pattern = q.get("pattern").cloned().unwrap_or_default();
    if raw_pattern.trim().is_empty() {
        return Json(json!([])).into_response();
    }
    let case_sensitive = q
        .get("caseSensitive")
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);
    let pattern_cmp = if case_sensitive {
        raw_pattern.clone()
    } else {
        raw_pattern.to_lowercase()
    };

    let mut all_files = Vec::new();
    collect_files_recursive(&base_dir, &base_dir, &mut all_files, 500);

    let mut results = Vec::new();
    for f in all_files {
        if results.len() >= 150 {
            break;
        }
        let ext = f
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if matches!(
            ext.as_str(),
            "png" | "jpg" | "jpeg" | "gif" | "webp" | "zip" | "exe" | "dll" | "bak" | "tmp"
        ) {
            continue;
        }
        let txt = extract_diffable_text(&f);
        if txt.is_empty() || txt.starts_with("[Binary File:") {
            continue;
        }
        let rel = f
            .strip_prefix(&base_dir)
            .unwrap_or(&f)
            .to_string_lossy()
            .replace('\\', "/");
        if is_ignored_change_path(&rel) {
            continue;
        }
        for (idx, line) in txt.lines().enumerate() {
            let matched = if case_sensitive {
                line.contains(&pattern_cmp)
            } else {
                line.to_lowercase().contains(&pattern_cmp)
            };
            if matched {
                results.push(json!({
                    "path": { "text": rel },
                    "lines": { "text": line },
                    "line_number": idx + 1,
                    "absolute_offset": 0,
                    "submatches": []
                }));
                if results.len() >= 150 {
                    break;
                }
            }
        }
    }

    Json(Value::Array(results)).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_diffable_text_handles_docx_binary_and_markdown_tables() {
        let md_v1 = "# Daily Report\n\nCash balance is 1,000,000.\n\n| Item | Qty |\n| --- | --- |\n| Coffee | 10 |\n";
        let md_v2 = "# Daily Report\n\nCash balance is 1,500,000.\n\n| Item | Qty |\n| --- | --- |\n| Coffee | 15 |\n";

        let docx_v1 = arunaki_docs::create_docx_from_markdown(md_v1).expect("docx v1");
        let docx_v2 = arunaki_docs::create_docx_from_markdown(md_v2).expect("docx v2");

        let path = Path::new("report.docx");
        let text_v1 = extract_diffable_text_from_bytes(path, &docx_v1);
        let text_v2 = extract_diffable_text_from_bytes(path, &docx_v2);

        assert_ne!(text_v1, text_v2);
        assert!(text_v1.contains("Cash balance is 1,000,000."));
        assert!(text_v2.contains("Cash balance is 1,500,000."));
        assert!(text_v1.contains("| Coffee | 10 |"));
        assert!(text_v2.contains("| Coffee | 15 |"));
    }

    #[test]
    fn workspace_baseline_tracks_markdown_word_and_text_changes_and_reverts_cleanly() {
        let temp_dir = std::env::temp_dir().join(format!("arunaki_diff_test_{}", crate::paths::now_ms()));
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        let md_file = temp_dir.join("notes.md");
        let docx_file = temp_dir.join("memo.docx");

        std::fs::write(&md_file, "# Initial Notes\nLine 1\n").unwrap();
        let initial_docx = arunaki_docs::create_docx_from_markdown("# Memo V1\nOriginal paragraph").unwrap();
        std::fs::write(&docx_file, &initial_docx).unwrap();

        // 1. Seed baseline snapshot
        ensure_workspace_baseline(&temp_dir);
        let baseline_md = temp_dir.join(".arunaki").join("baseline").join("notes.md");
        let baseline_docx = temp_dir.join(".arunaki").join("baseline").join("memo.docx");
        assert!(baseline_md.exists());
        assert!(baseline_docx.exists());

        // 2. Modify both .md and .docx
        std::fs::write(&md_file, "# Initial Notes\nLine 1 Updated\nLine 2 Added\n").unwrap();
        let updated_docx = arunaki_docs::create_docx_from_markdown("# Memo V2\nUpdated paragraph").unwrap();
        std::fs::write(&docx_file, &updated_docx).unwrap();

        // Verify diff projection detects both
        let docx_before = extract_diffable_text(&baseline_docx);
        let docx_after = extract_diffable_text(&docx_file);
        assert_ne!(docx_before, docx_after);
        assert!(docx_before.contains("Original paragraph"));
        assert!(docx_after.contains("Updated paragraph"));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
