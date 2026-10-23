use crate::bridge::LOCAL_CLI_BRIDGE_PORT;
use crate::paths::{arunaki_dot_dir, contains_path, normalize_workspace_path, now_ms};
use axum::{
    body::Body,
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use base64::Engine as _;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

static ACTIVE_WORKSPACE_ROOT: OnceLock<Mutex<Option<String>>> = OnceLock::new();

pub fn get_active_workspace_root() -> Option<String> {
    ACTIVE_WORKSPACE_ROOT
        .get_or_init(|| Mutex::new(None))
        .lock()
        .ok()
        .and_then(|g| g.clone())
}

pub fn set_active_workspace_root(dir: &str) {
    let norm = normalize_workspace_path(dir);
    if let Ok(mut guard) = ACTIVE_WORKSPACE_ROOT
        .get_or_init(|| Mutex::new(None))
        .lock()
    {
        *guard = Some(norm);
    }
}

pub fn router() -> Router {
    Router::new()
        .route("/api/desktop/pick-folder", post(handle_pick_folder))
        .route("/api/desktop/folder-tree", post(handle_folder_tree))
        .route("/api/desktop/read-file", post(handle_read_file))
        .route("/api/desktop/write-file", post(handle_write_file))
        .route("/api/desktop/create-folder", post(handle_create_folder))
        .route("/api/desktop/backup-folder", post(handle_backup_folder))
        .route("/api/desktop/delete-path", post(handle_delete_path))
        .route("/api/desktop/rename-path", post(handle_rename_path))
        .route("/api/desktop/open-path", post(handle_open_path))
        .route("/api/desktop/open-excel", post(handle_open_excel))
        .route("/api/desktop/open-word", post(handle_open_word))
        .route("/api/desktop/parse-excel", post(handle_parse_excel))
        .route("/api/desktop/write-excel", post(handle_write_excel))
        .route("/api/desktop/read-binary", post(handle_read_binary))
        .route("/api/desktop/engine-info", get(handle_engine_info))
        .route("/api/desktop/quit", post(handle_quit))
}

fn check_allowed_path(target: &Path) -> Result<(), String> {
    if let Some(root) = get_active_workspace_root() {
        let root_path = Path::new(&root);
        if !contains_path(root_path, target) {
            return Err(format!(
                "Security: Access denied for path outside active workspace: {}",
                target.display()
            ));
        }
    }
    Ok(())
}

async fn handle_pick_folder() -> Response {
    let picked = tokio::task::spawn_blocking(|| -> Option<String> {
        #[cfg(windows)]
        {
            let ps_script = r#"
Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = 'Pilih Folder Proyek Arunaki'
$f.ShowNewFolderButton = $true
if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::Out.Write($f.SelectedPath)
}
"#;
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            if let Ok(out) = std::process::Command::new("powershell")
                .args(["-NoProfile", "-STA", "-Command", ps_script])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
            {
                let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !s.is_empty() {
                    return Some(s);
                }
            }
        }
        None
    })
    .await
    .ok()
    .flatten();

    if let Some(ref p) = picked {
        set_active_workspace_root(p);
    }
    Json(json!({ "path": picked })).into_response()
}

fn build_tree_recursive(dir: &Path, depth: usize) -> Vec<Value> {
    if depth > 6 {
        return Vec::new();
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut dirs = Vec::new();
    let mut files = Vec::new();

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.')
            || matches!(
                name.as_str(),
                "node_modules" | "dist" | "build" | "__pycache__" | ".git" | "target"
            )
        {
            continue;
        }
        let full_path = entry.path();
        let full_str = full_path.to_string_lossy().to_string();
        if let Ok(ft) = entry.file_type() {
            if ft.is_dir() {
                let children = build_tree_recursive(&full_path, depth + 1);
                dirs.push((
                    name.to_lowercase(),
                    json!({
                        "name": name,
                        "path": full_str,
                        "type": "directory",
                        "children": children
                    }),
                ));
            } else if ft.is_file() {
                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                let ext = full_path
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| format!(".{}", e.to_lowercase()))
                    .unwrap_or_default();
                files.push((
                    name.to_lowercase(),
                    json!({
                        "name": name,
                        "path": full_str,
                        "type": "file",
                        "size": size,
                        "ext": ext
                    }),
                ));
            }
        }
    }

    dirs.sort_by(|a, b| a.0.cmp(&b.0));
    files.sort_by(|a, b| a.0.cmp(&b.0));

    dirs.into_iter()
        .map(|(_, v)| v)
        .chain(files.into_iter().map(|(_, v)| v))
        .collect()
}

async fn handle_folder_tree(Json(body): Json<Value>) -> Response {
    let folder_path = body
        .get("folderPath")
        .or_else(|| body.get("path"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if folder_path.trim().is_empty() {
        return Json(json!({ "error": "folderPath is required" })).into_response();
    }
    set_active_workspace_root(folder_path);
    let path = Path::new(folder_path);
    let folder_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(folder_path);
    let tree = build_tree_recursive(path, 0);
    Json(json!({
        "tree": tree,
        "folderName": folder_name,
        "folderPath": folder_path
    }))
    .into_response()
}

async fn handle_read_file(Json(body): Json<Value>) -> Response {
    let fp = body
        .get("filePath")
        .or_else(|| body.get("path"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let path = Path::new(fp);
    if let Err(e) = check_allowed_path(path) {
        return Json(json!({ "error": e })).into_response();
    }
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();
    let is_binary = matches!(
        ext.as_str(),
        "pdf" | "png" | "jpg" | "jpeg" | "gif" | "webp" | "xlsx" | "xls" | "docx" | "doc" | "pptx" | "ppt" | "zip"
    );
    if is_binary {
        match std::fs::read(path) {
            Ok(bytes) => {
                let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                Json(json!({ "content": b64, "encoding": "base64" })).into_response()
            }
            Err(e) => Json(json!({ "error": e.to_string() })).into_response(),
        }
    } else {
        match std::fs::read_to_string(path) {
            Ok(txt) => Json(json!({ "content": txt, "encoding": "utf-8" })).into_response(),
            Err(e) => Json(json!({ "error": e.to_string() })).into_response(),
        }
    }
}

async fn handle_write_file(Json(body): Json<Value>) -> Response {
    let fp = body
        .get("filePath")
        .or_else(|| body.get("path"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let content = body.get("content").and_then(|v| v.as_str()).unwrap_or("");
    let path = Path::new(fp);
    if let Err(e) = check_allowed_path(path) {
        return Json(json!({ "error": e })).into_response();
    }
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if content.starts_with("data:") && content.contains(";base64,") {
        if let Some((_, b64)) = content.split_once(";base64,") {
            if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(b64) {
                return match std::fs::write(path, bytes) {
                    Ok(_) => Json(json!({ "success": true })).into_response(),
                    Err(e) => Json(json!({ "error": e.to_string() })).into_response(),
                };
            }
        }
    }
    match std::fs::write(path, content) {
        Ok(_) => Json(json!({ "success": true })).into_response(),
        Err(e) => Json(json!({ "error": e.to_string() })).into_response(),
    }
}

async fn handle_create_folder(Json(body): Json<Value>) -> Response {
    let fp = body
        .get("folderPath")
        .or_else(|| body.get("path"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let path = Path::new(fp);
    if let Err(e) = check_allowed_path(path) {
        return Json(json!({ "error": e })).into_response();
    }
    match std::fs::create_dir_all(path) {
        Ok(_) => Json(json!({ "success": true })).into_response(),
        Err(e) => Json(json!({ "error": e.to_string() })).into_response(),
    }
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_recursive(&entry.path(), &dst.join(entry.file_name()))?;
        } else {
            std::fs::copy(entry.path(), dst.join(entry.file_name()))?;
        }
    }
    Ok(())
}

async fn handle_backup_folder(Json(body): Json<Value>) -> Response {
    let src = body
        .get("sourcePath")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let src_path = Path::new(src);
    if !src_path.exists() {
        return Json(json!({ "error": "Source folder does not exist" })).into_response();
    }
    let parent = src_path.parent().unwrap_or_else(|| Path::new("."));
    let base_name = src_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("folder");
    let backup_path = parent.join(format!("{}_backup_{}", base_name, now_ms()));
    match copy_dir_recursive(src_path, &backup_path) {
        Ok(_) => Json(json!({
            "success": true,
            "backupPath": backup_path.to_string_lossy()
        }))
        .into_response(),
        Err(e) => Json(json!({ "error": e.to_string() })).into_response(),
    }
}

async fn handle_delete_path(Json(body): Json<Value>) -> Response {
    let tp = body
        .get("targetPath")
        .or_else(|| body.get("path"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let path = Path::new(tp);
    if let Err(e) = check_allowed_path(path) {
        return Json(json!({ "error": e })).into_response();
    }
    let res = if path.is_dir() {
        std::fs::remove_dir_all(path)
    } else {
        std::fs::remove_file(path)
    };
    match res {
        Ok(_) => Json(json!({ "success": true })).into_response(),
        Err(e) => Json(json!({ "error": e.to_string() })).into_response(),
    }
}

async fn handle_rename_path(Json(body): Json<Value>) -> Response {
    let old_p = body.get("oldPath").and_then(|v| v.as_str()).unwrap_or("");
    let new_p = body.get("newPath").and_then(|v| v.as_str()).unwrap_or("");
    let old_path = Path::new(old_p);
    let new_path = Path::new(new_p);
    if let Err(e) = check_allowed_path(old_path) {
        return Json(json!({ "error": e })).into_response();
    }
    if let Err(e) = check_allowed_path(new_path) {
        return Json(json!({ "error": e })).into_response();
    }
    match std::fs::rename(old_path, new_path) {
        Ok(_) => Json(json!({ "success": true })).into_response(),
        Err(e) => Json(json!({ "error": e.to_string() })).into_response(),
    }
}

async fn handle_open_path(Json(body): Json<Value>) -> Response {
    let fp = body
        .get("filePath")
        .or_else(|| body.get("path"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer.exe").arg(fp).spawn();
    }
    Json(json!({ "success": true })).into_response()
}

async fn handle_open_excel(Json(body): Json<Value>) -> Response {
    let fp = body
        .get("filePath")
        .or_else(|| body.get("path"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let res = tokio::task::spawn_blocking(move || {
        let params = arunaki_docs::ExcelComParams {
            action: "open".to_string(),
            file_path: Some(fp),
            sheet_name: None,
            cell: None,
            value: None,
            cells: Vec::new(),
            bold: None,
            italic: None,
            font_size: None,
            bg_color: None,
            alignment: None,
            source_sheet: None,
            new_sheet_name: None,
        };
        let script = arunaki_docs::build_excel_com_script(&params);
        arunaki_docs::run_powershell_script("excel_open", &script)
    })
    .await;

    match res {
        Ok(Ok(_)) => Json(json!({ "success": true })).into_response(),
        Ok(Err(e)) => Json(json!({ "error": e })).into_response(),
        Err(e) => Json(json!({ "error": e.to_string() })).into_response(),
    }
}

async fn handle_open_word(Json(body): Json<Value>) -> Response {
    let fp = body
        .get("filePath")
        .or_else(|| body.get("path"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let res = tokio::task::spawn_blocking(move || {
        let params = arunaki_docs::WordComParams {
            action: "open".to_string(),
            file_path: Some(fp),
            text: None,
            paragraph_index: None,
            find_text: None,
            replace_text: None,
            bold: None,
            font_size: None,
            alignment: None,
        };
        let script = arunaki_docs::build_word_com_script(&params);
        arunaki_docs::run_powershell_script("word_open", &script)
    })
    .await;

    match res {
        Ok(Ok(_)) => Json(json!({ "success": true })).into_response(),
        Ok(Err(e)) => Json(json!({ "error": e })).into_response(),
        Err(e) => Json(json!({ "error": e.to_string() })).into_response(),
    }
}

async fn handle_parse_excel(Json(body): Json<Value>) -> Response {
    let fp = body
        .get("filePath")
        .or_else(|| body.get("path"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let path = Path::new(fp);
    if let Err(e) = check_allowed_path(path) {
        return Json(json!({ "error": e })).into_response();
    }
    match arunaki_docs::build_excel_map(fp) {
        Ok(json_str) => {
            let parsed: Value = serde_json::from_str(&json_str).unwrap_or_else(|_| json!({}));
            let mut sheets = serde_json::Map::new();
            let mut first_sheet_name = String::new();
            let mut first_rows: Vec<Vec<String>> = Vec::new();

            if let Some(sh_arr) = parsed.get("sheets").and_then(|v| v.as_array()) {
                for (idx, sh) in sh_arr.iter().enumerate() {
                    let sname = sh
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Sheet1")
                        .to_string();
                    if idx == 0 {
                        first_sheet_name = sname.clone();
                    }
                    let row_count = sh.get("rowCount").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                    let col_count = sh.get("colCount").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                    let mut grid = vec![vec![String::new(); col_count.max(1)]; row_count.min(500)];
                    if let Some(cells_arr) = sh.get("cells").and_then(|v| v.as_array()) {
                        for cell in cells_arr {
                            if let Some(cref) = cell.get("ref").and_then(|v| v.as_str()) {
                                if let Some((r, c)) = arunaki_docs::parse_cell_ref(cref) {
                                    if r < 500 {
                                        while grid.len() <= r {
                                            grid.push(vec![String::new(); col_count.max(c + 1)]);
                                        }
                                        if grid[r].len() <= c {
                                            grid[r].resize(c + 1, String::new());
                                        }
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
                                        grid[r][c] = txt;
                                    }
                                }
                            }
                        }
                    }
                    if idx == 0 {
                        first_rows = grid.clone();
                    }
                    sheets.insert(sname, json!(grid));
                }
            }
            Json(json!({
                "success": true,
                "sheetName": first_sheet_name,
                "sheets": sheets,
                "rows": first_rows
            }))
            .into_response()
        }
        Err(e) => Json(json!({ "error": e })).into_response(),
    }
}

async fn handle_write_excel(Json(body): Json<Value>) -> Response {
    let fp = body
        .get("filePath")
        .or_else(|| body.get("path"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let sheet_name = body
        .get("sheetName")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let rows = body
        .get("rows")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut cells: Vec<(String, String)> = Vec::new();
    for (r_idx, row_val) in rows.iter().enumerate() {
        if let Some(cols) = row_val.as_array() {
            for (c_idx, cell_val) in cols.iter().enumerate() {
                let col_letter = col_idx_to_letter(c_idx);
                let cell_ref = format!("{}{}", col_letter, r_idx + 1);
                let val_str = match cell_val {
                    Value::String(s) => s.clone(),
                    Value::Null => String::new(),
                    other => other.to_string(),
                };
                if !val_str.is_empty() {
                    cells.push((cell_ref, val_str));
                }
            }
        }
    }

    let res = tokio::task::spawn_blocking(move || {
        let params = arunaki_docs::ExcelComParams {
            action: "write_range".to_string(),
            file_path: Some(fp),
            sheet_name,
            cell: None,
            value: None,
            cells,
            bold: None,
            italic: None,
            font_size: None,
            bg_color: None,
            alignment: None,
            source_sheet: None,
            new_sheet_name: None,
        };
        let script = arunaki_docs::build_excel_com_script(&params);
        arunaki_docs::run_powershell_script("excel_write_grid", &script)
    })
    .await;

    match res {
        Ok(Ok(_)) => Json(json!({ "success": true })).into_response(),
        Ok(Err(e)) => Json(json!({ "error": e })).into_response(),
        Err(e) => Json(json!({ "error": e.to_string() })).into_response(),
    }
}

fn col_idx_to_letter(mut idx: usize) -> String {
    let mut out = String::new();
    loop {
        let rem = idx % 26;
        out.insert(0, (b'A' + rem as u8) as char);
        if idx < 26 {
            break;
        }
        idx = idx / 26 - 1;
    }
    out
}

async fn handle_read_binary(Json(body): Json<Value>) -> Response {
    let fp = body
        .get("filePath")
        .or_else(|| body.get("path"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let path = Path::new(fp);
    if let Err(e) = check_allowed_path(path) {
        return Json(json!({ "error": e })).into_response();
    }
    match std::fs::read(path) {
        Ok(bytes) => {
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            Json(json!({ "success": true, "base64": b64 })).into_response()
        }
        Err(e) => Json(json!({ "error": e.to_string() })).into_response(),
    }
}

async fn handle_engine_info() -> Response {
    let info_path = arunaki_dot_dir().join("engine-info.json");
    if let Ok(raw) = std::fs::read_to_string(&info_path) {
        if let Ok(val) = serde_json::from_str::<Value>(&raw) {
            return Json(val).into_response();
        }
    }
    Json(json!({
        "port": 4096,
        "hostname": "127.0.0.1",
        "url": "http://127.0.0.1:4096",
        "bridgePort": LOCAL_CLI_BRIDGE_PORT,
        "runtime": "rust"
    }))
    .into_response()
}

async fn handle_quit() -> Response {
    tokio::spawn(async {
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        std::process::exit(0);
    });
    Json(json!({ "ok": true })).into_response()
}

pub fn locate_web_dist() -> Option<PathBuf> {
    if let Ok(custom) = std::env::var("ARUNAKI_WEB_DIST") {
        let p = PathBuf::from(custom);
        if p.join("index.html").exists() {
            return Some(p);
        }
    }

    let mut candidates = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            candidates.push(exe_dir.join("web"));
            candidates.push(exe_dir.join("apps/web/dist"));
            let mut cur = Some(exe_dir);
            for _ in 0..5 {
                if let Some(d) = cur {
                    candidates.push(d.join("apps/web/dist"));
                    candidates.push(d.join("apps/desktop/web"));
                    candidates.push(d.join("web"));
                    cur = d.parent();
                }
            }
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("apps/web/dist"));
        candidates.push(cwd.join("apps/desktop/web"));
    }

    candidates.into_iter().find(|p| p.join("index.html").exists())
}

pub fn try_serve_static_asset(uri_path: &str) -> Option<Response> {
    if uri_path.starts_with("/api/")
        || uri_path.starts_with("/session")
        || uri_path.starts_with("/provider")
        || uri_path.starts_with("/messaging")
        || uri_path.starts_with("/knowledge")
    {
        return None;
    }

    let dist_dir = locate_web_dist()?;
    let rel = uri_path.trim_start_matches('/');
    let target_file = if rel.is_empty() {
        dist_dir.join("index.html")
    } else {
        let candidate = dist_dir.join(rel);
        if candidate.is_file() {
            candidate
        } else {
            // SPA fallback for client routes
            dist_dir.join("index.html")
        }
    };

    let bytes = std::fs::read(&target_file).ok()?;
    let mime = mime_guess::from_path(&target_file).first_or_octet_stream();
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime.as_ref())
        .body(Body::from(bytes))
        .ok()
}

pub const DESKTOP_INIT_SCRIPT: &str = r#"
(function() {
  if (window.arunakiDesktop) return;
  const ORIGIN = window.location.origin || 'http://127.0.0.1:4096';
  const postJson = async (path, body) => {
    const r = await fetch(ORIGIN + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    return await r.json();
  };

  let sseSource = null;
  const sseListeners = new Set();

  window.arunakiDesktop = {
    isDesktop: true,
    platform: 'win32',
    runtime: 'rust-tauri-wry',
    minimize: () => {},
    maximize: () => {},
    close: () => { postJson('/api/desktop/quit', {}); },
    isMaximized: async () => false,
    onMaximizedChange: () => () => {},
    pickFolder: async () => {
      const res = await postJson('/api/desktop/pick-folder', {});
      return res && res.path ? res.path : null;
    },
    getFolderTree: (folderPath) => postJson('/api/desktop/folder-tree', { folderPath }),
    readFile: (filePath) => postJson('/api/desktop/read-file', { filePath }),
    writeFile: (filePath, content) => postJson('/api/desktop/write-file', { filePath, content }),
    createFolder: (folderPath) => postJson('/api/desktop/create-folder', { folderPath }),
    backupFolder: (sourcePath) => postJson('/api/desktop/backup-folder', { sourcePath }),
    deletePath: (targetPath) => postJson('/api/desktop/delete-path', { targetPath }),
    renamePath: (oldPath, newPath) => postJson('/api/desktop/rename-path', { oldPath, newPath }),
    openPath: (filePath) => postJson('/api/desktop/open-path', { filePath }),
    openExcelNative: (filePath) => postJson('/api/desktop/open-excel', { filePath }),
    openWordNative: (filePath) => postJson('/api/desktop/open-word', { filePath }),
    parseExcel: (filePath) => postJson('/api/desktop/parse-excel', { filePath }),
    writeExcel: (filePath, rows, sheetName) => postJson('/api/desktop/write-excel', { filePath, rows, sheetName }),
    readBinaryFile: (filePath) => postJson('/api/desktop/read-binary', { filePath }),
    getEngineInfo: async () => {
      const r = await fetch(ORIGIN + '/api/desktop/engine-info');
      return await r.json();
    },
    engineFetch: async (opts) => {
      const url = ORIGIN + (opts.path.startsWith('/') ? opts.path : '/' + opts.path);
      const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
      if (opts.directory) {
        headers['x-arunaki-directory'] = opts.directory;
        headers['x-opencode-directory'] = opts.directory;
      }
      const res = await fetch(url, {
        method: opts.method || 'GET',
        headers,
        body: opts.body ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : undefined
      });
      const text = await res.text();
      let data = text;
      try { data = JSON.parse(text); } catch (_) {}
      return { ok: res.ok, status: res.status, data };
    },
    bridgeFetch: async (opts) => {
      const url = 'http://127.0.0.1:20188' + (opts.path.startsWith('/') ? opts.path : '/' + opts.path);
      const res = await fetch(url, {
        method: opts.method || 'GET',
        headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}),
        body: opts.body ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : undefined
      });
      const text = await res.text();
      let data = text;
      try { data = JSON.parse(text); } catch (_) {}
      return { ok: res.ok, status: res.status, data };
    },
    startEngineSSE: async (channelOrDir, maybePath, maybeHeaders) => {
      if (sseSource) {
        try { sseSource.close(); } catch (_) {}
      }
      let sseUrl = ORIGIN + '/api/event';
      if (typeof maybePath === 'string' && maybePath.startsWith('/')) {
        sseUrl = ORIGIN + maybePath;
      } else if (typeof channelOrDir === 'string' && !channelOrDir.startsWith('sse_') && channelOrDir.length > 0) {
        sseUrl = ORIGIN + '/api/event?directory=' + encodeURIComponent(channelOrDir);
      }
      sseSource = new EventSource(sseUrl);
      sseSource.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(ev.data);
          sseListeners.forEach((cb) => cb(parsed));
        } catch (_) {}
      };
      return { ok: true };
    },
    stopEngineSSE: async () => {
      if (sseSource) {
        try { sseSource.close(); } catch (_) {}
        sseSource = null;
      }
      return { ok: true };
    },
    onEngineSSE: (channelOrCb, maybeCb) => {
      const cb = typeof maybeCb === 'function' ? maybeCb : channelOrCb;
      if (typeof cb !== 'function') return () => {};
      sseListeners.add(cb);
      return () => sseListeners.delete(cb);
    },
    onEngineSseStatus: () => () => {}
  };
})();
"#;

#[cfg(windows)]
pub fn hide_console_window() {
    #[link(name = "kernel32")]
    extern "system" {
        fn GetConsoleWindow() -> *mut std::ffi::c_void;
    }
    #[link(name = "user32")]
    extern "system" {
        fn ShowWindow(hwnd: *mut std::ffi::c_void, n_cmd_show: i32) -> i32;
    }
    unsafe {
        let hwnd = GetConsoleWindow();
        if !hwnd.is_null() {
            // SW_HIDE = 0
            ShowWindow(hwnd, 0);
        }
    }
}

#[cfg(not(windows))]
pub fn hide_console_window() {}

pub fn launch_desktop_window(url: &str) {
    use tao::{
        dpi::LogicalSize,
        event::{Event, WindowEvent},
        event_loop::{ControlFlow, EventLoop},
        window::{Theme, WindowBuilder},
    };
    use wry::WebViewBuilder;

    let event_loop = EventLoop::new();
    let window = WindowBuilder::new()
        .with_title("Arunaki")
        .with_inner_size(LogicalSize::new(1360.0, 860.0))
        .with_min_inner_size(LogicalSize::new(960.0, 640.0))
        .with_theme(Some(Theme::Dark))
        .build(&event_loop)
        .expect("Failed to create Arunaki desktop window");

    let _webview = WebViewBuilder::new()
        .with_initialization_script(DESKTOP_INIT_SCRIPT)
        .with_url(url)
        .build(&window)
        .expect("Failed to initialize WebView2 runtime");

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        if let Event::WindowEvent {
            event: WindowEvent::CloseRequested,
            ..
        } = event
        {
            *control_flow = ControlFlow::Exit;
            std::process::exit(0);
        }
    });
}
