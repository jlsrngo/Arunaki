pub mod arunaki;
pub mod bridge;
pub mod cred_store;
pub mod desktop;
pub mod diff;
pub mod files;
pub mod knowledge;
pub mod messaging;
pub mod network;
pub mod paths;
pub mod permission;
pub mod provider;
pub mod question;
pub mod session;
pub mod tasks;
pub mod tool;

use crate::bridge::{start_bridge_server, LOCAL_CLI_BRIDGE_PORT};
use crate::cred_store::{harvest_all, register_local_cli_to_config};
use crate::paths::{arunaki_dot_dir, gen_id, now_ms};
use crate::session::get_event_sender;
use axum::{
    body::Body,
    extract::Request,
    http::{header, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use base64::Engine as _;
use futures_util::StreamExt;
use serde_json::json;
use std::time::Duration;
use tokio_stream::wrappers::BroadcastStream;

pub const ENGINE_VERSION: &str = "1.3.0-rust";

pub async fn init_engine_and_bind(
    hostname: &str,
    port: u16,
) -> (tokio::net::TcpListener, String, u16) {
    // 1. Harvest local CLI credentials & start Local-CLI Bridge on :20188
    harvest_all();
    register_local_cli_to_config(LOCAL_CLI_BRIDGE_PORT);
    if let Err(e) = start_bridge_server(LOCAL_CLI_BRIDGE_PORT).await {
        eprintln!(
            "[arunaki-engine] Notice: bridge server on :{}: {}",
            LOCAL_CLI_BRIDGE_PORT, e
        );
    } else {
        println!(
            "[arunaki-engine] Local-CLI Bridge listening on http://127.0.0.1:{}/v1",
            LOCAL_CLI_BRIDGE_PORT
        );
    }

    // 2. Start background Telegram bot polling & active folder ingestion watcher
    messaging::start_telegram_worker();
    session::watcher::start_folder_watcher_daemon();

    // 3. Write dev-server-password if server password env is provided
    let srv_user = std::env::var("Arunaki_SERVER_USERNAME")
        .or_else(|_| std::env::var("ARUNAKI_SERVER_USERNAME"))
        .unwrap_or_else(|_| "arunaki".to_string());
    if let Ok(srv_pass) = std::env::var("Arunaki_SERVER_PASSWORD")
        .or_else(|_| std::env::var("ARUNAKI_SERVER_PASSWORD"))
    {
        if !srv_pass.is_empty() {
            let pw_file = arunaki_dot_dir().join("dev-server-password");
            let _ = std::fs::write(pw_file, format!("{}:{}", srv_user, srv_pass));
        }
    }

    let bind_addr = format!("{}:{}", hostname, port);
    let listener = match tokio::net::TcpListener::bind(&bind_addr).await {
        Ok(l) => l,
        Err(_) => tokio::net::TcpListener::bind(format!("{}:0", hostname))
            .await
            .expect("Failed to bind arunaki-engine"),
    };

    let actual_port = listener.local_addr().map(|a| a.port()).unwrap_or(port);
    let url = format!("http://{}:{}", hostname, actual_port);

    // 4. Write ~/.arunaki/engine-info.json with complete dynamic stack metadata
    let info_path = arunaki_dot_dir().join("engine-info.json");
    let _ = std::fs::write(
        info_path,
        serde_json::to_string_pretty(&json!({
            "port": actual_port,
            "hostname": hostname,
            "url": url,
            "bridgePort": LOCAL_CLI_BRIDGE_PORT,
            "pid": std::process::id(),
            "runtime": "Native Rust Hybrid",
            "version": ENGINE_VERSION,
            "engine": "Axum v0.7 + Tokio v1.40",
            "desktop": "Tauri v2 + WebView2",
            "docs": "Native Win32 COM Sidecar (arunaki-docs)",
            "os": format!("{}_{} {}", std::env::consts::OS, std::env::consts::ARCH, std::env::consts::FAMILY)
        }))
        .unwrap_or_default(),
    );

    (listener, url, actual_port)
}

pub async fn run_axum_server(listener: tokio::net::TcpListener, _actual_port: u16) {
    axum::serve(listener, build_router()).await.unwrap();
}

pub fn build_router() -> Router {
    Router::new()
        .route("/api/health", get(handle_health))
        .route("/global/health", get(handle_health))
        .route("/health", get(handle_health))
        .route("/api/event", get(handle_sse_events))
        .route("/global/event", get(handle_sse_events))
        .route("/event", get(handle_sse_events))
        .merge(desktop::router())
        .merge(diff::router())
        .merge(knowledge::router())
        .merge(files::router())
        .merge(provider::router())
        .merge(messaging::router())
        .merge(network::router())
        .merge(session::router())
        .merge(tasks::router())
        .merge(question::router())
        .merge(permission::router())
        .fallback(handle_fallback)
        .layer(middleware::from_fn(cors_and_auth_middleware))
}

/// Same router, built once, so in-process dispatch does not re-register routes per call.
fn shared_router() -> &'static Router {
    static ROUTER: std::sync::OnceLock<Router> = std::sync::OnceLock::new();
    ROUTER.get_or_init(build_router)
}

/// Dispatches a request through the same router the Axum server uses, without touching a socket.
/// The desktop shell uses this so the UI never depends on the local HTTP port; third-party
/// integrations still speak HTTP on 127.0.0.1:4096.
pub async fn handle_local_request(
    method: &str,
    path: &str,
    headers: Vec<(String, String)>,
    body: Option<Vec<u8>>,
) -> (u16, Vec<(String, String)>, Vec<u8>) {
    use tower::ServiceExt;

    let m = Method::from_bytes(method.as_bytes()).unwrap_or(Method::GET);
    let mut builder = Request::builder().method(m).uri(path);
    if let Some(hs) = builder.headers_mut() {
        for (k, v) in headers {
            if let (Ok(name), Ok(val)) = (
                header::HeaderName::from_bytes(k.as_bytes()),
                header::HeaderValue::from_str(&v),
            ) {
                hs.append(name, val);
            }
        }
    }
    let req = builder.body(Body::from(body.unwrap_or_default()));
    let req = match req {
        Ok(r) => r,
        Err(e) => return (400, vec![], format!("Bad request: {e}").into_bytes()),
    };

    match shared_router().clone().oneshot(req).await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let headers: Vec<(String, String)> = resp
                .headers()
                .iter()
                .filter_map(|(k, v)| v.to_str().ok().map(|v| (k.to_string(), v.to_string())))
                .collect();
            let bytes = axum::body::to_bytes(resp.into_body(), 64 * 1024 * 1024)
                .await
                .map(|b| b.to_vec())
                .unwrap_or_default();
            (status, headers, bytes)
        }
        Err(e) => (500, vec![], format!("Engine dispatch failed: {e}").into_bytes()),
    }
}

pub async fn handle_health() -> impl IntoResponse {
    Json(json!({
        "healthy": true,
        "version": ENGINE_VERSION,
        "runtime": "rust"
    }))
}

pub async fn handle_sse_events() -> Response {
    let rx = get_event_sender().subscribe();
    let initial = futures_util::stream::once(async move {
        let init_evt = json!({
            "directory": "global",
            "payload": {
                "id": gen_id("evt"),
                "type": "server.connected",
                "time": now_ms(),
                "properties": {}
            }
        });
        Ok::<_, std::convert::Infallible>(format!("data: {}\n\n", init_evt))
    });

    let bstream = BroadcastStream::new(rx).filter_map(|res| async move {
        match res {
            Ok(val) => Some(Ok::<_, std::convert::Infallible>(format!(
                "data: {}\n\n",
                val
            ))),
            Err(_) => None,
        }
    });

    let combined = initial.chain(bstream);
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/event-stream")
        .header(header::CACHE_CONTROL, "no-cache")
        .header(header::CONNECTION, "keep-alive")
        .body(Body::from_stream(combined))
        .unwrap()
}

pub async fn handle_fallback(req: Request) -> Response {
    // 1. Try serving static Vite frontend assets (apps/dist)
    let uri_path = req.uri().path().to_string();
    if req.method() == Method::GET {
        if let Some(static_resp) = desktop::try_serve_static_asset(&uri_path) {
            return static_resp;
        }
    }

    // 2. Optional TypeScript upstream fallback if explicitly configured
    if let Ok(upstream) = std::env::var("ARUNAKI_TS_UPSTREAM") {
        let upstream = upstream.trim_end_matches('/');
        if !upstream.is_empty() {
            let method = req.method().clone();
            let pq = req
                .uri()
                .path_and_query()
                .map(|x| x.as_str())
                .unwrap_or("/");
            let target_url = format!("{}{}", upstream, pq);
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(60))
                .build()
                .unwrap();
            if let Ok(body_bytes) =
                axum::body::to_bytes(req.into_body(), 16 * 1024 * 1024).await
            {
                let req_method = reqwest::Method::from_bytes(method.as_str().as_bytes())
                    .unwrap_or(reqwest::Method::GET);
                if let Ok(r) = client
                    .request(req_method, &target_url)
                    .body(body_bytes.to_vec())
                    .send()
                    .await
                {
                    let status =
                        StatusCode::from_u16(r.status().as_u16()).unwrap_or(StatusCode::OK);
                    let bytes = r.bytes().await.unwrap_or_default();
                    return (status, bytes).into_response();
                }
            }
        }
    }

    (
        StatusCode::NOT_FOUND,
        Json(json!({ "error": "Endpoint not found" })),
    )
        .into_response()
}

/// Browsers always send `Origin` on cross-site requests; the native webview (same-origin),
/// CLI tools and other local processes do not. Only Arunaki's own UI and local dev servers
/// are cross-site origins worth trusting, so everything else is refused.
pub fn is_allowed_origin(origin: &str) -> bool {
    origin.starts_with("tauri://")
        || origin == "http://tauri.localhost"
        || origin == "https://tauri.localhost"
        || origin == "http://localhost"
        || origin == "https://localhost"
        || origin.starts_with("http://localhost:")
        || origin.starts_with("https://localhost:")
        || origin == "http://127.0.0.1"
        || origin.starts_with("http://127.0.0.1:")
}

pub async fn cors_and_auth_middleware(req: Request, next: Next) -> Response {
    // Any page the user opens in a browser can reach loopback:4096; only let Arunaki's
    // own origins through so a random website cannot drive the local API.
    if let Some(origin) = req
        .headers()
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok())
    {
        if !is_allowed_origin(origin) {
            return Response::builder()
                .status(StatusCode::FORBIDDEN)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    r#"{"error":"Forbidden: cross-site browser access to the local engine is blocked"}"#,
                ))
                .unwrap();
        }
    }

    if req.method() == Method::OPTIONS {
        return Response::builder()
            .status(StatusCode::NO_CONTENT)
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .header(
                header::ACCESS_CONTROL_ALLOW_METHODS,
                "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            )
            .header(
                header::ACCESS_CONTROL_ALLOW_HEADERS,
                "Content-Type, Authorization, x-arunaki-directory, x-opencode-directory, x-arunaki-workspace",
            )
            .body(Body::empty())
            .unwrap();
    }

    // Check Basic Auth only when Arunaki_SERVER_PASSWORD / ARUNAKI_SERVER_PASSWORD is set
    if let Ok(expected_pass) = std::env::var("Arunaki_SERVER_PASSWORD")
        .or_else(|_| std::env::var("ARUNAKI_SERVER_PASSWORD"))
    {
        if !expected_pass.is_empty() {
            let expected_user = std::env::var("Arunaki_SERVER_USERNAME")
                .or_else(|_| std::env::var("ARUNAKI_SERVER_USERNAME"))
                .unwrap_or_else(|_| "arunaki".to_string());
            let expected_b64 = base64::engine::general_purpose::STANDARD
                .encode(format!("{}:{}", expected_user, expected_pass));
            let expected_hdr = format!("Basic {}", expected_b64);

            let provided = req
                .headers()
                .get(header::AUTHORIZATION)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("");

            let mut authorized = provided == expected_hdr;
            if !authorized {
                if let Some(query) = req.uri().query() {
                    for pair in query.split('&') {
                        if let Some((k, v)) = pair.split_once('=') {
                            if k == "auth_token" || k == "token" {
                                if let Ok(decoded) = base64::engine::general_purpose::STANDARD
                                    .decode(v)
                                    .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(v))
                                    .or_else(|_| base64::engine::general_purpose::STANDARD_NO_PAD.decode(v))
                                {
                                    if let Ok(s) = String::from_utf8(decoded) {
                                        if s == format!("{}:{}", expected_user, expected_pass) {
                                            authorized = true;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if !authorized {
                return Response::builder()
                    .status(StatusCode::UNAUTHORIZED)
                    .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(r#"{"error":"Unauthorized"}"#))
                    .unwrap();
            }
        }
    }

    let mut resp = next.run(req).await;
    let headers = resp.headers_mut();
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        header::HeaderValue::from_static("*"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_METHODS,
        header::HeaderValue::from_static("GET, POST, PUT, PATCH, DELETE, OPTIONS"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        header::HeaderValue::from_static(
            "Content-Type, Authorization, x-arunaki-directory, x-opencode-directory, x-arunaki-workspace",
        ),
    );
    resp
}

#[cfg(test)]
mod origin_tests {
    use super::is_allowed_origin;

    #[test]
    fn allows_own_ui_and_local_dev_origins() {
        for origin in [
            "tauri://localhost",
            "http://tauri.localhost",
            "https://tauri.localhost",
            "http://localhost",
            "http://localhost:5173",
            "http://127.0.0.1:4173",
        ] {
            assert!(is_allowed_origin(origin), "{origin} should be allowed");
        }
    }

    #[test]
    fn blocks_arbitrary_web_origins() {
        for origin in [
            "https://evil.com",
            "null",
            "http://localhost.evil.com",
            "http://127.0.0.1.evil.com",
            "https://tauri.localhost.evil.com",
        ] {
            assert!(!is_allowed_origin(origin), "{origin} should be blocked");
        }
    }

    #[tokio::test]
    async fn local_dispatch_reaches_router_without_socket() {
        let (status, _, body) = super::handle_local_request("GET", "/api/health", vec![], None).await;
        assert_eq!(status, 200);
        assert!(String::from_utf8_lossy(&body).contains("\"healthy\":true"));
    }

    #[tokio::test]
    async fn local_dispatch_still_blocks_web_origins() {
        let (status, _, _) = super::handle_local_request(
            "GET",
            "/api/health",
            vec![("origin".to_string(), "https://evil.com".to_string())],
            None,
        )
        .await;
        assert_eq!(status, 403);
    }
}
