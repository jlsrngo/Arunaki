use crate::bridge::LOCAL_CLI_BRIDGE_PORT;
use crate::files::urlencoding_decode;
use crate::knowledge::get_active_knowledge_for_workspace;
use crate::paths::{gen_id, normalize_workspace_path, now_ms};
use crate::provider::read_arunaki_config;
use crate::session::message::emit_event;
use crate::session::session::{save_store, set_active_run, with_store};
use crate::session::tools::{build_tool_definitions, execute_tool_call, should_attach_document_tools};
use axum::{
    extract::Path as AxumPath,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Value};
use std::collections::HashMap;

pub fn default_model_ref() -> Value {
    let cfg = read_arunaki_config();
    let model_str = cfg
        .pointer("/provider/local-cli/options/defaultModel")
        .or_else(|| cfg.get("defaultModel"))
        .and_then(|v| v.as_str())
        .unwrap_or("kiro/auto");
    json!({
        "providerID": "local-cli",
        "id": model_str
    })
}

pub async fn handle_switch_model(
    AxumPath(id): AxumPath<String>,
    Json(body): Json<Value>,
) -> Response {
    let model = body.get("model").cloned().unwrap_or_else(|| body.clone());
    let updated = with_store(|store| {
        if let Some(s) = store.sessions.get_mut(&id) {
            s["model"] = model.clone();
            s["time"]["updated"] = json!(now_ms());
            let cloned = s.clone();
            save_store(store);
            Some(cloned)
        } else {
            None
        }
    });
    if let Some(s) = updated {
        Json(json!({ "data": s, "ok": true })).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Session not found" })),
        )
            .into_response()
    }
}

pub async fn handle_abort(AxumPath(id): AxumPath<String>) -> Response {
    set_active_run(&id, false);
    Json(json!({ "data": { "aborted": true } })).into_response()
}

fn is_emoji_char(c: char) -> bool {
    ('\u{1F300}'..='\u{1FAFF}').contains(&c)
        || ('\u{2600}'..='\u{27BF}').contains(&c)
        || ('\u{1F600}'..='\u{1F64F}').contains(&c)
        || ('\u{1F680}'..='\u{1F6FF}').contains(&c)
}

/// Strong claim that an ArunakiZen POS action physically happened (lowercased text).
fn claims_zen_action(lower_msg: &str) -> bool {
    const PHRASES: &[&str] = &[
        "sudah dicetak",
        "berhasil dicetak",
        "dicetak ulang",
        "sudah tercetak",
        "struk fisik",
        "struk sudah",
        "laci kasir sudah terbuka",
        "laci kasir terbuka",
        "receipt has been printed",
        "receipt printed",
        "drawer opened",
    ];
    let strong_phrase = PHRASES.iter().any(|p| lower_msg.contains(p));
    let r43_action = lower_msg.contains("r43-")
        && (lower_msg.contains("berhasil diedit")
            || lower_msg.contains("sudah diedit")
            || lower_msg.contains("berhasil direvisi")
            || lower_msg.contains("sudah direvisi")
            || lower_msg.contains("berhasil divoid")
            || lower_msg.contains("berhasil di-void")
            || lower_msg.contains("sudah dibatalkan"));
    strong_phrase || r43_action
}

/// Weaker completion wording, only meaningful when the user specifically asked for a POS action.
fn claims_zen_action_soft(lower_msg: &str) -> bool {
    const PHRASES: &[&str] = &["selesai", "berhasil", "sudah", "done", "success", "lunas", "revised"];
    PHRASES.iter().any(|p| lower_msg.contains(p))
}

/// User prompt specifically requests an ArunakiZen POS hardware or retail order action.
fn requests_zen_action(lower_prompt: &str) -> bool {
    let mentions_receipt_print = (lower_prompt.contains("cetak") || lower_prompt.contains("print"))
        && (lower_prompt.contains("struk")
            || lower_prompt.contains("stuk")
            || lower_prompt.contains("receipt")
            || lower_prompt.contains("resi"));
    let mentions_drawer = lower_prompt.contains("laci") || lower_prompt.contains("drawer");
    let mentions_r43_action = lower_prompt.contains("r43-")
        && (lower_prompt.contains("cetak")
            || lower_prompt.contains("print")
            || lower_prompt.contains("edit")
            || lower_prompt.contains("revisi")
            || lower_prompt.contains("void")
            || lower_prompt.contains("batal"));
    let mentions_pos_order_action = lower_prompt.contains("revisi order")
        || lower_prompt.contains("edit order")
        || lower_prompt.contains("void order");

    mentions_receipt_print || mentions_drawer || mentions_r43_action || mentions_pos_order_action
}

fn derive_session_title(prompt: &str) -> String {
    let first_line = prompt
        .lines()
        .map(|l| l.trim())
        .find(|l| !l.is_empty())
        .unwrap_or(prompt.trim());

    let no_emoji: String = first_line.chars().filter(|&c| !is_emoji_char(c)).collect();
    let cleaned = no_emoji
        .trim_start_matches(|c: char| c == '#' || c == '*' || c == '-' || c == '>' || c == '`' || c == '@' || c.is_whitespace())
        .trim();

    if cleaned.is_empty() {
        return "New Session".to_string();
    }

    if cleaned.chars().count() > 40 {
        let mut truncated = String::new();
        for ch in cleaned.chars() {
            if truncated.chars().count() >= 37 {
                break;
            }
            truncated.push(ch);
        }
        format!("{}...", truncated.trim())
    } else {
        cleaned.to_string()
    }
}

pub async fn handle_prompt(
    AxumPath(session_id): AxumPath<String>,
    q: HashMap<String, String>,
    headers: HeaderMap,
    body: Value,
) -> Response {
    let raw_dir = q
        .get("directory")
        .map(|s| s.to_string())
        .or_else(|| {
            headers
                .get("x-arunaki-directory")
                .and_then(|h| h.to_str().ok())
                .map(|s| s.to_string())
        })
        .unwrap_or_default();
    let workspace_dir = normalize_workspace_path(&urlencoding_decode(&raw_dir));

    let prompt_text = body
        .get("prompt")
        .and_then(|p| p.get("text").or(Some(p)))
        .and_then(|v| v.as_str())
        .or_else(|| body.get("text").and_then(|v| v.as_str()))
        .unwrap_or("")
        .to_string();

    let files_val = body
        .get("prompt")
        .and_then(|p| p.get("files"))
        .or_else(|| body.get("files"))
        .cloned();

    let session_val = with_store(|store| store.sessions.get(&session_id).cloned());
    let Some(session) = session_val else {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Session not found" })),
        )
            .into_response();
    };

    let model_val = session.get("model").cloned().unwrap_or_else(default_model_ref);
    let provider_id = model_val
        .get("providerID")
        .and_then(|v| v.as_str())
        .unwrap_or("local-cli")
        .to_string();
    let model_id = model_val
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("kiro/auto")
        .to_string();

    let user_msg_id = gen_id("msg");
    let created_ms = now_ms();
    let mut user_msg = json!({
        "id": user_msg_id,
        "type": "user",
        "role": "user",
        "agent": "default",
        "model": {
            "providerID": provider_id,
            "id": model_id
        },
        "text": prompt_text,
        "content": [{ "type": "text", "text": prompt_text }],
        "time": { "created": created_ms }
    });
    if let Some(ref f) = files_val {
        user_msg["files"] = f.clone();
    }

    let mut updated_title: Option<String> = None;
    let history = with_store(|store| {
        if let Some(sess) = store.sessions.get_mut(&session_id) {
            let current_title = sess.get("title").and_then(|v| v.as_str()).unwrap_or("");
            if current_title.is_empty()
                || current_title.eq_ignore_ascii_case("New Session")
                || current_title.eq_ignore_ascii_case("Chat")
                || current_title.starts_with("New session -")
                || current_title.starts_with("New Session -")
            {
                let auto_title = derive_session_title(&prompt_text);
                if auto_title != "New Session" {
                    sess["title"] = json!(&auto_title);
                    sess["time"]["updated"] = json!(created_ms);
                    updated_title = Some(auto_title);
                }
            }
        }
        let msgs = store.messages.entry(session_id.clone()).or_default();
        let hist = msgs.clone();
        msgs.push(user_msg.clone());
        save_store(store);
        hist
    });

    if let Some(ref title) = updated_title {
        emit_event(
            &workspace_dir,
            "session.updated",
            json!({
                "sessionID": session_id,
                "title": title
            }),
        );
    }

    emit_event(
        &workspace_dir,
        "session.prompt.started",
        json!({
            "sessionID": session_id,
            "messageID": user_msg_id,
            "prompt": prompt_text
        }),
    );

    let sid_c = session_id.clone();
    let ws_c = workspace_dir.clone();
    let pid_c = provider_id.clone();
    let mid_c = model_id.clone();
    let ptxt_c = prompt_text.clone();

    let p_preview: String = if prompt_text.chars().count() > 60 {
        format!("{}...", prompt_text.chars().take(60).collect::<String>())
    } else {
        prompt_text.clone()
    };
    crate::paths::log_engine(
        "chat",
        &format!("📥 User prompt [{}]: \"{}\"", session_id, p_preview),
    );
    crate::paths::log_engine(
        "chat",
        &format!("🎯 Routing request to Model: '{}' (Provider: '{}')", model_id, provider_id),
    );

    let files_c = files_val.clone();
    tokio::spawn(async move {
        run_agent_turn(
            &sid_c,
            &ws_c,
            &pid_c,
            &mid_c,
            &history,
            &ptxt_c,
            files_c.as_ref(),
        )
        .await;
    });

    Json(json!({
        "data": {
            "id": user_msg_id,
            "sessionID": session_id,
            "prompt": {
                "text": prompt_text,
                "files": [],
                "agents": []
            },
            "delivery": "interrupt",
            "timeCreated": created_ms
        }
    }))
    .into_response()
}

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

    // 1. Base system prompt from prompt/default.txt
    let base_prompt_template = include_str!("prompt/default.txt");
    let mut sys_prompt = format!(
        "{}\n\n# Active Workspace\nYou are operating strictly inside the active project folder: {}\n\
        All file operations must be isolated to this directory.",
        base_prompt_template,
        workspace_dir
    );

    // 2. ArunakiZen Retail Integration (if configured)
    let pos_cfg = crate::tool::zen::load_zen_config();
    let pos_user = if pos_cfg.username.is_empty() {
        "Cashier Operator".to_string()
    } else {
        pos_cfg.username.clone()
    };
    sys_prompt.push_str(&format!(
        "\n\n<arunakizen>\n\
        # ArunakiZen Retail & Transaction Integration\n\
        Arunaki is connected to the local ArunakiZen server at: {}\n\
        Active Operator: {}\n\
        \n\
        Available ArunakiZen Tools:\n\
        - `arunakizen_search_product`: Search retail product catalog by barcode, SKU, or name to find official items and prices.\n\
        - `arunakizen_create_sale_order`: Create an official cashier sales transaction (R43 invoice), deduct inventory, and record payment.\n\
        - `arunakizen_edit_sale_order`: Edit/revise an EXISTING invoice in place (same R43 number, is_edit: true): change items, quantities, payment amount (e.g. 'uang pas'), or add shipping lines.\n\
        - `arunakizen_void_sale_order`: Void (cancel and rollback) an existing cashier sales invoice (R43). Requires supervisor password in ArunakiZen; prefer `arunakizen_edit_sale_order` for revisions.\n\
        - `arunakizen_print_receipt`: Print an official customer receipt on the physical thermal printer and kick open the cash drawer.\n\
        - `arunakizen_get_shift_summary`: View cashier shift turnover and drawer cash balance.\n\
        - `question`: Interactive clarification tool. Use this to ask the user to confirm product typos, ambiguities, or missing catalog items.\n\
        \n\
        CRITICAL ARUNAKIZEN INSTRUCTIONS:\n\
        1. When user inputs sales orders, clothing/apparel items with quantities/prices (e.g. 'KPM POLO BLACK L 18...', 'NSA LONGSLEEVE...'), or asks to 'print invoice', 'print receipt', or 'create transaction':\n\
           - DO NOT just draw ASCII text boxes in the chat or ask to save into a .txt or .docx file!\n\
           - Match products with `arunakizen_search_product` and record the official retail transaction with `arunakizen_create_sale_order`.\n\
           - If user requests to print receipt/invoice, call `arunakizen_print_receipt` with the invoice number.\n\
           - ALWAYS format the order/invoice breakdown cleanly inside [CANVAS]...[/CANVAS] tags so it opens interactively in the user's Canvas editor!\n\
        \n\
        2. STRICT NO-SUBSTITUTION RULE & TYPO CONFIRMATION (CRITICAL):\n\
           - NEVER invent, substitute, or replace any product code or color on your own without explicit user consent (e.g. NEVER substitute 'MAROON' for 'CARLONE' just because prices match)!\n\
           - If `arunakizen_search_product` returns 0 results or provides typo suggestions (e.g. 'CARLONE' -> suggested 'CAROLINE BLUE'), you MUST call the `question` tool to ask the user to confirm the intended product before creating the sale order or printing!\n\
           - Example question prompt: \"Product 'CARLONE XL' was not found. Did you mean 'NSA LONGSLEEVE CAROLINE BLUE XL'?\"\n\
        \n\
        3. PRODUCT DEDUPLICATION & LINE MERGING:\n\
           - Identical items (same product code, size, and unit price) MUST be merged into a single line item with accumulated quantity (e.g. 1 pcs + 1 pcs = 2 pcs). Do NOT put identical items on separate lines unless prices or discounts differ.\n\
        \n\
        4. BATCH SEARCH (CRITICAL FOR FAST EXECUTION - ZERO REDUNDANT LOOPS):\n\
           - When an order contains multiple products (e.g. 2 or more apparel lines), ALWAYS pass the `queries` array to `arunakizen_search_product` (e.g. `queries: [\"KPM POLO BLACK L\", \"KPM POLO MAROON XL\", \"NSA LONGSLEEVE BLACK XL\"]`) instead of calling the tool one-by-one!\n\
           - This resolves ALL items in a single parallel call in milliseconds, completely preventing slow multiple-turn looping.\n\
        \n\
        5. STRICT NO-UNSOLICITED-NOTES RULE (CRITICAL):\n\
           - NEVER auto-generate summaries, item lists, or filler text into the `notes` (memo/remarks) field of `arunakizen_create_sale_order`!\n\
           - Leave `notes` completely empty (\"\") unless the user explicitly commanded a specific memo to be recorded on the invoice (e.g. 'leave with security guard', 'dropship for customer Budi').\n\
        \n\
        6. ORDER REVISION (CRITICAL - PREVENT DUPLICATE INVOICES):\n\
           - If an invoice was already created earlier in the conversation (e.g. invoice R43-241026007), and the user now asks to correct, revise, replace an item, change payment, or 'edit lagi':\n\
           - Call `arunakizen_edit_sale_order` with the SAME invoice number and the full corrected item list / payment. Do NOT create a new duplicate order.\n\
           - Only use `arunakizen_void_sale_order` when the user explicitly wants to cancel/delete the transaction.\n\
        \n\
        8. STRICT NO-FAKE-ACTION RULE (CRITICAL - ZERO HALLUCINATED POS ACTIONS):\n\
           - NEVER say a receipt was printed, the cash drawer opened, an invoice was created, edited, revised, or voided unless you called the corresponding `arunakizen_*` tool IN THIS TURN and it returned success.\n\
           - Previous assistant messages in history are NOT proof that an action happened now. Each new request ('cetak struk', 'edit lagi', 'buka laci') requires a NEW tool call.\n\
           - If the tool returns an error or `spooled: false`, report the failure honestly.\n\
        \n\
        7. STRICT NO-EMOJI RULE (CRITICAL):\n\
           - NEVER include emojis (e.g. 🧾, 📄, 🛒, ⚠️, 📦, 💰, ✨) in order headings, markdown titles, receipt text, canvas titles, or invoice outputs.\n\
           - Always output clean, professional, plain alphanumeric text with standard markdown formatting.\n\
        </arunakizen>\n",
        pos_cfg.host_url,
        pos_user
    ));

    // 2. Living Workspace Memory (Cartographer & Sentinel: ARUNAKI.md)
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

    // 4. Sentinel autonomous learning on user corrections
    if crate::session::memory::might_be_correction(prompt_text) {
        crate::session::memory::record_learned_correction(workspace_dir, prompt_text);
    }

    let mut chat_messages = vec![json!({ "role": "system", "content": sys_prompt })];
    for m in history {
        let mtype = m.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if mtype == "user" {
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
            // 3. Final assistant text message (if any summary was generated)
            if !tool_calls.is_empty() {
                chat_messages.push(json!({
                    "role": "assistant",
                    "content": if clean_txt.is_empty() { Value::Null } else { Value::String(clean_txt.clone()) },
                    "tool_calls": tool_calls
                }));
                for tr in tool_results {
                    chat_messages.push(tr);
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

    let enriched_user_text = if !ocr_transcriptions.is_empty() {
        format!("{}\n\n{}", prompt_text, ocr_transcriptions.join("\n\n"))
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
    let base_url = cfg
        .pointer(&format!("/provider/{}/options/baseURL", provider_id))
        .or_else(|| cfg.pointer(&format!("/provider/{}/api", provider_id)))
        .and_then(|v| v.as_str())
        .map(|s| s.trim_end_matches('/').to_string())
        .unwrap_or_else(|| format!("http://127.0.0.1:{}/v1", LOCAL_CLI_BRIDGE_PORT));
    let api_key = cfg
        .pointer(&format!("/provider/{}/options/apiKey", provider_id))
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
    let mut read_tool_executed = false;
    let mut mutation_tool_executed = false;
    let mut zen_tool_executed = false;
    let mut zen_guard_fired = false;

    for _step in 0..25 {
        let step_start = now_ms();
        crate::paths::log_engine(
            "ai",
            &format!("⏳ Calling AI model '{}' (step {})...", model_id, _step + 1),
        );
        let mut step_messages = chat_messages.clone();
        if _step >= 6 {
            step_messages.push(json!({
                "role": "system",
                "content": "Notice: Multiple tool operations have been performed. If all required document data has been gathered, do not re-read the same files. Conclude pending modifications immediately and provide the final answer and summary to the user."
            }));
        }
        let mut req_body = json!({
            "model": model_id,
            "messages": step_messages,
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

        let Ok(r) = resp else {
            final_text = "Error: Failed to reach AI provider.".to_string();
            break;
        };
        if !r.status().is_success() {
            let err_txt = r.text().await.unwrap_or_default();
            final_text = format!("Error from AI provider: {}", err_txt);
            break;
        }
        let data: Value = r.json().await.unwrap_or_else(|_| json!({}));
        let msg = data
            .pointer("/choices/0/message")
            .cloned()
            .unwrap_or_else(|| json!({}));
        let msg_text = msg
            .get("content")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let tool_calls = msg
            .get("tool_calls")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let step_dur = now_ms().saturating_sub(step_start);
        crate::paths::log_engine(
            "ai",
            &format!(
                "✨ AI Model '{}' replied in {}ms | text: {} chars | tools: {}",
                model_id,
                step_dur,
                msg_text.len(),
                tool_calls.len()
            ),
        );

        if tool_calls.is_empty() {
            // ArunakiZen fake-action guard: model claims a POS action (receipt printed / physical thermal receipt / drawer opened / R43 invoice revised)
            // without having executed any arunakizen_* tool in this turn.
            // MUST NOT FIRE if a workspace document mutation tool (edit/write/apply_patch/excel_com) already executed!
            if !zen_tool_executed && !mutation_tool_executed && !zen_guard_fired && _step < 4 {
                let lower_msg = msg_text.to_lowercase();
                let lower_prompt = prompt_text.to_lowercase();
                if claims_zen_action(&lower_msg) || (requests_zen_action(&lower_prompt) && claims_zen_action_soft(&lower_msg)) {
                    zen_guard_fired = true;
                    crate::paths::log_engine(
                        "ai",
                        "🛡️ ArunakiZen guard: model claimed a POS action without calling any arunakizen_* tool. Forcing tool call.",
                    );
                    chat_messages.push(json!({ "role": "assistant", "content": msg_text }));
                    chat_messages.push(json!({
                        "role": "user",
                        "content": "CRITICAL SYSTEM GUARD: Your previous reply claimed a POS action (receipt printed / physical thermal receipt / drawer opened / R43 invoice revised), but NO arunakizen_* tool was executed in this turn. Nothing happened in ArunakiZen and no receipt was printed. If a POS action was requested, call the correct tool RIGHT NOW (`arunakizen_print_receipt` to print, `arunakizen_open_drawer` for the drawer, `arunakizen_edit_sale_order` with the invoice number for revisions, `arunakizen_create_sale_order` for new orders). Otherwise, if this was just a document or file edit, output only the document result."
                    }));
                    continue;
                }
            }
            let lower_msg = msg_text.to_lowercase();
            let claims_mutation = lower_msg.contains("has been updated")
                || lower_msg.contains("have updated")
                || lower_msg.contains("have saved")
                || lower_msg.contains("has been saved")
                || lower_msg.contains("file is updated")
                || lower_msg.contains("file has been updated")
                || lower_msg.contains("file has been saved")
                || lower_msg.contains("data has been inserted")
                || lower_msg.contains("changes are saved")
                || lower_msg.contains("sudah tersimpan")
                || lower_msg.contains("sudah diupdate")
                || lower_msg.contains("sudah dirubah")
                || lower_msg.contains("sudah dimasukkan")
                || lower_msg.contains("sudah saya update")
                || lower_msg.contains("sudah saya simpan")
                || lower_msg.contains("sudah saya edit")
                || lower_msg.contains("sudah dipindahkan")
                || lower_msg.contains("sudah dihapus")
                || lower_msg.contains("sudah ditambahkan")
                || lower_msg.contains("sudah diganti")
                || lower_msg.contains("sudah tercatat")
                || lower_msg.contains("sudah dihitung")
                || lower_msg.contains("data tersinkronisasi")
                || lower_msg.contains("sekarang saya update")
                || lower_msg.contains("saya edit sekarang")
                || lower_msg.contains("saya eksekusi sekarang")
                || lower_msg.contains("akan saya edit")
                || lower_msg.contains("akan saya update")
                || lower_msg.contains("akan saya eksekusi")
                || lower_msg.contains("eksekusi sekarang")
                || lower_msg.contains("sedang proses")
                || lower_msg.contains("tunggu sebentar")
                || lower_msg.contains("updating now")
                || (read_tool_executed && !mutation_tool_executed && _step <= 2 && msg_text.lines().count() > 2);

            let lower_prompt = prompt_text.to_lowercase();
            let user_requested_mutation = lower_prompt.contains("update")
                || lower_prompt.contains("rekap")
                || lower_prompt.contains("masukkan")
                || lower_prompt.contains("masukan")
                || lower_prompt.contains("masukin")
                || lower_prompt.contains("tambahkan")
                || lower_prompt.contains("tambah")
                || lower_prompt.contains("simpan")
                || lower_prompt.contains("catat")
                || lower_prompt.contains("ubah")
                || lower_prompt.contains("edit")
                || lower_prompt.contains("pindahkan")
                || lower_prompt.contains("pindah")
                || lower_prompt.contains("hapus")
                || lower_prompt.contains("buang")
                || lower_prompt.contains("hilangkan")
                || lower_prompt.contains("ganti")
                || lower_prompt.contains("write")
                || lower_prompt.contains("save")
                || lower_prompt.contains("insert")
                || lower_prompt.contains("add");

            let should_intercept = (claims_mutation || (user_requested_mutation && (_step == 0 || read_tool_executed)))
                && !mutation_tool_executed
                && _step < 4;

            if should_intercept {
                crate::paths::log_engine(
                    "ai",
                    "🛡️ Guardrail triggered: Model attempted to conclude without calling mutation tools. Intercepting turn.",
                );
                chat_messages.push(json!({
                    "role": "assistant",
                    "content": msg_text
                }));
                chat_messages.push(json!({
                    "role": "user",
                    "content": "CRITICAL SYSTEM GUARD: You generated conversational text ('saya edit sekarang' / apologies / claiming changes), but NO tool call was executed! Nothing was read or saved to disk. You MUST invoke the `read` or `edit` tool RIGHT NOW. Do NOT output conversational text or promises. Output the tool call directly."
                }));
                continue;
            }

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
            let args_val: Value =
                serde_json::from_str(args_str).unwrap_or_else(|_| json!({}));
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
            let tool_out = execute_tool_call(
                session_id,
                &assistant_msg_id,
                &call_id,
                &fn_name,
                &args_val,
                workspace_dir,
            )
            .await;

            let fn_lower = fn_name.to_lowercase();
            if fn_lower.starts_with("arunakizen_")
                || fn_lower.starts_with("zen_")
                || fn_lower.starts_with("pos_")
                || fn_lower == "edit_sale_order"
                || fn_lower == "void_sale_order"
            {
                zen_tool_executed = true;
            }
            if matches!(
                fn_lower.as_str(),
                "read" | "read_file" | "excel_read" | "word_read" | "ppt_read" | "pdf_read" | "image_ocr" | "ocr" | "grep" | "glob"
            ) {
                read_tool_executed = true;
            }
            if matches!(
                fn_lower.as_str(),
                "edit" | "edit_file" | "apply_patch" | "write" | "write_file" | "create_file" | "excel_com" | "word_com" | "ppt_com" | "bash" | "shell" | "terminal"
            ) {
                if tool_out.get("error").is_none() {
                    mutation_tool_executed = true;
                }
            }
            let tool_out_str =
                serde_json::to_string_pretty(&tool_out).unwrap_or_else(|_| "{}".to_string());
            let tool_end = now_ms();
            let tool_dur = tool_end.saturating_sub(tool_start);
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

            content_parts.push(json!({
                "type": "tool",
                "id": call_id,
                "name": fn_name,
                "state": {
                    "status": "completed",
                    "input": args_val,
                    "structured": tool_out,
                    "content": [{ "type": "text", "text": tool_out_str }],
                    "attachments": []
                },
                "time": { "created": tool_start, "completed": tool_end }
            }));

            chat_messages.push(json!({
                "role": "tool",
                "tool_call_id": call_id,
                "name": fn_name,
                "content": tool_out_str
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

pub async fn run_direct_prompt(workspace_dir: &str, prompt_text: &str) -> String {
    let dir = normalize_workspace_path(workspace_dir);
    let session_id = format!("ses_tg_{}", now_ms());
    let model_ref = default_model_ref();
    let provider_id = model_ref
        .get("providerID")
        .and_then(|v| v.as_str())
        .unwrap_or("local-cli")
        .to_string();
    let model_id = model_ref
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("kiro/auto")
        .to_string();

    run_agent_turn(&session_id, &dir, &provider_id, &model_id, &[], prompt_text, None).await;

    with_store(|store| {
        store
            .messages
            .get(&session_id)
            .and_then(|msgs| msgs.last())
            .and_then(|last| last.get("content"))
            .and_then(|c| c.as_array())
            .and_then(|arr| {
                arr.iter()
                    .find_map(|p| p.get("text").and_then(|t| t.as_str()))
            })
            .unwrap_or("Done.")
            .to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_zen_fake_action_detection() {
        assert!(claims_zen_action(
            &"Struk fisik sudah keluar dari printer dan laci kasir sudah terbuka!".to_lowercase()
        ));
        assert!(claims_zen_action(&"invoice r43-281026001 berhasil diedit".to_lowercase()));
        assert!(!claims_zen_action("halo, ada yang bisa saya bantu?"));
        assert!(!claims_zen_action("file laporan-harian.txt sudah berhasil diedit"));
        assert!(requests_zen_action("cetak lah stuknya"));
        assert!(requests_zen_action("cetak invoice r43-281026001"));
        assert!(!requests_zen_action("coba edit lagi dan uang nya pas buat"));
        assert!(!requests_zen_action("pengeluaran jnt nya belum ditambahkan"));
        assert!(!requests_zen_action("masih ada ini kamu belum ada edit lagi"));
        assert!(!requests_zen_action("halo"));
        assert!(claims_zen_action_soft("selesai! total 181.000"));
    }

    #[test]
    fn test_derive_session_title() {
        assert_eq!(
            derive_session_title("KPM POLO BLACK\nL 18\n\nMAROON"),
            "KPM POLO BLACK"
        );
        assert_eq!(
            derive_session_title("# Laporan Keuangan Harian"),
            "Laporan Keuangan Harian"
        );
        assert_eq!(
            derive_session_title("- cetak invoice toko"),
            "cetak invoice toko"
        );
        assert_eq!(
            derive_session_title("🧾 Struk — R43-241026010"),
            "Struk — R43-241026010"
        );
        assert_eq!(
            derive_session_title(""),
            "New Session"
        );
    }
}
