//! Document Tools module — mirrors `packages/engine/engine/src/tool/`.
//! All tool execution is strictly isolated to the active workspace folder.

pub mod bash;
pub mod doc_com;
pub mod doc_read;
pub mod edit;
pub mod glob;
pub mod grep;
pub mod image_ocr;
pub mod zen;
#[allow(unused_imports)]
pub mod open_app;
pub mod question;
pub mod read;
pub mod reconcile;
pub mod sop;
pub mod synthesize;
pub mod todo;
pub mod websearch;
pub mod write;

use serde_json::{json, Value};
use std::path::{Path, PathBuf};

use crate::paths::contains_path;

pub fn should_attach_document_tools(_prompt_text: &str, _history: &[Value]) -> bool {
    // In Arunaki desktop document agent, tools are ALWAYS attached
    // so any concise user instruction (e.g. "recap to excel", "fuel expense 100")
    // can autonomously discover, read, calculate, and modify workspace documents.
    true
}

pub fn build_tool_definitions() -> Vec<Value> {
    let mut defs = vec![
        open_app::open_app_tool_definition(),
        read::read_tool_definition(),
        write::write_tool_definition(),
        edit::edit_tool_definition(),
        glob::glob_tool_definition(),
        grep::grep_tool_definition(),
        todo::todo_tool_definition(),
        websearch::websearch_tool_definition(),
        question::question_tool_definition(),
        bash::bash_tool_definition(),
    ];
    defs.extend(doc_read::doc_read_tool_definitions());
    defs.push(image_ocr::image_ocr_tool_definition());
    defs.extend(doc_com::doc_com_tool_definitions());
    defs.extend(zen::zen_tool_definitions());
    defs.extend(sop::sop_tool_definitions());
    defs.extend(reconcile::reconcile_tool_definitions());
    defs.extend(synthesize::synthesize_tool_definitions());
    defs
}

pub fn resolve_isolated_path(workspace_dir: &str, raw_file: &str) -> Result<PathBuf, String> {
    let base = Path::new(workspace_dir);
    let candidate = Path::new(raw_file);
    let resolved = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        base.join(raw_file)
    };
    if !contains_path(base, &resolved) {
        return Err(format!(
            "Project Folder Isolation Error: '{}' is outside the active project folder '{}'",
            raw_file, workspace_dir
        ));
    }
    Ok(resolved)
}

pub async fn execute_tool_call(
    session_id: &str,
    assistant_msg_id: &str,
    call_id: &str,
    name: &str,
    arguments: &Value,
    workspace_dir: &str,
) -> Value {
    match name {
        "open_document_app" | "open_app" | "launch_app" | "open_artcraft_app" => {
            open_app::execute_open_app(session_id, workspace_dir, arguments)
        }
        "read" | "read_file" => read::execute_read(workspace_dir, arguments),
        "write" | "write_file" | "create_file" => {
            write::execute_write(session_id, workspace_dir, arguments)
        }
        "edit" | "edit_file" | "apply_patch" => {
            edit::execute_edit(session_id, workspace_dir, arguments)
        }
        "glob" | "list_files" | "list_directory" => glob::execute_glob(workspace_dir, arguments),
        "grep" | "search" | "search_files" => grep::execute_grep(workspace_dir, arguments),
        "todowrite" | "todo" => todo::execute_todowrite(session_id, workspace_dir, arguments),
        "websearch" => websearch::execute_websearch(arguments).await,
        "question" => {
            question::execute_question(
                session_id,
                assistant_msg_id,
                call_id,
                workspace_dir,
                arguments,
            )
            .await
        }
        "excel_read" => doc_read::execute_excel_read(workspace_dir, arguments),
        "word_read" => doc_read::execute_word_read(workspace_dir, arguments),
        "ppt_read" => doc_read::execute_ppt_read(workspace_dir, arguments),
        "pdf_read" => doc_read::execute_pdf_read(workspace_dir, arguments),
        "image_ocr" | "ocr" | "ocr_image" => {
            image_ocr::execute_image_ocr(workspace_dir, arguments)
        }
        "excel_com" | "word_com" | "ppt_com" => {
            doc_com::execute_doc_com(name, workspace_dir, arguments).await
        }
        "arunakizen_search_product" | "zen_search_product" | "pos_search_product" => {
            zen::execute_search_product(arguments).await
        }
        "arunakizen_create_sale_order" | "zen_create_order" | "pos_create_order" => {
            zen::execute_create_sale_order(arguments).await
        }
        "arunakizen_get_shift_summary" | "zen_shift_summary" | "pos_shift_summary" => {
            zen::execute_get_shift_summary(arguments).await
        }
        "arunakizen_print_receipt" | "zen_print_receipt" | "pos_print_receipt" => {
            zen::execute_print_receipt(arguments).await
        }
        "arunakizen_open_drawer" | "zen_open_drawer" | "pos_open_drawer" => {
            zen::execute_open_drawer(arguments).await
        }
        "arunakizen_adjust_stock" | "zen_adjust_stock" | "pos_adjust_stock" => {
            zen::execute_adjust_stock(arguments).await
        }
        "arunakizen_void_sale_order" | "zen_void_order" | "pos_void_order" | "void_sale_order" | "arunakizen_cancel_sale_order" => {
            zen::execute_void_sale_order(arguments).await
        }
        "list_sop_playbooks" | "get_sop_playbooks" | "sop_list" => {
            sop::execute_list_sop_playbooks(arguments)
        }
        "execute_sop_playbook" | "run_sop" | "run_sop_playbook" => {
            sop::execute_sop_playbook(session_id, workspace_dir, arguments)
        }
        "audit_reconciliation" | "three_way_match" | "reconcile_audit" => {
            reconcile::execute_audit_reconciliation(session_id, workspace_dir, arguments)
        }
        "generate_executive_summary" | "executive_summary" | "synthesize_executive" => {
            synthesize::execute_generate_executive_summary(session_id, workspace_dir, arguments)
        }
        "bash" | "shell" | "terminal" => {
            bash::execute_bash(session_id, workspace_dir, arguments).await
        }
        _ => json!({ "error": format!("Unknown tool: {}", name) }),
    }
}
