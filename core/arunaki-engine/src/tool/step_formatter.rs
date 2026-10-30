use axum::{response::IntoResponse, response::Response, Json};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub use crate::session::ui_mapper::format_tool_step_label;

/// Classifies a tool and label into a standardized UI semantic icon category.
pub fn classify_tool_icon_type(tool_name: &str, label: &str) -> &'static str {
    let t = tool_name.to_lowercase();
    let l = label.to_lowercase();

    if t.contains("arunakizen")
        || t.contains("catalog")
        || t.contains("katalog")
        || t.contains("pos")
        || t.contains("order")
        || t.contains("receipt")
        || t.contains("drawer")
        || t.contains("struk")
        || t.contains("nota")
    {
        if t.contains("search") || t.contains("product") || t.contains("katalog") || t.contains("catalog") || t.contains("barang") {
            return "package_search";
        }
        if t.contains("void") || t.contains("cancel") || t.contains("batal") {
            return "rotate_ccw";
        }
        if t.contains("order") || t.contains("sale") || t.contains("penjualan") || t.contains("transaksi") {
            return "receipt";
        }
        if t.contains("print") || t.contains("receipt") || t.contains("struk") || t.contains("nota") {
            return "printer";
        }
        if t.contains("drawer") || t.contains("laci") {
            return "vault";
        }
        if t.contains("shift") || t.contains("kasir") || t.contains("summary") {
            return "calculator";
        }
        if t.contains("stock") || t.contains("stok") {
            return "boxes";
        }
    }

    if t.contains("question") || t.contains("clarification") {
        return "question";
    }

    // Office & Documents
    if t.contains("excel") || t.contains("csv") || t.contains("xlsx") || t.contains("xls") || t.contains("grid") || l.contains("gridcraft") {
        return "spreadsheet";
    }
    if t.contains("word") || t.contains("docx") || t.contains("doc") || l.contains("wordcraft") {
        return "word";
    }
    if t.contains("pdf") || l.contains("pdfcraft") {
        return "pdf";
    }
    if t.contains("deck") || t.contains("ppt") || t.contains("slide") || l.contains("deckcraft") {
        return "deck";
    }
    if t.contains("knowledge") || t.contains("memory") {
        return "database";
    }

    // Edit/Write tool priority over generic "file"
    if t.contains("edit") || t.contains("write") || t.contains("replace") || t.contains("modify") {
        return "keyboard";
    }
    if t.contains("read") || t.contains("explore") || t.contains("file") || t.contains("search") {
        return "file_search";
    }

    "monitor"
}

#[derive(Deserialize)]
pub struct FormatStepRequest {
    #[serde(default, rename = "toolName")]
    pub tool_name: String,
    #[serde(default)]
    pub args: Value,
    #[serde(default, rename = "isFinished")]
    pub is_finished: Option<bool>,
}

#[derive(Serialize)]
pub struct FormatStepResponse {
    pub success: bool,
    pub label: String,
    pub icon_type: &'static str,
}

pub async fn handle_format_step_label(Json(req): Json<FormatStepRequest>) -> Response {
    let is_finished = req.is_finished.unwrap_or(false);
    let label = format_tool_step_label(&req.tool_name, &req.args, is_finished);
    let icon_type = classify_tool_icon_type(&req.tool_name, &label);

    Json(FormatStepResponse {
        success: true,
        label,
        icon_type,
    })
    .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_and_classify_step() {
        let label = format_tool_step_label("read_file", &json!({ "path": "docs/laporan.xlsx" }), true);
        assert_eq!(label, "Explored laporan.xlsx");
        assert_eq!(classify_tool_icon_type("read_file", &label), "file_search");

        let label_pos = format_tool_step_label("arunakizen_search_catalog", &json!({ "query": "Kopi Susu" }), true);
        assert_eq!(label_pos, "Searched catalog: Kopi Susu");
        assert_eq!(classify_tool_icon_type("arunakizen_search_catalog", &label_pos), "package_search");

        let label_edit = format_tool_step_label("edit_file", &json!({ "path": "summary.docx" }), false);
        assert_eq!(label_edit, "Editing summary.docx");
        assert_eq!(classify_tool_icon_type("edit_file", &label_edit), "keyboard");
    }
}
