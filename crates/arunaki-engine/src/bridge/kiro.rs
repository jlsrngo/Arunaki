use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Value};
use std::collections::HashMap;

use super::{extract_content_text, make_completion_response, make_sse_response_from_result};
use crate::cred_store::{ensure_fresh_credential, refresh_credential_source};
use crate::paths::gen_id;

// ============================================================================
// KIRO (AWS CodeWhisperer Binary EventStream)
// ============================================================================

pub(crate) async fn handle_kiro_request(body: Value, model: &str, is_stream: bool) -> Response {
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
