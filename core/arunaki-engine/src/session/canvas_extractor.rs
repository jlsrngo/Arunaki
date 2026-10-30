//! Fast Rust Canvas Extractor & Session Canvas History Analyzer.
//!
//! Offloads:
//! 1. Detection of `[CANVAS]...[/CANVAS]` blocks, markdown code blocks, and structured markdown tables.
//! 2. Clean table/document title extraction and emoji stripping.
//! 3. Extraction of recent canvas artifacts from stored session messages (`GET /api/session/:id/canvases`).

use serde_json::{json, Value};

/// Cleans markdown symbols and emojis to produce a clean canvas tab title.
pub fn extract_canvas_title(content: &str) -> String {
    let lines: Vec<&str> = content
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();

    if lines.is_empty() {
        return "Data Table".to_string();
    }

    let first_line = lines[0]
        .trim_start_matches('#')
        .trim()
        .replace(['`', '*', '|', '_'], "")
        .trim()
        .to_string();

    if !first_line.is_empty() && !lines[0].starts_with('|') && first_line.chars().count() <= 40 {
        return first_line;
    }

    if lines[0].starts_with('|') {
        let cells: Vec<&str> = lines[0]
            .split('|')
            .map(|c| c.trim())
            .filter(|c| !c.is_empty())
            .collect();
        if !cells.is_empty() {
            let sample = cells.iter().take(2).copied().collect::<Vec<&str>>().join(" / ");
            return format!("Table: {}", sample);
        }
        return "Data Table".to_string();
    }

    if first_line.chars().count() > 40 {
        let truncated: String = first_line.chars().take(38).collect();
        return format!("{}...", truncated);
    }

    "Data Canvas".to_string()
}

/// Extracts canvas text from an LLM response string:
/// 1. Explicit `[CANVAS]...[/CANVAS]` or streaming `[CANVAS]...`
/// 2. Codeblocks tagged with `canvas`, `deliverable`, `document`, `table`, or `csv`.
/// 3. Formatted markdown tables with header divider row `|---|`.
pub fn extract_canvas_content(text: &str) -> Option<String> {
    if text.is_empty() {
        return None;
    }

    // 1. Explicit completed [CANVAS]...[/CANVAS] (case-insensitive)
    let lower = text.to_lowercase();
    if let Some(open_idx) = lower.find("[canvas]") {
        let after_open = open_idx + 8;
        if let Some(close_offset) = lower[after_open..].find("[/canvas]") {
            let end_idx = after_open + close_offset;
            let snippet = text[after_open..end_idx].trim();
            if snippet.len() >= 10 {
                return Some(snippet.to_string());
            }
        } else {
            // Streaming [CANVAS]...
            let snippet = text[after_open..].trim();
            if snippet.len() >= 15 {
                return Some(snippet.to_string());
            }
        }
    }

    // 2. Fenced codeblock ```canvas, ```deliverable, etc.
    let tags = ["```canvas", "```deliverable", "```document", "```table", "```csv"];
    for tag in tags {
        if let Some(start) = lower.find(tag) {
            let after_tag = start + tag.len();
            if let Some(newline_offset) = text[after_tag..].find('\n') {
                let body_start = after_tag + newline_offset + 1;
                if let Some(end_offset) = text[body_start..].find("```") {
                    let snippet = text[body_start..body_start + end_offset].trim();
                    if snippet.len() >= 10 {
                        return Some(snippet.to_string());
                    }
                }
            }
        }
    }

    // 3. Structured markdown tables
    let lines: Vec<&str> = text.lines().collect();
    let mut first_table_start: Option<usize> = None;
    let mut last_table_end: Option<usize> = None;

    let mut i = 0;
    while i + 1 < lines.len() {
        let l1 = lines[i].trim();
        let l2 = lines[i + 1].trim();
        if l1.starts_with('|') && l1.ends_with('|') && l2.starts_with('|') && l2.ends_with('|') && is_markdown_table_divider(l2) {
            if first_table_start.is_none() {
                let mut p = i as isize - 1;
                while p >= 0 && lines[p as usize].trim().is_empty() {
                    p -= 1;
                }
                if p >= 0 && lines[p as usize].trim().starts_with('#') {
                    first_table_start = Some(p as usize);
                } else {
                    first_table_start = Some(i);
                }
            }
            let mut j = i + 2;
            while j < lines.len() && lines[j].trim().starts_with('|') && lines[j].trim().ends_with('|') {
                j += 1;
            }
            last_table_end = Some(j);
            i = j;
            continue;
        }
        i += 1;
    }

    if let (Some(start), Some(end)) = (first_table_start, last_table_end) {
        let snippet = lines[start..end].join("\n").trim().to_string();
        if snippet.len() >= 20 {
            return Some(snippet);
        }
    }

    None
}

fn is_markdown_table_divider(line: &str) -> bool {
    let trimmed = line.trim();
    if !trimmed.starts_with('|') || !trimmed.ends_with('|') {
        return false;
    }
    let inner = &trimmed[1..trimmed.len() - 1];
    let parts: Vec<&str> = inner.split('|').map(|s| s.trim()).collect();
    if parts.is_empty() {
        return false;
    }
    for part in parts {
        let part_trimmed = part.trim_matches(':');
        if part_trimmed.is_empty() || !part_trimmed.chars().all(|c| c == '-') {
            return false;
        }
    }
    true
}

/// Extracts `(latest_canvas_text, recent_canvases)` from a list of stored messages.
pub fn extract_session_canvases(messages: &[Value]) -> (Option<String>, Vec<Value>) {
    let mut session_canvases: Vec<Value> = Vec::new();
    let mut latest_canvas_text: Option<String> = None;

    for msg in messages.iter().rev() {
        let role = msg.get("role").or_else(|| msg.get("type")).and_then(|v| v.as_str()).unwrap_or("");
        if role != "assistant" {
            continue;
        }

        let content = if let Some(s) = msg.get("content").and_then(|v| v.as_str()) {
            s.to_string()
        } else if let Some(s) = msg.get("text").and_then(|v| v.as_str()) {
            s.to_string()
        } else if let Some(arr) = msg.get("content").and_then(|v| v.as_array()) {
            arr.iter()
                .filter_map(|p| {
                    let pt = p.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    if pt == "text" || pt.is_empty() {
                        p.get("text").and_then(|v| v.as_str())
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
                .join("")
        } else {
            String::new()
        };

        if let Some(canvas_content) = extract_canvas_content(&content) {
            if latest_canvas_text.is_none() {
                latest_canvas_text = Some(canvas_content.clone());
            }

            let already_exists = session_canvases.iter().any(|c| {
                c.get("content")
                    .and_then(|v| v.as_str())
                    .map(|s| s.trim() == canvas_content.trim())
                    .unwrap_or(false)
            });

            if !already_exists {
                let title = extract_canvas_title(&canvas_content);
                let created_at = msg
                    .get("createdAt")
                    .or_else(|| msg.pointer("/time/created"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| crate::paths::now_iso());

                session_canvases.push(json!({
                    "id": format!("canvas-{}-{}", crate::paths::now_ms(), session_canvases.len()),
                    "title": title,
                    "content": canvas_content,
                    "createdAt": created_at,
                }));
            }
        }
    }

    session_canvases.truncate(5);
    (latest_canvas_text, session_canvases)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_canvas_block_and_title() {
        let text = "Berikut rekapitulasinya:\n\n[CANVAS]\n# Rekapitulasi Kas Harian\n| Tanggal | Masuk | Keluar |\n|---|---|---|\n| 2026-10-30 | 1000 | 200 |\n[/CANVAS]\nSelesai.";
        let extracted = extract_canvas_content(text).expect("canvas should be extracted");
        assert!(extracted.contains("# Rekapitulasi Kas Harian"));
        assert!(extracted.contains("| 2026-10-30 | 1000 | 200 |"));

        let title = extract_canvas_title(&extracted);
        assert_eq!(title, "Rekapitulasi Kas Harian");
    }

    #[test]
    fn extracts_markdown_tables_without_explicit_canvas_tags() {
        let text = "Data penjualan:\n| Item | Qty | Harga |\n|:---|:---:|---:|\n| Kopi | 5 | 25000 |\n| Teh | 2 | 10000 |";
        let extracted = extract_canvas_content(text).expect("table should be extracted");
        assert!(extracted.contains("| Kopi | 5 | 25000 |"));
        let title = extract_canvas_title(&extracted);
        assert!(title.contains("Table: Item / Qty"));
    }
}

