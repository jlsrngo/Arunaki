//! Arunaki Native Desktop API Module (Pure Rust)
//!
//! Provides native IPC endpoints invoked by the Tauri frontend webview via `window.__TAURI__.invoke(...)`.
//! All core desktop logic, process orchestration, credential storage, and engine communications
//! reside here in compiled Rust binary, leaving the React UI strictly as a thin presentation layer.

use std::collections::HashMap;

#[derive(serde::Deserialize, serde::Serialize, Clone, Debug)]
pub struct TauriEngineRequest {
    pub path: String,
    pub method: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    pub body: Option<String>,
}

#[derive(serde::Deserialize, serde::Serialize, Clone, Debug)]
pub struct TauriEngineResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub ok: bool,
}

/// Provides system metadata and desktop environment status.
#[tauri::command]
pub fn desktop_info() -> serde_json::Value {
    serde_json::json!({
        "runtime": "tauri-v2",
        "engine": "Axum v0.7 + Tokio v1.40",
        "desktop": "Tauri v2 + Microsoft Edge WebView2",
        "docs": "Native Win32 COM Sidecar",
        "os": "Windows_NT x64"
    })
}

/// Native window controls for custom frameless titlebar.
#[tauri::command]
pub fn window_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_toggle_maximize(window: tauri::Window) -> Result<(), String> {
    let is_max = window.is_maximized().map_err(|e| e.to_string())?;
    if is_max {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn window_close(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

/// Direct loopback dispatcher for Arunaki Axum engine routes.
/// Completely bypasses browser socket and CORS barriers.
#[tauri::command]
pub async fn tauri_engine_fetch(req: TauriEngineRequest) -> Result<TauriEngineResponse, String> {
    let port = 4096;
    let method_str = req.method.unwrap_or_else(|| "GET".to_string()).to_uppercase();
    let path = if req.path.starts_with('/') {
        req.path
    } else {
        format!("/{}", req.path)
    };
    let url = format!("http://127.0.0.1:{}{}", port, path);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let req_method = match method_str.as_str() {
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        "PATCH" => reqwest::Method::PATCH,
        _ => reqwest::Method::GET,
    };

    let mut req_builder = client.request(req_method, &url);
    if let Some(headers) = req.headers {
        for (k, v) in headers {
            if let (Ok(name), Ok(val)) = (
                reqwest::header::HeaderName::from_bytes(k.as_bytes()),
                reqwest::header::HeaderValue::from_str(&v),
            ) {
                req_builder = req_builder.header(name, val);
            }
        }
    }

    if let Some(body) = req.body {
        req_builder = req_builder.body(body);
    }

    match req_builder.send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let ok = resp.status().is_success();
            let status_text = resp.status().canonical_reason().unwrap_or("").to_string();
            let mut res_headers = HashMap::new();
            for (k, v) in resp.headers() {
                if let Ok(val) = v.to_str() {
                    res_headers.insert(k.as_str().to_string(), val.to_string());
                }
            }
            let body = resp.text().await.unwrap_or_default();
            Ok(TauriEngineResponse {
                status,
                status_text,
                headers: res_headers,
                body,
                ok,
            })
        }
        Err(e) => Err(format!("Engine request failed: {}", e)),
    }
}

/// Spawns native terminal windows or clears credentials for CLI providers.
#[tauri::command]
pub async fn tauri_cli_login(target: String) -> Result<serde_json::Value, String> {
    match target.as_str() {
        "antigravity-logout" => {
            arunaki_engine::cred_store::remove_credential("antigravity");
            Ok(serde_json::json!({
                "data": { "success": true, "message": "Signed out from Google Antigravity." }
            }))
        }
        "opencode-logout" => {
            arunaki_engine::cred_store::remove_credential("opencode");
            Ok(serde_json::json!({
                "data": { "success": true, "message": "Signed out from OpenCode." }
            }))
        }
        "claude" | "codex" | "opencode-terminal" | "antigravity-cli" => {
            let cmd_str = match target.as_str() {
                "claude" => "claude",
                "codex" => "codex",
                "opencode-terminal" => "opencode auth login",
                "antigravity-cli" => "agy login",
                _ => "cmd",
            };
            #[cfg(windows)]
            {
                let _ = std::process::Command::new("cmd")
                    .args(["/c", "start", "cmd", "/k", cmd_str])
                    .spawn();
            }
            Ok(serde_json::json!({
                "data": {
                    "success": true,
                    "message": format!("Launched '{}' in terminal window.", cmd_str)
                }
            }))
        }
        _ => Ok(serde_json::json!({
            "data": {
                "success": true,
                "message": "Built-in Rust Local-CLI Bridge is active."
            }
        })),
    }
}

/// Harvests credentials and builds CLI provider registry directly in Rust memory.
#[tauri::command]
pub async fn tauri_cli_status() -> Result<serde_json::Value, String> {
    arunaki_engine::cred_store::harvest_all();
    let creds = arunaki_engine::cred_store::get_all_credentials();
    let registry = arunaki_engine::provider::local_cli::build_cli_provider_registry();
    let discovered = arunaki_engine::provider::local_cli::build_discovered_list();

    let mut sources = serde_json::Map::new();
    for s in ["codex", "claude", "opencode", "kiro", "antigravity", "groq"] {
        if let Some(c) = creds.get(s) {
            sources.insert(
                s.to_string(),
                serde_json::json!({
                    "connected": true,
                    "expiresAt": c.expires_at,
                    "updatedAt": c.updated_at,
                    "autoHarvested": c.auto_harvested,
                    "accountInfo": c.account_info,
                    "hasRefreshToken": c.refresh_token.is_some()
                }),
            );
        } else {
            sources.insert(
                s.to_string(),
                serde_json::json!({
                    "connected": false,
                    "expired": false
                }),
            );
        }
    }

    Ok(serde_json::json!({
        "data": {
            "sources": sources,
            "registry": registry,
            "discovered": discovered,
            "bridgePort": arunaki_engine::bridge::LOCAL_CLI_BRIDGE_PORT
        }
    }))
}
