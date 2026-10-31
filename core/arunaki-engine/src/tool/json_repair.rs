//! Robust JSON Tool Argument Repair & Syntax Recovery.
//!
//! Models occasionally output malformed JSON in tool call arguments (e.g. unescaped newlines
//! in multiline text, trailing commas, markdown code blocks, or truncated brackets).
//! Instead of silently collapsing malformed arguments to `{}` (which breaks tools with misleading errors),
//! this module repairs recoverable syntax errors and returns descriptive errors for unrecoverable ones.

use serde_json::{json, Value};

/// Attempts to parse a tool argument string into a `serde_json::Value`.
///
/// 1. Fast path: native `serde_json::from_str`.
/// 2. If it's a double-stringified JSON string, unwrap and parse the inner string.
/// 3. Strip markdown code fences (```json ... ```).
/// 4. Repair unescaped control characters (literal newlines/tabs inside quotes).
/// 5. Strip trailing commas before closing braces/brackets.
/// 6. Auto-close truncated strings/braces/brackets.
///
/// Returns `Ok(Value)` on success or repair, or `Err(String)` with an actionable diagnostic.
pub fn parse_or_repair_tool_args(raw: &str) -> Result<Value, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(json!({}));
    }

    // 1. Fast path
    if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
        // If the LLM returned a JSON-encoded string containing JSON, unwrap it
        if let Some(inner_str) = val.as_str() {
            let inner_trimmed = inner_str.trim();
            if (inner_trimmed.starts_with('{') && inner_trimmed.ends_with('}'))
                || (inner_trimmed.starts_with('[') && inner_trimmed.ends_with(']'))
            {
                if let Ok(inner_val) = serde_json::from_str::<Value>(inner_trimmed) {
                    return Ok(inner_val);
                }
            }
        }
        return Ok(val);
    }

    // 2. Strip markdown fences
    let mut candidate = strip_markdown_fences(trimmed).to_string();

    if let Ok(val) = serde_json::from_str::<Value>(&candidate) {
        return Ok(val);
    }

    // 3. Repair unescaped newlines and tabs inside string literals
    candidate = escape_control_chars_in_strings(&candidate);
    if let Ok(val) = serde_json::from_str::<Value>(&candidate) {
        return Ok(val);
    }

    // 4. Remove trailing commas before } or ]
    candidate = remove_trailing_commas(&candidate);
    if let Ok(val) = serde_json::from_str::<Value>(&candidate) {
        return Ok(val);
    }

    // 5. Auto-close unclosed quotes and brackets
    candidate = auto_close_json_brackets(&candidate);
    if let Ok(val) = serde_json::from_str::<Value>(&candidate) {
        return Ok(val);
    }

    // 6. Attempt single quote to double quote conversion if single quotes are present
    if candidate.contains('\'') {
        let single_quote_repaired = repair_single_quotes(&candidate);
        if let Ok(val) = serde_json::from_str::<Value>(&single_quote_repaired) {
            return Ok(val);
        }
    }

    // Final failure with diagnostic
    let preview: String = raw.chars().take(120).collect();
    Err(format!(
        "Failed to parse tool call arguments as JSON: '{}'. Please provide well-formed JSON object syntax.",
        preview
    ))
}

/// Strips ```` ```json ```` and ```` ``` ```` wrapper fences.
fn strip_markdown_fences(s: &str) -> &str {
    let mut cleaned = s.trim();
    if cleaned.starts_with("```") {
        if let Some(first_newline) = cleaned.find('\n') {
            cleaned = &cleaned[first_newline + 1..];
        } else {
            cleaned = cleaned.trim_start_matches('`');
        }
    }
    if cleaned.ends_with("```") {
        cleaned = cleaned.trim_end_matches('`').trim_end();
    }
    cleaned.trim()
}

/// Escapes literal newlines, carriage returns, and unescaped tabs inside string literals.
fn escape_control_chars_in_strings(input: &str) -> String {
    let mut output = String::with_capacity(input.len() + 32);
    let mut in_string = false;
    let mut escape_active = false;

    for ch in input.chars() {
        if escape_active {
            output.push(ch);
            escape_active = false;
            continue;
        }

        if ch == '\\' {
            escape_active = true;
            output.push(ch);
            continue;
        }

        if ch == '"' {
            in_string = !in_string;
            output.push(ch);
            continue;
        }

        if in_string {
            match ch {
                '\n' => output.push_str("\\n"),
                '\r' => output.push_str("\\r"),
                '\t' => output.push_str("\\t"),
                _ => output.push(ch),
            }
        } else {
            output.push(ch);
        }
    }

    output
}

/// Removes trailing commas before `}` or `]`.
fn remove_trailing_commas(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let chars: Vec<char> = input.chars().collect();
    let len = chars.len();
    let mut in_string = false;
    let mut escape_active = false;

    let mut i = 0;
    while i < len {
        let ch = chars[i];

        if escape_active {
            output.push(ch);
            escape_active = false;
            i += 1;
            continue;
        }

        if ch == '\\' {
            escape_active = true;
            output.push(ch);
            i += 1;
            continue;
        }

        if ch == '"' {
            in_string = !in_string;
            output.push(ch);
            i += 1;
            continue;
        }

        if !in_string && ch == ',' {
            // Check if next non-whitespace char is } or ]
            let mut j = i + 1;
            while j < len && chars[j].is_whitespace() {
                j += 1;
            }
            if j < len && (chars[j] == '}' || chars[j] == ']') {
                // Skip the comma
                i += 1;
                continue;
            }
        }

        output.push(ch);
        i += 1;
    }

    output
}

/// Closes any unclosed string literals and matching braces/brackets.
fn auto_close_json_brackets(input: &str) -> String {
    let mut output = input.to_string();
    let mut in_string = false;
    let mut escape_active = false;
    let mut stack = Vec::new();

    for ch in input.chars() {
        if escape_active {
            escape_active = false;
            continue;
        }
        if ch == '\\' {
            escape_active = true;
            continue;
        }
        if ch == '"' {
            in_string = !in_string;
            continue;
        }
        if !in_string {
            match ch {
                '{' => stack.push('}'),
                '[' => stack.push(']'),
                '}' => {
                    if let Some(pos) = stack.iter().rposition(|&c| c == '}') {
                        stack.remove(pos);
                    }
                }
                ']' => {
                    if let Some(pos) = stack.iter().rposition(|&c| c == ']') {
                        stack.remove(pos);
                    }
                }
                _ => {}
            }
        }
    }

    if in_string {
        output.push('"');
    }

    while let Some(closing) = stack.pop() {
        output.push(closing);
    }

    output
}

/// Simple heuristic to convert single-quoted JSON keys and strings to double-quoted JSON.
fn repair_single_quotes(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut in_double_quote = false;
    let mut in_single_quote = false;
    let mut escape_active = false;

    for ch in input.chars() {
        if escape_active {
            output.push(ch);
            escape_active = false;
            continue;
        }
        if ch == '\\' {
            escape_active = true;
            output.push(ch);
            continue;
        }
        if ch == '"' && !in_single_quote {
            in_double_quote = !in_double_quote;
            output.push(ch);
            continue;
        }
        if ch == '\'' && !in_double_quote {
            in_single_quote = !in_single_quote;
            output.push('"');
            continue;
        }

        output.push(ch);
    }

    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_json_passes_untouched() {
        let raw = r#"{"filePath": "document.docx", "limit": 100}"#;
        let res = parse_or_repair_tool_args(raw).expect("should parse");
        assert_eq!(res["filePath"], "document.docx");
        assert_eq!(res["limit"], 100);
    }

    #[test]
    fn test_empty_string_gives_empty_object() {
        let res = parse_or_repair_tool_args("").expect("should succeed");
        assert_eq!(res, json!({}));
    }

    #[test]
    fn test_markdown_fence_stripped() {
        let raw = "```json\n{\"filePath\": \"notes.txt\"}\n```";
        let res = parse_or_repair_tool_args(raw).expect("should parse markdown fence");
        assert_eq!(res["filePath"], "notes.txt");
    }

    #[test]
    fn test_trailing_comma_repaired() {
        let raw = r#"{"filePath": "laporan.xlsx", "offset": 50, }"#;
        let res = parse_or_repair_tool_args(raw).expect("should repair trailing comma");
        assert_eq!(res["filePath"], "laporan.xlsx");
        assert_eq!(res["offset"], 50);
    }

    #[test]
    fn test_unescaped_newlines_in_string_repaired() {
        let raw = "{\n  \"filePath\": \"summary.md\",\n  \"content\": \"Line 1\nLine 2\nLine 3\"\n}";
        let res = parse_or_repair_tool_args(raw).expect("should repair literal newlines");
        assert_eq!(res["filePath"], "summary.md");
        assert!(res["content"].as_str().unwrap().contains("Line 2"));
    }

    #[test]
    fn test_double_stringified_json_unwrapped() {
        let raw = r#""{\"filePath\": \"inner.csv\", \"limit\": 5}""#;
        let res = parse_or_repair_tool_args(raw).expect("should unwrap double-stringified json");
        assert_eq!(res["filePath"], "inner.csv");
        assert_eq!(res["limit"], 5);
    }

    #[test]
    fn test_unclosed_brace_auto_closed() {
        let raw = r#"{"filePath": "cut_off.txt", "limit": 20"#;
        let res = parse_or_repair_tool_args(raw).expect("should close bracket");
        assert_eq!(res["filePath"], "cut_off.txt");
        assert_eq!(res["limit"], 20);
    }

    #[test]
    fn test_unclosed_string_and_brace_auto_closed() {
        let raw = r#"{"filePath": "draft.txt", "notes": "still writing"#;
        let res = parse_or_repair_tool_args(raw).expect("should close quote and bracket");
        assert_eq!(res["filePath"], "draft.txt");
        assert_eq!(res["notes"], "still writing");
    }

    #[test]
    fn test_single_quotes_repaired() {
        let raw = "{'filePath': 'single.json', 'action': 'read'}";
        let res = parse_or_repair_tool_args(raw).expect("should repair single quotes");
        assert_eq!(res["filePath"], "single.json");
        assert_eq!(res["action"], "read");
    }

    #[test]
    fn test_unrecoverable_garbage_returns_clear_error() {
        let raw = "This is definitely not a JSON object";
        let err = parse_or_repair_tool_args(raw).expect_err("should return error");
        assert!(err.contains("Failed to parse tool call arguments as JSON"));
    }
}

