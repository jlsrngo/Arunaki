//! Local-CLI Bridge (:20188) — OpenAI-compatible server that routes to vendor adapters.

mod antigravity;
mod claude;
mod codex;
mod kiro;
pub mod schema;

use crate::cred_store::{ensure_fresh_credential, get_all_credentials, harvest_all};
use crate::paths::{gen_id, now_ms};
use axum::{
    body::Body,
    extract::Request,
    http::{header, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};
use std::collections::HashMap;

use antigravity::handle_antigravity_request;
use claude::handle_claude_request;
use codex::handle_codex_request;
use kiro::handle_kiro_request;

pub const LOCAL_CLI_BRIDGE_PORT: u16 = 20188;

/// Origin guard: Blocks arbitrary browser websites from making cross-site calls to the local bridge.
/// CLI tools (Cursor IDE, Claude Code, curl, scripts) don't send an Origin header and are allowed.
async fn origin_guard_middleware(req: Request, next: Next) -> Response {
    if let Some(origin) = req.headers().get(header::ORIGIN).and_then(|v| v.to_str().ok()) {
        let allowed = origin == "http://localhost"
            || origin == "https://localhost"
            || origin.starts_with("http://127.0.0.1:")
            || origin.starts_with("http://localhost:")
            || origin == "http://127.0.0.1"
            || origin.starts_with("tauri://")
            || origin == "http://tauri.localhost";

        if !allowed {
            return Response::builder()
                .status(StatusCode::FORBIDDEN)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(r#"{"error":"Forbidden: Cross-site browser access to local bridge is blocked for security"}"#))
                .unwrap();
        }
    }
    next.run(req).await
}

pub async fn start_bridge_server(preferred_port: u16) -> Result<u16, String> {
    harvest_all();

    // 1. Probe first: If an existing Arunaki Local-CLI Bridge is already running on preferred_port, reuse it!
    let probe_url = format!("http://127.0.0.1:{}/health", preferred_port);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(300))
        .build();
    if let Ok(c) = client {
        if let Ok(resp) = c.get(&probe_url).send().await {
            if resp.status().is_success() {
                println!(
                    "[arunaki-bridge] Existing bridge instance detected on port {}, reusing.",
                    preferred_port
                );
                return Ok(preferred_port);
            }
        }
    }

    // 2. Incremental fallback: Try preferred_port, preferred_port + 1 ... preferred_port + 5, then random port 0
    let candidate_ports = [
        preferred_port,
        preferred_port + 1,
        preferred_port + 2,
        preferred_port + 3,
        0,
    ];

    let mut bound_listener = None;
    for &p in &candidate_ports {
        let addr = format!("127.0.0.1:{}", p);
        match tokio::net::TcpListener::bind(&addr).await {
            Ok(l) => {
                bound_listener = Some(l);
                break;
            }
            Err(_) => continue,
        }
    }

    let listener = bound_listener.ok_or_else(|| {
        format!("Failed to bind Local-CLI Bridge on any candidate port around {}", preferred_port)
    })?;

    let actual_port = listener.local_addr().map(|a| a.port()).unwrap_or(preferred_port);

    // 3. Write active bridge metadata to ~/.arunaki/bridge-info.json
    let info_path = crate::paths::arunaki_dot_dir().join("bridge-info.json");
    let _ = std::fs::write(
        info_path,
        serde_json::to_string_pretty(&json!({
            "port": actual_port,
            "url": format!("http://127.0.0.1:{}/v1", actual_port),
            "pid": std::process::id(),
            "healthy": true
        }))
        .unwrap_or_default(),
    );

    let app = Router::new()
        .route("/health", get(handle_health))
        .route("/v1/models", get(handle_models))
        .route("/v1/chat/completions", post(handle_chat_completions))
        .layer(middleware::from_fn(origin_guard_middleware));

    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });

    Ok(actual_port)
}

async fn handle_health() -> impl IntoResponse {
    let creds = get_all_credentials();
    Json(json!({
        "ok": true,
        "codex": creds.contains_key("codex"),
        "claude": creds.contains_key("claude"),
        "opencode": creds.contains_key("opencode"),
        "kiro": creds.contains_key("kiro"),
        "antigravity": creds.contains_key("antigravity"),
        "groq": creds.contains_key("groq"),
    }))
}

async fn handle_models() -> impl IntoResponse {
    let creds = get_all_credentials();
    let mut models = Vec::new();
    if creds.contains_key("codex") {
        for id in [
            "gpt-5.6-terra",
            "gpt-5.4",
            "gpt-5.4-mini",
            "gpt-5.3-codex",
            "gpt-5.2-codex",
            "gpt-5.2",
            "gpt-5.1-codex-max",
            "gpt-5.1-codex-mini",
        ] {
            models.push(json!({ "id": id, "object": "model", "owned_by": "codex-cli" }));
        }
    }
    if creds.contains_key("claude") {
        for id in ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5"] {
            models.push(json!({ "id": id, "object": "model", "owned_by": "claude-cli" }));
        }
    }
    if creds.contains_key("kiro") {
        for id in [
            "kiro/auto",
            "kiro/claude-opus-4.6",
            "kiro/claude-sonnet-4.6",
            "kiro/claude-sonnet-4.5",
            "kiro/claude-haiku-4.5",
            "kiro/deepseek-3.2",
            "kiro/minimax-m2.5",
            "kiro/glm-5",
            "kiro/qwen3-coder-next",
        ] {
            models.push(json!({ "id": id, "object": "model", "owned_by": "kiro-cli" }));
        }
    }
    if creds.contains_key("antigravity") {
        for id in [
            "gemini-3.8-pro-high",
            "gemini-3.8-pro-low",
            "gemini-3.8-flash-high",
            "gemini-3.8-flash-medium",
            "gemini-3.8-flash-low",
            "gemini-3.8-flash-minimal",
            "claude-sonnet-4-6-agy",
            "claude-opus-4-6-thinking",
            "gpt-oss-120b-medium",
        ] {
            models.push(json!({ "id": id, "object": "model", "owned_by": "antigravity-cli" }));
        }
    }
    if creds.contains_key("opencode") {
        for id in [
            "opencode/big-pickle",
            "opencode/mimo-v2-pro-free",
            "opencode/mimo-v2-omni-free",
            "opencode/nemotron-3-super-free",
            "opencode/minimax-m2.5-free",
            "opencode/gpt-5-nano",
        ] {
            models.push(json!({ "id": id, "object": "model", "owned_by": "opencode-cli" }));
        }
    }
    Json(json!({ "object": "list", "data": models }))
}

async fn handle_chat_completions(req: Request) -> Response {
    let bytes = match axum::body::to_bytes(req.into_body(), 32 * 1024 * 1024).await {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": { "message": format!("Invalid request body: {}", e) } })),
            )
                .into_response()
        }
    };
    let body: Value = match serde_json::from_slice(&bytes) {
        Ok(v) => v,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": { "message": format!("Invalid JSON: {}", e) } })),
            )
                .into_response()
        }
    };

    let model = body
        .get("model")
        .and_then(|v| v.as_str())
        .unwrap_or("gpt-5.4")
        .to_string();
    let is_stream = body
        .get("stream")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    crate::paths::log_engine("bridge", &format!("⚡ Incoming AI Request -> Model: '{}' (stream: {})", model, is_stream));

    if model.starts_with("kiro/") {
        return handle_kiro_request(body, &model, is_stream).await;
    }
    if model.starts_with("opencode/") || model == "big-pickle" || model.ends_with("-free") {
        return handle_opencode_request(body, &model, is_stream).await;
    }
    if model.starts_with("gemini-")
        || model.ends_with("-agy")
        || model.ends_with("-thinking")
        || model.starts_with("gpt-oss-")
    {
        return handle_antigravity_request(body, &model, is_stream).await;
    }
    if model.starts_with("claude-") {
        return handle_claude_request(body, &model, is_stream).await;
    }
    handle_codex_request(body, &model, is_stream).await
}

pub(crate) fn extract_content_text(content: Option<&Value>) -> String {
    match content {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|p| {
                if let Some(s) = p.as_str() {
                    Some(s.to_string())
                } else {
                    p.get("text")
                        .or_else(|| p.get("input_text"))
                        .or_else(|| p.get("content"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                }
            })
            .collect::<Vec<_>>()
            .join(""),
        _ => String::new(),
    }
}

pub(crate) fn make_completion_response(
    model: &str,
    text: String,
    tool_calls: Vec<Value>,
) -> Response {
    make_completion_response_with_reasoning(model, text, String::new(), tool_calls)
}

pub(crate) fn make_completion_response_with_reasoning(
    model: &str,
    text: String,
    reasoning: String,
    tool_calls: Vec<Value>,
) -> Response {
    let has_tools = !tool_calls.is_empty();
    let mut message = json!({
        "role": "assistant",
        "content": if text.is_empty() && has_tools { Value::Null } else { Value::String(text) },
    });
    if !reasoning.trim().is_empty() {
        message["reasoning_content"] = Value::String(reasoning);
    }
    if has_tools {
        message["tool_calls"] = Value::Array(tool_calls);
    }
    Json(json!({
        "id": gen_id("chatcmpl"),
        "object": "chat.completion",
        "created": now_ms() / 1000,
        "model": model,
        "choices": [{
            "index": 0,
            "message": message,
            "finish_reason": if has_tools { "tool_calls" } else { "stop" }
        }],
        "usage": {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0
        }
    }))
    .into_response()
}

pub(crate) fn make_sse_response_from_result(
    model: &str,
    text: String,
    tool_calls: Vec<Value>,
) -> Response {
    make_sse_response_with_reasoning(model, text, String::new(), tool_calls)
}

pub(crate) fn make_sse_response_with_reasoning(
    model: &str,
    text: String,
    reasoning: String,
    tool_calls: Vec<Value>,
) -> Response {
    let chat_id = gen_id("chatcmpl");
    let created = now_ms() / 1000;
    let mut chunks = Vec::new();

    if !reasoning.trim().is_empty() {
        chunks.push(format!(
            "data: {}\n\n",
            json!({
                "id": chat_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": model,
                "choices": [{
                    "index": 0,
                    "delta": { "role": "assistant", "reasoning_content": reasoning },
                    "finish_reason": Value::Null
                }]
            })
        ));
    }

    if !text.is_empty() {
        chunks.push(format!(
            "data: {}\n\n",
            json!({
                "id": chat_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": model,
                "choices": [{
                    "index": 0,
                    "delta": { "role": "assistant", "content": text },
                    "finish_reason": Value::Null
                }]
            })
        ));
    }

    for (idx, tc) in tool_calls.iter().enumerate() {
        let id = tc.get("id").and_then(|v| v.as_str()).unwrap_or("call_1");
        let name = tc
            .pointer("/function/name")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let args = tc
            .pointer("/function/arguments")
            .and_then(|v| v.as_str())
            .unwrap_or("{}");
        chunks.push(format!(
            "data: {}\n\n",
            json!({
                "id": chat_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": model,
                "choices": [{
                    "index": 0,
                    "delta": {
                        "tool_calls": [{
                            "index": idx,
                            "id": id,
                            "type": "function",
                            "function": { "name": name, "arguments": args }
                        }]
                    },
                    "finish_reason": Value::Null
                }]
            })
        ));
    }

    let finish = if !tool_calls.is_empty() {
        "tool_calls"
    } else {
        "stop"
    };
    chunks.push(format!(
        "data: {}\n\n",
        json!({
            "id": chat_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model,
            "choices": [{
                "index": 0,
                "delta": {},
                "finish_reason": finish
            }]
        })
    ));
    chunks.push("data: [DONE]\n\n".to_string());

    let payload = chunks.join("");
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/event-stream")
        .header(header::CACHE_CONTROL, "no-cache")
        .body(Body::from(payload))
        .unwrap()
}


// ============================================================================
// 2. OPENCODE ZEN
// ============================================================================
fn mint_opencode_id(prefix: &str, seed: u64) -> String {
    let hex_part = format!("{:012x}", seed & 0xffff_ffff_ffff);
    const BASE62: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    let mut tail = String::with_capacity(14);
    let mut x = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    for _ in 0..14 {
        x = x.wrapping_mul(6364136223846793005).wrapping_add(1);
        let idx = ((x >> 32) as usize) % 62;
        tail.push(BASE62[idx] as char);
    }
    format!("{}_{}{}", prefix, hex_part, tail)
}

async fn handle_opencode_request(mut body: Value, model: &str, is_stream: bool) -> Response {
    let token = ensure_fresh_credential("opencode")
        .await
        .map(|c| c.access_token)
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "public".to_string());

    let clean_model = model.strip_prefix("opencode/").unwrap_or(model).to_string();
    body["model"] = Value::String(clean_model);
    // OpenCode Zen gateway rejects non-stream requests on free tier; always stream upstream.
    body["stream"] = Value::Bool(true);
    if let Some(obj) = body.as_object_mut() {
        obj.remove("stream_options");
    }

    let mut existing_tools = body
        .get("tools")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let had_client_tools = !existing_tools.is_empty();

    for fname in ["bash", "glob", "grep", "read"] {
        let already = existing_tools.iter().any(|t| {
            t.pointer("/function/name")
                .or_else(|| t.get("name"))
                .and_then(|v| v.as_str())
                == Some(fname)
        });
        if !already {
            existing_tools.push(json!({
                "type": "function",
                "function": {
                    "name": fname,
                    "description": "This tool is currently unavailable and must not be used.",
                    "parameters": { "type": "object", "properties": {} }
                }
            }));
        }
    }
    body["tools"] = Value::Array(existing_tools);
    if !had_client_tools && body.get("tool_choice").is_none() {
        body["tool_choice"] = Value::String("none".to_string());
    }

    let now = now_ms();
    let ses_id = mint_opencode_id("ses", now);
    let msg_id = mint_opencode_id("msg", now.wrapping_add(1));

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .unwrap();

    let resp = match client
        .post("https://opencode.ai/zen/v1/chat/completions")
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream")
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "opencode/1.18.31")
        .header("x-opencode-client", "desktop")
        .header("x-opencode-project", "global")
        .header("x-opencode-session", ses_id)
        .header("x-opencode-request", msg_id)
        .json(&body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": { "message": format!("OpenCode upstream error: {}", e) } })),
            )
                .into_response()
        }
    };

    if !resp.status().is_success() {
        let st = resp.status();
        let txt = resp.text().await.unwrap_or_default();
        return (
            st,
            Json(json!({ "error": { "message": format!("OpenCode error ({}): {}", st, txt) } })),
        )
            .into_response();
    }

    if is_stream {
        let stream = resp.bytes_stream();
        Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/event-stream")
            .header(header::CACHE_CONTROL, "no-cache")
            .body(Body::from_stream(stream))
            .unwrap()
    } else {
        let sse_txt = resp.text().await.unwrap_or_default();
        let mut full_text = String::new();
        let mut tool_order: Vec<usize> = Vec::new();
        let mut tool_map: HashMap<usize, (String, String, String)> = HashMap::new(); // index -> (id, name, args)

        for line in sse_txt.lines() {
            let trimmed = line.trim();
            if !trimmed.starts_with("data:") {
                continue;
            }
            let data_str = trimmed.trim_start_matches("data:").trim();
            if data_str.is_empty() || data_str == "[DONE]" {
                continue;
            }
            if let Ok(chunk) = serde_json::from_str::<Value>(data_str) {
                if let Some(delta) = chunk.pointer("/choices/0/delta") {
                    if let Some(c) = delta.get("content").and_then(|v| v.as_str()) {
                        full_text.push_str(c);
                    }
                    if let Some(tcs) = delta.get("tool_calls").and_then(|v| v.as_array()) {
                        for tc in tcs {
                            let idx = tc.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                            let entry = tool_map.entry(idx).or_insert_with(|| {
                                tool_order.push(idx);
                                (String::new(), String::new(), String::new())
                            });
                            if let Some(id) = tc.get("id").and_then(|v| v.as_str()) {
                                if !id.is_empty() {
                                    entry.0 = id.to_string();
                                }
                            }
                            if let Some(name) = tc.pointer("/function/name").and_then(|v| v.as_str())
                            {
                                if !name.is_empty() {
                                    entry.1.push_str(name);
                                }
                            }
                            if let Some(args) =
                                tc.pointer("/function/arguments").and_then(|v| v.as_str())
                            {
                                entry.2.push_str(args);
                            }
                        }
                    }
                }
            }
        }

        let mut tool_calls = Vec::new();
        for idx in tool_order {
            if let Some((id, name, args)) = tool_map.remove(&idx) {
                if !name.is_empty() {
                    let clean_id = if id.is_empty() {
                        format!("call_{}", idx)
                    } else {
                        id
                    };
                    let clean_args = if serde_json::from_str::<Value>(&args).is_ok() {
                        args
                    } else {
                        "{}".to_string()
                    };
                    tool_calls.push(json!({
                        "id": clean_id,
                        "type": "function",
                        "function": {
                            "name": name,
                            "arguments": clean_args
                        }
                    }));
                }
            }
        }

        make_completion_response(model, full_text, tool_calls)
    }
}

