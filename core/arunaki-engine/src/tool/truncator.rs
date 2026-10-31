//! Tool Output Truncator & Bounded Ingestion Guard.
//!
//! Enforces OpenCode/Claude Code standard limits (50 KB / 2,000 lines) on all tool outputs
//! before they enter the model context, preventing sudden context window exhaustion.

/// Maximum byte limit for a single tool response in the model context.
pub const MAX_TOOL_OUTPUT_BYTES: usize = 50 * 1024; // 50 KB

/// Maximum lines allowed in a single tool response.
pub const MAX_TOOL_OUTPUT_LINES: usize = 2_000;

/// Maximum character length for a single line before truncating.
pub const MAX_LINE_LENGTH: usize = 2_000;

/// Bounds a tool output string to standard limits.
///
/// Returns `(bounded_string, was_truncated)`.
/// If truncated, appends an actionable continuation hint with line and byte metrics.
pub fn bound_tool_output(tool_name: &str, raw_output: &str) -> (String, bool) {
    if raw_output.len() <= MAX_TOOL_OUTPUT_BYTES && !raw_output.contains('\n') {
        return (raw_output.to_string(), false);
    }

    let raw_lines: Vec<&str> = raw_output.lines().collect();
    let total_lines = raw_lines.len();
    let total_bytes = raw_output.len();

    let needs_line_truncation = total_lines > MAX_TOOL_OUTPUT_LINES;
    let needs_byte_truncation = total_bytes > MAX_TOOL_OUTPUT_BYTES;
    let has_oversized_lines = raw_lines.iter().any(|l| l.len() > MAX_LINE_LENGTH);

    if !needs_line_truncation && !needs_byte_truncation && !has_oversized_lines {
        return (raw_output.to_string(), false);
    }

    let mut bounded = String::with_capacity(MAX_TOOL_OUTPUT_BYTES + 512);
    let mut lines_included = 0usize;

    for line in raw_lines.iter().take(MAX_TOOL_OUTPUT_LINES) {
        let clean_line = if line.len() > MAX_LINE_LENGTH {
            format!("{}... [line truncated]", &line[..MAX_LINE_LENGTH])
        } else {
            line.to_string()
        };

        if bounded.len() + clean_line.len() + 1 > MAX_TOOL_OUTPUT_BYTES {
            break;
        }

        if !bounded.is_empty() {
            bounded.push('\n');
        }
        bounded.push_str(&clean_line);
        lines_included += 1;
    }

    let truncated_kb = bounded.len() / 1024;
    let total_kb = (total_bytes + 1023) / 1024;

    bounded.push_str(&format!(
        "\n\n[Output truncated by harness: displayed ~{} KB ({} lines). Total: {} KB ({} lines). In tool '{}', use pagination ('offset' / 'limit') or specific query filters to inspect further.]",
        truncated_kb, lines_included, total_kb, total_lines, tool_name
    ));

    (bounded, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_small_output_passes_unmodified() {
        let small = "{\"status\":\"ok\",\"count\":5}";
        let (output, truncated) = bound_tool_output("test", small);
        assert!(!truncated);
        assert_eq!(output, small);
    }

    #[test]
    fn test_truncates_excessive_lines() {
        let mut lines = Vec::new();
        for i in 1..=3000 {
            lines.push(format!("Row {}", i));
        }
        let raw = lines.join("\n");
        let (output, truncated) = bound_tool_output("read", &raw);

        assert!(truncated);
        assert!(output.contains("[Output truncated by harness"));
        assert!(output.contains("3000 lines"));
        assert!(output.len() <= MAX_TOOL_OUTPUT_BYTES + 1024);
    }

    #[test]
    fn test_truncates_giant_single_line() {
        let giant = "A".repeat(80 * 1024); // 80 KB
        let (output, truncated) = bound_tool_output("read", &giant);

        assert!(truncated);
        assert!(output.contains("[Output truncated by harness"));
        assert!(output.len() <= MAX_TOOL_OUTPUT_BYTES + 1024);
    }
}

