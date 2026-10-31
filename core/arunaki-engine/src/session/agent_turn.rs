//! Agent Turn Execution Engine — mirrors OpenCode `packages/core/src/session/runner/llm.ts`.
//!
//! Handles the full lifecycle of an autonomous turn:
//! - Context assembly (<env>, <living_memory>, <workspace_documents>, <knowledge_base>)
//! - Multimodal attachment ingestion & OCR transcription
//! - 25-step LLM completion loop with Doom-Loop breaker & Tool Output hard limits
//! - JSON tool argument syntax recovery
//! - Context overflow auto-healing and emergency compaction
//! - Real-time SSE event emission and message persistence

use crate::bridge::LOCAL_CLI_BRIDGE_PORT;
use crate::knowledge::get_active_knowledge_for_workspace;
use crate::paths::{gen_id, now_ms};
use crate::provider::read_arunaki_config;
use crate::session::message::emit_event;
use crate::session::session::{save_store, with_store};
use crate::session::tools::{build_tool_definitions, execute_tool_call, should_attach_document_tools};
use serde_json::{json, Value};

pub async fn run_agent_turn(
    session_id: &str,
    workspace_dir: &str,
    provider_id: &str,
    model_id: &str,
    history: &[Value],
    prompt_text: &str,
    files: Option<&Value>,
) {
    let assistant_msg_id = gen_id("msg");
    let started_ms = now_ms();

    emit_event(
        workspace_dir,
        "session.next.step.started",
        json!({
            "sessionID": session_id,
            "messageID": assistant_msg_id,
            "agent": "default",
            "model": { "providerID": provider_id, "id": model_id }
        }),
    );

    // 1. Base system prompt from prompt/default.txt + environment block (OpenCode SystemPrompt.environment parity)
    let base_prompt_template = include_str!("prompt/default.txt");
    let now = chrono::Local::now();
    let today_date_str = now.format("%Y-%m-%d").to_string();
    let day_of_week = now.format("%A").to_string();
    let current_time_str = now.format("%H:%M").to_string();

    let mut sys_prompt = format!(
        "{}\n\nHere is some useful information about the environment you are running in:\n\
        <env>\n\
          Working directory: {}\n\
          Platform: {}\n\
          Today's date: {} ({})\n\
          Current local time: {}\n\
        </env>",
        base_prompt_template.trim(),
        workspace_dir,
        std::env::consts::OS,
        today_date_str,
        day_of_week,
        current_time_str
    );

    // Document Auto-Locator (Item 3a - Pre-LLM deterministic document indexing)
    if let Some(doc_block) = crate::files::doc_locator::format_workspace_documents_block(workspace_dir) {
        sys_prompt.push_str("

");
        sys_prompt.push_str(&doc_block);
    }

    // 2. Workspace Instruction File (.arunaki/ARUNAKI.md)
    let living_mem = crate::session::memory::get_living_memory_for_workspace(workspace_dir);
    if !living_mem.trim().is_empty() {
        sys_prompt.push_str("\n\n<living_memory>\n");
        sys_prompt.push_str(living_mem.trim());
        sys_prompt.push_str("\n</living_memory>");
    }

    // 3. Visual Knowledge Graph base
    let active_kn = get_active_knowledge_for_workspace(workspace_dir);
    if !active_kn.is_empty() {
        sys_prompt.push_str("\n\n<knowledge_base>\n");
        for n in active_kn.iter().take(10) {
            let t = n.get("title").and_then(|v| v.as_str()).unwrap_or("Note");
            let c = n.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let snippet: String = c.chars().take(4000).collect();
            sys_prompt.push_str(&format!("--- {} ---\n{}\n", t, snippet));
        }
        sys_prompt.push_str("</knowledge_base>");
    }

    // Proactive Context Compaction (OpenCode Item 2a)
    let (effective_history, was_compacted) =
        crate::session::compaction::compact_session_history(history, crate::session::compaction::DEFAULT_CONTEXT_WINDOW);
    if was_compacted {
        crate::paths::log_engine(
            "session",
            &format!(
                "📦 Session context compacted: {} turns summarized to preserve context window",
                history.len()
            ),
        );
        emit_event(
            workspace_dir,
            "session.compacted",
            json!({
                "sessionID": session_id,
                "originalTurns": history.len(),
                "compactedTurns": effective_history.len()
            }),
        );
    }

    let mut chat_messages = vec![json!({ "role": "system", "content": sys_prompt })];
    for m in &effective_history {
        let mtype = m.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if mtype == "synthetic" {
            let txt = m.get("text").and_then(|v| v.as_str()).unwrap_or("");
            if !txt.is_empty() {
                chat_messages.push(json!({ "role": "system", "content": txt }));
            }
        } else if mtype == "user" {
            let txt = m.get("text").and_then(|v| v.as_str()).unwrap_or("");
            chat_messages.push(json!({ "role": "user", "content": txt }));
        } else if mtype == "assistant" {
            let parts = m.get("content").and_then(|v| v.as_array());
            let mut tool_calls = Vec::new();
            let mut tool_results = Vec::new();
            let mut text_parts = Vec::new();

            if let Some(arr) = parts {
                for p in arr {
                    let ptype = p.get("type").and_then(|t| t.as_str()).unwrap_or("");
                    if ptype == "text" {
                        if let Some(t) = p.get("text").and_then(|s| s.as_str()) {
                            text_parts.push(t);
                        }
                    } else if ptype == "tool" {
                        let cid = p.get("id").and_then(|v| v.as_str()).unwrap_or("call_0");
                        let fn_name = p.get("name").and_then(|v| v.as_str()).unwrap_or("tool");
                        let input_val = p.pointer("/state/input").cloned().unwrap_or_else(|| json!({}));
                        let out_str = p
                            .pointer("/state/content/0/text")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                            .or_else(|| {
                                p.pointer("/state/structured")
                                    .map(|v| serde_json::to_string(v).unwrap_or_default())
                            })
                            .unwrap_or_else(|| "{}".to_string());

                        tool_calls.push(json!({
                            "id": cid,
                            "type": "function",
                            "function": {
                                "name": fn_name,
                                "arguments": serde_json::to_string(&input_val).unwrap_or_else(|_| "{}".to_string())
                            }
                        }));

                        tool_results.push(json!({
                            "role": "tool",
                            "tool_call_id": cid,
                            "name": fn_name,
                            "content": out_str
                        }));
                    }
                }
            }

            let mut clean_txt = text_parts.join("");
            if clean_txt.starts_with("[Tools executed in this past turn:") {
                if let Some(pos) = clean_txt.find("]\n") {
                    clean_txt = clean_txt[pos + 2..].to_string();
                } else if let Some(pos) = clean_txt.find(']') {
                    clean_txt = clean_txt[pos + 1..].trim_start().to_string();
                }
            }

            // Standard OpenCode / OpenAI Message Structure:
            // 1. Assistant message with tool_calls (if any tools were invoked)
            // 2. Tool response messages for each tool call
            // 3. Final assistant text message AFTER tool outputs (preserving strict user/assistant alternation)
            if !tool_calls.is_empty() {
                chat_messages.push(json!({
                    "role": "assistant",
                    "content": Value::Null,
                    "tool_calls": tool_calls
                }));
                for tr in tool_results {
                    chat_messages.push(tr);
                }
                if !clean_txt.is_empty() {
                    chat_messages.push(json!({
                        "role": "assistant",
                        "content": clean_txt
                    }));
                }
            } else if !clean_txt.is_empty() {
                chat_messages.push(json!({ "role": "assistant", "content": clean_txt }));
            }
        }
    }
    // Process attached files (especially images) for OCR & Multimodal vision
    let mut ocr_transcriptions: Vec<String> = Vec::new();
    let mut image_urls: Vec<String> = Vec::new();

    if let Some(files_arr) = files.and_then(|f| f.as_array()) {
        for file_item in files_arr {
            let file_name = file_item
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("attached_image.png");
            let uri = file_item
                .get("uri")
                .or_else(|| file_item.get("url"))
                .and_then(|v| v.as_str())
                .unwrap_or("");

            if uri.starts_with("data:image/") {
                image_urls.push(uri.to_string());
                if let Some(comma_pos) = uri.find(',') {
                    let b64_data = &uri[comma_pos + 1..];
                    use base64::prelude::*;
                    if let Ok(bytes) = BASE64_STANDARD.decode(b64_data.trim()) {
                        let scratch_dir = crate::paths::arunaki_dot_dir().join("scratch");
                        let _ = std::fs::create_dir_all(&scratch_dir);
                        let clean_name = file_name.replace(|c: char| !c.is_alphanumeric() && c != '.' && c != '_', "_");
                        let img_path = scratch_dir.join(format!("attached_{}_{}", now_ms(), clean_name));
                        if std::fs::write(&img_path, &bytes).is_ok() {
                            crate::paths::log_engine(
                                "ocr",
                                &format!("📸 Processing attached image '{}' via Windows native OCR", img_path.display()),
                            );
                            match crate::tool::image_ocr::run_native_ocr(&img_path) {
                                Ok(text) if !text.trim().is_empty() => {
                                    crate::paths::log_engine(
                                        "ocr",
                                        &format!("🔍 OCR recognized {} chars from '{}'", text.len(), file_name),
                                    );
                                    ocr_transcriptions.push(format!(
                                        "[Attached Image: {} (Native OCR Transcribed Content)]:\n\"\"\"\n{}\n\"\"\"",
                                        file_name,
                                        text.trim()
                                    ));
                                }
                                Ok(_) => {
                                    crate::paths::log_engine(
                                        "ocr",
                                        &format!("ℹ️ OCR completed for '{}' (no text detected)", file_name),
                                    );
                                }
                                Err(err) => {
                                    crate::paths::log_engine(
                                        "ocr",
                                        &format!("⚠️ OCR failed for '{}': {}", file_name, err),
                                    );
                                }
                            }
                        }
                    }
                }
            } else if !uri.is_empty() {
                let candidate = std::path::Path::new(workspace_dir).join(uri);
                if candidate.exists() {
                    let is_img = uri.ends_with(".png")
                        || uri.ends_with(".jpg")
                        || uri.ends_with(".jpeg")
                        || uri.ends_with(".webp")
                        || uri.ends_with(".bmp");
                    if is_img {
                        if let Ok(text) = crate::tool::image_ocr::run_native_ocr(&candidate) {
                            if !text.trim().is_empty() {
                                ocr_transcriptions.push(format!(
                                    "[Attached Image: {} (Native OCR Transcribed Content)]:\n\"\"\"\n{}\n\"\"\"",
                                    file_name,
                                    text.trim()
                                ));
                            }
                        }
                    }
                }
            }
        }
    }

    // Resolve @filename mentions from prompt_text into workspace file context
    let mut mentioned_files_context = Vec::new();
    for word in prompt_text.split_whitespace() {
        if let Some(m) = word.strip_prefix('@') {
            let clean_m = m.trim_matches(|c: char| !c.is_alphanumeric() && c != '.' && c != '_' && c != '-');
            if !clean_m.is_empty() {
                let candidate = std::path::Path::new(workspace_dir).join(clean_m);
                if candidate.is_file() {
                    if let Ok(content) = std::fs::read_to_string(&candidate) {
                        let snippet: String = content.chars().take(8000).collect();
                        mentioned_files_context.push(format!(
                            "[Explicitly Mentioned Workspace File: {}]:\n\"\"\"\n{}\n\"\"\"",
                            clean_m, snippet.trim()
                        ));
                    } else {
                        mentioned_files_context.push(format!(
                            "[Explicitly Mentioned Workspace File: {} (binary document present in active folder)]",
                            clean_m
                        ));
                    }
                }
            }
        }
    }

    let mut context_additions = Vec::new();
    if !ocr_transcriptions.is_empty() {
        context_additions.extend(ocr_transcriptions);
    }
    if !mentioned_files_context.is_empty() {
        context_additions.extend(mentioned_files_context);
    }

    let enriched_user_text = if !context_additions.is_empty() {
        format!("{}\n\n{}", prompt_text, context_additions.join("\n\n"))
    } else {
        prompt_text.to_string()
    };

    if !image_urls.is_empty() {
        let mut user_parts = vec![json!({ "type": "text", "text": enriched_user_text })];
        for img_url in &image_urls {
            user_parts.push(json!({
                "type": "image_url",
                "image_url": { "url": img_url }
            }));
        }
        chat_messages.push(json!({ "role": "user", "content": user_parts }));
    } else {
        chat_messages.push(json!({ "role": "user", "content": enriched_user_text }));
    }

    // Determine target base URL & API key
    let cfg = read_arunaki_config();
    let is_local_bridge = provider_id == "antigravity" || provider_id == "local-cli";
    let mut base_url = cfg
        .pointer(&format!("/provider/{}/options/baseURL", provider_id))
        .or_else(|| cfg.pointer(&format!("/provider/{}/api/url", provider_id)))
        .or_else(|| cfg.pointer(&format!("/provider/{}/api", provider_id)))
        .or_else(|| cfg.pointer(&format!("/providers/{}/options/baseURL", provider_id)))
        .or_else(|| cfg.pointer(&format!("/providers/{}/api/url", provider_id)))
        .and_then(|v| v.as_str())
        .map(|s| s.trim_end_matches('/').to_string())
        .unwrap_or_else(|| crate::bridge::get_bridge_base_url());

    if is_local_bridge {
        let active_port = crate::bridge::ensure_bridge_running().await;
        base_url = format!("http://127.0.0.1:{}/v1", active_port);
    }
    let api_key = cfg
        .pointer(&format!("/provider/{}/options/apiKey", provider_id))
        .or_else(|| cfg.pointer(&format!("/provider/{}/request/body/apiKey", provider_id)))
        .or_else(|| cfg.pointer(&format!("/providers/{}/options/apiKey", provider_id)))
        .or_else(|| cfg.pointer(&format!("/providers/{}/request/body/apiKey", provider_id)))
        .and_then(|v| v.as_str())
        .unwrap_or("local-cli-bridge")
        .to_string();

    let attach_tools = should_attach_document_tools(prompt_text, history);
    let tools_def = if attach_tools {
        build_tool_definitions()
    } else {
        Vec::new()
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .unwrap();

    let mut content_parts: Vec<Value> = Vec::new();
    let mut final_text = String::new();
    let mut doom_loop_detector = super::doom_loop::DoomLoopDetector::default();

    for _step in 0..25 {
        let step_start = now_ms();
        crate::paths::log_engine(
            "ai",
            &format!("⏳ Calling AI model '{}' (step {})...", model_id, _step + 1),
        );
        let mut req_body = json!({
            "model": model_id,
            "messages": chat_messages,
            "stream": false
        });
        if !tools_def.is_empty() {
            req_body["tools"] = Value::Array(tools_def.clone());
        }

        let resp = client
            .post(format!("{}/chat/completions", base_url))
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&req_body)
            .send()
            .await;

        let r = match resp {
            Ok(r) => r,
            Err(e) => {
                crate::paths::log_engine(
                    "ai",
                    &format!("⚠️ Connection error to AI endpoint {}: {}", base_url, e),
                );
                if is_local_bridge || base_url.contains(&format!(":{}", LOCAL_CLI_BRIDGE_PORT)) {
                    crate::paths::log_engine("ai", "🔄 Auto-healing Local-CLI Bridge and retrying turn...");
                    let new_port = crate::bridge::ensure_bridge_running().await;
                    base_url = format!("http://127.0.0.1:{}/v1", new_port);
                    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                    match client
                        .post(format!("{}/chat/completions", base_url))
                        .header("Content-Type", "application/json")
                        .header("Authorization", format!("Bearer {}", api_key))
                        .json(&req_body)
                        .send()
                        .await
                    {
                        Ok(retried_r) => retried_r,
                        Err(retry_err) => {
                            final_text = format!("Error: Failed to reach AI provider ({}).", retry_err);
                            break;
                        }
                    }
                } else {
                    final_text = format!("Error: Failed to reach AI provider ({}).", e);
                    break;
                }
            }
        };
        let mut r = r;
        if !r.status().is_success() {
            let err_txt = r.text().await.unwrap_or_default();
            // Context Overflow Auto-Healing (OpenCode Item 2b)
            if crate::session::compaction::is_context_overflow_error(&err_txt) && chat_messages.len() > 2 {
                crate::paths::log_engine(
                    "ai",
                    "🩹 Context window overflow detected! Triggering emergency compaction auto-heal...",
                );
                chat_messages = crate::session::compaction::emergency_compact_messages(&chat_messages);
                req_body["messages"] = Value::Array(chat_messages.clone());

                emit_event(
                    workspace_dir,
                    "session.overflow_healed",
                    json!({
                        "sessionID": session_id,
                        "compactedMessages": chat_messages.len()
                    }),
                );

                let retry_resp = client
                    .post(format!("{}/chat/completions", base_url))
                    .header("Content-Type", "application/json")
                    .header("Authorization", format!("Bearer {}", api_key))
                    .json(&req_body)
                    .send()
                    .await;

                match retry_resp {
                    Ok(healed_r) if healed_r.status().is_success() => {
                        crate::paths::log_engine("ai", "✅ Emergency context auto-heal succeeded! Continuing turn.");
                        r = healed_r;
                    }
                    Ok(healed_r) => {
                        let final_err = healed_r.text().await.unwrap_or_default();
                        final_text = format!("Error from AI provider (after context compaction): {}", final_err);
                        break;
                    }
                    Err(retry_e) => {
                        final_text = format!("Error reaching AI provider during auto-heal retry: {}", retry_e);
                        break;
                    }
                }
            } else {
                final_text = format!("Error from AI provider: {}", err_txt);
                break;
            }
        }
        let data: Value = r.json().await.unwrap_or_else(|_| json!({}));
        let msg = data
            .pointer("/choices/0/message")
            .cloned()
            .unwrap_or_else(|| json!({}));
        let mut msg_text = msg
            .get("content")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let mut msg_reasoning = msg
            .get("reasoning_content")
            .or_else(|| msg.get("reasoning"))
            .or_else(|| msg.get("thought"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();

        // Also extract inline <think>...</think> blocks if model emitted them inside content
        if let Some(s_idx) = msg_text.find("<think>") {
            if let Some(e_rel) = msg_text[s_idx + 7..].find("</think>") {
                let e_idx = s_idx + 7 + e_rel;
                let inline_thought = msg_text[s_idx + 7..e_idx].trim().to_string();
                if !inline_thought.is_empty() {
                    if !msg_reasoning.is_empty() {
                        msg_reasoning.push_str("\n\n");
                    }
                    msg_reasoning.push_str(&inline_thought);
                }
                let mut cleaned = String::with_capacity(msg_text.len());
                cleaned.push_str(&msg_text[..s_idx]);
                cleaned.push_str(&msg_text[e_idx + 8..]);
                msg_text = cleaned.trim().to_string();
            }
        }

        let tool_calls = msg
            .get("tool_calls")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let step_end = now_ms();
        let step_dur = step_end.saturating_sub(step_start);
        crate::paths::log_engine(
            "ai",
            &format!(
                "✨ AI Model '{}' replied in {}ms | thought: {} chars | text: {} chars | tools: {}",
                model_id,
                step_dur,
                msg_reasoning.len(),
                msg_text.len(),
                tool_calls.len()
            ),
        );

        if !msg_reasoning.is_empty() {
            let r_part_id = gen_id("rsn");
            emit_event(
                workspace_dir,
                "session.next.reasoning.started",
                json!({
                    "sessionID": session_id,
                    "messageID": assistant_msg_id,
                    "id": r_part_id
                }),
            );
            emit_event(
                workspace_dir,
                "session.next.reasoning.delta",
                json!({
                    "sessionID": session_id,
                    "messageID": assistant_msg_id,
                    "id": r_part_id,
                    "delta": msg_reasoning
                }),
            );
            emit_event(
                workspace_dir,
                "session.next.reasoning.ended",
                json!({
                    "sessionID": session_id,
                    "messageID": assistant_msg_id,
                    "id": r_part_id,
                    "text": msg_reasoning
                }),
            );
            content_parts.push(json!({
                "type": "reasoning",
                "id": r_part_id,
                "text": msg_reasoning,
                "time": {
                    "start": step_start,
                    "end": step_end,
                    "created": step_start,
                    "completed": step_end
                }
            }));
        }

        if tool_calls.is_empty() {
            final_text = msg_text;
            break;
        }

        // Append assistant message with tool_calls to conversation
        chat_messages.push(msg.clone());

        for tc in tool_calls {
            let call_id = tc
                .get("id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| gen_id("call"));
            let fn_name = tc
                .pointer("/function/name")
                .and_then(|v| v.as_str())
                .unwrap_or("tool")
                .to_string();
            let args_str = tc
                .pointer("/function/arguments")
                .and_then(|v| v.as_str())
                .unwrap_or("{}");

            // Robust JSON Tool Argument Repair & Syntax Recovery (Item 1c)
            let (args_val, syntax_error) = match crate::tool::json_repair::parse_or_repair_tool_args(args_str) {
                Ok(val) => (val, None),
                Err(err) => (json!({}), Some(err)),
            };

            let tool_start = now_ms();

            emit_event(
                workspace_dir,
                "session.next.tool.called",
                json!({
                    "sessionID": session_id,
                    "messageID": assistant_msg_id,
                    "id": call_id,
                    "name": fn_name,
                    "input": args_val
                }),
            );

            crate::paths::log_engine(
                "tool",
                &format!("🔧 Executing tool '{}' with input: {}", fn_name, args_str),
            );

            // Doom-Loop Breaker & Syntax Guard
            let loop_warning = doom_loop_detector.check_and_record(&fn_name, args_str);
            let (tool_out, is_blocked) = if let Some(err_msg) = syntax_error {
                crate::paths::log_engine(
                    "tool",
                    &format!("⚠️ JSON argument syntax error for tool '{}': {}", fn_name, err_msg),
                );
                (json!({ "error": err_msg, "blocked": true }), true)
            } else if let Some(warning) = loop_warning {
                crate::paths::log_engine(
                    "tool",
                    &format!("🛑 Doom-loop blocked: tool '{}' repeated identically with args: {}", fn_name, args_str),
                );
                (json!({ "error": warning, "blocked": true }), true)
            } else {
                let out = execute_tool_call(
                    session_id,
                    &assistant_msg_id,
                    &call_id,
                    &fn_name,
                    &args_val,
                    workspace_dir,
                )
                .await;
                (out, false)
            };

            let tool_out_str =
                serde_json::to_string_pretty(&tool_out).unwrap_or_else(|_| "{}".to_string());
            let tool_end = now_ms();
            let tool_dur = tool_end.saturating_sub(tool_start);

            if is_blocked {
                crate::paths::log_engine(
                    "tool",
                    &format!("⚠️ Tool '{}' was halted by DoomLoopDetector in {}ms", fn_name, tool_dur),
                );
                emit_event(
                    workspace_dir,
                    "session.next.tool.failed",
                    json!({
                        "sessionID": session_id,
                        "messageID": assistant_msg_id,
                        "id": call_id,
                        "name": fn_name,
                        "content": [{ "type": "text", "text": tool_out_str }],
                        "error": { "message": "Execution halted: repeated identical invocation detected" }
                    }),
                );
            } else {
                crate::paths::log_engine(
                    "tool",
                    &format!("✅ Tool '{}' completed in {}ms", fn_name, tool_dur),
                );
                emit_event(
                    workspace_dir,
                    "session.next.tool.success",
                    json!({
                        "sessionID": session_id,
                        "messageID": assistant_msg_id,
                        "id": call_id,
                        "name": fn_name,
                        "content": [{ "type": "text", "text": tool_out_str }],
                        "structured": tool_out
                    }),
                );
            }

            content_parts.push(json!({
                "type": "tool",
                "id": call_id,
                "name": fn_name,
                "state": {
                    "status": if is_blocked { "error" } else { "completed" },
                    "input": args_val,
                    "structured": tool_out,
                    "content": [{ "type": "text", "text": tool_out_str }],
                    "attachments": []
                },
                "time": { "created": tool_start, "completed": tool_end }
            }));

            let (bounded_tool_out_str, was_truncated) =
                crate::tool::truncator::bound_tool_output(&fn_name, &tool_out_str);
            if was_truncated {
                crate::paths::log_engine(
                    "tool",
                    &format!("✂️ Tool '{}' output bounded by harness to prevent context exhaustion", fn_name),
                );
            }

            chat_messages.push(json!({
                "role": "tool",
                "tool_call_id": call_id,
                "name": fn_name,
                "content": bounded_tool_out_str
            }));
        }
    }

    // Ensure the user always receives a final response text (never leave an empty bubble after tool executions)
    if final_text.trim().is_empty() {
        chat_messages.push(json!({
            "role": "user",
            "content": "All requested document operations and tools have completed execution. Provide a clear, concise final summary and answer to the user."
        }));

        let req_body = json!({
            "model": model_id,
            "messages": chat_messages,
            "stream": false
        });

        if let Ok(resp) = client
            .post(format!("{}/chat/completions", base_url))
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&req_body)
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(data) = resp.json::<Value>().await {
                    if let Some(txt) = data.pointer("/choices/0/message/content").and_then(|v| v.as_str()) {
                        final_text = txt.trim().to_string();
                    }
                }
            }
        }

        if final_text.trim().is_empty() {
            final_text = "All requested document operations have been completed successfully.".to_string();
        }
    }

    let txt_part_id = gen_id("txt");
    emit_event(
        workspace_dir,
        "session.next.text.started",
        json!({
            "sessionID": session_id,
            "messageID": assistant_msg_id,
            "id": txt_part_id
        }),
    );
    if !final_text.is_empty() {
        emit_event(
            workspace_dir,
            "session.next.text.delta",
            json!({
                "sessionID": session_id,
                "messageID": assistant_msg_id,
                "id": txt_part_id,
                "delta": final_text
            }),
        );
    }
    emit_event(
        workspace_dir,
        "session.next.text.ended",
        json!({
            "sessionID": session_id,
            "messageID": assistant_msg_id,
            "id": txt_part_id,
            "text": final_text
        }),
    );

    content_parts.push(json!({
        "type": "text",
        "id": txt_part_id,
        "text": final_text
    }));

    let completed_ms = now_ms();
    let total_elapsed = completed_ms.saturating_sub(started_ms);
    crate::paths::log_engine(
        "chat",
        &format!(
            "🏁 Turn completed for session '{}' in {}ms (model: '{}')",
            session_id, total_elapsed, model_id
        ),
    );
    let assistant_msg = json!({
        "id": assistant_msg_id,
        "type": "assistant",
        "role": "assistant",
        "agent": "default",
        "model": {
            "providerID": provider_id,
            "id": model_id
        },
        "content": content_parts,
        "finish": "stop",
        "cost": 0,
        "tokens": {
            "input": 0,
            "output": 0,
            "reasoning": 0,
            "cache": { "read": 0, "write": 0 }
        },
        "time": {
            "created": started_ms,
            "completed": completed_ms
        }
    });

    with_store(|store| {
        if let Some(s) = store.sessions.get_mut(session_id) {
            s["time"]["updated"] = json!(completed_ms);
            let cur_title = s.get("title").and_then(|v| v.as_str()).unwrap_or("");
            if cur_title.is_empty()
                || cur_title.eq_ignore_ascii_case("New Session")
                || cur_title.eq_ignore_ascii_case("Chat")
                || cur_title.starts_with("New session -")
                || cur_title.starts_with("New Session -")
            {
                if let Some(first_msg) = store.messages.get(session_id).and_then(|m| m.first()) {
                    let text = first_msg.get("text").and_then(|v| v.as_str()).unwrap_or("");
                    let auto_title = crate::session::title::derive_session_title(text);
                    if auto_title != "New Session" {
                        s["title"] = json!(&auto_title);
                    }
                }
            }
        }
        store
            .messages
            .entry(session_id.to_string())
            .or_default()
            .push(assistant_msg);
        save_store(store);
    });

    emit_event(
        workspace_dir,
        "session.next.step.ended",
        json!({
            "sessionID": session_id,
            "messageID": assistant_msg_id,
            "finish": "stop",
            "cost": 0,
            "tokens": { "input": 0, "output": 0, "reasoning": 0, "cache": { "read": 0, "write": 0 } }
        }),
    );
    emit_event(
        workspace_dir,
        "session.idle",
        json!({ "sessionID": session_id }),
    );
}
