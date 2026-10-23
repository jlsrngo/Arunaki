use crate::cred_store::{
    decode_jwt_payload, ensure_fresh_credential, get_all_credentials, harvest_all,
    refresh_credential_source,
};
use crate::paths::{gen_id, now_ms};
use axum::{
    body::Body,
    extract::Request,
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

pub const LOCAL_CLI_BRIDGE_PORT: u16 = 20188;

static AGY_PROJECT_ID: OnceLock<Mutex<Option<String>>> = OnceLock::new();
static AGY_SIGNATURES: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn remember_signature(key: &str, sig: &str) {
    if key.is_empty() || sig.is_empty() {
        return;
    }
    let m = AGY_SIGNATURES.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(mut guard) = m.lock() {
        guard.insert(key.to_string(), sig.to_string());
    }
}

fn lookup_signature(key: &str) -> Option<String> {
    let m = AGY_SIGNATURES.get_or_init(|| Mutex::new(HashMap::new()));
    m.lock().ok().and_then(|g| g.get(key).cloned())
}

pub async fn start_bridge_server(port: u16) -> Result<(), String> {
    harvest_all();
    let app = Router::new()
        .route("/health", get(handle_health))
        .route("/v1/models", get(handle_models))
        .route("/v1/chat/completions", post(handle_chat_completions));

    let addr = format!("127.0.0.1:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .map_err(|e| format!("Failed to bind bridge on {}: {}", addr, e))?;

    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });
    Ok(())
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

fn extract_content_text(content: Option<&Value>) -> String {
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

fn make_completion_response(
    model: &str,
    text: String,
    tool_calls: Vec<Value>,
) -> Response {
    let has_tools = !tool_calls.is_empty();
    let mut message = json!({
        "role": "assistant",
        "content": if text.is_empty() && has_tools { Value::Null } else { Value::String(text) },
    });
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

fn make_sse_response_from_result(
    model: &str,
    text: String,
    tool_calls: Vec<Value>,
) -> Response {
    let chat_id = gen_id("chatcmpl");
    let created = now_ms() / 1000;
    let mut chunks = Vec::new();

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
// 1. KIRO (AWS CodeWhisperer Binary EventStream)
// ============================================================================
async fn handle_kiro_request(body: Value, model: &str, is_stream: bool) -> Response {
    let cred = match ensure_fresh_credential("kiro").await {
        Some(c) => c,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": { "message": "Kiro CLI credentials not found or expired." } })),
            )
                .into_response()
        }
    };

    let kiro_model_id = model.strip_prefix("kiro/").unwrap_or("auto");
    let region = cred.region.as_deref().unwrap_or("us-east-1");
    let profile_arn = cred
        .profile_arn
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or("arn:aws:codewhisperer:us-east-1:638616132270:profile/AAAACCCCXXXX")
        .to_string();
    let messages = body
        .get("messages")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut system_parts = Vec::new();
    let mut raw_turns: Vec<Value> = Vec::new();

    for m in &messages {
        let role = m.get("role").and_then(|v| v.as_str()).unwrap_or("user");
        if role == "system" || role == "developer" {
            let text = extract_content_text(m.get("content"));
            if !text.trim().is_empty() {
                system_parts.push(text);
            }
            continue;
        }
        if role == "tool" {
            let tool_call_id = m
                .get("tool_call_id")
                .or_else(|| m.get("id"))
                .and_then(|v| v.as_str())
                .unwrap_or("call_0");
            let content_str = match m.get("content") {
                Some(Value::String(s)) => s.clone(),
                Some(v) => serde_json::to_string(v).unwrap_or_default(),
                None => String::new(),
            };
            let tr = json!({
                "toolUseId": tool_call_id,
                "status": "success",
                "content": [{ "text": content_str }]
            });
            if let Some(last) = raw_turns.last_mut() {
                if last.get("role").and_then(|v| v.as_str()) == Some("user")
                    && last.get("isToolResultTurn").and_then(|v| v.as_bool()) == Some(true)
                {
                    if let Some(arr) = last.get_mut("toolResults").and_then(|v| v.as_array_mut()) {
                        arr.push(tr);
                        continue;
                    }
                }
            }
            raw_turns.push(json!({
                "role": "user",
                "content": "",
                "toolResults": [tr],
                "isToolResultTurn": true
            }));
            continue;
        }
        if role == "assistant" {
            let text = extract_content_text(m.get("content"));
            let mut tool_uses = Vec::new();
            if let Some(tcs) = m.get("tool_calls").and_then(|v| v.as_array()) {
                for tc in tcs {
                    let id = tc.get("id").and_then(|v| v.as_str()).unwrap_or("call_0");
                    let name = tc
                        .pointer("/function/name")
                        .or_else(|| tc.get("name"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("tool");
                    let args_val = match tc.pointer("/function/arguments") {
                        Some(Value::String(s)) => {
                            serde_json::from_str::<Value>(s).unwrap_or_else(|_| json!({}))
                        }
                        Some(v) if v.is_object() => v.clone(),
                        _ => json!({}),
                    };
                    tool_uses.push(json!({
                        "toolUseId": id,
                        "name": name,
                        "input": args_val
                    }));
                }
            }
            raw_turns.push(json!({
                "role": "assistant",
                "content": if text.is_empty() && !tool_uses.is_empty() { "Calling tools." } else if text.is_empty() { "OK" } else { &text },
                "toolUses": tool_uses
            }));
            continue;
        }
        let text = extract_content_text(m.get("content"));
        raw_turns.push(json!({
            "role": "user",
            "content": text
        }));
    }

    let mut kiro_tools = Vec::new();
    if let Some(tools) = body.get("tools").and_then(|v| v.as_array()) {
        for t in tools {
            let fn_obj = t.get("function").unwrap_or(t);
            if let Some(name) = fn_obj.get("name").and_then(|v| v.as_str()) {
                let desc = fn_obj
                    .get("description")
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
                    .unwrap_or("Tool function");
                let schema = fn_obj
                    .get("parameters")
                    .cloned()
                    .unwrap_or_else(|| json!({ "type": "object", "properties": {} }));
                kiro_tools.push(json!({
                    "toolSpecification": {
                        "name": name,
                        "description": desc,
                        "inputSchema": { "json": schema }
                    }
                }));
            }
        }
    }

    let mut history = Vec::new();
    let sys_prefix = if !system_parts.is_empty() {
        format!("{}\n\n", system_parts.join("\n\n"))
    } else {
        String::new()
    };

    let current_turn = raw_turns
        .pop()
        .unwrap_or_else(|| json!({ "role": "user", "content": "Hello" }));

    for (idx, turn) in raw_turns.iter().enumerate() {
        let role = turn.get("role").and_then(|v| v.as_str()).unwrap_or("user");
        if role == "user" {
            let mut text = turn
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if idx == 0 && !sys_prefix.is_empty() {
                text = format!("{}{}", sys_prefix, text);
            }
            let mut u_msg = json!({
                "content": text,
                "modelId": kiro_model_id,
                "origin": "AI_EDITOR"
            });
            if let Some(trs) = turn.get("toolResults").and_then(|v| v.as_array()) {
                if !trs.is_empty() {
                    u_msg["userInputMessageContext"] = json!({ "toolResults": trs });
                }
            }
            history.push(json!({ "userInputMessage": u_msg }));
        } else {
            let text = turn
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("OK");
            let mut a_msg = json!({ "content": text });
            if let Some(tus) = turn.get("toolUses").and_then(|v| v.as_array()) {
                if !tus.is_empty() {
                    a_msg["toolUses"] = Value::Array(tus.clone());
                }
            }
            history.push(json!({ "assistantResponseMessage": a_msg }));
        }
    }

    let mut cur_content = current_turn
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if history.is_empty() && !sys_prefix.is_empty() {
        cur_content = format!("{}{}", sys_prefix, cur_content);
    }

    let mut cur_ctx = serde_json::Map::new();
    if !kiro_tools.is_empty() {
        cur_ctx.insert("tools".to_string(), Value::Array(kiro_tools));
    }
    if let Some(trs) = current_turn.get("toolResults").and_then(|v| v.as_array()) {
        if !trs.is_empty() {
            cur_ctx.insert("toolResults".to_string(), Value::Array(trs.clone()));
            if cur_content.is_empty() {
                cur_content = String::new();
            }
        }
    }
    if cur_content.is_empty() && !cur_ctx.contains_key("toolResults") {
        cur_content = "Continue.".to_string();
    }

    let mut cur_user_msg = json!({
        "content": cur_content,
        "modelId": kiro_model_id,
        "origin": "AI_EDITOR"
    });
    if !cur_ctx.is_empty() {
        cur_user_msg["userInputMessageContext"] = Value::Object(cur_ctx);
    }

    let payload = json!({
        "conversationState": {
            "chatTriggerType": "MANUAL",
            "conversationId": gen_id("conv"),
            "history": history,
            "currentMessage": {
                "userInputMessage": cur_user_msg
            }
        },
        "profileArn": profile_arn
    });

    let url = format!("https://q.{}.amazonaws.com/generateAssistantResponse", region);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .unwrap();

    let mut resp = match client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream")
        .header("Authorization", format!("Bearer {}", cred.access_token))
        .header("x-amz-sso-bearer", &cred.access_token)
        .header("x-amzn-kiro-agent-mode", "spec")
        .header("x-amzn-codewhisperer-machine-id", "kiro-desktop")
        .header("x-amzn-codewhisperer-profile-arn", &profile_arn)
        .json(&payload)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": { "message": format!("Kiro request error: {}", e) } })),
            )
                .into_response()
        }
    };

    if resp.status() == StatusCode::UNAUTHORIZED || resp.status() == StatusCode::FORBIDDEN {
        if let Some(refreshed) = refresh_credential_source("kiro", &cred).await {
            if let Ok(r2) = client
                .post(&url)
                .header("Content-Type", "application/json")
                .header("Accept", "text/event-stream")
                .header("Authorization", format!("Bearer {}", refreshed.access_token))
                .header("x-amz-sso-bearer", &refreshed.access_token)
                .header("x-amzn-kiro-agent-mode", "spec")
                .header("x-amzn-codewhisperer-machine-id", "kiro-desktop")
                .header("x-amzn-codewhisperer-profile-arn", &profile_arn)
                .json(&payload)
                .send()
                .await
            {
                resp = r2;
            }
        }
    }

    if !resp.status().is_success() {
        let status = resp.status();
        let err_txt = resp.text().await.unwrap_or_default();
        return (
            status,
            Json(json!({ "error": { "message": format!("Kiro upstream error ({}): {}", status, err_txt) } })),
        )
            .into_response();
    }

    let raw_bytes = match resp.bytes().await {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": { "message": format!("Kiro stream read error: {}", e) } })),
            )
                .into_response()
        }
    };

    let (full_text, tool_calls) = parse_kiro_event_stream(&raw_bytes);
    if is_stream {
        make_sse_response_from_result(model, full_text, tool_calls)
    } else {
        make_completion_response(model, full_text, tool_calls)
    }
}

fn parse_kiro_event_stream(buf: &[u8]) -> (String, Vec<Value>) {
    let mut full_text = String::new();
    let mut tool_order: Vec<String> = Vec::new();
    let mut tool_map: HashMap<String, (String, String)> = HashMap::new(); // id -> (name, input_acc)

    let mut offset = 0usize;
    while offset + 16 <= buf.len() {
        let total_len = u32::from_be_bytes([
            buf[offset],
            buf[offset + 1],
            buf[offset + 2],
            buf[offset + 3],
        ]) as usize;
        let headers_len = u32::from_be_bytes([
            buf[offset + 4],
            buf[offset + 5],
            buf[offset + 6],
            buf[offset + 7],
        ]) as usize;

        if total_len < 16 || offset + total_len > buf.len() {
            break;
        }

        let headers_start = offset + 12;
        let payload_start = headers_start + headers_len;
        let payload_end = offset + total_len - 4;

        if payload_start <= payload_end && payload_end <= buf.len() {
            // Parse headers to find :event-type
            let mut h_off = headers_start;
            let mut event_type = String::new();
            while h_off < payload_start {
                let name_len = buf[h_off] as usize;
                h_off += 1;
                if h_off + name_len >= payload_start {
                    break;
                }
                let h_name = String::from_utf8_lossy(&buf[h_off..h_off + name_len]).to_string();
                h_off += name_len;
                let h_type = buf[h_off];
                h_off += 1;
                if h_type == 7 {
                    if h_off + 2 > payload_start {
                        break;
                    }
                    let val_len = u16::from_be_bytes([buf[h_off], buf[h_off + 1]]) as usize;
                    h_off += 2;
                    if h_off + val_len > payload_start {
                        break;
                    }
                    let h_val = String::from_utf8_lossy(&buf[h_off..h_off + val_len]).to_string();
                    h_off += val_len;
                    if h_name == ":event-type" {
                        event_type = h_val;
                    }
                } else {
                    break;
                }
            }

            if let Ok(evt) = serde_json::from_slice::<Value>(&buf[payload_start..payload_end]) {
                let content_opt = evt
                    .pointer("/assistantResponseEvent/content")
                    .or_else(|| {
                        if event_type == "assistantResponseEvent" {
                            evt.get("content")
                        } else {
                            None
                        }
                    })
                    .and_then(|v| v.as_str());
                if let Some(c) = content_opt {
                    full_text.push_str(c);
                }

                let tu_opt = evt.get("toolUseEvent").or_else(|| {
                    if event_type == "toolUseEvent" || evt.get("toolUseId").is_some() {
                        Some(&evt)
                    } else {
                        None
                    }
                });
                if let Some(tu) = tu_opt {
                    if let (Some(id), Some(name)) = (
                        tu.get("toolUseId").and_then(|v| v.as_str()),
                        tu.get("name").and_then(|v| v.as_str()),
                    ) {
                        if !tool_map.contains_key(id) {
                            tool_order.push(id.to_string());
                            tool_map.insert(id.to_string(), (name.to_string(), String::new()));
                        }
                        if let Some(entry) = tool_map.get_mut(id) {
                            if let Some(inp_str) = tu.get("input").and_then(|v| v.as_str()) {
                                entry.1.push_str(inp_str);
                            } else if let Some(inp_obj) = tu.get("input").filter(|v| v.is_object())
                            {
                                entry.1 = serde_json::to_string(inp_obj).unwrap_or_default();
                            }
                        }
                    }
                }
            }
        }

        offset += total_len;
    }

    let mut tool_calls = Vec::new();
    for id in tool_order {
        if let Some((name, raw_args)) = tool_map.remove(&id) {
            let clean_args = if serde_json::from_str::<Value>(&raw_args).is_ok() {
                raw_args
            } else {
                "{}".to_string()
            };
            tool_calls.push(json!({
                "id": id,
                "type": "function",
                "function": {
                    "name": name,
                    "arguments": clean_args
                }
            }));
        }
    }

    (full_text, tool_calls)
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

// ============================================================================
// 3. ANTIGRAVITY (Google Cloud Code v1internal)
// ============================================================================
fn map_antigravity_model(model: &str) -> (&'static str, Option<&'static str>) {
    match model {
        "gemini-3.8-pro-high" => ("gemini-3.1-pro-high", Some("high")),
        "gemini-3.8-pro-low" => ("gemini-3.1-pro-low", Some("low")),
        "gemini-3.8-flash-high" => ("gemini-3-flash", Some("high")),
        "gemini-3.8-flash-medium" => ("gemini-3-flash", Some("medium")),
        "gemini-3.8-flash-low" => ("gemini-3-flash", Some("low")),
        "gemini-3.8-flash-minimal" => ("gemini-3-flash", Some("minimal")),
        "claude-sonnet-4-6-agy" => ("claude-sonnet-4-6", None),
        "claude-opus-4-6-thinking" => ("claude-opus-4-6-thinking", Some("high")),
        "gpt-oss-120b-medium" => ("gpt-oss-120b-medium", Some("medium")),
        _ => ("gemini-3-flash", Some("medium")),
    }
}

fn sanitize_gemini_schema(schema: &Value) -> Value {
    match schema {
        Value::Array(arr) => Value::Array(arr.iter().map(sanitize_gemini_schema).collect()),
        Value::Object(map) => {
            let mut out = serde_json::Map::new();
            for (k, v) in map {
                if matches!(
                    k.as_str(),
                    "$schema"
                        | "additionalProperties"
                        | "default"
                        | "title"
                        | "examples"
                        | "exclusiveMinimum"
                        | "exclusiveMaximum"
                        | "propertyNames"
                        | "const"
                ) {
                    continue;
                }
                if k == "type" {
                    if let Some(arr) = v.as_array() {
                        let non_null = arr
                            .iter()
                            .filter_map(|x| x.as_str())
                            .find(|&t| t != "null")
                            .unwrap_or("string");
                        out.insert(k.clone(), Value::String(non_null.to_string()));
                        continue;
                    }
                }
                out.insert(k.clone(), sanitize_gemini_schema(v));
            }
            if out.contains_key("properties") && !out.contains_key("type") {
                out.insert("type".to_string(), Value::String("object".to_string()));
            }
            Value::Object(out)
        }
        _ => schema.clone(),
    }
}

async fn get_antigravity_project_id(access_token: &str) -> String {
    {
        let m = AGY_PROJECT_ID.get_or_init(|| Mutex::new(None));
        if let Ok(guard) = m.lock() {
            if let Some(ref pid) = *guard {
                return pid.clone();
            }
        }
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .unwrap();

    if let Ok(resp) = client
        .post("https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .header("User-Agent", "antigravity/2.0.7 windows/amd64")
        .json(&json!({
            "metadata": {
                "ideType": "ANTIGRAVITY",
                "platform": "WINDOWS",
                "pluginType": "GEMINI"
            }
        }))
        .send()
        .await
    {
        if let Ok(data) = resp.json::<Value>().await {
            let pid = data
                .get("cloudaicompanionProject")
                .and_then(|v| {
                    v.as_str()
                        .map(|s| s.to_string())
                        .or_else(|| v.get("id").and_then(|x| x.as_str()).map(|s| s.to_string()))
                })
                .unwrap_or_else(|| "rising-fact-p41fc".to_string());
            let m = AGY_PROJECT_ID.get_or_init(|| Mutex::new(None));
            if let Ok(mut guard) = m.lock() {
                *guard = Some(pid.clone());
            }
            return pid;
        }
    }

    "rising-fact-p41fc".to_string()
}

async fn handle_antigravity_request(body: Value, model: &str, is_stream: bool) -> Response {
    let mut cred = match ensure_fresh_credential("antigravity").await {
        Some(c) => c,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": { "message": "Antigravity credentials not found." } })),
            )
                .into_response()
        }
    };

    let (upstream_model, thinking_level) = map_antigravity_model(model);
    let messages = body
        .get("messages")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut system_parts = Vec::new();
    let mut contents: Vec<Value> = Vec::new();
    let mut tool_id_to_name = HashMap::new();

    for m in &messages {
        if m.get("role").and_then(|v| v.as_str()) == Some("assistant") {
            if let Some(tcs) = m.get("tool_calls").and_then(|v| v.as_array()) {
                for tc in tcs {
                    if let (Some(id), Some(name)) = (
                        tc.get("id").and_then(|v| v.as_str()),
                        tc.pointer("/function/name")
                            .or_else(|| tc.get("name"))
                            .and_then(|v| v.as_str()),
                    ) {
                        tool_id_to_name.insert(id.to_string(), name.to_string());
                    }
                }
            }
        }
    }

    for m in &messages {
        let role = m.get("role").and_then(|v| v.as_str()).unwrap_or("user");
        if role == "system" || role == "developer" {
            let txt = extract_content_text(m.get("content"));
            if !txt.trim().is_empty() {
                system_parts.push(txt);
            }
            continue;
        }
        if role == "tool" {
            let call_id = m
                .get("tool_call_id")
                .or_else(|| m.get("id"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let fn_name = m
                .get("name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .or_else(|| tool_id_to_name.get(call_id).cloned())
                .unwrap_or_else(|| "tool".to_string());
            let resp_obj = match m.get("content") {
                Some(Value::String(s)) => serde_json::from_str::<Value>(s)
                    .ok()
                    .filter(|v| v.is_object())
                    .unwrap_or_else(|| json!({ "output": s })),
                Some(v) if v.is_object() => v.clone(),
                Some(v) => json!({ "output": v }),
                None => json!({ "output": "" }),
            };
            let part = json!({
                "functionResponse": {
                    "name": fn_name,
                    "id": call_id,
                    "response": resp_obj
                }
            });
            if let Some(last) = contents.last_mut() {
                if last.get("role").and_then(|v| v.as_str()) == Some("user") {
                    if let Some(parts) = last.get_mut("parts").and_then(|v| v.as_array_mut()) {
                        if parts.iter().all(|p| p.get("functionResponse").is_some()) {
                            parts.push(part);
                            continue;
                        }
                    }
                }
            }
            contents.push(json!({ "role": "user", "parts": [part] }));
            continue;
        }
        if role == "assistant" {
            let mut parts = Vec::new();
            let txt = extract_content_text(m.get("content"));
            if !txt.is_empty() {
                parts.push(json!({ "text": txt }));
            }
            if let Some(tcs) = m.get("tool_calls").and_then(|v| v.as_array()) {
                for tc in tcs {
                    let id = tc.get("id").and_then(|v| v.as_str()).unwrap_or("");
                    let name = tc
                        .pointer("/function/name")
                        .or_else(|| tc.get("name"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("tool");
                    let args_val = match tc.pointer("/function/arguments") {
                        Some(Value::String(s)) => {
                            serde_json::from_str::<Value>(s).unwrap_or_else(|_| json!({}))
                        }
                        Some(v) if v.is_object() => v.clone(),
                        _ => json!({}),
                    };
                    let sig = lookup_signature(id)
                        .or_else(|| lookup_signature(&format!("fn:{}", name)))
                        .unwrap_or_else(|| "skip_thought_signature_validator".to_string());
                    parts.push(json!({
                        "functionCall": {
                            "id": id,
                            "name": name,
                            "args": args_val
                        },
                        "thoughtSignature": sig
                    }));
                }
            }
            if !parts.is_empty() {
                contents.push(json!({ "role": "model", "parts": parts }));
            }
            continue;
        }

        let txt = extract_content_text(m.get("content"));
        contents.push(json!({
            "role": "user",
            "parts": [{ "text": if txt.is_empty() { " ".to_string() } else { txt } }]
        }));
    }

    if contents.is_empty() {
        contents.push(json!({ "role": "user", "parts": [{ "text": "Hello" }] }));
    }

    let mut fn_decls = Vec::new();
    if let Some(tools) = body.get("tools").and_then(|v| v.as_array()) {
        for t in tools {
            let fn_obj = t.get("function").unwrap_or(t);
            if let Some(name) = fn_obj.get("name").and_then(|v| v.as_str()) {
                let desc = fn_obj
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let params = fn_obj
                    .get("parameters")
                    .map(sanitize_gemini_schema)
                    .unwrap_or_else(|| json!({ "type": "object", "properties": {} }));
                fn_decls.push(json!({
                    "name": name,
                    "description": desc,
                    "parameters": params
                }));
            }
        }
    }

    let mut gen_cfg = json!({
        "maxOutputTokens": body.get("max_tokens").and_then(|v| v.as_u64()).unwrap_or(8192),
        "temperature": body.get("temperature").and_then(|v| v.as_f64()).unwrap_or(1.0)
    });
    if let Some(lvl) = thinking_level {
        if upstream_model.starts_with("gemini-3") {
            gen_cfg["thinkingConfig"] = json!({
                "includeThoughts": true,
                "thinkingLevel": lvl
            });
        }
    }

    let mut inner_req = json!({
        "contents": contents,
        "generationConfig": gen_cfg
    });
    if !system_parts.is_empty() {
        inner_req["systemInstruction"] = json!({
            "role": "user",
            "parts": [{ "text": system_parts.join("\n\n") }]
        });
    }
    if !fn_decls.is_empty() {
        inner_req["tools"] = json!([{ "functionDeclarations": fn_decls }]);
    }

    let project_id = get_antigravity_project_id(&cred.access_token).await;
    let agy_payload = json!({
        "project": project_id,
        "model": upstream_model,
        "request": inner_req,
        "requestType": "agent",
        "userAgent": "antigravity",
        "requestId": gen_id("agent")
    });

    let url = "https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse";
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .unwrap();

    let mut resp = match client
        .post(url)
        .header("Authorization", format!("Bearer {}", cred.access_token))
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream")
        .header("User-Agent", "antigravity/2.0.7 windows/amd64")
        .json(&agy_payload)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": { "message": format!("Antigravity request error: {}", e) } })),
            )
                .into_response()
        }
    };

    if resp.status() == StatusCode::UNAUTHORIZED || resp.status() == StatusCode::FORBIDDEN {
        if let Some(refreshed) = refresh_credential_source("antigravity", &cred).await {
            cred = refreshed;
            if let Ok(r2) = client
                .post(url)
                .header("Authorization", format!("Bearer {}", cred.access_token))
                .header("Content-Type", "application/json")
                .header("Accept", "text/event-stream")
                .header("User-Agent", "antigravity/2.0.7 windows/amd64")
                .json(&agy_payload)
                .send()
                .await
            {
                resp = r2;
            }
        }
    }

    if !resp.status().is_success() {
        let st = resp.status();
        let txt = resp.text().await.unwrap_or_default();
        return (
            st,
            Json(json!({ "error": { "message": format!("Antigravity error ({}): {}", st, txt) } })),
        )
            .into_response();
    }

    let sse_text = resp.text().await.unwrap_or_default();
    let mut full_text = String::new();
    let mut tool_calls = Vec::new();
    let mut last_sig = String::new();

    for line in sse_text.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with("data:") {
            continue;
        }
        let json_str = trimmed.trim_start_matches("data:").trim();
        if json_str.is_empty() || json_str == "[DONE]" {
            continue;
        }
        if let Ok(evt) = serde_json::from_str::<Value>(json_str) {
            let root = evt.get("response").unwrap_or(&evt);
            if let Some(parts) = root
                .pointer("/candidates/0/content/parts")
                .and_then(|v| v.as_array())
            {
                for part in parts {
                    if let Some(sig) = part.get("thoughtSignature").and_then(|v| v.as_str()) {
                        last_sig = sig.to_string();
                    }
                    let is_thought = part
                        .get("thought")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    if !is_thought {
                        if let Some(t) = part.get("text").and_then(|v| v.as_str()) {
                            full_text.push_str(t);
                        }
                    }
                    if let Some(fc) = part.get("functionCall") {
                        let name = fc.get("name").and_then(|v| v.as_str()).unwrap_or("tool");
                        let call_id = fc
                            .get("id")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                            .unwrap_or_else(|| gen_id("call"));
                        let sig = part
                            .get("thoughtSignature")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                            .unwrap_or_else(|| last_sig.clone());
                        if !sig.is_empty() {
                            remember_signature(&call_id, &sig);
                            remember_signature(&format!("fn:{}", name), &sig);
                        }
                        let args_str = serde_json::to_string(
                            fc.get("args").unwrap_or(&json!({})),
                        )
                        .unwrap_or_else(|_| "{}".to_string());
                        tool_calls.push(json!({
                            "id": call_id,
                            "type": "function",
                            "function": {
                                "name": name,
                                "arguments": args_str
                            }
                        }));
                    }
                }
            }
        }
    }

    if is_stream {
        make_sse_response_from_result(model, full_text, tool_calls)
    } else {
        make_completion_response(model, full_text, tool_calls)
    }
}

// ============================================================================
// 4. CODEX (ChatGPT Backend Responses API)
// ============================================================================
fn normalize_codex_model(model: &str) -> &str {
    model.strip_prefix("codex/").unwrap_or(model)
}

async fn handle_codex_request(body: Value, model: &str, is_stream: bool) -> Response {
    let mut cred = match ensure_fresh_credential("codex").await {
        Some(c) => c,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": { "message": "Codex CLI credentials not found." } })),
            )
                .into_response()
        }
    };

    let account_id = cred
        .account_id
        .clone()
        .filter(|s| !s.is_empty())
        .or_else(|| {
            decode_jwt_payload(&cred.access_token).and_then(|p| {
                p.pointer("/https:~1~1api.openai.com~1auth/chatgpt_account_id")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            })
        })
        .unwrap_or_default();

    let messages = body
        .get("messages")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut sys_parts = Vec::new();
    let mut input = Vec::new();

    for m in &messages {
        let role = m.get("role").and_then(|v| v.as_str()).unwrap_or("user");
        if role == "system" || role == "developer" {
            let txt = extract_content_text(m.get("content"));
            if !txt.trim().is_empty() {
                sys_parts.push(txt);
            }
            continue;
        }
        if role == "tool" {
            let call_id = m
                .get("tool_call_id")
                .or_else(|| m.get("id"))
                .and_then(|v| v.as_str())
                .unwrap_or("call_0");
            let out_str = extract_content_text(m.get("content"));
            input.push(json!({
                "type": "function_call_output",
                "call_id": call_id,
                "output": out_str
            }));
            continue;
        }
        if role == "assistant" {
            let txt = extract_content_text(m.get("content"));
            if !txt.is_empty() {
                input.push(json!({
                    "type": "message",
                    "role": "assistant",
                    "content": [{ "type": "output_text", "text": txt }]
                }));
            }
            if let Some(tcs) = m.get("tool_calls").and_then(|v| v.as_array()) {
                for tc in tcs {
                    let call_id = tc.get("id").and_then(|v| v.as_str()).unwrap_or("call_0");
                    let name = tc
                        .pointer("/function/name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("tool");
                    let args = tc
                        .pointer("/function/arguments")
                        .and_then(|v| v.as_str())
                        .unwrap_or("{}");
                    input.push(json!({
                        "type": "function_call",
                        "call_id": call_id,
                        "name": name,
                        "arguments": args
                    }));
                }
            }
            continue;
        }
        let txt = extract_content_text(m.get("content"));
        input.push(json!({
            "type": "message",
            "role": "user",
            "content": [{ "type": "input_text", "text": txt }]
        }));
    }

    let mut codex_payload = json!({
        "model": normalize_codex_model(model),
        "instructions": if sys_parts.is_empty() { "You are a helpful assistant.".to_string() } else { sys_parts.join("\n\n") },
        "input": input,
        "stream": true,
        "store": false
    });

    if let Some(tools) = body.get("tools").and_then(|v| v.as_array()) {
        let mapped: Vec<Value> = tools
            .iter()
            .map(|t| {
                if let Some(fn_obj) = t.get("function") {
                    json!({
                        "type": "function",
                        "name": fn_obj.get("name"),
                        "description": fn_obj.get("description").and_then(|v| v.as_str()).unwrap_or(""),
                        "parameters": fn_obj.get("parameters").cloned().unwrap_or_else(|| json!({ "type": "object", "properties": {} }))
                    })
                } else {
                    t.clone()
                }
            })
            .collect();
        if !mapped.is_empty() {
            codex_payload["tools"] = Value::Array(mapped);
        }
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .unwrap();

    let mut req_builder = client
        .post("https://chatgpt.com/backend-api/codex/responses")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", cred.access_token))
        .header("originator", "codex_cli_rs")
        .header("Accept", "text/event-stream");
    if !account_id.is_empty() {
        req_builder = req_builder.header("ChatGPT-Account-ID", &account_id);
    }

    let mut resp = match req_builder.json(&codex_payload).send().await {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": { "message": format!("Codex request error: {}", e) } })),
            )
                .into_response()
        }
    };

    if resp.status() == StatusCode::UNAUTHORIZED || resp.status() == StatusCode::FORBIDDEN {
        if let Some(refreshed) = refresh_credential_source("codex", &cred).await {
            cred = refreshed;
            let mut rb2 = client
                .post("https://chatgpt.com/backend-api/codex/responses")
                .header("Content-Type", "application/json")
                .header("Authorization", format!("Bearer {}", cred.access_token))
                .header("originator", "codex_cli_rs")
                .header("Accept", "text/event-stream");
            if !account_id.is_empty() {
                rb2 = rb2.header("ChatGPT-Account-ID", &account_id);
            }
            if let Ok(r2) = rb2.json(&codex_payload).send().await {
                resp = r2;
            }
        }
    }

    if !resp.status().is_success() {
        let st = resp.status();
        let txt = resp.text().await.unwrap_or_default();
        return (
            st,
            Json(json!({ "error": { "message": format!("Codex error ({}): {}", st, txt) } })),
        )
            .into_response();
    }

    let sse_text = resp.text().await.unwrap_or_default();
    let mut full_text = String::new();
    let mut tool_calls = Vec::new();

    for line in sse_text.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with("data:") {
            continue;
        }
        let data_str = trimmed.trim_start_matches("data:").trim();
        if data_str.is_empty() || data_str == "[DONE]" {
            continue;
        }
        if let Ok(evt) = serde_json::from_str::<Value>(data_str) {
            let etype = evt.get("type").and_then(|v| v.as_str()).unwrap_or("");
            if etype == "response.output_text.delta" {
                if let Some(d) = evt.get("delta").and_then(|v| v.as_str()) {
                    full_text.push_str(d);
                }
            } else if etype == "response.output_item.done" {
                if let Some(item) = evt.get("item") {
                    if item.get("type").and_then(|v| v.as_str()) == Some("function_call") {
                        let call_id = item
                            .get("call_id")
                            .or_else(|| item.get("id"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("call_0");
                        let name = item
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("tool");
                        let args = item
                            .get("arguments")
                            .and_then(|v| v.as_str())
                            .unwrap_or("{}");
                        tool_calls.push(json!({
                            "id": call_id,
                            "type": "function",
                            "function": {
                                "name": name,
                                "arguments": args
                            }
                        }));
                    }
                }
            }
        }
    }

    if is_stream {
        make_sse_response_from_result(model, full_text, tool_calls)
    } else {
        make_completion_response(model, full_text, tool_calls)
    }
}

// ============================================================================
// 5. CLAUDE (Anthropic Messages API)
// ============================================================================
async fn handle_claude_request(body: Value, model: &str, is_stream: bool) -> Response {
    let cred = match ensure_fresh_credential("claude").await {
        Some(c) => c,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": { "message": "Claude CLI credentials not found." } })),
            )
                .into_response()
        }
    };

    let messages = body
        .get("messages")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let mut sys_parts = Vec::new();
    let mut claude_msgs = Vec::new();

    for m in &messages {
        let role = m.get("role").and_then(|v| v.as_str()).unwrap_or("user");
        if role == "system" || role == "developer" {
            let txt = extract_content_text(m.get("content"));
            if !txt.trim().is_empty() {
                sys_parts.push(txt);
            }
            continue;
        }
        let txt = extract_content_text(m.get("content"));
        claude_msgs.push(json!({
            "role": if role == "assistant" { "assistant" } else { "user" },
            "content": txt
        }));
    }

    let mut payload = json!({
        "model": model,
        "max_tokens": body.get("max_tokens").and_then(|v| v.as_u64()).unwrap_or(8192),
        "messages": claude_msgs,
        "stream": false
    });
    if !sys_parts.is_empty() {
        payload["system"] = Value::String(sys_parts.join("\n\n"));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .unwrap();

    let resp = match client
        .post("https://api.anthropic.com/v1/messages")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", cred.access_token))
        .header("anthropic-version", "2023-06-01")
        .header(
            "anthropic-beta",
            "oauth-2025-04-20,claude-code-20250219,interleaved-thinking-2025-05-14",
        )
        .json(&payload)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": { "message": format!("Claude request error: {}", e) } })),
            )
                .into_response()
        }
    };

    if !resp.status().is_success() {
        let st = resp.status();
        let txt = resp.text().await.unwrap_or_default();
        return (
            st,
            Json(json!({ "error": { "message": format!("Claude error ({}): {}", st, txt) } })),
        )
            .into_response();
    }

    let data: Value = resp.json().await.unwrap_or_else(|_| json!({}));
    let mut text = String::new();
    let mut tool_calls = Vec::new();
    if let Some(arr) = data.get("content").and_then(|v| v.as_array()) {
        for block in arr {
            if block.get("type").and_then(|v| v.as_str()) == Some("text") {
                if let Some(t) = block.get("text").and_then(|v| v.as_str()) {
                    text.push_str(t);
                }
            } else if block.get("type").and_then(|v| v.as_str()) == Some("tool_use") {
                let id = block.get("id").and_then(|v| v.as_str()).unwrap_or("call_0");
                let name = block.get("name").and_then(|v| v.as_str()).unwrap_or("tool");
                let args = serde_json::to_string(block.get("input").unwrap_or(&json!({})))
                    .unwrap_or_else(|_| "{}".to_string());
                tool_calls.push(json!({
                    "id": id,
                    "type": "function",
                    "function": { "name": name, "arguments": args }
                }));
            }
        }
    }

    if is_stream {
        make_sse_response_from_result(model, text, tool_calls)
    } else {
        make_completion_response(model, text, tool_calls)
    }
}
