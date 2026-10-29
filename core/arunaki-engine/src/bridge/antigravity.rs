use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use super::{
    extract_content_text, make_completion_response_with_reasoning,
    make_sse_response_with_reasoning,
};
use crate::cred_store::{ensure_fresh_credential, refresh_credential_source};
use crate::paths::gen_id;

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

pub(crate) async fn handle_antigravity_request(body: Value, model: &str, is_stream: bool) -> Response {
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
    let mut thought_text = String::new();
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
                    if is_thought {
                        if let Some(t) = part.get("text").and_then(|v| v.as_str()) {
                            thought_text.push_str(t);
                        }
                    } else if let Some(t) = part.get("text").and_then(|v| v.as_str()) {
                        full_text.push_str(t);
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
        make_sse_response_with_reasoning(model, full_text, thought_text, tool_calls)
    } else {
        make_completion_response_with_reasoning(model, full_text, thought_text, tool_calls)
    }
}

