//! Document Glob/List Tool — mirrors `packages/engine/engine/src/tool/glob.ts`.
//! Recursively lists files within the isolated active project folder with full wildcard support.

use serde_json::{json, Value};
use std::path::Path;

use crate::files::collect_files_recursive;

pub fn glob_tool_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "glob",
            "description": include_str!("prompt/glob.txt"),
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": { "type": "string", "description": "Wildcard pattern (e.g. '*', '*.txt', '*LAPORAN*.txt', '**/*.xlsx') or substring to filter files by." }
                }
            }
        }
    })
}

/// Matches a glob/wildcard expression against a target path or filename.
/// Handles:
/// - `*` or empty pattern -> matches all
/// - `*.txt`, `*LAPORAN*.txt` -> matches wildcards accurately
/// - `**/*.xlsx` -> handles recursive glob prefixes
/// - case-insensitive on all platforms
/// - matches against full relative path OR filename
pub fn matches_glob_pattern(pattern: &str, target: &str) -> bool {
    let p_clean = pattern.trim();
    if p_clean.is_empty() || p_clean == "*" || p_clean == "**" || p_clean == "**/*" {
        return true;
    }

    let p_lower = p_clean.to_lowercase().replace('\\', "/");
    let t_lower = target.to_lowercase().replace('\\', "/");
    let file_name = t_lower.rsplit('/').next().unwrap_or(&t_lower);

    // If no glob wildcards (* or ?), allow substring match or exact match
    if !p_lower.contains('*') && !p_lower.contains('?') {
        return t_lower.contains(&p_lower) || file_name == p_lower;
    }

    // Match full path or match file name
    if wildcard_match_core(&p_lower, &t_lower) || wildcard_match_core(&p_lower, file_name) {
        return true;
    }

    // If pattern starts with "**/", also test with the prefix stripped
    if let Some(stripped) = p_lower.strip_prefix("**/") {
        if wildcard_match_core(stripped, &t_lower) || wildcard_match_core(stripped, file_name) {
            return true;
        }
    }

    false
}

fn wildcard_match_core(pattern: &str, target: &str) -> bool {
    let pat: Vec<char> = pattern.chars().collect();
    let txt: Vec<char> = target.chars().collect();

    let mut p_idx = 0;
    let mut t_idx = 0;
    let mut star_idx = None;
    let mut match_idx = 0;

    while t_idx < txt.len() {
        if p_idx < pat.len() && (pat[p_idx] == '?' || pat[p_idx] == txt[t_idx]) {
            p_idx += 1;
            t_idx += 1;
        } else if p_idx < pat.len() && pat[p_idx] == '*' {
            while p_idx < pat.len() && pat[p_idx] == '*' {
                p_idx += 1;
            }
            if p_idx == pat.len() {
                return true;
            }
            star_idx = Some(p_idx - 1);
            match_idx = t_idx;
        } else if let Some(s_idx) = star_idx {
            p_idx = s_idx + 1;
            match_idx += 1;
            t_idx = match_idx;
        } else {
            return false;
        }
    }

    while p_idx < pat.len() && pat[p_idx] == '*' {
        p_idx += 1;
    }

    p_idx == pat.len()
}

pub fn execute_glob(workspace_dir: &str, arguments: &Value) -> Value {
    let mut out_paths = Vec::new();
    let base_p = Path::new(workspace_dir);
    collect_files_recursive(base_p, base_p, &mut out_paths, 500);

    let pattern = arguments
        .get("pattern")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();

    let mut filtered = Vec::new();
    for p in out_paths {
        let rel_str = match p.strip_prefix(base_p) {
            Ok(rel) => rel.to_string_lossy().replace('\\', "/"),
            Err(_) => p.to_string_lossy().replace('\\', "/"),
        };
        if matches_glob_pattern(pattern, &rel_str) {
            filtered.push(rel_str);
        }
    }
    filtered.sort();
    json!({ "files": filtered })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_glob_wildcard_matching() {
        assert!(matches_glob_pattern("*", "LAPORAN-HARIAN.txt"));
        assert!(matches_glob_pattern("*.txt", "LAPORAN-HARIAN.txt"));
        assert!(matches_glob_pattern("*LAPORAN*.txt", "LAPORAN-HARIAN.txt"));
        assert!(matches_glob_pattern("*laporan*", "LAPORAN-HARIAN.txt"));
        assert!(matches_glob_pattern("LAPORAN*", "LAPORAN-HARIAN.txt"));
        assert!(matches_glob_pattern("laporan", "LAPORAN-HARIAN.txt"));
        assert!(matches_glob_pattern("**/*.txt", "LAPORAN-HARIAN.txt"));
        assert!(matches_glob_pattern("**/*.txt", "reports/november/LAPORAN-HARIAN.txt"));
        assert!(!matches_glob_pattern("*.xlsx", "LAPORAN-HARIAN.txt"));
        assert!(matches_glob_pattern("*.xlsx", "REKAP 10-2026.xlsx"));
        assert!(matches_glob_pattern("*order*", "ORDER.txt"));
    }
}
