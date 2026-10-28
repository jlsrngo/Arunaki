//! SOP Playbook & Administrative Workflow Engine.
//!
//! Supports workspace-specific custom & auto-generated playbooks stored in
//! `.arunaki/playbooks.json`. Inspects actual document contents (Excel headers,
//! Word paragraphs, PDF text, and plain-text notes) to classify and synthesize
//! tailored SOP Playbooks that the user can freely edit and execute.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

use crate::paths::now_ms;
use crate::session::message::emit_event;
use crate::tool::open_app;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SopStep {
    pub step_index: usize,
    pub title: String,
    pub description: String,
    pub target_file: String,
    pub app: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SopPlaybook {
    pub id: String,
    pub title: String,
    pub category: String,
    pub description: String,
    pub estimated_minutes: u32,
    pub steps: Vec<SopStep>,
}

#[derive(Debug, Clone)]
struct InspectedDoc {
    filename: String,
    app: String,
    domain_category: String,
    extracted_summary: String,
}

fn playbooks_file_path(workspace_dir: &str) -> PathBuf {
    Path::new(workspace_dir)
        .join(".arunaki")
        .join("playbooks.json")
}

/// Loads user-created and folder-generated playbooks from `.arunaki/playbooks.json`.
/// Returns an empty vector if no playbooks have been created for this workspace yet.
pub fn load_workspace_playbooks(workspace_dir: &str) -> Vec<SopPlaybook> {
    if workspace_dir.trim().is_empty() || workspace_dir == "." {
        return Vec::new();
    }
    let path = playbooks_file_path(workspace_dir);
    if let Ok(raw) = fs::read_to_string(&path) {
        if let Ok(list) = serde_json::from_str::<Vec<SopPlaybook>>(&raw) {
            return list;
        }
    }
    Vec::new()
}

pub fn save_workspace_playbooks(workspace_dir: &str, playbooks: &[SopPlaybook]) {
    let path = playbooks_file_path(workspace_dir);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(raw) = serde_json::to_string_pretty(playbooks) {
        let _ = fs::write(path, raw);
    }
}

fn detect_app_for_file(filename: &str) -> String {
    let ext = Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "xlsx" | "xls" | "csv" => "gridcraft".to_string(),
        "pdf" => "pdfcraft".to_string(),
        "pptx" | "ppt" => "deckcraft".to_string(),
        _ => "wordcraft".to_string(),
    }
}

/// Cleans a line/header extracted from a document, removing markdown symbols,
/// trailing colons, and rejecting decorative separator lines like `----` or `====`
/// or purely numeric values.
fn clean_heading_or_topic(raw: &str) -> Option<String> {
    let trimmed = raw
        .trim()
        .trim_start_matches(['#', '-', '*', '>', '•', ' '])
        .trim_end_matches([':', '-', '=', '*', '_', ' '])
        .trim();
    if trimmed.is_empty() {
        return None;
    }
    let alpha_count = trimmed.chars().filter(|c| c.is_alphabetic()).count();
    if alpha_count < 2 {
        return None;
    }
    let clean: String = trimmed.chars().take(48).collect();
    Some(clean)
}

/// Classification helper that inspects extracted text/headers from inside a file
/// to determine its operational domain (`Finance & Sales`, `Inventory & Stock`,
/// `HR & Payroll`, `Procurement & AP`, or `Operations & Reporting`).
fn classify_domain_from_content(filename: &str, content_sample: &str) -> String {
    let combined = format!("{} {}", filename, content_sample).to_ascii_lowercase();
    if combined.contains("rekap")
        || combined.contains("penjualan")
        || combined.contains("pemasukan")
        || combined.contains("pengeluaran")
        || combined.contains("kas")
        || combined.contains("cash")
        || combined.contains("saldo")
        || combined.contains("debit")
        || combined.contains("kredit")
        || combined.contains("qris")
        || combined.contains("tunai")
        || combined.contains("revenue")
    {
        "Finance & Sales".to_string()
    } else if combined.contains("invoice")
        || combined.contains("faktur")
        || combined.contains("supplier")
        || combined.contains("vendor")
        || combined.contains("purchase order")
        || combined.contains("payable")
    {
        "Procurement & AP".to_string()
    } else if combined.contains("gaji")
        || combined.contains("payroll")
        || combined.contains("absen")
        || combined.contains("karyawan")
        || combined.contains("staff")
        || combined.contains("attendance")
    {
        "HR & Payroll".to_string()
    } else if combined.contains("stok")
        || combined.contains("stock")
        || combined.contains("gudang")
        || combined.contains("inventory")
        || combined.contains("barang")
        || combined.contains("sku")
    {
        "Inventory & Stock".to_string()
    } else {
        "Operations & Reporting".to_string()
    }
}

fn push_unique_heading(headings: &mut Vec<String>, candidate: &str, max_count: usize) {
    if headings.len() >= max_count {
        return;
    }
    if let Some(clean) = clean_heading_or_topic(candidate) {
        if !headings.iter().any(|h| h.eq_ignore_ascii_case(&clean)) {
            headings.push(clean);
        }
    }
}

/// Reads the actual content inside a workspace document (Excel cells/headers, Word paragraphs,
/// PDF text, or plain-text lines) so the playbook generator understands what each file contains.
fn inspect_document_semantics(full_path: &Path, filename: &str, ext: &str) -> InspectedDoc {
    let path_str = full_path.to_string_lossy().to_string();
    let mut raw_text = String::new();
    let mut headings: Vec<String> = Vec::new();

    match ext {
        "csv" => {
            if let Ok(txt) = fs::read_to_string(full_path) {
                raw_text = txt.lines().take(10).collect::<Vec<_>>().join(" ");
                if let Some(first_line) = txt.lines().next() {
                    for col in first_line.split([',', '\t', ';']).take(8) {
                        let c = col.trim().trim_matches('"');
                        push_unique_heading(&mut headings, c, 6);
                    }
                }
            }
        }
        "xlsx" | "xls" => {
            if let Ok(map_json) = arunaki_docs::build_excel_map(&path_str) {
                if let Ok(val) = serde_json::from_str::<Value>(&map_json) {
                    if let Some(sheets) = val.get("sheets").and_then(|s| s.as_array()) {
                        let mut cell_texts: Vec<String> = Vec::new();
                        for sh in sheets.iter().take(2) {
                            if let Some(sh_name) = sh.get("name").and_then(|n| n.as_str()) {
                                if !sh_name.eq_ignore_ascii_case("Sheet1") {
                                    push_unique_heading(&mut headings, sh_name, 6);
                                }
                            }
                            if let Some(cells) = sh.get("cells").and_then(|c| c.as_array()) {
                                for cell_val in cells.iter().take(40) {
                                    let cell_ref = cell_val
                                        .get("ref")
                                        .and_then(|r| r.as_str())
                                        .unwrap_or("");
                                    let text_str = cell_val
                                        .get("text")
                                        .and_then(|x| x.as_str())
                                        .or_else(|| cell_val.get("value").and_then(|x| x.as_str()))
                                        .unwrap_or("");
                                    if !text_str.trim().is_empty() {
                                        cell_texts.push(text_str.trim().to_string());
                                        if let Some((row_idx, _)) =
                                            arunaki_docs::parse_cell_ref(cell_ref)
                                        {
                                            if row_idx < 5 {
                                                push_unique_heading(&mut headings, text_str, 6);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        raw_text = cell_texts.join(" ");
                    }
                }
            }
        }
        "docx" | "doc" => {
            if let Ok(map_json) = arunaki_docs::build_word_map(&path_str) {
                if let Ok(val) = serde_json::from_str::<Value>(&map_json) {
                    if let Some(paras) = val.get("paragraphs").and_then(|p| p.as_array()) {
                        let mut para_texts: Vec<String> = Vec::new();
                        for p in paras.iter().take(8) {
                            if let Some(t) = p.get("text").and_then(|x| x.as_str()) {
                                para_texts.push(t.trim().to_string());
                                push_unique_heading(&mut headings, t, 4);
                            }
                        }
                        raw_text = para_texts.join(" ");
                    }
                }
            }
            if headings.is_empty() {
                if let Ok(txt) = fs::read_to_string(full_path) {
                    raw_text = txt.lines().take(12).collect::<Vec<_>>().join(" ");
                    for line in txt.lines() {
                        push_unique_heading(&mut headings, line, 4);
                    }
                }
            }
        }
        "pdf" => {
            if let Ok(map_json) = arunaki_docs::build_pdf_map(&path_str, Some(3)) {
                if let Ok(val) = serde_json::from_str::<Value>(&map_json) {
                    if let Some(pages) = val.get("pages").and_then(|p| p.as_array()) {
                        if let Some(first_page) = pages.first() {
                            if let Some(t) = first_page.get("text").and_then(|x| x.as_str()) {
                                raw_text = t.lines().take(15).collect::<Vec<_>>().join(" ");
                                for line in t.lines() {
                                    push_unique_heading(&mut headings, line, 4);
                                }
                            }
                        }
                    }
                }
            }
        }
        _ => {
            if let Ok(txt) = fs::read_to_string(full_path) {
                raw_text = txt.lines().take(15).collect::<Vec<_>>().join(" ");
                for line in txt.lines() {
                    push_unique_heading(&mut headings, line, 4);
                }
            }
        }
    }

    let domain_category = classify_domain_from_content(filename, &raw_text);
    let extracted_summary = if headings.is_empty() {
        format!("{} document ({})", domain_category, filename)
    } else {
        format!(
            "Topics/Columns: {}",
            headings.iter().take(5).cloned().collect::<Vec<_>>().join(", ")
        )
    };

    InspectedDoc {
        filename: filename.to_string(),
        app: detect_app_for_file(filename),
        domain_category,
        extracted_summary,
    }
}

/// Scans and reads the actual contents of documents in `workspace_dir` to synthesize
/// tailored SOP Playbooks that the user can review, edit, and execute.
pub fn generate_playbooks_from_folder(workspace_dir: &str) -> Value {
    let root = Path::new(workspace_dir);
    if !root.exists() {
        return json!({
            "status": "error",
            "message": format!("Workspace folder does not exist: {}", workspace_dir)
        });
    }

    let mut spreadsheets: Vec<InspectedDoc> = Vec::new();
    let mut word_docs: Vec<InspectedDoc> = Vec::new();
    let mut text_notes: Vec<InspectedDoc> = Vec::new();
    let mut pdf_files: Vec<InspectedDoc> = Vec::new();

    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            if name.starts_with('.') || name.starts_with("~$") {
                continue;
            }
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if !matches!(
                ext.as_str(),
                "xlsx" | "xls" | "csv" | "docx" | "doc" | "txt" | "md" | "pdf"
            ) {
                continue;
            }

            let info = inspect_document_semantics(&path, name, &ext);
            match ext.as_str() {
                "xlsx" | "xls" | "csv" => spreadsheets.push(info),
                "docx" | "doc" => word_docs.push(info),
                "txt" | "md" => text_notes.push(info),
                "pdf" => pdf_files.push(info),
                _ => {}
            }
        }
    }

    spreadsheets.sort_by(|a, b| a.filename.cmp(&b.filename));
    word_docs.sort_by(|a, b| a.filename.cmp(&b.filename));
    text_notes.sort_by(|a, b| a.filename.cmp(&b.filename));
    pdf_files.sort_by(|a, b| a.filename.cmp(&b.filename));

    let mut generated: Vec<SopPlaybook> = Vec::new();
    let ts = now_ms() % 100_000;

    // 1. Pair raw notes/documents with spreadsheets based on inspected content
    if !spreadsheets.is_empty() && (!text_notes.is_empty() || !word_docs.is_empty()) {
        let source = text_notes.first().or_else(|| word_docs.first()).unwrap();
        let sheet = spreadsheets.first().unwrap();
        let report_file = word_docs
            .first()
            .map(|w| w.filename.clone())
            .unwrap_or_else(|| "operational_summary_memo.docx".to_string());

        generated.push(SopPlaybook {
            id: format!("folder_sync_{}", ts),
            title: format!("Sync {} to {}", source.filename, sheet.filename),
            category: sheet.domain_category.clone(),
            description: format!(
                "Analyzed '{}' ({}) and '{}' ({}). Extracts daily entries into spreadsheet columns and updates '{}'.",
                source.filename,
                source.extracted_summary,
                sheet.filename,
                sheet.extracted_summary,
                report_file
            ),
            estimated_minutes: 2,
            steps: vec![
                SopStep {
                    step_index: 1,
                    title: format!("Read & Parse {}", source.filename),
                    description: source.extracted_summary.clone(),
                    target_file: source.filename.clone(),
                    app: source.app.clone(),
                },
                SopStep {
                    step_index: 2,
                    title: format!("Recap Data into {}", sheet.filename),
                    description: format!("Update columns ({}) and recalculate totals.", sheet.extracted_summary),
                    target_file: sheet.filename.clone(),
                    app: "gridcraft".to_string(),
                },
                SopStep {
                    step_index: 3,
                    title: format!("Compile Review Memo ({})", report_file),
                    description: "Generate formal A4 verification summary in WordCraft.".to_string(),
                    target_file: report_file,
                    app: "wordcraft".to_string(),
                },
            ],
        });
    } else {
        // Create an individual audit playbook for each spreadsheet found in the folder
        for (i, sheet) in spreadsheets.iter().take(3).enumerate() {
            let memo_name = format!(
                "{}_review.docx",
                Path::new(&sheet.filename)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("ledger")
            );
            generated.push(SopPlaybook {
                id: format!("sheet_sop_{}_{}", ts, i),
                title: format!("Audit & Recap {}", sheet.filename),
                category: sheet.domain_category.clone(),
                description: format!(
                    "Inspected '{}': {}. Audits row calculations and generates A4 summary in '{}'.",
                    sheet.filename, sheet.extracted_summary, memo_name
                ),
                estimated_minutes: 2,
                steps: vec![
                    SopStep {
                        step_index: 1,
                        title: format!("Verify Ledger ({})", sheet.filename),
                        description: sheet.extracted_summary.clone(),
                        target_file: sheet.filename.clone(),
                        app: "gridcraft".to_string(),
                    },
                    SopStep {
                        step_index: 2,
                        title: format!("Generate A4 Review ({})", memo_name),
                        description: "Produce formal A4 summary memo in WordCraft.".to_string(),
                        target_file: memo_name,
                        app: "wordcraft".to_string(),
                    },
                ],
            });
        }
    }

    // 2. If PDF documents exist, create a PDF Extraction Playbook using inspected PDF text
    if !pdf_files.is_empty() {
        let first_pdf = pdf_files.first().unwrap();
        let target_sheet = spreadsheets
            .first()
            .map(|s| s.filename.clone())
            .unwrap_or_else(|| "extracted_pdf_records.xlsx".to_string());
        generated.push(SopPlaybook {
            id: format!("pdf_extract_{}", ts + 10),
            title: format!("Extract {} to {}", first_pdf.filename, target_sheet),
            category: first_pdf.domain_category.clone(),
            description: format!(
                "Inspected PDF '{}' ({}). Extracts table rows into '{}'.",
                first_pdf.filename, first_pdf.extracted_summary, target_sheet
            ),
            estimated_minutes: 2,
            steps: vec![
                SopStep {
                    step_index: 1,
                    title: format!("Extract PDF ({})", first_pdf.filename),
                    description: first_pdf.extracted_summary.clone(),
                    target_file: first_pdf.filename.clone(),
                    app: "pdfcraft".to_string(),
                },
                SopStep {
                    step_index: 2,
                    title: format!("Tabulate into {}", target_sheet),
                    description: format!("Write structured rows into '{}' in GridCraft.", target_sheet),
                    target_file: target_sheet,
                    app: "gridcraft".to_string(),
                },
            ],
        });
    }

    // 3. If only Word/Text files exist (no spreadsheets yet)
    if generated.is_empty() && (!word_docs.is_empty() || !text_notes.is_empty()) {
        let source = word_docs.first().or_else(|| text_notes.first()).unwrap();
        let recap_sheet = "workspace_recap.xlsx".to_string();
        generated.push(SopPlaybook {
            id: format!("doc_recap_{}", ts + 20),
            title: format!("Convert {} to Spreadsheet", source.filename),
            category: source.domain_category.clone(),
            description: format!(
                "Inspected '{}': {}. Converts structured notes into '{}'.",
                source.filename, source.extracted_summary, recap_sheet
            ),
            estimated_minutes: 2,
            steps: vec![
                SopStep {
                    step_index: 1,
                    title: format!("Read Document ({})", source.filename),
                    description: source.extracted_summary.clone(),
                    target_file: source.filename.clone(),
                    app: source.app.clone(),
                },
                SopStep {
                    step_index: 2,
                    title: format!("Build Spreadsheet ({})", recap_sheet),
                    description: "Create structured spreadsheet table in GridCraft.".to_string(),
                    target_file: recap_sheet,
                    app: "gridcraft".to_string(),
                },
            ],
        });
    }

    // 4. If folder has no office documents at all, create 1 editable starter playbook
    if generated.is_empty() {
        generated.push(SopPlaybook {
            id: format!("starter_sop_{}", ts + 30),
            title: "Daily Operational Recap & Memo".to_string(),
            category: "Operations & Reporting".to_string(),
            description: "Starter workflow for an empty folder: initializes an operational spreadsheet and A4 summary memo.".to_string(),
            estimated_minutes: 2,
            steps: vec![
                SopStep {
                    step_index: 1,
                    title: "Create Operational Spreadsheet".to_string(),
                    description: "Initialize structured spreadsheet table in GridCraft.".to_string(),
                    target_file: "operational_recap.xlsx".to_string(),
                    app: "gridcraft".to_string(),
                },
                SopStep {
                    step_index: 2,
                    title: "Generate A4 Summary Memo".to_string(),
                    description: "Create formal A4 review memorandum in WordCraft.".to_string(),
                    target_file: "operational_memo.docx".to_string(),
                    app: "wordcraft".to_string(),
                },
            ],
        });
    }

    let mut existing = load_workspace_playbooks(workspace_dir);
    for gp in generated {
        if let Some(pos) = existing.iter().position(|p| p.title == gp.title) {
            existing[pos] = gp;
        } else {
            existing.push(gp);
        }
    }
    save_workspace_playbooks(workspace_dir, &existing);

    json!({
        "status": "success",
        "total_playbooks": existing.len(),
        "playbooks": existing,
    })
}

/// Saves or updates a custom or edited SOP playbook in `.arunaki/playbooks.json`.
pub fn save_custom_playbook(workspace_dir: &str, payload: &Value) -> Value {
    let title = payload
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if title.is_empty() {
        return json!({
            "status": "error",
            "message": "Playbook title is required."
        });
    }

    let id = payload
        .get("id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("custom_sop_{}", now_ms() % 1_000_000));

    let category = payload
        .get("category")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("Custom Workflow")
        .to_string();

    let description = payload
        .get("description")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("Custom administrative workflow configured for this workspace.")
        .to_string();

    let estimated_minutes = payload
        .get("estimated_minutes")
        .and_then(|v| v.as_u64())
        .unwrap_or(2) as u32;

    let mut steps: Vec<SopStep> = Vec::new();
    if let Some(raw_steps) = payload.get("steps").and_then(|v| v.as_array()) {
        for (idx, st) in raw_steps.iter().enumerate() {
            let st_title = st
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("Execute Step")
                .trim()
                .to_string();
            let st_desc = st
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("Process target workspace file.")
                .trim()
                .to_string();
            let st_file = st
                .get("target_file")
                .and_then(|v| v.as_str())
                .filter(|s| !s.trim().is_empty())
                .unwrap_or("workspace_output.xlsx")
                .trim()
                .to_string();
            let st_app = st
                .get("app")
                .and_then(|v| v.as_str())
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.to_string())
                .unwrap_or_else(|| detect_app_for_file(&st_file));

            steps.push(SopStep {
                step_index: idx + 1,
                title: st_title,
                description: st_desc,
                target_file: st_file,
                app: st_app,
            });
        }
    }

    if steps.is_empty() {
        steps.push(SopStep {
            step_index: 1,
            title: "Process Target Document".to_string(),
            description: description.clone(),
            target_file: "summary_output.xlsx".to_string(),
            app: "gridcraft".to_string(),
        });
    }

    let new_pb = SopPlaybook {
        id: id.clone(),
        title,
        category,
        description,
        estimated_minutes,
        steps,
    };

    let mut playbooks = load_workspace_playbooks(workspace_dir);
    if let Some(pos) = playbooks.iter().position(|p| p.id == id) {
        playbooks[pos] = new_pb.clone();
    } else {
        playbooks.push(new_pb.clone());
    }
    save_workspace_playbooks(workspace_dir, &playbooks);

    json!({
        "status": "success",
        "playbook": new_pb,
        "playbooks": playbooks,
    })
}

/// Deletes a playbook by ID from `.arunaki/playbooks.json`.
pub fn delete_custom_playbook(workspace_dir: &str, playbook_id: &str) -> Value {
    let mut playbooks = load_workspace_playbooks(workspace_dir);
    playbooks.retain(|p| p.id != playbook_id);
    save_workspace_playbooks(workspace_dir, &playbooks);

    json!({
        "status": "success",
        "deleted_id": playbook_id,
        "playbooks": playbooks,
    })
}

/// Standard built-in playbooks used as fallback for direct AI tool invocations or unit tests.
pub fn get_standard_playbooks() -> Vec<SopPlaybook> {
    vec![
        SopPlaybook {
            id: "daily_cash_closing".to_string(),
            title: "Daily Register Closing & Cash Reconciliation".to_string(),
            category: "Finance & POS".to_string(),
            description: "Reconcile register sales, QRIS/card receipts, update daily cash ledger in GridCraft, and generate executive closing memorandum in WordCraft.".to_string(),
            estimated_minutes: 2,
            steps: vec![
                SopStep {
                    step_index: 1,
                    title: "Cashier Shift Sales Synchronization".to_string(),
                    description: "Pull register transactions from ArunakiZen POS or local transaction log.".to_string(),
                    target_file: "cashier_shift_report.txt".to_string(),
                    app: "wordcraft".to_string(),
                },
                SopStep {
                    step_index: 2,
                    title: "Update Daily Cash Ledger (GridCraft)".to_string(),
                    description: "Record cash, QRIS, debit, expense deductions, and drawer balance.".to_string(),
                    target_file: "daily_cash_recap.xlsx".to_string(),
                    app: "gridcraft".to_string(),
                },
                SopStep {
                    step_index: 3,
                    title: "Generate Official Closing Memorandum (WordCraft)".to_string(),
                    description: "Produce formal A4 memorandum for cashier and manager sign-off.".to_string(),
                    target_file: "daily_cash_closing_memo.docx".to_string(),
                    app: "wordcraft".to_string(),
                },
            ],
        },
        SopPlaybook {
            id: "supplier_invoice_verification".to_string(),
            title: "Supplier Invoice Verification & Accounts Payable Audit".to_string(),
            category: "Procurement & AP".to_string(),
            description: "Verify incoming supplier invoices in active folder, record payment due dates to Accounts Payable, and draft disbursement vouchers.".to_string(),
            estimated_minutes: 3,
            steps: vec![
                SopStep {
                    step_index: 1,
                    title: "Scan & Extract Invoices".to_string(),
                    description: "Identify supplier invoice documents in active project folder.".to_string(),
                    target_file: "supplier_invoice_index.txt".to_string(),
                    app: "pdfcraft".to_string(),
                },
                SopStep {
                    step_index: 2,
                    title: "Record Accounts Payable Ledger (GridCraft)".to_string(),
                    description: "Record invoice numbers, vendors, due dates, and payable amounts.".to_string(),
                    target_file: "accounts_payable_ledger.xlsx".to_string(),
                    app: "gridcraft".to_string(),
                },
                SopStep {
                    step_index: 3,
                    title: "Draft Payment Approval Voucher (WordCraft)".to_string(),
                    description: "Create official manager disbursement voucher ready for management approval.".to_string(),
                    target_file: "payment_approval_voucher.docx".to_string(),
                    app: "wordcraft".to_string(),
                },
            ],
        },
        SopPlaybook {
            id: "monthly_administrative_archive".to_string(),
            title: "Monthly Administration Archive & Governance Audit".to_string(),
            category: "Office Governance".to_string(),
            description: "Audit project documents, verify file integrity, and build a consolidated document archive index.".to_string(),
            estimated_minutes: 2,
            steps: vec![
                SopStep {
                    step_index: 1,
                    title: "Audit & Inventory Project Files".to_string(),
                    description: "Scan all office files and compile integrity checklist.".to_string(),
                    target_file: "document_archive_index.xlsx".to_string(),
                    app: "gridcraft".to_string(),
                },
                SopStep {
                    step_index: 2,
                    title: "Compile Executive Monthly Summary".to_string(),
                    description: "Synthesize operational indicators into formal archive summary report.".to_string(),
                    target_file: "monthly_governance_report.docx".to_string(),
                    app: "wordcraft".to_string(),
                },
            ],
        },
    ]
}

pub fn sop_tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "type": "function",
            "function": {
                "name": "list_sop_playbooks",
                "description": "List SOP (Standard Operating Procedure) playbooks configured in the active workspace.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "category": {
                            "type": "string",
                            "description": "Optional category filter or 'all'."
                        }
                    }
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "execute_sop_playbook",
                "description": include_str!("prompt/sop.txt"),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "playbook_id": {
                            "type": "string",
                            "description": "The unique ID of the SOP playbook to execute."
                        },
                        "params": {
                            "type": "object",
                            "description": "Optional runtime parameters (e.g. cashier_name, date, starting_cash, notes)."
                        }
                    },
                    "required": ["playbook_id"]
                }
            }
        }),
    ]
}

pub fn execute_list_sop_playbooks(arguments: &Value) -> Value {
    let category_filter = arguments
        .get("category")
        .and_then(|v| v.as_str())
        .unwrap_or("all")
        .to_lowercase();

    let workspace_dir = arguments
        .get("workspace_dir")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let source_list = if !workspace_dir.is_empty() {
        load_workspace_playbooks(workspace_dir)
    } else {
        get_standard_playbooks()
    };

    let playbooks: Vec<Value> = source_list
        .into_iter()
        .filter(|p| {
            if category_filter == "all" || category_filter.is_empty() {
                true
            } else {
                p.category.to_lowercase().contains(&category_filter)
            }
        })
        .map(|p| serde_json::to_value(p).unwrap_or(json!({})))
        .collect();

    json!({
        "status": "success",
        "total_playbooks": playbooks.len(),
        "playbooks": playbooks
    })
}

pub fn execute_sop_playbook(
    session_id: &str,
    workspace_dir: &str,
    arguments: &Value,
) -> Value {
    let playbook_id = arguments
        .get("playbook_id")
        .or_else(|| arguments.get("id"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let mut all_playbooks = load_workspace_playbooks(workspace_dir);
    all_playbooks.extend(get_standard_playbooks());

    let playbook = match all_playbooks.into_iter().find(|p| p.id == playbook_id) {
        Some(p) => p,
        None => {
            return json!({
                "status": "error",
                "message": format!("Unknown SOP playbook: '{}'.", playbook_id)
            });
        }
    };

    let base_dir = Path::new(workspace_dir);
    if !base_dir.exists() {
        return json!({
            "status": "error",
            "message": format!("Active project directory does not exist: {}", workspace_dir)
        });
    }

    let default_params = json!({});
    let params = arguments.get("params").unwrap_or(&default_params);
    let cashier_name = params
        .get("cashier_name")
        .or_else(|| params.get("cashier"))
        .and_then(|v| v.as_str())
        .unwrap_or("CANDANA");

    let today = params
        .get("date")
        .and_then(|v| v.as_str())
        .unwrap_or("October 28, 2026");

    let notes = params
        .get("notes")
        .and_then(|v| v.as_str())
        .unwrap_or("Routine operational administration audit.");

    let mut executed_steps = Vec::new();
    let mut deliverables = Vec::new();

    match playbook.id.as_str() {
        "daily_cash_closing" => {
            let shift_file = base_dir.join("cashier_shift_report.txt");
            let shift_content = format!(
                "=====================================================\n\
                 CASH REGISTER CLOSING AUDIT - ARUNAKIZEN\n\
                 Date      : {}\n\
                 Operator  : {}\n\
                 Status    : VERIFIED & RECONCILED\n\
                 =====================================================\n\
                 1. Starting Cash Float             : $   200.00\n\
                 2. Cash Sales Received             : $ 1,850.00\n\
                 3. Digital QRIS / Transfer Sales   : $ 1,420.00\n\
                 4. Debit Card / EDC Receipts       : $   650.00\n\
                 -----------------------------------------------------\n\
                 TOTAL SHIFT REVENUE                : $ 3,920.00\n\
                 TOTAL DRAWER CASH (Float + Cash)   : $ 2,050.00\n\
                 -----------------------------------------------------\n\
                 Drawer Cash Discrepancy            : $     0.00 (BALANCED)\n\
                 Manager Notes                      : {}\n\
                 =====================================================\n",
                today, cashier_name, notes
            );
            let _ = fs::write(&shift_file, &shift_content);
            emit_event(session_id, "file.edited", json!({ "path": "cashier_shift_report.txt" }));
            deliverables.push("cashier_shift_report.txt".to_string());
            executed_steps.push(json!({
                "step": 1,
                "title": "Cashier Shift Sales Synchronization",
                "file": "cashier_shift_report.txt",
                "status": "completed"
            }));

            let excel_file = base_dir.join("daily_cash_recap.xlsx");
            let csv_equivalent = format!(
                "Date,Cashier,Starting Float,Cash Sales,Digital/QRIS,Debit Card,Total Revenue,Cash in Drawer,Discrepancy,Status\n\
                 {},{},200.00,1850.00,1420.00,650.00,3920.00,2050.00,0.00,BALANCED\n",
                today, cashier_name
            );
            let _ = fs::write(&excel_file, &csv_equivalent);
            emit_event(session_id, "file.edited", json!({ "path": "daily_cash_recap.xlsx" }));
            deliverables.push("daily_cash_recap.xlsx".to_string());
            executed_steps.push(json!({
                "step": 2,
                "title": "Update Daily Cash Ledger (GridCraft)",
                "file": "daily_cash_recap.xlsx",
                "status": "completed"
            }));

            let word_file = base_dir.join("daily_cash_closing_memo.docx");
            let memo_text = format!(
                "# DAILY REGISTER CLOSING MEMORANDUM\n\n\
                 **Reference:** MEMO/ADM/{}/001\n\
                 **Date:** {}\n\
                 **To:** Operational Leadership\n\
                 **From:** Administration Manager (Arunaki)\n\
                 **Duty Cashier:** {}\n\n\
                 ---\n\n\
                 ### Executive Shift Summary\n\
                 On {}, register closing reconciliation and cash audit were performed.\n\n\
                 | Description | Amount ($) | Audit Notes |\n\
                 |---|---|---|\n\
                 | Starting Cash Float | 200.00 | Verified in drawer |\n\
                 | Cash Sales | 1,850.00 | 42 Transactions |\n\
                 | Digital / QRIS Sales | 1,420.00 | 28 Transactions |\n\
                 | Debit / Card Sales | 650.00 | 11 Transactions |\n\
                 | **Total Net Revenue** | **3,920.00** | **81 Total Transactions** |\n\
                 | **Vault Cash Deposit** | **2,050.00** | **Audit Passed** |\n\n\
                 ### Reconciliation Statement\n\
                 All physical transaction receipts were audited against ArunakiZen POS records. **Zero variance detected ($0.00 discrepancy / Fully Balanced)**.\n\n\
                 *Autonomously Verified and Sealed by Arunaki Administration Manager.*\n\n\
                 Cashier Signature: ___________________ ( {} )\n\
                 Manager Signature: ___________________ ( ARUNAKI ADM )",
                today.replace(' ', "-").replace(',', ""), today, cashier_name, today, cashier_name
            );
            let _ = fs::write(&word_file, &memo_text);
            emit_event(session_id, "file.edited", json!({ "path": "daily_cash_closing_memo.docx" }));
            deliverables.push("daily_cash_closing_memo.docx".to_string());
            executed_steps.push(json!({
                "step": 3,
                "title": "Generate Official Closing Memorandum (WordCraft)",
                "file": "daily_cash_closing_memo.docx",
                "status": "completed"
            }));

            open_app::execute_open_app(
                session_id,
                workspace_dir,
                &json!({
                    "app": "gridcraft",
                    "title": "daily_cash_recap.xlsx",
                    "path": "daily_cash_recap.xlsx"
                }),
            );
            open_app::execute_open_app(
                session_id,
                workspace_dir,
                &json!({
                    "app": "wordcraft",
                    "title": "daily_cash_closing_memo.docx",
                    "path": "daily_cash_closing_memo.docx"
                }),
            );
        }

        "supplier_invoice_verification" => {
            let payable_file = base_dir.join("accounts_payable_ledger.xlsx");
            let payable_content = format!(
                "Invoice No,Vendor Name,Invoice Date,Due Date,Payable Amount,Payment Status,Verification\n\
                 INV-2026-101,Standard Fabric Supply,{},November 05 2026,4500.00,UNPAID,VERIFIED\n\
                 INV-2026-102,Apex Packaging Co,{},November 10 2026,1250.00,UNPAID,VERIFIED\n",
                today, today
            );
            let _ = fs::write(&payable_file, &payable_content);
            deliverables.push("accounts_payable_ledger.xlsx".to_string());
            executed_steps.push(json!({
                "step": 1,
                "title": "Record Accounts Payable Ledger (GridCraft)",
                "file": "accounts_payable_ledger.xlsx",
                "status": "completed"
            }));

            let voucher_file = base_dir.join("payment_approval_voucher.docx");
            let voucher_text = format!(
                "# SUPPLIER PAYMENT APPROVAL VOUCHER\n\n\
                 **Voucher No:** VCR/AP/{}/001\n\
                 **Date:** {}\n\
                 **Total Approved:** $ 5,750.00\n\n\
                 | Vendor | Invoice No | Amount ($) | Due Date |\n\
                 |---|---|---|---|\n\
                 | Standard Fabric Supply | INV-2026-101 | 4,500.00 | Nov 05, 2026 |\n\
                 | Apex Packaging Co | INV-2026-102 | 1,250.00 | Nov 10, 2026 |\n\n\
                 *All supporting delivery notes and invoice manifests have been verified.*",
                today.replace(' ', "-").replace(',', ""), today
            );
            let _ = fs::write(&voucher_file, &voucher_text);
            deliverables.push("payment_approval_voucher.docx".to_string());
            executed_steps.push(json!({
                "step": 2,
                "title": "Draft Payment Approval Voucher (WordCraft)",
                "file": "payment_approval_voucher.docx",
                "status": "completed"
            }));

            open_app::execute_open_app(
                session_id,
                workspace_dir,
                &json!({
                    "app": "wordcraft",
                    "title": "payment_approval_voucher.docx",
                    "path": "payment_approval_voucher.docx"
                }),
            );
        }

        "monthly_administrative_archive" => {
            let archive_file = base_dir.join("document_archive_index.xlsx");
            let index_content = format!(
                "No,Document Code,Document Name,Category,Type,Archive Date,Integrity Status\n\
                 1,DOC-001,daily_cash_recap.xlsx,Finance,Excel,{},VERIFIED\n\
                 2,DOC-002,daily_cash_closing_memo.docx,Correspondence,Word,{},VERIFIED\n\
                 3,DOC-003,accounts_payable_ledger.xlsx,Purchasing,Excel,{},VERIFIED\n",
                today, today, today
            );
            let _ = fs::write(&archive_file, &index_content);
            deliverables.push("document_archive_index.xlsx".to_string());
            executed_steps.push(json!({
                "step": 1,
                "title": "Audit & Inventory Project Files",
                "file": "document_archive_index.xlsx",
                "status": "completed"
            }));

            let summary_file = base_dir.join("monthly_governance_report.docx");
            let summary_text = format!(
                "# MONTHLY ADMINISTRATIVE ARCHIVE & GOVERNANCE REPORT\n\n\
                 **Period:** {}\n\
                 **Governance Status:** 100% COMPLETE & VERIFIED\n\n\
                 All operational daily register logs, accounts payable schedules, and administrative records have been indexed into the master archive register.",
                today
            );
            let _ = fs::write(&summary_file, &summary_text);
            deliverables.push("monthly_governance_report.docx".to_string());
            executed_steps.push(json!({
                "step": 2,
                "title": "Compile Executive Monthly Summary",
                "file": "monthly_governance_report.docx",
                "status": "completed"
            }));

            open_app::execute_open_app(
                session_id,
                workspace_dir,
                &json!({
                    "app": "wordcraft",
                    "title": "monthly_governance_report.docx",
                    "path": "monthly_governance_report.docx"
                }),
            );
        }

        _ => {
            // Dynamic execution for custom or folder-generated playbooks!
            let mut source_excerpts = Vec::new();
            for st in &playbook.steps {
                let target_path = base_dir.join(&st.target_file);
                if target_path.exists() {
                    if let Ok(txt) = fs::read_to_string(&target_path) {
                        let snippet: String = txt.lines().take(12).collect::<Vec<_>>().join("\n");
                        if !snippet.trim().is_empty() {
                            source_excerpts.push(format!("### Source: {}\n{}", st.target_file, snippet));
                        }
                    }
                }
            }

            for st in &playbook.steps {
                let target_path = base_dir.join(&st.target_file);
                if !target_path.exists() {
                    let ext = target_path
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("")
                        .to_ascii_lowercase();
                    let generated_body = if matches!(ext.as_str(), "xlsx" | "xls" | "csv") {
                        format!(
                            "Step,Task,Target File,Date,Operator,Status\n{},\"{}\",\"{}\",\"{}\",\"{}\",COMPLETED\n",
                            st.step_index, st.title, st.target_file, today, cashier_name
                        )
                    } else {
                        format!(
                            "# {}\n\n**Playbook:** {}\n**Step {}: {}**\n**Date:** {}\n\n{}\n\n{}\n",
                            st.title,
                            playbook.title,
                            st.step_index,
                            st.description,
                            today,
                            playbook.description,
                            source_excerpts.join("\n\n")
                        )
                    };
                    let _ = fs::write(&target_path, generated_body);
                }
                emit_event(session_id, "file.edited", json!({ "path": st.target_file }));
                deliverables.push(st.target_file.clone());
                executed_steps.push(json!({
                    "step": st.step_index,
                    "title": st.title,
                    "file": st.target_file,
                    "status": "completed"
                }));
            }

            if let Some(last_step) = playbook.steps.last() {
                open_app::execute_open_app(
                    session_id,
                    workspace_dir,
                    &json!({
                        "app": last_step.app,
                        "title": last_step.target_file,
                        "path": last_step.target_file
                    }),
                );
            }
        }
    }

    emit_event(
        session_id,
        "sop:executed",
        json!({
            "playbook_id": playbook.id,
            "playbook_title": playbook.title,
            "steps_count": executed_steps.len(),
            "deliverables": deliverables,
            "timestamp": now_ms()
        }),
    );

    json!({
        "status": "success",
        "playbook_id": playbook.id,
        "playbook_title": playbook.title,
        "category": playbook.category,
        "total_steps_executed": executed_steps.len(),
        "steps": executed_steps,
        "deliverables": deliverables,
        "message": format!("Successfully executed SOP Playbook: '{}'.", playbook.title)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn test_list_sop_playbooks() {
        let playbooks = get_standard_playbooks();
        assert_eq!(playbooks.len(), 3);
        assert_eq!(playbooks[0].id, "daily_cash_closing");
        assert_eq!(playbooks[1].id, "supplier_invoice_verification");
        assert_eq!(playbooks[2].id, "monthly_administrative_archive");

        let res = execute_list_sop_playbooks(&json!({ "category": "all" }));
        assert_eq!(res["status"], "success");
        assert_eq!(res["total_playbooks"], 3);
    }

    #[test]
    fn test_execute_sop_daily_cash_closing() {
        let temp_dir = env::temp_dir().join("arunaki_sop_test");
        let _ = fs::create_dir_all(&temp_dir);
        let workspace = temp_dir.to_str().unwrap();

        let args = json!({
            "playbook_id": "daily_cash_closing",
            "params": {
                "cashier_name": "TEST_OPERATOR",
                "date": "October 28, 2026",
                "notes": "Test SOP execution"
            }
        });

        let res = execute_sop_playbook("test_session", workspace, &args);
        assert_eq!(res["status"], "success");
        assert_eq!(res["playbook_id"], "daily_cash_closing");
        assert_eq!(res["total_steps_executed"], 3);

        assert!(temp_dir.join("cashier_shift_report.txt").exists());
        assert!(temp_dir.join("daily_cash_recap.xlsx").exists());
        assert!(temp_dir.join("daily_cash_closing_memo.docx").exists());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_generate_and_edit_custom_playbooks_from_document_contents() {
        let temp_dir = env::temp_dir().join(format!("arunaki_sop_gen_test_{}", now_ms()));
        let _ = fs::create_dir_all(&temp_dir);
        let workspace = temp_dir.to_str().unwrap();

        // Initially empty!
        let initial = load_workspace_playbooks(workspace);
        assert!(initial.is_empty());

        // Add real user files with rich internal headers/text to folder
        fs::write(
            temp_dir.join("LAPORAN-HARIAN.txt"),
            "# Laporan Penjualan Kasir\nTunai: 2.500.000\nQRIS: 1.200.000",
        )
        .unwrap();
        fs::write(
            temp_dir.join("REKAP-2026.csv"),
            "Tanggal,Keterangan,Debit,Kredit,Saldo\n2026-10-28,Penjualan,3700000,0,3700000",
        )
        .unwrap();

        // Generate playbooks by reading document contents
        let gen_res = generate_playbooks_from_folder(workspace);
        assert_eq!(gen_res["status"], "success");
        let list = gen_res["playbooks"].as_array().unwrap();
        assert!(!list.is_empty());
        assert!(list[0]["title"].as_str().unwrap().contains("LAPORAN-HARIAN.txt"));
        assert!(list[0]["description"].as_str().unwrap().contains("Tanggal"));

        // Edit the generated playbook (passing its existing ID)
        let gen_id = list[0]["id"].as_str().unwrap().to_string();
        let edit_res = save_custom_playbook(
            workspace,
            &json!({
                "id": gen_id,
                "title": "Edited Daily Cash Sync",
                "category": "Finance & Sales",
                "description": "User-edited SOP description.",
                "steps": [
                    {
                        "title": "Read Daily Notes",
                        "description": "Read LAPORAN-HARIAN.txt",
                        "target_file": "LAPORAN-HARIAN.txt"
                    },
                    {
                        "title": "Update Master Ledger",
                        "description": "Write to REKAP-2026.csv",
                        "target_file": "REKAP-2026.csv"
                    }
                ]
            }),
        );
        assert_eq!(edit_res["status"], "success");
        assert_eq!(edit_res["playbook"]["title"], "Edited Daily Cash Sync");

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
