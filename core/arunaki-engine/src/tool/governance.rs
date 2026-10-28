//! Document Governance, Lifecycle & Digital Approval Stamping Engine.
//!
//! Manages `.arunaki/governance.json` inside the active workspace folder,
//! tracks lifecycle states (`DRAFT`, `UNDER_REVIEW`, `VERIFIED`, `FINAL_LOCKED`),
//! computes SHA-256 integrity hashes, injects official digital managerial stamps,
//! and enforces read-only mutation locks on `FINAL_LOCKED` documents.

use crate::paths::now_ms;
use crate::session::emit_event;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

const GOVERNANCE_PROMPT: &str = include_str!("prompt/governance.txt");

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GovernanceAuditTrailEntry {
    pub timestamp_ms: u64,
    pub status: String,
    pub reviewer: String,
    pub notes: String,
    pub sha256_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentGovernanceRecord {
    pub filename: String,
    pub status: String,
    pub reviewer: String,
    pub stamp_id: Option<String>,
    pub sha256_hash: String,
    pub updated_at_ms: u64,
    pub locked: bool,
    pub history: Vec<GovernanceAuditTrailEntry>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WorkspaceGovernanceManifest {
    pub version: u32,
    pub updated_at_ms: u64,
    pub documents: BTreeMap<String, DocumentGovernanceRecord>,
}

pub fn governance_tool_definitions() -> Vec<Value> {
    vec![json!({
        "type": "function",
        "function": {
            "name": "manage_document_governance",
            "description": GOVERNANCE_PROMPT,
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["status", "update"],
                        "description": "'status' to list governance records, or 'update' to change a document's lifecycle state."
                    },
                    "filename": {
                        "type": "string",
                        "description": "Relative filename in the active project folder (required when action is 'update')."
                    },
                    "status": {
                        "type": "string",
                        "enum": ["DRAFT", "UNDER_REVIEW", "VERIFIED", "FINAL_LOCKED"],
                        "description": "Target governance lifecycle state."
                    },
                    "reviewer": {
                        "type": "string",
                        "description": "Reviewer or manager title (default: 'Arunaki Administration Manager')."
                    },
                    "apply_stamp": {
                        "type": "boolean",
                        "description": "Whether to append the official digital approval stamp block to the document."
                    },
                    "notes": {
                        "type": "string",
                        "description": "Audit notes or approval remarks."
                    }
                },
                "required": ["action"]
            }
        }
    })]
}

fn manifest_path(workspace_dir: &str) -> PathBuf {
    Path::new(workspace_dir)
        .join(".arunaki")
        .join("governance.json")
}

pub fn load_governance_manifest(workspace_dir: &str) -> WorkspaceGovernanceManifest {
    let path = manifest_path(workspace_dir);
    if let Ok(raw) = std::fs::read_to_string(&path) {
        if let Ok(manifest) = serde_json::from_str::<WorkspaceGovernanceManifest>(&raw) {
            return manifest;
        }
    }
    WorkspaceGovernanceManifest {
        version: 1,
        updated_at_ms: now_ms(),
        documents: BTreeMap::new(),
    }
}

pub fn save_governance_manifest(workspace_dir: &str, manifest: &WorkspaceGovernanceManifest) {
    let path = manifest_path(workspace_dir);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(serialized) = serde_json::to_string_pretty(manifest) {
        let _ = std::fs::write(path, serialized);
    }
}

pub fn compute_file_sha256(file_path: &Path) -> String {
    if let Ok(bytes) = std::fs::read(file_path) {
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        let digest = hasher.finalize();
        digest.iter().map(|b| format!("{:02x}", b)).collect()
    } else {
        "0000000000000000000000000000000000000000000000000000000000000000".to_string()
    }
}

fn normalize_rel_filename(workspace_dir: &str, raw_file: &str) -> String {
    let norm_root = workspace_dir.replace('\\', "/");
    let norm_file = raw_file.replace('\\', "/");
    if let Some(stripped) = norm_file.strip_prefix(&format!("{}/", norm_root.trim_end_matches('/'))) {
        stripped.to_string()
    } else {
        Path::new(&norm_file)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&norm_file)
            .to_string()
    }
}

/// Returns `true` if the specified file in `workspace_dir` is currently in `FINAL_LOCKED` state.
pub fn is_document_locked(workspace_dir: &str, raw_file: &str) -> bool {
    let key = normalize_rel_filename(workspace_dir, raw_file);
    let manifest = load_governance_manifest(workspace_dir);
    manifest
        .documents
        .get(&key)
        .map(|rec| rec.locked || rec.status == "FINAL_LOCKED")
        .unwrap_or(false)
}

/// Injects an official digital approval stamp into text-compatible office documents.
fn apply_digital_approval_stamp(
    file_path: &Path,
    reviewer: &str,
    status: &str,
    stamp_id: &str,
) -> bool {
    if !file_path.exists() {
        return false;
    }
    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let Ok(existing) = std::fs::read_to_string(file_path) else {
        return false;
    };

    if existing.contains("VERIFIED BY ARUNAKI ADMINISTRATION MANAGER") {
        return true;
    }

    let updated = if matches!(ext.as_str(), "xlsx" | "xls" | "csv") {
        format!(
            "{}\nSTAMP\tVERIFIED BY ARUNAKI ADMINISTRATION MANAGER\t{}\t{}\n",
            existing.trim_end(),
            status,
            stamp_id
        )
    } else {
        format!(
            "{}\n\n---\n### OFFICIAL DIGITAL GOVERNANCE STAMP\n- **Stamp Authority:** VERIFIED BY ARUNAKI ADMINISTRATION MANAGER\n- **Reviewer:** {}\n- **Lifecycle Status:** `{}`\n- **Digital Stamp ID:** `{}`\n",
            existing.trim_end(),
            reviewer,
            status,
            stamp_id
        )
    };

    std::fs::write(file_path, updated).is_ok()
}

pub fn execute_manage_governance(
    session_id: &str,
    workspace_dir: &str,
    args: &Value,
) -> Value {
    let action = args
        .get("action")
        .and_then(|v| v.as_str())
        .unwrap_or("status");

    let mut manifest = load_governance_manifest(workspace_dir);

    if action == "status" || action == "list" {
        let mut dirty = false;
        for (fname, rec) in manifest.documents.iter_mut() {
            if !rec.locked && rec.status == "VERIFIED" {
                let fp = Path::new(workspace_dir).join(fname);
                if fp.exists() {
                    let current_hash = compute_file_sha256(&fp);
                    let content_str = std::fs::read_to_string(&fp).unwrap_or_default();
                    let is_text_doc = matches!(
                        fp.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase().as_str(),
                        "txt" | "md" | "csv"
                    );
                    let stamp_removed = is_text_doc && !content_str.contains("VERIFIED BY ARUNAKI ADMINISTRATION MANAGER");
                    if current_hash != rec.sha256_hash || stamp_removed {
                        rec.status = "DRAFT".to_string();
                        rec.stamp_id = None;
                        rec.sha256_hash = current_hash;
                        rec.updated_at_ms = now_ms();
                        dirty = true;
                    }
                }
            }
        }
        if dirty {
            save_governance_manifest(workspace_dir, &manifest);
        }
        let records: Vec<DocumentGovernanceRecord> =
            manifest.documents.values().cloned().collect();
        return json!({
            "status": "success",
            "directory": workspace_dir,
            "count": records.len(),
            "documents": records,
            "manifest": manifest.documents,
        });
    }

    let Some(raw_filename) = args.get("filename").and_then(|v| v.as_str()) else {
        return json!({
            "status": "error",
            "message": "Missing required parameter 'filename' for governance update."
        });
    };

    let filename = normalize_rel_filename(workspace_dir, raw_filename);
    let file_path = Path::new(workspace_dir).join(&filename);

    let target_status = args
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("VERIFIED")
        .to_ascii_uppercase();

    let reviewer = args
        .get("reviewer")
        .and_then(|v| v.as_str())
        .unwrap_or("Arunaki Administration Manager")
        .to_string();

    let notes = args
        .get("notes")
        .and_then(|v| v.as_str())
        .unwrap_or("Lifecycle state updated by Administration Manager")
        .to_string();

    let apply_stamp = args
        .get("apply_stamp")
        .and_then(|v| v.as_bool())
        .unwrap_or(target_status == "VERIFIED" || target_status == "FINAL_LOCKED");

    let now = now_ms();
    let stamp_id = if target_status == "VERIFIED" || target_status == "FINAL_LOCKED" {
        Some(format!("ARN-STAMP-{}", now % 1_000_000_000))
    } else {
        None
    };

    if apply_stamp {
        if let Some(ref sid) = stamp_id {
            let _ = apply_digital_approval_stamp(&file_path, &reviewer, &target_status, sid);
        }
    }

    let sha256_hash = compute_file_sha256(&file_path);
    let is_locked = target_status == "FINAL_LOCKED";

    let trail_entry = GovernanceAuditTrailEntry {
        timestamp_ms: now,
        status: target_status.clone(),
        reviewer: reviewer.clone(),
        notes,
        sha256_hash: sha256_hash.clone(),
    };

    let record = manifest
        .documents
        .entry(filename.clone())
        .or_insert_with(|| DocumentGovernanceRecord {
            filename: filename.clone(),
            status: target_status.clone(),
            reviewer: reviewer.clone(),
            stamp_id: stamp_id.clone(),
            sha256_hash: sha256_hash.clone(),
            updated_at_ms: now,
            locked: is_locked,
            history: Vec::new(),
        });

    record.status = target_status.clone();
    record.reviewer = reviewer;
    if stamp_id.is_some() {
        record.stamp_id = stamp_id;
    }
    record.sha256_hash = sha256_hash;
    record.updated_at_ms = now;
    record.locked = is_locked;
    record.history.push(trail_entry);

    let updated_record = record.clone();
    manifest.updated_at_ms = now;
    save_governance_manifest(workspace_dir, &manifest);

    emit_event(
        workspace_dir,
        "governance:updated",
        json!({
            "sessionID": session_id,
            "filename": filename,
            "record": updated_record,
            "timestamp": now,
        }),
    );

    json!({
        "status": "success",
        "filename": filename,
        "record": updated_record,
        "summary": format!(
            "Document '{}' transitioned to '{}' (locked: {}, sha256: {}...).",
            filename,
            target_status,
            is_locked,
            &updated_record.sha256_hash[..12.min(updated_record.sha256_hash.len())]
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_document_governance_lifecycle_stamping_and_lock() {
        let temp_dir = std::env::temp_dir().join(format!("arunaki_gov_test_{}", now_ms()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let dir_str = temp_dir.to_string_lossy().to_string();

        let doc_path = temp_dir.join("daily_cash_closing_memo.docx");
        std::fs::write(&doc_path, "# Daily Cash Closing Memo\nInitial draft content.").unwrap();

        // 1. Set status to DRAFT
        let r1 = execute_manage_governance(
            "s1",
            &dir_str,
            &json!({
                "action": "update",
                "filename": "daily_cash_closing_memo.docx",
                "status": "DRAFT",
                "apply_stamp": false
            }),
        );
        assert_eq!(r1["record"]["status"], "DRAFT");
        assert!(!is_document_locked(&dir_str, "daily_cash_closing_memo.docx"));

        // 2. Transition to VERIFIED with digital stamp
        let r2 = execute_manage_governance(
            "s1",
            &dir_str,
            &json!({
                "action": "update",
                "filename": "daily_cash_closing_memo.docx",
                "status": "VERIFIED",
                "apply_stamp": true
            }),
        );
        assert_eq!(r2["record"]["status"], "VERIFIED");
        let stamped_text = std::fs::read_to_string(&doc_path).unwrap();
        assert!(stamped_text.contains("VERIFIED BY ARUNAKI ADMINISTRATION MANAGER"));

        // 3. Transition to FINAL_LOCKED
        let r3 = execute_manage_governance(
            "s1",
            &dir_str,
            &json!({
                "action": "update",
                "filename": "daily_cash_closing_memo.docx",
                "status": "FINAL_LOCKED"
            }),
        );
        assert_eq!(r3["record"]["status"], "FINAL_LOCKED");
        assert!(is_document_locked(&dir_str, "daily_cash_closing_memo.docx"));

        // 4. Verify write tool blocks editing a FINAL_LOCKED document
        let write_attempt = crate::tool::write::execute_write(
            "s1",
            &dir_str,
            &json!({
                "filePath": "daily_cash_closing_memo.docx",
                "content": "Unauthorized overwrite"
            }),
        );
        assert!(
            write_attempt["error"]
                .as_str()
                .unwrap_or("")
                .contains("FINAL_LOCKED"),
            "Write tool must reject mutation on FINAL_LOCKED document"
        );

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
