#![allow(dead_code, unused_imports)]
//! Arunaki Living Workspace Memory — Cartographer & Workspace Rules Loader.
//! Mirrors OpenCode `Instruction.Service` + workspace catalog synthesis for `.arunaki/ARUNAKI.md`.

use std::collections::HashSet;
use std::path::Path;

use crate::files::collect_files_recursive;
use crate::paths::{arunaki_dot_dir, now_iso};

pub const ARUNAKI_MD_NAME: &str = "ARUNAKI.md";
pub const CORRECTIONS_FILE_NAME: &str = "user-corrections.jsonl";

/// Infers domain dynamically based on scanned file extensions.
pub fn infer_domain(extensions: &[&str]) -> String {
    let mut types = Vec::new();
    let has_sheet = extensions.iter().any(|&e| e == ".xlsx" || e == ".xls" || e == ".csv");
    let has_doc = extensions.iter().any(|&e| e == ".docx" || e == ".doc" || e == ".pdf");
    let has_note = extensions.iter().any(|&e| e == ".txt" || e == ".md");

    if has_sheet {
        types.push("Spreadsheets & Tabular Data");
    }
    if has_doc {
        types.push("Documents & Reports");
    }
    if has_note && !has_sheet && !has_doc {
        types.push("Text Notes & Markdown");
    }

    if types.is_empty() {
        "General Document Workspace".to_string()
    } else {
        types.join(" | ")
    }
}

/// Derives universal syntax invariants based on file types.
pub fn derive_syntax_invariants(extensions: &[&str]) -> Vec<String> {
    let mut inv = Vec::new();
    let has_sheet = extensions.iter().any(|&e| e == ".xlsx" || e == ".xls" || e == ".csv");
    let has_doc = extensions.iter().any(|&e| e == ".docx" || e == ".doc" || e == ".pdf" || e == ".txt");

    if has_sheet {
        inv.push("- Tabular & Spreadsheet Files: Preserve existing sheet structures, column headers, and calculation formulas (SUM, TOTAL, math formulas) without altering unedited cells or formatting.".to_string());
        inv.push("- Workbook Integrity: When editing spreadsheets, save valid structures and verify all calculated values.".to_string());
    }
    if has_doc {
        inv.push("- Document Files: Maintain the existing heading hierarchy, layout structure, and tone established in existing notes and reports.".to_string());
    }
    if has_sheet && has_doc {
        inv.push("- Cross-Document Consistency: Ensure referenced data, dates, and metrics match across spreadsheets and summary reports.".to_string());
    }
    inv.push("- Active Folder Isolation: Only inspect and operate on files within the currently opened active folder.".to_string());

    inv
}

/// Reads the active workspace living memory from `.arunaki/ARUNAKI.md`.
/// If it doesn't exist yet, automatically synthesizes it on the fly.
pub fn get_living_memory_for_workspace(workspace_dir: &str) -> String {
    let ws_path = Path::new(workspace_dir);
    let arunaki_md = ws_path.join(".arunaki").join(ARUNAKI_MD_NAME);

    if arunaki_md.exists() {
        if let Ok(content) = std::fs::read_to_string(&arunaki_md) {
            if !content.trim().is_empty() {
                return content;
            }
        }
    }

    // Auto-synthesize on first run
    synthesize_living_memory(workspace_dir)
}

/// Scans active folder and synthesizes `.arunaki/ARUNAKI.md`.
pub fn synthesize_living_memory(workspace_dir: &str) -> String {
    let ws_path = Path::new(workspace_dir);
    let folder_name = ws_path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Active Folder".to_string());

    let mut all_files = Vec::new();
    collect_files_recursive(ws_path, ws_path, &mut all_files, 200);

    let mut extensions = HashSet::new();
    let mut clean_files = Vec::new();

    for f in &all_files {
        let p_str = f.to_string_lossy().to_string();
        if p_str.starts_with(".arunaki") || p_str.starts_with(".git") || p_str.starts_with("node_modules") {
            continue;
        }
        if let Some(ext) = f.extension().and_then(|s| s.to_str()) {
            extensions.insert(format!(".{}", ext.to_lowercase()));
        }
        clean_files.push(p_str);
    }

    let ext_slices: Vec<&str> = extensions.iter().map(|s| s.as_str()).collect();
    let domain = infer_domain(&ext_slices);
    let invariants = derive_syntax_invariants(&ext_slices);

    let file_catalog = if clean_files.is_empty() {
        "_No document files detected in the active folder yet._".to_string()
    } else {
        clean_files
            .iter()
            .take(40)
            .map(|f| format!("- {}", f))
            .collect::<Vec<_>>()
            .join("\n")
    };

    let arunaki_dir = ws_path.join(".arunaki");
    let _ = std::fs::create_dir_all(&arunaki_dir);
    let arunaki_md = arunaki_dir.join(ARUNAKI_MD_NAME);

    let existing_doc = std::fs::read_to_string(&arunaki_md).unwrap_or_default();
    let existing_corrections = extract_existing_corrections(&existing_doc);
    let learned_section = if existing_corrections.is_empty() {
        "_No learned preferences yet._".to_string()
    } else {
        existing_corrections.join("\n")
    };

    let doc = format!(
        "# LOCAL WORKSPACE OPERATING RULES ({})\n\n\
        <!-- AUTO-GENERATED BY ARUNAKI CARTOGRAPHER. DO NOT DELETE. -->\n\n\
        ## Domain Profile\n{}\n\n\
        ## Workspace Catalog\n{}\n\n\
        ## Operating Invariants\n{}\n\n\
        ## User Preferences & Learned Corrections\n### Learned by the Sentinel\n{}\n",
        folder_name, domain, file_catalog, invariants.join("\n"), learned_section
    );

    let _ = std::fs::write(&arunaki_md, &doc);
    doc
}

fn extract_existing_corrections(doc: &str) -> Vec<String> {
    if doc.is_empty() {
        return Vec::new();
    }
    let mut out = Vec::new();
    let mut in_section = false;

    for line in doc.lines() {
        if line.starts_with("## User Preferences") {
            in_section = true;
            continue;
        }
        if in_section {
            if line.starts_with("## ") || line.starts_with("---") {
                break;
            }
            let trimmed = line.trim();
            if trimmed.starts_with("- ") && !trimmed.contains("No learned preferences yet") {
                out.push(trimmed.to_string());
            }
        }
    }
    out
}
