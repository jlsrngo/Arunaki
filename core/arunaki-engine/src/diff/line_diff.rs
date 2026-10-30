//! Native LCS line-diff and side-by-side row generator with prefix/suffix slicing.

use axum::{
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiffLine {
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(rename = "oldLineNumber", skip_serializing_if = "Option::is_none")]
    pub old_line_number: Option<usize>,
    #[serde(rename = "newLineNumber", skip_serializing_if = "Option::is_none")]
    pub new_line_number: Option<usize>,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SideBySideDiffCell {
    #[serde(rename = "lineNumber", skip_serializing_if = "Option::is_none")]
    pub line_number: Option<usize>,
    pub content: String,
    #[serde(rename = "type")]
    pub kind: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SideBySideDiffRow {
    pub id: String,
    pub left: SideBySideDiffCell,
    pub right: SideBySideDiffCell,
}

#[derive(Debug, Deserialize)]
pub struct LineDiffRequest {
    #[serde(rename = "oldText", default)]
    pub old_text: String,
    #[serde(rename = "newText", default)]
    pub new_text: String,
    #[serde(rename = "includeSideBySide", default)]
    pub include_side_by_side: bool,
}

/// Computes line-by-line diff using common prefix/suffix trimming + LCS table on the changed core.
pub fn compute_line_diff(old_text: &str, new_text: &str) -> Vec<DiffLine> {
    let old_lines: Vec<&str> = if old_text.is_empty() {
        Vec::new()
    } else {
        old_text.split('\n').collect()
    };
    let new_lines: Vec<&str> = if new_text.is_empty() {
        Vec::new()
    } else {
        new_text.split('\n').collect()
    };

    let n = old_lines.len();
    let m = new_lines.len();

    // 1. Trim common prefix
    let mut prefix_len = 0;
    while prefix_len < n && prefix_len < m && old_lines[prefix_len] == new_lines[prefix_len] {
        prefix_len += 1;
    }

    // 2. Trim common suffix
    let mut suffix_len = 0;
    while suffix_len < (n - prefix_len)
        && suffix_len < (m - prefix_len)
        && old_lines[n - 1 - suffix_len] == new_lines[m - 1 - suffix_len]
    {
        suffix_len += 1;
    }

    let mut result = Vec::with_capacity(n.max(m));

    // Push unchanged prefix
    for idx in 0..prefix_len {
        result.push(DiffLine {
            kind: "unchanged".to_string(),
            old_line_number: Some(idx + 1),
            new_line_number: Some(idx + 1),
            content: old_lines[idx].to_string(),
        });
    }

    // 3. Run LCS on the middle slice [prefix_len .. n - suffix_len] and [prefix_len .. m - suffix_len]
    let old_mid = &old_lines[prefix_len..(n - suffix_len)];
    let new_mid = &new_lines[prefix_len..(m - suffix_len)];
    let mid_n = old_mid.len();
    let mid_m = new_mid.len();

    if mid_n > 0 || mid_m > 0 {
        let width = mid_m + 1;
        let mut dp = vec![0usize; (mid_n + 1) * width];

        for i in 0..mid_n {
            for j in 0..mid_m {
                let val = if old_mid[i] == new_mid[j] {
                    dp[i * width + j] + 1
                } else {
                    dp[(i + 1) * width + j].max(dp[i * width + (j + 1)])
                };
                dp[(i + 1) * width + (j + 1)] = val;
            }
        }

        let mut i = mid_n;
        let mut j = mid_m;
        let mut mid_diff = Vec::with_capacity(mid_n + mid_m);

        while i > 0 || j > 0 {
            if i > 0 && j > 0 && old_mid[i - 1] == new_mid[j - 1] {
                mid_diff.push(DiffLine {
                    kind: "unchanged".to_string(),
                    old_line_number: Some(prefix_len + i),
                    new_line_number: Some(prefix_len + j),
                    content: old_mid[i - 1].to_string(),
                });
                i -= 1;
                j -= 1;
            } else if j > 0 && (i == 0 || dp[i * width + (j - 1)] >= dp[(i - 1) * width + j]) {
                mid_diff.push(DiffLine {
                    kind: "added".to_string(),
                    old_line_number: None,
                    new_line_number: Some(prefix_len + j),
                    content: new_mid[j - 1].to_string(),
                });
                j -= 1;
            } else {
                mid_diff.push(DiffLine {
                    kind: "deleted".to_string(),
                    old_line_number: Some(prefix_len + i),
                    new_line_number: None,
                    content: old_mid[i - 1].to_string(),
                });
                i -= 1;
            }
        }

        mid_diff.reverse();
        result.extend(mid_diff);
    }

    // Push unchanged suffix
    for offset in 0..suffix_len {
        let old_idx = n - suffix_len + offset;
        let new_idx = m - suffix_len + offset;
        result.push(DiffLine {
            kind: "unchanged".to_string(),
            old_line_number: Some(old_idx + 1),
            new_line_number: Some(new_idx + 1),
            content: old_lines[old_idx].to_string(),
        });
    }

    result
}

/// Pairs `DiffLine` items into left/right rows for side-by-side visual split comparison.
pub fn compute_side_by_side_diff(lines: &[DiffLine]) -> Vec<SideBySideDiffRow> {
    let mut rows = Vec::with_capacity(lines.len());
    let mut row_idx = 0usize;
    let mut k = 0usize;

    while k < lines.len() {
        let cur = &lines[k];
        if cur.kind == "unchanged" {
            rows.push(SideBySideDiffRow {
                id: format!("row-{}", row_idx),
                left: SideBySideDiffCell {
                    line_number: cur.old_line_number,
                    content: cur.content.clone(),
                    kind: "unchanged".to_string(),
                },
                right: SideBySideDiffCell {
                    line_number: cur.new_line_number,
                    content: cur.content.clone(),
                    kind: "unchanged".to_string(),
                },
            });
            row_idx += 1;
            k += 1;
            continue;
        }

        let mut deleted_chunk = Vec::new();
        let mut added_chunk = Vec::new();

        while k < lines.len() && lines[k].kind == "deleted" {
            deleted_chunk.push(&lines[k]);
            k += 1;
        }
        while k < lines.len() && lines[k].kind == "added" {
            added_chunk.push(&lines[k]);
            k += 1;
        }

        let max_len = deleted_chunk.len().max(added_chunk.len());
        for idx in 0..max_len {
            let left = if let Some(del) = deleted_chunk.get(idx) {
                SideBySideDiffCell {
                    line_number: del.old_line_number,
                    content: del.content.clone(),
                    kind: "deleted".to_string(),
                }
            } else {
                SideBySideDiffCell {
                    line_number: None,
                    content: String::new(),
                    kind: "empty".to_string(),
                }
            };

            let right = if let Some(add) = added_chunk.get(idx) {
                SideBySideDiffCell {
                    line_number: add.new_line_number,
                    content: add.content.clone(),
                    kind: "added".to_string(),
                }
            } else {
                SideBySideDiffCell {
                    line_number: None,
                    content: String::new(),
                    kind: "empty".to_string(),
                }
            };

            rows.push(SideBySideDiffRow {
                id: format!("row-{}", row_idx),
                left,
                right,
            });
            row_idx += 1;
        }
    }

    rows
}

/// `POST /api/desktop/line-diff`
pub async fn handle_line_diff(Json(req): Json<LineDiffRequest>) -> Response {
    let diff_lines = compute_line_diff(&req.old_text, &req.new_text);
    let added_count = diff_lines.iter().filter(|l| l.kind == "added").count();
    let deleted_count = diff_lines.iter().filter(|l| l.kind == "deleted").count();
    let side_by_side = if req.include_side_by_side {
        Some(compute_side_by_side_diff(&diff_lines))
    } else {
        None
    };

    Json(json!({
        "ok": true,
        "diffLines": diff_lines,
        "addedCount": added_count,
        "deletedCount": deleted_count,
        "sideBySideRows": side_by_side,
    }))
    .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn computes_exact_added_and_deleted_lines() {
        let old = "Header\nBaris Lama\nFooter";
        let new = "Header\nBaris Baru 1\nBaris Baru 2\nFooter";
        let diff = compute_line_diff(old, new);

        let added: Vec<&DiffLine> = diff.iter().filter(|d| d.kind == "added").collect();
        let deleted: Vec<&DiffLine> = diff.iter().filter(|d| d.kind == "deleted").collect();
        let unchanged: Vec<&DiffLine> = diff.iter().filter(|d| d.kind == "unchanged").collect();

        assert_eq!(added.len(), 2);
        assert_eq!(deleted.len(), 1);
        assert_eq!(unchanged.len(), 2);
        assert_eq!(deleted[0].content, "Baris Lama");
        assert_eq!(added[0].content, "Baris Baru 1");
        assert_eq!(added[1].content, "Baris Baru 2");
    }

    #[test]
    fn pairs_side_by_side_rows_cleanly() {
        let diff = compute_line_diff("A\nB\nC", "A\nB_mod\nC");
        let rows = compute_side_by_side_diff(&diff);
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[1].left.kind, "deleted");
        assert_eq!(rows[1].right.kind, "added");
    }
}

