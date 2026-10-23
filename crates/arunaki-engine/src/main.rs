pub mod arunaki;
mod bridge;
mod cred_store;
mod desktop;
mod files;
mod knowledge;
mod messaging;
mod paths;
mod permission;
mod provider;
mod question;
mod session;
mod tool;

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

const ENGINE_VERSION: &str = "1.3.0-rust";

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let mut port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(4096);
    let mut hostname = String::from("127.0.0.1");
    let mut headless = false;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "serve" | "--headless" | "--server" => {
                headless = true;
                i += 1;
            }
            "--port" | "-p" if i + 1 < args.len() => {
                if let Ok(p) = args[i + 1].parse::<u16>() {
                    port = p;
                }
                i += 2;
            }
            "--hostname" | "-h" if i + 1 < args.len() => {
                hostname = args[i + 1].clone();
                i += 2;
            }
            "--version" | "-v" => {
                println!("arunaki-engine {}", ENGINE_VERSION);
                return;
            }
            _ => {
                i += 1;
            }
        }
    }

    if headless || std::env::var("ARUNAKI_HEADLESS").as_deref() == Ok("1") {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("Failed to create Tokio runtime");
        rt.block_on(async move {
            let (listener, url, actual_port) = init_engine_and_bind(&hostname, port).await;
            println!(
                "arunaki server listening on {} (native Rust engine v{})",
                url, ENGINE_VERSION
            );
            run_axum_server(listener, actual_port).await;
        });
    } else {
        // Standalone Desktop GUI Mode (double-clicked in Explorer with no terminal needed!)
        if std::env::var("ARUNAKI_SHOW_CONSOLE").as_deref() != Ok("1") {
            desktop::hide_console_window();
        }

        let (ready_tx, ready_rx) = std::sync::mpsc::channel::<String>();
        let host_clone = hostname.clone();
        std::thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .expect("Failed to create background Tokio runtime");
            rt.block_on(async move {
                // Check if another arunaki-engine is already listening on `port`
                let probe_url = format!("http://{}:{}/api/health", host_clone, port);
                let already_up = reqwest::Client::builder()
                    .timeout(Duration::from_millis(400))
                    .build()
                    .unwrap()
                    .get(&probe_url)
                    .send()
                    .await
                    .map(|r| r.status().is_success())
                    .unwrap_or(false);

                if already_up {
                    let existing_url = format!("http://{}:{}", host_clone, port);
                    let _ = ready_tx.send(existing_url);
                    loop {
                        tokio::time::sleep(Duration::from_secs(3600)).await;
                    }
                } else {
                    let (listener, url, actual_port) =
                        init_engine_and_bind(&host_clone, port).await;
                    let _ = ready_tx.send(url);
                    run_axum_server(listener, actual_port).await;
                }
            });
        });

        let app_url = ready_rx
            .recv_timeout(Duration::from_secs(10))
            .unwrap_or_else(|_| format!("http://{}:{}", hostname, port));
        desktop::launch_desktop_window(&app_url);
    }
}

async fn init_engine_and_bind(
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

    // 2. Start background Telegram bot polling if enabled
    messaging::start_telegram_worker();

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

    // 4. Write ~/.arunaki/engine-info.json
    let info_path = arunaki_dot_dir().join("engine-info.json");
    let _ = std::fs::write(
        info_path,
        serde_json::to_string_pretty(&json!({
            "port": actual_port,
            "hostname": hostname,
            "url": url,
            "bridgePort": LOCAL_CLI_BRIDGE_PORT,
            "pid": std::process::id(),
            "runtime": "rust",
            "version": ENGINE_VERSION
        }))
        .unwrap_or_default(),
    );

    (listener, url, actual_port)
}

async fn run_axum_server(listener: tokio::net::TcpListener, _actual_port: u16) {
    let app = Router::new()
        .route("/api/health", get(handle_health))
        .route("/global/health", get(handle_health))
        .route("/health", get(handle_health))
        .route("/api/event", get(handle_sse_events))
        .route("/global/event", get(handle_sse_events))
        .route("/event", get(handle_sse_events))
        .merge(desktop::router())
        .merge(knowledge::router())
        .merge(files::router())
        .merge(provider::router())
        .merge(messaging::router())
        .merge(session::router())
        .merge(question::router())
        .merge(permission::router())
        .fallback(handle_fallback)
        .layer(middleware::from_fn(cors_and_auth_middleware));

    axum::serve(listener, app).await.unwrap();
}

async fn handle_health() -> impl IntoResponse {
    Json(json!({
        "healthy": true,
        "version": ENGINE_VERSION,
        "runtime": "rust"
    }))
}

async fn handle_sse_events() -> Response {
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

async fn handle_fallback(req: Request) -> Response {
    // 1. Try serving static Vite frontend assets (apps/web/dist)
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

async fn cors_and_auth_middleware(req: Request, next: Next) -> Response {
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
                // Do NOT send WWW-Authenticate: Basic header to prevent Chromium from popping up
                // an intrusive native modal "Sign in to access this site" dialog.
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
