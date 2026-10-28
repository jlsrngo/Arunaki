//! Document Edit Tool — mirrors `packages/opencode/src/tool/edit.ts`.
//! Modifies existing files with CRLF/LF normalization and cascading fuzzy replacers
//! (Simple, LineTrimmed, BlockAnchor, WhitespaceNormalized, IndentationFlexible, TrimmedBoundary).

use serde_json::{json, Value};

use super::resolve_isolated_path;
use crate::session::message::emit_event;

pub fn edit_tool_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "edit",
            "description": include_str!("prompt/edit.txt"),
            "parameters": {
                "type": "object",
                "properties": {
                    "filePath": {
                        "type": "string",
                        "description": "The path to the file to modify (relative to workspace or absolute inside workspace)."
                    },
                    "oldString": {
                        "type": "string",
                        "description": "The text to replace."
                    },
                    "newString": {
                        "type": "string",
                        "description": "The text to replace it with (must be different from oldString)."
                    },
                    "replaceAll": {
                        "type": "boolean",
                        "description": "Replace all occurrences of oldString (default false)."
                    }
                },
                "required": ["filePath", "oldString", "newString"]
            }
        }
    })
}

fn normalize_line_endings(text: &str) -> String {
    text.replace("\r\n", "\n")
}

fn detect_line_ending(text: &str) -> &'static str {
    if text.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    }
}

fn convert_to_line_ending(text: &str, ending: &str) -> String {
    if ending == "\n" {
        text.to_string()
    } else {
        text.replace("\r\n", "\n").replace('\n', "\r\n")
    }
}

fn levenshtein(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let (m, n) = (a_chars.len(), b_chars.len());
    if m == 0 {
        return n;
    }
    if n == 0 {
        return m;
    }
    let mut dp = vec![vec![0usize; n + 1]; m + 1];
    for (i, row) in dp.iter_mut().enumerate().take(m + 1) {
        row[0] = i;
    }
    for j in 0..=n {
        dp[0][j] = j;
    }
    for i in 1..=m {
        for j in 1..=n {
            let cost = usize::from(a_chars[i - 1] != b_chars[j - 1]);
            dp[i][j] = (dp[i - 1][j] + 1)
                .min(dp[i][j - 1] + 1)
                .min(dp[i - 1][j - 1] + cost);
        }
    }
    dp[m][n]
}

fn line_trimmed_matches(content: &str, find: &str) -> Vec<String> {
    let mut out = Vec::new();
    let orig_lines: Vec<&str> = content.split('\n').collect();
    let mut search_lines: Vec<&str> = find.split('\n').collect();
    if search_lines.last() == Some(&"") {
        search_lines.pop();
    }
    if search_lines.is_empty() || search_lines.len() > orig_lines.len() {
        return out;
    }

    for i in 0..=(orig_lines.len() - search_lines.len()) {
        let mut matches = true;
        for j in 0..search_lines.len() {
            if orig_lines[i + j].trim() != search_lines[j].trim() {
                matches = false;
                break;
            }
        }
        if matches {
            out.push(orig_lines[i..i + search_lines.len()].join("\n"));
        }
    }
    out
}

fn block_anchor_matches(content: &str, find: &str) -> Vec<String> {
    let mut out = Vec::new();
    let orig_lines: Vec<&str> = content.split('\n').collect();
    let mut search_lines: Vec<&str> = find.split('\n').collect();
    if search_lines.last() == Some(&"") {
        search_lines.pop();
    }
    if search_lines.len() < 3 || orig_lines.len() < 3 {
        return out;
    }

    let first_search = search_lines[0].trim();
    let last_search = search_lines[search_lines.len() - 1].trim();
    if first_search.is_empty() || last_search.is_empty() {
        return out;
    }

    let search_block_size = search_lines.len();
    let max_delta = (search_block_size / 4).max(1);

    let mut candidates: Vec<(usize, usize)> = Vec::new();
    for i in 0..orig_lines.len() {
        if orig_lines[i].trim() != first_search {
            continue;
        }
        for j in (i + 2)..orig_lines.len() {
            if orig_lines[j].trim() == last_search {
                let actual_size = j - i + 1;
                if actual_size.abs_diff(search_block_size) <= max_delta {
                    candidates.push((i, j));
                }
                break;
            }
        }
    }

    let mut best_match: Option<(usize, usize)> = None;
    let mut best_sim = -1.0_f64;

    for (start, end) in candidates {
        let actual_size = end - start + 1;
        let lines_to_check = (search_block_size.saturating_sub(2)).min(actual_size.saturating_sub(2));
        let sim = if lines_to_check > 0 {
            let mut acc = 0.0_f64;
            for j in 1..=lines_to_check {
                let orig_l = orig_lines[start + j].trim();
                let search_l = search_lines[j].trim();
                let max_len = orig_l.chars().count().max(search_l.chars().count());
                if max_len == 0 {
                    acc += 1.0;
                } else {
                    let dist = levenshtein(orig_l, search_l);
                    acc += 1.0 - (dist as f64 / max_len as f64);
                }
            }
            acc / (lines_to_check as f64)
        } else {
            1.0
        };

        if sim > best_sim {
            best_sim = sim;
            best_match = Some((start, end));
        }
    }

    if best_sim >= 0.65 {
        if let Some((start, end)) = best_match {
            out.push(orig_lines[start..=end].join("\n"));
        }
    }
    out
}

fn whitespace_normalized_matches(content: &str, find: &str) -> Vec<String> {
    let mut out = Vec::new();
    let norm = |s: &str| s.split_whitespace().collect::<Vec<_>>().join(" ");
    let norm_find = norm(find);
    if norm_find.is_empty() {
        return out;
    }

    let lines: Vec<&str> = content.split('\n').collect();
    let find_lines: Vec<&str> = find.split('\n').collect();

    if find_lines.len() == 1 {
        for line in &lines {
            if norm(line) == norm_find {
                out.push((*line).to_string());
            }
        }
    } else if find_lines.len() <= lines.len() {
        for i in 0..=(lines.len() - find_lines.len()) {
            let block = lines[i..i + find_lines.len()].join("\n");
            if norm(&block) == norm_find {
                out.push(block);
            }
        }
    }
    out
}

fn indentation_flexible_matches(content: &str, find: &str) -> Vec<String> {
    let mut out = Vec::new();
    let strip_indent = |text: &str| -> String {
        let lines: Vec<&str> = text.split('\n').collect();
        let min_indent = lines
            .iter()
            .filter(|l| !l.trim().is_empty())
            .map(|l| l.chars().take_while(|c| c.is_whitespace()).count())
            .min()
            .unwrap_or(0);
        lines
            .iter()
            .map(|l| {
                if l.trim().is_empty() {
                    *l
                } else {
                    let byte_idx = l
                        .char_indices()
                        .nth(min_indent)
                        .map(|(idx, _)| idx)
                        .unwrap_or(l.len());
                    &l[byte_idx..]
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    };

    let norm_find = strip_indent(find);
    let content_lines: Vec<&str> = content.split('\n').collect();
    let find_lines: Vec<&str> = find.split('\n').collect();
    if find_lines.is_empty() || find_lines.len() > content_lines.len() {
        return out;
    }

    for i in 0..=(content_lines.len() - find_lines.len()) {
        let block = content_lines[i..i + find_lines.len()].join("\n");
        if strip_indent(&block) == norm_find {
            out.push(block);
        }
    }
    out
}

fn trimmed_boundary_matches(content: &str, find: &str) -> Vec<String> {
    let mut out = Vec::new();
    let trimmed = find.trim();
    if trimmed == find || trimmed.is_empty() {
        return out;
    }
    if content.contains(trimmed) {
        out.push(trimmed.to_string());
    }
    out
}

/// Applies OpenCode-style cascading replacers on LF-normalized content.
pub fn replace_content(
    content: &str,
    old_string: &str,
    new_string: &str,
    replace_all: bool,
) -> Result<(String, usize), String> {
    if old_string.is_empty() {
        return Err("oldString cannot be empty when editing an existing file.".to_string());
    }
    if old_string == new_string {
        return Err("No changes to apply: oldString and newString are identical.".to_string());
    }

    let candidate_lists: Vec<Vec<String>> = vec![
        vec![old_string.to_string()],
        line_trimmed_matches(content, old_string),
        block_anchor_matches(content, old_string),
        whitespace_normalized_matches(content, old_string),
        indentation_flexible_matches(content, old_string),
        trimmed_boundary_matches(content, old_string),
    ];

    for candidates in candidate_lists {
        for search in candidates {
            if search.is_empty() {
                continue;
            }
            if let Some(first_idx) = content.find(&search) {
                let count = content.matches(&search).count();
                if replace_all || count == 1 {
                    let updated = if replace_all {
                        content.replace(&search, new_string)
                    } else {
                        let mut res = String::with_capacity(content.len() + new_string.len());
                        res.push_str(&content[..first_idx]);
                        res.push_str(new_string);
                        res.push_str(&content[first_idx + search.len()..]);
                        res
                    };
                    return Ok((updated, if replace_all { count } else { 1 }));
                }
                // Multiple occurrences even when replaceAll is false: replace all to avoid blocking document edits
                let updated = content.replace(&search, new_string);
                return Ok((updated, count));
            }
        }
    }

    Err("Could not find oldString in the file. Read the file first to verify its current contents.".to_string())
}

pub fn execute_edit(session_id: &str, workspace_dir: &str, arguments: &Value) -> Value {
    let fp = arguments
        .get("filePath")
        .or_else(|| arguments.get("path"))
        .or_else(|| arguments.get("file"))
        .or_else(|| arguments.get("targetFile"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let target = arguments
        .get("oldString")
        .or_else(|| arguments.get("old_string"))
        .or_else(|| arguments.get("target"))
        .or_else(|| arguments.get("find"))
        .or_else(|| arguments.get("search"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let replacement = arguments
        .get("newString")
        .or_else(|| arguments.get("new_string"))
        .or_else(|| arguments.get("replacement"))
        .or_else(|| arguments.get("replace"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let replace_all = arguments
        .get("replaceAll")
        .or_else(|| arguments.get("replace_all"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if target.is_empty() {
        return json!({ "error": "oldString (target) cannot be empty." });
    }

    if crate::tool::governance::is_document_locked(workspace_dir, fp) {
        return json!({
            "error": format!(
                "Document Governance Lock: '{}' is marked FINAL_LOCKED and is read-only. Unlock via manage_document_governance before editing.",
                fp
            )
        });
    }

    match resolve_isolated_path(workspace_dir, fp) {
        Ok(p) => match std::fs::read_to_string(&p) {
            Ok(content_old) => {
                let ending = detect_line_ending(&content_old);
                let norm_content = normalize_line_endings(&content_old);
                let norm_old = normalize_line_endings(target);
                let norm_new = normalize_line_endings(replacement);

                match replace_content(&norm_content, &norm_old, &norm_new, replace_all) {
                    Ok((norm_updated, count)) => {
                        let updated = convert_to_line_ending(&norm_updated, ending);
                        crate::files::record_document_change(workspace_dir, fp, &content_old, &updated);
                        match std::fs::write(&p, &updated) {
                            Ok(_) => {
                                emit_event(
                                    workspace_dir,
                                    "file.edited",
                                    json!({
                                        "file": fp,
                                        "sessionID": session_id,
                                        "before": content_old,
                                        "after": updated
                                    }),
                                );
                                json!({
                                    "ok": true,
                                    "output": "Edit applied successfully.",
                                    "occurrencesReplaced": count
                                })
                            }
                            Err(e) => json!({ "error": format!("Write error: {}", e) }),
                        }
                    }
                    Err(err_msg) => json!({
                        "error": format!("{} (file: '{}')", err_msg, fp)
                    }),
                }
            }
            Err(e) => json!({ "error": format!("Read error on '{}': {}", fp, e) }),
        },
        Err(e) => json!({ "error": e }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_crlf_multiline_edit_succeeds() {
        let crlf_content = "SUMMARY REPORT\r\n1. Revenue: 100\r\n2. Expense: 20\r\nTotal: 80\r\n";
        let ending = detect_line_ending(crlf_content);
        assert_eq!(ending, "\r\n");

        let norm_content = normalize_line_endings(crlf_content);
        let norm_old = normalize_line_endings("2. Expense: 20\nTotal: 80");
        let norm_new = normalize_line_endings("2. Expense: 20\n3. Shipping: 15\nTotal: 65");

        let (updated_lf, count) = replace_content(&norm_content, &norm_old, &norm_new, false).unwrap();
        assert_eq!(count, 1);

        let final_crlf = convert_to_line_ending(&updated_lf, ending);
        assert!(final_crlf.contains("3. Shipping: 15\r\nTotal: 65\r\n"));
    }

    #[test]
    fn test_line_trimmed_and_whitespace_replacers() {
        let content = "Line 1   \n  Line 2:   Value 50  \nLine 3\n";
        let old_str = "Line 1\nLine 2: Value 50\nLine 3";
        let new_str = "Line 1\nLine 2: Value 75\nLine 3";

        let (updated, count) = replace_content(content, old_str, new_str, false).unwrap();
        assert_eq!(count, 1);
        assert!(updated.contains("Line 2: Value 75"));
    }
}
