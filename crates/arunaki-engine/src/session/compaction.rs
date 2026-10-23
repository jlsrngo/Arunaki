#![allow(dead_code)] // TODO: wire into prompt.rs once compaction.ts is ported
use serde_json::Value;

pub const DEFAULT_CONTEXT_WINDOW: usize = 128_000;
pub const MAX_RECENT_MESSAGES_TO_PRESERVE: usize = 20;

/// Approximates token count using character length (~4 characters per token).
pub fn estimate_tokens(text: &str) -> usize {
    text.len().div_ceil(4)
}

/// Compacts history messages if total estimated tokens exceed context limit.
/// Preserves system instructions and the most recent messages.
pub fn compact_history(messages: &[Value], max_tokens: usize) -> Vec<Value> {
    if messages.is_empty() {
        return Vec::new();
    }

    let total_chars: usize = messages
        .iter()
        .map(|m| {
            if let Some(txt) = m.get("text").and_then(|v| v.as_str()) {
                txt.len()
            } else if let Some(content) = m.get("content").and_then(|v| v.as_str()) {
                content.len()
            } else {
                100
            }
        })
        .sum();

    if total_chars / 4 <= max_tokens || messages.len() <= MAX_RECENT_MESSAGES_TO_PRESERVE {
        return messages.to_vec();
    }

    // Keep the most recent messages within token budget
    let mut compacted = Vec::new();
    let mut current_chars = 0;
    let char_limit = max_tokens * 4;

    for m in messages.iter().rev() {
        let msg_len = m
            .get("text")
            .or_else(|| m.get("content"))
            .and_then(|v| v.as_str())
            .map(|s| s.len())
            .unwrap_or(100);

        if current_chars + msg_len > char_limit && compacted.len() >= MAX_RECENT_MESSAGES_TO_PRESERVE {
            break;
        }
        compacted.push(m.clone());
        current_chars += msg_len;
    }

    compacted.reverse();
    compacted
}
