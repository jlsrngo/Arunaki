//! Pre-LLM Workspace Document Auto-Locator.
//!
//! Deterministically indexes documents (.xlsx, .csv, .docx, .pdf, .pptx, .md)
//! in the active workspace folder so the LLM knows all existing documents upfront
//! on turn 1 without exploratory globbing roundtrips.

use std::fs;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiscoveredDocument {
    pub relative_path: String,
    pub doc_type: &'static str,
    pub size_bytes: u64,
}

/// Discovers document files in the active workspace up to 2 directories deep.
pub fn scan_workspace_documents(workspace_dir: &str) -> Vec<DiscoveredDocument> {
    let ws_path = Path::new(workspace_dir);
    if !ws_path.is_dir() {
        return Vec::new();
    }

    let mut results = Vec::new();
    scan_dir_recursive(ws_path, ws_path, 0, 2, &mut results);

    // Sort by name for deterministic order
    results.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    results
}

fn scan_dir_recursive(
    root: &Path,
    current: &Path,
    depth: usize,
    max_depth: usize,
    results: &mut Vec<DiscoveredDocument>,
) {
    if depth > max_depth || results.len() >= 40 {
        return;
    }

    let entries = match fs::read_dir(current) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        if results.len() >= 40 {
            break;
        }

        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files, system files, lock files, and build directories
        if file_name.starts_with('.')
            || file_name.starts_with("~$")
            || file_name == "node_modules"
            || file_name == "target"
            || file_name == "dist"
            || file_name == "dist-portable"
            || file_name == "build"
        {
            continue;
        }

        if path.is_dir() {
            scan_dir_recursive(root, &path, depth + 1, max_depth, results);
        } else if path.is_file() {
            if let Some(doc_type) = classify_document_extension(&file_name) {
                let size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
                if let Ok(rel) = path.strip_prefix(root) {
                    let rel_str = rel.to_string_lossy().replace('\\', "/");
                    results.push(DiscoveredDocument {
                        relative_path: rel_str,
                        doc_type,
                        size_bytes,
                    });
                }
            }
        }
    }
}

pub fn classify_document_extension(filename: &str) -> Option<&'static str> {
    let lower = filename.to_lowercase();
    if lower.ends_with(".xlsx") || lower.ends_with(".xls") {
        Some("Excel Spreadsheet")
    } else if lower.ends_with(".csv") || lower.ends_with(".tsv") {
        Some("CSV / Tabular Data")
    } else if lower.ends_with(".docx") || lower.ends_with(".doc") {
        Some("Word Document")
    } else if lower.ends_with(".pdf") {
        Some("PDF Document")
    } else if lower.ends_with(".pptx") || lower.ends_with(".ppt") {
        Some("PowerPoint Presentation")
    } else if lower.ends_with(".md") && !lower.ends_with("readme.md") {
        Some("Markdown Document")
    } else {
        None
    }
}

/// Formats discovered workspace documents as a concise markdown block for the `<env>` / prompt.
pub fn format_workspace_documents_block(workspace_dir: &str) -> Option<String> {
    let docs = scan_workspace_documents(workspace_dir);
    if docs.is_empty() {
        return None;
    }

    let mut out = String::from("<workspace_documents>\nDocuments present in the active folder:\n");
    for doc in docs.iter().take(25) {
        let size_kb = (doc.size_bytes + 1023) / 1024;
        out.push_str(&format!(
            "- `{}` ({}, ~{} KB)\n",
            doc.relative_path, doc.doc_type, size_kb
        ));
    }
    out.push_str("When the user refers to \"excel\", \"spreadsheet\", \"laporan\", \"dokumen\", or \"pdf\", operate directly on these files.\n");
    out.push_str("</workspace_documents>");

    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_document_extension() {
        assert_eq!(classify_document_extension("rekap.xlsx"), Some("Excel Spreadsheet"));
        assert_eq!(classify_document_extension("transactions.csv"), Some("CSV / Tabular Data"));
        assert_eq!(classify_document_extension("draft.docx"), Some("Word Document"));
        assert_eq!(classify_document_extension("invoice.pdf"), Some("PDF Document"));
        assert_eq!(classify_document_extension("pitch.pptx"), Some("PowerPoint Presentation"));
        assert_eq!(classify_document_extension("notes.md"), Some("Markdown Document"));
        assert_eq!(classify_document_extension("README.md"), None);
        assert_eq!(classify_document_extension("main.rs"), None);
    }

    #[test]
    fn test_scan_and_format_workspace_documents() {
        let tmp = std::env::temp_dir().join(format!("test_doc_locator_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()));
        let _ = fs::create_dir_all(tmp.join("subfolder"));

        let _ = fs::write(tmp.join("sales.xlsx"), b"spreadsheet content");
        let _ = fs::write(tmp.join("subfolder").join("contract.docx"), b"word document content");
        let _ = fs::write(tmp.join("ignore.tmp"), b"ignore me");

        let docs = scan_workspace_documents(tmp.to_str().unwrap());
        assert_eq!(docs.len(), 2);
        assert!(docs.iter().any(|d| d.relative_path == "sales.xlsx"));
        assert!(docs.iter().any(|d| d.relative_path == "subfolder/contract.docx"));

        let block = format_workspace_documents_block(tmp.to_str().unwrap()).expect("block should exist");
        assert!(block.contains("<workspace_documents>"));
        assert!(block.contains("`sales.xlsx`"));
        assert!(block.contains("`subfolder/contract.docx`"));

        let _ = fs::remove_dir_all(&tmp);
    }
}

