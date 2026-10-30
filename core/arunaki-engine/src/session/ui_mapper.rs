//! High-performance Rust UI Message Mapper & Reasoning Stripper.
//!
//! Offloads:
//! 1. Regex stripping of `<think>...</think>` tags and reasoning extraction.
//! 2. Antigravity-style tool step label formatting (`format_tool_step_label`).
//! 3. Internal dotfile tool invocation suppression (`.arunaki`, `.git`, `arunaki.md`).
//! 4. Thought timing calculation (`thoughtMs`, `thoughtSec`).
//! 5. Consecutive assistant turn merging and reasoning paragraph deduplication.

use serde_json::{json, Value};
use std::collections::HashSet;

/// Returns `true` if a tool invocation targets internal files like `.arunaki`, `.git`, or `ARUNAKI.md`.
pub fn is_internal_tool_target(val: &Value) -> bool {
    let input = val
        .get("state")
        .and_then(|s| s.get("input"))
        .or_else(|| val.get("input"))
        .or_else(|| val.get("args"))
        .or_else(|| val.pointer("/toolInvocation/args"))
        .unwrap_or(val);

    let target_str = input
        .get("TargetFile")
        .or_else(|| input.get("targetFile"))
        .or_else(|| input.get("path"))
        .or_else(|| input.get("filePath"))
        .or_else(|| input.get("file"))
        .or_else(|| input.get("command"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if target_str.is_empty() {
        return false;
    }

    let normalized = target_str.replace('\\', "/");
    let lower = normalized.to_lowercase();
    if lower.contains(".arunaki") || lower.contains(".git") || lower.contains("arunaki.md") {
        return true;
    }

    for segment in normalized.split('/') {
        if !segment.is_empty() && segment != "." && segment != ".." && segment.starts_with('.') {
            return true;
        }
    }

    false
}

/// Cleans paired and unclosed `<think>...</think>` tags from text, returning `(clean_text, extracted_thoughts)`.
pub fn clean_reasoning_tags(text: &str) -> (String, Vec<String>) {
    if text.is_empty() {
        return (String::new(), Vec::new());
    }

    let mut thoughts = Vec::new();
    let mut remaining = text.to_string();

    // 1. Extract closed <think>...</think> blocks (case-insensitive)
    loop {
        let lower = remaining.to_lowercase();
        if let Some(start_idx) = lower.find("<think>") {
            let after_open = start_idx + 7;
            if let Some(end_offset) = lower[after_open..].find("</think>") {
                let end_idx = after_open + end_offset;
                let thought = remaining[after_open..end_idx].trim().to_string();
                if !thought.is_empty() {
                    thoughts.push(thought);
                }
                let mut next_str = remaining[..start_idx].to_string();
                next_str.push_str(&remaining[end_idx + 8..]);
                remaining = next_str;
                continue;
            }
        }
        break;
    }

    // 2. Extract unclosed <think>... until end
    let lower = remaining.to_lowercase();
    if let Some(start_idx) = lower.find("<think>") {
        let after_open = start_idx + 7;
        let thought = remaining[after_open..].trim().to_string();
        if !thought.is_empty() {
            thoughts.push(thought);
        }
        remaining = remaining[..start_idx].to_string();
    }

    // 3. Strip any stray </think> tags
    let clean = remaining
        .replace("</think>", "")
        .replace("</THINK>", "")
        .replace("<think>", "")
        .replace("<THINK>", "")
        .trim()
        .to_string();

    (clean, thoughts)
}

/// Clean Antigravity-style label formatter for tool invocations.
pub fn format_tool_step_label(tool_name: &str, args_or_target: &Value, is_finished: bool) -> String {
    let t = tool_name.to_lowercase();

    let mut target = String::new();
    let mut query_text = String::new();
    let mut batch_count = 0usize;
    let mut invoice_no = String::new();
    let mut item_code = String::new();

    if let Some(s) = args_or_target.as_str() {
        let trimmed = s.trim();
        if !trimmed.starts_with("completed")
            && !trimmed.starts_with("failed")
            && !trimmed.starts_with("executing")
        {
            target = trimmed.to_string();
        }
    } else if let Some(obj) = args_or_target.as_object() {
        target = obj
            .get("TargetFile")
            .or_else(|| obj.get("targetFile"))
            .or_else(|| obj.get("path"))
            .or_else(|| obj.get("filePath"))
            .or_else(|| obj.get("file"))
            .or_else(|| obj.get("pattern"))
            .or_else(|| obj.get("CommandLine"))
            .or_else(|| obj.get("commandLine"))
            .or_else(|| obj.get("command"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        if let Some(q) = obj
            .get("query")
            .or_else(|| obj.get("q"))
            .or_else(|| obj.get("search"))
            .and_then(|v| v.as_str())
        {
            query_text = q.trim().to_string();
        }

        if let Some(queries) = obj.get("queries").and_then(|v| v.as_array()) {
            batch_count = queries.len();
            if let Some(first) = queries.first().and_then(|v| v.as_str()) {
                query_text = first.trim().to_string();
            }
        }

        if let Some(items) = obj.get("items").and_then(|v| v.as_array()) {
            batch_count = items.len();
        }

        if let Some(inv) = obj.get("invoice").and_then(|v| v.as_str()) {
            invoice_no = inv.trim().to_string();
        }
        if let Some(code) = obj.get("item_code").and_then(|v| v.as_str()) {
            item_code = code.trim().to_string();
        }
    }

    let normalized_target = target.replace('\\', "/");
    let raw_file_name = normalized_target
        .split('/')
        .filter(|s| !s.is_empty())
        .last()
        .unwrap_or(&target)
        .to_string();

    let is_internal = raw_file_name.starts_with('.')
        || raw_file_name.eq_ignore_ascii_case("arunaki.md")
        || normalized_target.contains(".arunaki")
        || normalized_target.contains(".git");

    let file_name = if is_internal { "" } else { &raw_file_name };

    // 1. POS / Retail
    if t.contains("pos") || t.contains("arunakizen") {
        if t.contains("search") || t.contains("product") || t.contains("katalog") || t.contains("catalog") {
            if batch_count > 1 {
                return if is_finished { format!("Searched catalog ({} items)", batch_count) } else { format!("Searching catalog ({} items)", batch_count) };
            }
            if !query_text.is_empty() {
                return if is_finished { format!("Searched catalog: {}", query_text) } else { format!("Searching catalog: {}", query_text) };
            }
            return if is_finished { "Searched product catalog".to_string() } else { "Searching product catalog".to_string() };
        }
        if t.contains("void") || t.contains("cancel") || t.contains("batal") {
            if !invoice_no.is_empty() {
                return if is_finished { format!("Voided sales order: {}", invoice_no) } else { format!("Voiding sales order: {}", invoice_no) };
            }
            return if is_finished { "Voided sales order".to_string() } else { "Voiding sales order".to_string() };
        }
        if t.contains("order") || t.contains("sale") || t.contains("transaksi") {
            if t.contains("edit") || t.contains("ubah") {
                if !invoice_no.is_empty() {
                    return if is_finished { format!("Edited sales order: {}", invoice_no) } else { format!("Editing sales order: {}", invoice_no) };
                }
                return if is_finished { "Edited sales order".to_string() } else { "Editing sales order".to_string() };
            }
            if batch_count > 0 {
                return if is_finished { format!("Created sales order ({} items)", batch_count) } else { format!("Creating sales order ({} items)", batch_count) };
            }
            return if is_finished { "Created sales order".to_string() } else { "Creating sales order".to_string() };
        }
        if t.contains("print") || t.contains("receipt") || t.contains("struk") {
            if !invoice_no.is_empty() {
                return if is_finished { format!("Printed receipt: {}", invoice_no) } else { format!("Printing receipt: {}", invoice_no) };
            }
            return if is_finished { "Printed customer receipt".to_string() } else { "Printing customer receipt".to_string() };
        }
        if t.contains("drawer") || t.contains("laci") {
            return if is_finished { "Opened cash drawer".to_string() } else { "Opening cash drawer".to_string() };
        }
        if t.contains("stock") || t.contains("stok") {
            if !item_code.is_empty() {
                return if is_finished { format!("Adjusted stock: {}", item_code) } else { format!("Adjusting stock: {}", item_code) };
            }
            return if is_finished { "Adjusted inventory stock".to_string() } else { "Adjusting inventory stock".to_string() };
        }
    }

    // 2. ArtCraft Document apps
    if t == "open_document_app" || t == "open_app" || t == "launch_app" {
        let raw_app = args_or_target
            .get("app")
            .or_else(|| args_or_target.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or(&target);
        let app_lower = raw_app.to_lowercase();
        let app_name = if app_lower.contains("word") {
            "WordCraft"
        } else if app_lower.contains("grid") || app_lower.contains("excel") {
            "GridCraft"
        } else if app_lower.contains("pdf") {
            "PdfCraft"
        } else if app_lower.contains("deck") || app_lower.contains("slide") {
            "DeckCraft"
        } else {
            "Document App"
        };
        return if is_finished { format!("Opened {}", app_name) } else { format!("Opening {}", app_name) };
    }

    // 3. Questions
    if t == "question" || t.contains("ask_question") {
        return if is_finished { "Asked clarification question".to_string() } else { "Asking clarification question".to_string() };
    }

    // 4. Read / view
    if t == "read" || t == "read_file" || t == "view_file" {
        if !file_name.is_empty() {
            return if is_finished { format!("Explored {}", file_name) } else { format!("Reading {}", file_name) };
        }
        return if is_finished { "Explored workspace".to_string() } else { "Exploring workspace".to_string() };
    }
    if t == "list_dir" || t == "glob" {
        if !file_name.is_empty() {
            return if is_finished { format!("Explored folder {}", file_name) } else { format!("Exploring folder {}", file_name) };
        }
        return if is_finished { "Explored workspace".to_string() } else { "Exploring workspace".to_string() };
    }

    // 5. Edit / write
    if t.contains("replace") || t == "edit" || t == "edit_file" {
        let name = if file_name.is_empty() { "file" } else { file_name };
        return if is_finished { format!("Edited {}", name) } else { format!("Editing {}", name) };
    }
    if t.contains("write") || t == "create_file" {
        let name = if file_name.is_empty() { "file" } else { file_name };
        return if is_finished { format!("Created {}", name) } else { format!("Writing {}", name) };
    }

    // 6. Excel
    if t.contains("excel") {
        let name = if file_name.is_empty() { "" } else { file_name };
        if t.contains("batch") {
            return if is_finished { format!("Batch updated Excel {}", name).trim().to_string() } else { format!("Batch updating Excel {}", name).trim().to_string() };
        }
        if t.contains("read") || t.contains("view") {
            return if is_finished { format!("Read Excel {}", name).trim().to_string() } else { format!("Reading Excel {}", name).trim().to_string() };
        }
        return if is_finished { format!("Updated Excel {}", name).trim().to_string() } else { format!("Updating Excel {}", name).trim().to_string() };
    }

    // 7. Word
    if t.contains("word") || t.contains("docx") {
        let name = if file_name.is_empty() { "" } else { file_name };
        if t.contains("read") || t.contains("view") {
            return if is_finished { format!("Read Word {}", name).trim().to_string() } else { format!("Reading Word {}", name).trim().to_string() };
        }
        return if is_finished { format!("Updated Word {}", name).trim().to_string() } else { format!("Updating Word {}", name).trim().to_string() };
    }

    // 8. Command
    if t == "run_command" || t == "bash" || t == "powershell" {
        let preview: String = target.chars().take(30).collect();
        let cmd = if preview.is_empty() { "command" } else { &preview };
        return if is_finished { format!("Ran {}", cmd) } else { format!("Running {}", cmd) };
    }

    // 9. Search
    if t.contains("knowledge") || t.contains("memory") {
        if !query_text.is_empty() {
            return if is_finished { format!("Searched knowledge: {}", query_text) } else { format!("Searching knowledge: {}", query_text) };
        }
        return if is_finished { "Searched knowledge base".to_string() } else { "Searching knowledge base".to_string() };
    }
    if t.contains("search") || t.contains("grep") {
        let q = if !query_text.is_empty() { &query_text } else { &target };
        if !q.is_empty() {
            return if is_finished { format!("Searched for {}", q) } else { format!("Searching for {}", q) };
        }
        return if is_finished { "Searched workspace".to_string() } else { "Searching workspace".to_string() };
    }

    // Fallback
    let disp = if tool_name.is_empty() { "action" } else { tool_name };
    if !file_name.is_empty() {
        if is_finished { format!("{}: {}", disp, file_name) } else { format!("Running {}: {}", disp, file_name) }
    } else {
        if is_finished { format!("Executed {}", disp) } else { format!("Executing {}", disp) }
    }
}

/// Transforms raw stored session messages into clean, UI-ready messages:
/// - Filters internal compaction/system noise.
/// - Parses and cleans reasoning blocks (`<think>`).
/// - Builds Antigravity step labels for tools.
/// - Calculates thought duration in ms/sec.
/// - Merges consecutive assistant messages.
pub fn map_messages_for_ui(raw_messages: &[Value]) -> Vec<Value> {
    if raw_messages.is_empty() {
        return Vec::new();
    }

    // 1. Filter out compaction, system, and summary messages
    let mut filtered: Vec<&Value> = raw_messages
        .iter()
        .filter(|m| {
            let t = m.get("type").or_else(|| m.get("role")).and_then(|v| v.as_str()).unwrap_or("");
            if matches!(t, "compaction" | "system" | "model-switched" | "plan") {
                return false;
            }
            if m.get("agent").and_then(|v| v.as_str()) == Some("compaction") {
                return false;
            }
            if m.get("mode").and_then(|v| v.as_str()) == Some("compaction") {
                return false;
            }
            if m.get("summary").and_then(|v| v.as_bool()) == Some(true)
                || m.pointer("/info/summary").and_then(|v| v.as_bool()) == Some(true)
            {
                return false;
            }
            true
        })
        .collect();

    // 2. Sort chronologically
    filtered.sort_by_key(|m| {
        m.pointer("/time/created")
            .or_else(|| m.get("time_created"))
            .or_else(|| m.pointer("/time/start"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0)
    });

    let mut individual_messages: Vec<Value> = Vec::with_capacity(filtered.len());

    for (idx, msg) in filtered.iter().enumerate() {
        let raw_type = msg.get("type").or_else(|| msg.get("role")).and_then(|v| v.as_str()).unwrap_or("");
        let role = if raw_type == "user" { "user" } else { "assistant" };

        let mut content = String::new();
        let mut reasoning = String::new();
        let mut execution_steps: Vec<Value> = Vec::new();
        let mut thought_sec: Option<u64> = None;
        let mut thought_ms: Option<u64> = None;
        let mut parts: Vec<Value> = Vec::new();

        // A. Extract text & reasoning from msg.content
        if let Some(s) = msg.get("content").and_then(|v| v.as_str()) {
            content = s.to_string();
        } else if let Some(s) = msg.get("text").and_then(|v| v.as_str()) {
            content = s.to_string();
        } else if let Some(arr) = msg.get("content").and_then(|v| v.as_array()) {
            let mut reasoning_chunks = Vec::new();
            let mut total_reasoning_time = 0u64;

            for p in arr {
                let p_type = p.get("type").and_then(|v| v.as_str()).unwrap_or("");
                if p_type == "reasoning" {
                    if let Some(t) = p.get("text").and_then(|v| v.as_str()) {
                        reasoning_chunks.push(t.to_string());
                    }
                    if let (Some(start), Some(end)) = (
                        p.pointer("/time/start").and_then(|v| v.as_u64()),
                        p.pointer("/time/end").and_then(|v| v.as_u64()),
                    ) {
                        if end > start {
                            total_reasoning_time += end - start;
                        }
                    }
                } else if (p_type == "text" || p_type.is_empty()) && p.get("text").is_some() {
                    if let Some(t) = p.get("text").and_then(|v| v.as_str()) {
                        content.push_str(t);
                    }
                } else if (p_type == "tool" || p_type == "tool-invocation") && !is_internal_tool_target(p) {
                    let tool_name = p
                        .get("name")
                        .or_else(|| p.get("tool"))
                        .or_else(|| p.pointer("/toolInvocation/toolName"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("action");
                    let input = p
                        .pointer("/state/input")
                        .or_else(|| p.get("input"))
                        .or_else(|| p.get("args"))
                        .unwrap_or(&Value::Null);
                    let is_error = p.pointer("/state/status").and_then(|v| v.as_str()) == Some("error")
                        || p.get("error").is_some();
                    let status = if is_error {
                        "failed"
                    } else if p.pointer("/state/status").and_then(|v| v.as_str()) == Some("running") {
                        "running"
                    } else {
                        "completed"
                    };
                    let label = format_tool_step_label(tool_name, input, status == "completed");
                    execution_steps.push(json!({
                        "id": format!("tool-{}-{}", idx, execution_steps.len()),
                        "label": label,
                        "status": status,
                        "iconType": "tool",
                        "toolName": tool_name,
                    }));
                }
            }

            if !reasoning_chunks.is_empty() {
                reasoning = reasoning_chunks.join("\n\n");
            }
            if total_reasoning_time > 0 {
                thought_ms = Some(total_reasoning_time);
                thought_sec = Some((total_reasoning_time / 1000).max(1));
            }
        }

        // B. Calculate thought timing fallback
        if role == "assistant" && thought_sec.is_none() {
            let start = msg.pointer("/time/created")
                .or_else(|| msg.get("time_created"))
                .or_else(|| msg.pointer("/time/start"))
                .and_then(|v| v.as_u64());
            let end = msg.pointer("/time/updated")
                .or_else(|| msg.get("time_updated"))
                .or_else(|| msg.pointer("/time/end"))
                .and_then(|v| v.as_u64());
            if let (Some(s), Some(e)) = (start, end) {
                if e > s {
                    let dur = e - s;
                    thought_ms = Some(dur);
                    thought_sec = Some((dur / 1000).max(1));
                } else {
                    thought_ms = Some(488);
                    thought_sec = Some(1);
                }
            }
        }

        // C. Clean reasoning tags from content
        let (cleaned_content, extracted_thoughts) = clean_reasoning_tags(&content);
        if !extracted_thoughts.is_empty() {
            if !reasoning.is_empty() {
                reasoning.push_str("\n\n");
            }
            reasoning.push_str(&extracted_thoughts.join("\n\n"));
        }
        content = cleaned_content;

        // D. Build parts array
        if role == "assistant" {
            if !reasoning.is_empty() {
                parts.push(json!({
                    "type": "thought",
                    "text": reasoning.trim(),
                    "durationSec": thought_sec,
                    "durationMs": thought_ms,
                }));
            }
            for step in &execution_steps {
                parts.push(json!({
                    "type": "tool",
                    "step": step,
                }));
            }
            if !content.is_empty() {
                parts.push(json!({
                    "type": "text",
                    "text": content.trim(),
                }));
            }
        }

        let mid = msg
            .get("id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("{}-{}-{}", role, idx, crate::paths::now_ms()));

        individual_messages.push(json!({
            "id": mid,
            "role": role,
            "content": content,
            "reasoning": if reasoning.is_empty() { Value::Null } else { Value::String(reasoning.trim().to_string()) },
            "executionSteps": if execution_steps.is_empty() { Value::Null } else { json!(execution_steps) },
            "thoughtSec": thought_sec,
            "thoughtMs": thought_ms,
            "parts": if parts.is_empty() { Value::Null } else { json!(parts) },
            "createdAt": msg.get("createdAt").or_else(|| msg.pointer("/time/created")),
            "summary": false,
            "isRustMapped": true,
        }));
    }

    // 3. Merge consecutive assistant messages belonging to the same turn
    let mut merged: Vec<Value> = Vec::with_capacity(individual_messages.len());
    for m in individual_messages {
        let is_asst = m.get("role").and_then(|v| v.as_str()) == Some("assistant");
        let last_is_asst = merged
            .last()
            .and_then(|last| last.get("role").and_then(|v| v.as_str()))
            == Some("assistant");

        if is_asst && last_is_asst {
            let last = merged.last_mut().unwrap();
            let new_content = m.get("content").and_then(|v| v.as_str()).unwrap_or("");
            if !new_content.is_empty() {
                let existing = last.get("content").and_then(|v| v.as_str()).unwrap_or("");
                let combined = if existing.is_empty() {
                    new_content.to_string()
                } else {
                    format!("{}\n\n{}", existing, new_content)
                };
                last["content"] = Value::String(combined);
            }

            // Merge reasoning with paragraph deduplication
            let new_reasoning = m.get("reasoning").and_then(|v| v.as_str()).unwrap_or("");
            if !new_reasoning.is_empty() {
                let existing_reasoning = last
                    .get("reasoning")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if existing_reasoning.is_empty() {
                    last["reasoning"] = Value::String(new_reasoning.to_string());
                } else {
                    let mut seen = HashSet::new();
                    for para in existing_reasoning.split("\n\n") {
                        seen.insert(para.trim());
                    }
                    let mut combined = existing_reasoning.to_string();
                    for para in new_reasoning.split("\n\n") {
                        let trimmed = para.trim();
                        if !trimmed.is_empty() && !seen.contains(trimmed) {
                            seen.insert(trimmed);
                            combined.push_str("\n\n");
                            combined.push_str(trimmed);
                        }
                    }
                    last["reasoning"] = Value::String(combined);
                }
            }

            // Append parts
            if let Some(new_parts) = m.get("parts").and_then(|v| v.as_array()) {
                if let Some(old_parts) = last.get_mut("parts").and_then(|v| v.as_array_mut()) {
                    old_parts.extend(new_parts.clone());
                } else {
                    last["parts"] = json!(new_parts);
                }
            }

            last["id"] = m["id"].clone();
        } else {
            merged.push(m);
        }
    }

    merged
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleans_closed_and_unclosed_thinking_tags() {
        let raw = "Halo! <think>Menganalisis file dokumen...</think> Ini laporannya.";
        let (clean, thoughts) = clean_reasoning_tags(raw);
        assert_eq!(clean, "Halo!  Ini laporannya.");
        assert_eq!(thoughts.len(), 1);
        assert_eq!(thoughts[0], "Menganalisis file dokumen...");

        let unclosed = "Langkah awal. <think>Memproses kalkulasi total";
        let (clean2, thoughts2) = clean_reasoning_tags(unclosed);
        assert_eq!(clean2, "Langkah awal.");
        assert_eq!(thoughts2.len(), 1);
        assert_eq!(thoughts2[0], "Memproses kalkulasi total");
    }

    #[test]
    fn formats_antigravity_step_labels() {
        let label1 = format_tool_step_label(
            "read_file",
            &json!({ "filePath": "laporan_keuangan.xlsx" }),
            true,
        );
        assert_eq!(label1, "Explored laporan_keuangan.xlsx");

        let label2 = format_tool_step_label(
            "open_document_app",
            &json!({ "app": "gridcraft" }),
            false,
        );
        assert_eq!(label2, "Opening GridCraft");

        let label3 = format_tool_step_label(
            "pos_search_product",
            &json!({ "query": "Kopi Susu" }),
            true,
        );
        assert_eq!(label3, "Searched catalog: Kopi Susu");
    }

    #[test]
    fn detects_internal_tool_targets() {
        assert!(is_internal_tool_target(&json!({ "path": ".arunaki/tasks.json" })));
        assert!(is_internal_tool_target(&json!({ "filePath": "docs/ARUNAKI.md" })));
        assert!(!is_internal_tool_target(&json!({ "filePath": "src/App.tsx" })));
    }
}

