//! Active Project Folder Ingestion Monitor & Background Heartbeat Daemon.
//!
//! Proactively monitors the active project folder for newly added administrative
//! documents (invoices, receipts, bank statements, contracts, spreadsheets) without
//! waiting for a manual user prompt, classifies each file, and emits SSE notifications
//! for 1-click managerial processing.

use crate::desktop::get_active_workspace_root;
use crate::paths::now_ms;
use crate::session::emit_event;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

/// Administrative document classification for newly ingested files.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DetectedDocument {
    pub filename: String,
    pub path: String,
    pub extension: String,
    pub category: String,
    pub size_bytes: u64,
    pub detected_at_ms: u64,
    pub recommended_action: String,
    pub suggested_playbook_id: String,
}

#[derive(Debug, Default, Clone)]
struct DirectoryWatchEntry {
    baseline_initialized: bool,
    known_files: HashSet<String>,
    pending_detected: Vec<DetectedDocument>,
}

static WATCHER_REGISTRY: OnceLock<Mutex<HashMap<String, DirectoryWatchEntry>>> = OnceLock::new();

fn registry() -> &'static Mutex<HashMap<String, DirectoryWatchEntry>> {
    WATCHER_REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

/// System-generated deliverables that should not be flagged as external incoming documents.
const INTERNAL_DELIVERABLES: &[&str] = &[
    "daily_cash_recap.xlsx",
    "daily_cash_closing_memo.docx",
    "accounts_payable_ledger.xlsx",
    "payment_approval_voucher.docx",
    "document_archive_index.xlsx",
    "monthly_governance_report.docx",
    "reconciliation_audit_report.xlsx",
    "reconciliation_discrepancy_memo.docx",
    "executive_summary_memo.docx",
    "executive_presentation_deck.pptx",
];

fn is_supported_document_ext(ext: &str) -> bool {
    matches!(
        ext,
        "pdf" | "xlsx" | "xls" | "csv" | "docx" | "doc" | "pptx" | "txt" | "md" | "png" | "jpg" | "jpeg" | "webp"
    )
}

fn is_internal_deliverable(filename: &str) -> bool {
    let lower = filename.to_ascii_lowercase();
    INTERNAL_DELIVERABLES.iter().any(|&d| d == lower)
}

/// Classifies a newly detected file based on filename semantics and extension.
pub fn classify_document(filename: &str, full_path: &str, size_bytes: u64) -> DetectedDocument {
    let lower = filename.to_ascii_lowercase();
    let ext = Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let (category, recommended_action, suggested_playbook_id) = if lower.contains("inv")
        || lower.contains("invoice")
        || lower.contains("bill")
        || lower.contains("vendor")
        || lower.contains("supplier")
        || lower.contains("po_")
        || lower.contains("po-")
    {
        (
            "INVOICE",
            "Extract line items, cross-check against Purchase Orders, and update Accounts Payable ledger",
            "supplier_invoice_verification",
        )
    } else if lower.contains("bank")
        || lower.contains("statement")
        || lower.contains("mutation")
        || lower.contains("settlement")
    {
        (
            "BANK_STATEMENT",
            "Run 3-Way Cash & Bank Reconciliation against store shift totals and Excel cashbook",
            "daily_cash_closing",
        )
    } else if lower.contains("receipt")
        || lower.contains("slip")
        || lower.contains("pos")
        || lower.contains("register")
        || lower.contains("voucher")
        || matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp")
    {
        (
            "RECEIPT",
            "Verify payment proof and reconcile with daily cash register closing",
            "daily_cash_closing",
        )
    } else if lower.contains("contract")
        || lower.contains("agreement")
        || lower.contains("policy")
        || lower.contains("memo")
        || ext == "docx"
        || ext == "doc"
    {
        (
            "CONTRACT",
            "Catalog document metadata and index in Monthly Administrative Archive",
            "monthly_administrative_archive",
        )
    } else if matches!(ext.as_str(), "xlsx" | "xls" | "csv") {
        (
            "LEDGER_SPREADSHEET",
            "Audit spreadsheet formulas and cross-reconcile financial totals",
            "daily_cash_closing",
        )
    } else {
        (
            "GENERAL_DOCUMENT",
            "Inspect document contents and index into project governance archive",
            "monthly_administrative_archive",
        )
    };

    DetectedDocument {
        filename: filename.to_string(),
        path: full_path.replace('\\', "/"),
        extension: ext,
        category: category.to_string(),
        size_bytes,
        detected_at_ms: now_ms(),
        recommended_action: recommended_action.to_string(),
        suggested_playbook_id: suggested_playbook_id.to_string(),
    }
}

fn list_candidate_files(workspace_dir: &str) -> Vec<(String, String, u64)> {
    let root = Path::new(workspace_dir);
    let mut results = Vec::new();
    let Ok(entries) = std::fs::read_dir(root) else {
        return results;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if name.starts_with('.') || name.starts_with("~$") || is_internal_deliverable(name) {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !is_supported_document_ext(&ext) {
            continue;
        }
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        results.push((
            name.to_string(),
            path.to_string_lossy().to_string(),
            size,
        ));
    }
    results.sort_by(|a, b| a.0.cmp(&b.0));
    results
}

/// Initializes the baseline file snapshot for a workspace directory so existing files
/// are marked as known, and only subsequent file drops trigger proactive ingestion alerts.
pub fn seed_baseline_snapshot(workspace_dir: &str) {
    let norm_dir = workspace_dir.replace('\\', "/");
    let files = list_candidate_files(workspace_dir);
    if let Ok(mut reg) = registry().lock() {
        let entry = reg.entry(norm_dir).or_default();
        for (name, _, _) in files {
            entry.known_files.insert(name);
        }
        entry.baseline_initialized = true;
    }
}

/// Scans the workspace directory for newly added files since the baseline snapshot.
/// If the directory has never been initialized, the first scan seeds the baseline
/// unless `detect_all_on_first_scan` is set to true.
pub fn scan_workspace_directory(workspace_dir: &str, detect_all_on_first_scan: bool) -> Value {
    let norm_dir = workspace_dir.replace('\\', "/");
    let current_files = list_candidate_files(workspace_dir);

    let mut newly_detected: Vec<DetectedDocument> = Vec::new();
    let mut pending_list: Vec<DetectedDocument> = Vec::new();

    if let Ok(mut reg) = registry().lock() {
        let entry = reg.entry(norm_dir.clone()).or_default();

        // Prune pending documents that were deleted from disk
        let current_names: HashSet<String> = current_files.iter().map(|(n, _, _)| n.clone()).collect();
        entry
            .pending_detected
            .retain(|doc| current_names.contains(&doc.filename));

        if !entry.baseline_initialized && !detect_all_on_first_scan {
            for (name, _, _) in &current_files {
                entry.known_files.insert(name.clone());
            }
            entry.baseline_initialized = true;
        } else {
            entry.baseline_initialized = true;
            for (name, full_path, size) in &current_files {
                if !entry.known_files.contains(name) {
                    entry.known_files.insert(name.clone());
                    let doc = classify_document(name, full_path, *size);
                    entry.pending_detected.push(doc.clone());
                    newly_detected.push(doc);
                }
            }
        }

        pending_list = entry.pending_detected.clone();
    }

    if !newly_detected.is_empty() {
        emit_event(
            &norm_dir,
            "folder:documents-detected",
            json!({
                "directory": norm_dir,
                "newCount": newly_detected.len(),
                "totalPending": pending_list.len(),
                "newDocuments": newly_detected,
                "pendingDocuments": pending_list,
                "timestamp": now_ms(),
            }),
        );
    }

    let mut category_counts: HashMap<String, usize> = HashMap::new();
    for doc in &pending_list {
        *category_counts.entry(doc.category.clone()).or_insert(0) += 1;
    }

    json!({
        "directory": norm_dir,
        "pendingCount": pending_list.len(),
        "newCount": newly_detected.len(),
        "categoryCounts": category_counts,
        "pendingDocuments": pending_list,
        "timestamp": now_ms(),
    })
}

/// Marks pending detected documents in the workspace directory as acknowledged/processed.
pub fn acknowledge_detected_documents(
    workspace_dir: &str,
    filenames: Option<Vec<String>>,
) -> Value {
    let norm_dir = workspace_dir.replace('\\', "/");
    let mut remaining = 0usize;

    if let Ok(mut reg) = registry().lock() {
        if let Some(entry) = reg.get_mut(&norm_dir) {
            if let Some(target_names) = filenames {
                let target_set: HashSet<String> = target_names.into_iter().collect();
                entry
                    .pending_detected
                    .retain(|doc| !target_set.contains(&doc.filename));
            } else {
                entry.pending_detected.clear();
            }
            remaining = entry.pending_detected.len();
        }
    }

    json!({
        "directory": norm_dir,
        "acknowledged": true,
        "remainingPending": remaining,
        "timestamp": now_ms(),
    })
}

/// Starts the background Tokio heartbeat loop that periodically monitors the active
/// workspace root for newly dropped documents.
pub fn start_folder_watcher_daemon() {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(5));
        loop {
            interval.tick().await;
            if let Some(dir_str) = get_active_workspace_root() {
                if !dir_str.is_empty() && Path::new(&dir_str).is_dir() {
                    let _ = scan_workspace_directory(&dir_str, false);
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_watcher_baseline_and_new_file_ingestion() {
        let temp_dir = std::env::temp_dir().join(format!("arunaki_watcher_test_{}", now_ms()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let dir_str = temp_dir.to_string_lossy().to_string();

        // 1. Create an existing file before baseline initialization
        std::fs::write(temp_dir.join("existing_notes.txt"), "Existing file").unwrap();

        // First scan initializes baseline without flagging existing files
        let initial_scan = scan_workspace_directory(&dir_str, false);
        assert_eq!(initial_scan["pendingCount"].as_u64().unwrap_or(99), 0);

        // 2. Drop 3 new administrative files + 1 internal deliverable
        std::fs::write(temp_dir.join("INV-2026-881.pdf"), "Vendor Invoice PDF").unwrap();
        std::fs::write(temp_dir.join("bank_statement_october.pdf"), "Bank Statement").unwrap();
        std::fs::write(temp_dir.join("pos_receipt_shift1.jpg"), "Receipt Image").unwrap();
        std::fs::write(
            temp_dir.join("reconciliation_audit_report.xlsx"),
            "Internal generated deliverable",
        )
        .unwrap();

        // 3. Scan again — should detect the 3 external files and ignore the internal deliverable
        let second_scan = scan_workspace_directory(&dir_str, false);
        assert_eq!(second_scan["newCount"].as_u64().unwrap_or(0), 3);
        assert_eq!(second_scan["pendingCount"].as_u64().unwrap_or(0), 3);

        let pending = second_scan["pendingDocuments"].as_array().unwrap();
        let categories: Vec<&str> = pending
            .iter()
            .filter_map(|d| d["category"].as_str())
            .collect();
        assert!(categories.contains(&"INVOICE"));
        assert!(categories.contains(&"BANK_STATEMENT"));
        assert!(categories.contains(&"RECEIPT"));

        // 4. Acknowledge 1 specific file
        let ack_one = acknowledge_detected_documents(
            &dir_str,
            Some(vec!["INV-2026-881.pdf".to_string()]),
        );
        assert_eq!(ack_one["remainingPending"].as_u64().unwrap_or(99), 2);

        // 5. Acknowledge all remaining files
        let ack_all = acknowledge_detected_documents(&dir_str, None);
        assert_eq!(ack_all["remainingPending"].as_u64().unwrap_or(99), 0);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
