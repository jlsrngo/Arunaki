//! Document COM Automation Tool — Windows COM automation for Excel, Word, PowerPoint.
//! Controls desktop applications for high-fidelity formatting, tables, and editing.

use serde_json::{json, Value};

use super::resolve_isolated_path;

fn parse_cell_coord(coord: &str) -> (usize, usize) {
    let mut col_str = String::new();
    let mut row_str = String::new();
    for ch in coord.chars() {
        if ch.is_ascii_alphabetic() {
            col_str.push(ch.to_ascii_uppercase());
        } else if ch.is_ascii_digit() {
            row_str.push(ch);
        }
    }
    let col = letter_to_col_index(&col_str);
    let row = row_str.parse::<usize>().unwrap_or(1);
    (col, row)
}

fn letter_to_col_index(letter: &str) -> usize {
    let mut idx = 0;
    for ch in letter.chars() {
        if ch.is_ascii_uppercase() {
            idx = idx * 26 + (ch as usize - 'A' as usize + 1);
        }
    }
    if idx == 0 {
        1
    } else {
        idx
    }
}

fn col_index_to_letter(mut idx: usize) -> String {
    let mut result = String::new();
    while idx > 0 {
        let rem = (idx - 1) % 26;
        result.insert(0, (b'A' + rem as u8) as char);
        idx = (idx - 1) / 26;
    }
    if result.is_empty() {
        "A".to_string()
    } else {
        result
    }
}

fn parse_cells_arg(arguments: &Value) -> Vec<(String, String)> {
    let mut result = Vec::new();

    // 1. Array of objects or arrays: cells: [{"cell": "A1", "value": "x"}] or [["A1", "x"]]
    if let Some(arr) = arguments.get("cells").and_then(|v| v.as_array()) {
        for item in arr {
            if let Some(obj) = item.as_object() {
                let cell = obj
                    .get("cell")
                    .or_else(|| obj.get("r"))
                    .or_else(|| obj.get("coordinate"))
                    .or_else(|| obj.get("key"))
                    .and_then(|v| v.as_str());
                let val = obj
                    .get("value")
                    .or_else(|| obj.get("v"))
                    .or_else(|| obj.get("val"));
                if let (Some(c), Some(v)) = (cell, val) {
                    let v_str = if let Some(s) = v.as_str() {
                        s.to_string()
                    } else {
                        v.to_string()
                    };
                    result.push((c.to_string(), v_str));
                }
            } else if let Some(pair) = item.as_array() {
                if pair.len() >= 2 {
                    let c = pair[0].as_str().unwrap_or("");
                    let v = if let Some(s) = pair[1].as_str() {
                        s.to_string()
                    } else {
                        pair[1].to_string()
                    };
                    if !c.is_empty() {
                        result.push((c.to_string(), v));
                    }
                }
            }
        }
    } else if let Some(map) = arguments.get("cells").and_then(|v| v.as_object()) {
        // 2. Object map {"A1": "val", "B1": "val"}
        for (k, v) in map {
            let v_str = if let Some(s) = v.as_str() {
                s.to_string()
            } else {
                v.to_string()
            };
            result.push((k.clone(), v_str));
        }
    }

    // 3. Row-based batch writing: rows: [["a", "b"], ["c", "d"]] with startCell (e.g. "A14")
    if let Some(rows) = arguments.get("rows").and_then(|v| v.as_array()) {
        let start_cell = arguments
            .get("startCell")
            .or_else(|| arguments.get("start_cell"))
            .and_then(|v| v.as_str())
            .unwrap_or("A1");

        let (start_col, start_row) = parse_cell_coord(start_cell);
        for (r_idx, row_val) in rows.iter().enumerate() {
            if let Some(row_arr) = row_val.as_array() {
                let current_row = start_row + r_idx;
                for (c_idx, cell_val) in row_arr.iter().enumerate() {
                    let col_letter = col_index_to_letter(start_col + c_idx);
                    let coord = format!("{}{}", col_letter, current_row);
                    let v_str = if let Some(s) = cell_val.as_str() {
                        s.to_string()
                    } else {
                        cell_val.to_string()
                    };
                    result.push((coord, v_str));
                }
            }
        }
    }

    result
}

pub fn doc_com_tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "type": "function",
            "function": {
                "name": "excel_com",
                "description": include_str!("prompt/excel_com.txt"),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": { "type": "string", "description": "Relative path to Excel file." },
                        "action": { "type": "string", "enum": ["open", "format", "write", "write_range", "summary"], "description": "Action to perform. Use 'write' or 'write_range' for updating cells." },
                        "sheet": { "type": "string", "description": "Sheet name to target (optional)." },
                        "cells": {
                            "type": "array",
                            "description": "BATCH CELL UPDATE (HIGHLY RECOMMENDED FOR MULTIPLE CELLS): List of cells to write in a single batch. Example: [{'cell': 'A14', 'value': '2026-10-24'}, {'cell': 'B14', 'value': 'CK GINTING'}, {'cell': 'C14', 'value': '130000'}]. DO NOT call excel_com in a loop for each cell!",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "cell": { "type": "string", "description": "Target cell coordinate (e.g. 'A14')" },
                                    "value": { "type": "string", "description": "Value or formula to write (e.g. '=SUM(C2:C13)')" }
                                },
                                "required": ["cell", "value"]
                            }
                        },
                        "rows": {
                            "type": "array",
                            "description": "BATCH ROW UPDATE: 2D array of rows to insert starting at startCell. Example: [['CK GINTING', '130000', 'BRI'], ['CK SHANK', '372000', 'BNI']]",
                            "items": {
                                "type": "array",
                                "items": { "type": "string" }
                            }
                        },
                        "startCell": { "type": "string", "description": "Starting cell coordinate for 'rows' batch write (e.g. 'A14'). Defaults to 'A1'." },
                        "cell": { "type": "string", "description": "Single target cell (e.g. A1, B5). Used ONLY when writing a single cell. Use 'cells' or 'rows' when updating multiple cells." },
                        "value": { "type": "string", "description": "Value or formula to write for a single cell." },
                        "bold": { "type": "boolean" },
                        "italic": { "type": "boolean" },
                        "fontSize": { "type": "number" },
                        "bgColor": { "type": "number", "description": "RGB integer color." },
                        "alignment": { "type": "string", "enum": ["left", "center", "right"] },
                        "sourceSheet": { "type": "string" }
                    },
                    "required": ["file", "action"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "word_com",
                "description": include_str!("prompt/word_com.txt"),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": { "type": "string", "description": "Relative path to Word document." },
                        "action": { "type": "string", "enum": ["open", "append", "replace", "format"], "description": "Action to perform." },
                        "text": { "type": "string", "description": "Text content to insert." },
                        "paragraphIndex": { "type": "number" },
                        "findText": { "type": "string" },
                        "replaceText": { "type": "string" },
                        "bold": { "type": "boolean" },
                        "fontSize": { "type": "number" },
                        "alignment": { "type": "string", "enum": ["left", "center", "right"] }
                    },
                    "required": ["file", "action"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "ppt_com",
                "description": include_str!("prompt/ppt_com.txt"),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file": { "type": "string", "description": "Relative path to PowerPoint presentation." },
                        "action": { "type": "string", "enum": ["open", "add_slide", "set_text"], "description": "Action to perform." },
                        "slideNumber": { "type": "number" },
                        "shapeIndex": { "type": "number" },
                        "shapeName": { "type": "string" },
                        "text": { "type": "string" },
                        "title": { "type": "string" }
                    },
                    "required": ["file", "action"]
                }
            }
        }),
    ]
}

pub async fn execute_doc_com(
    name: &str,
    workspace_dir: &str,
    arguments: &Value,
) -> Value {
    let fp = arguments.get("file").and_then(|v| v.as_str()).unwrap_or("");
    let action = arguments
        .get("action")
        .and_then(|v| v.as_str())
        .unwrap_or("open")
        .to_string();

    match resolve_isolated_path(workspace_dir, fp) {
        Ok(p) => {
            let abs = p.to_string_lossy().to_string();
            let script = if name == "excel_com" {
                let parsed_cells = parse_cells_arg(arguments);
                let effective_action = if !parsed_cells.is_empty()
                    && (action == "write" || action == "write_range" || action == "format")
                {
                    "write_range".to_string()
                } else {
                    action
                };

                let params = arunaki_docs::ExcelComParams {
                    action: effective_action,
                    file_path: Some(abs),
                    sheet_name: arguments
                        .get("sheet")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    cell: arguments
                        .get("cell")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    value: arguments
                        .get("value")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    cells: parsed_cells,
                    bold: arguments.get("bold").and_then(|v| v.as_bool()),
                    italic: arguments.get("italic").and_then(|v| v.as_bool()),
                    font_size: arguments.get("fontSize").and_then(|v| v.as_f64()),
                    bg_color: arguments.get("bgColor").and_then(|v| v.as_i64()),
                    alignment: arguments
                        .get("alignment")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    source_sheet: arguments
                        .get("sourceSheet")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    new_sheet_name: None,
                };
                arunaki_docs::build_excel_com_script(&params)
            } else if name == "word_com" {
                let params = arunaki_docs::WordComParams {
                    action,
                    file_path: Some(abs),
                    text: arguments
                        .get("text")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    paragraph_index: arguments
                        .get("paragraphIndex")
                        .and_then(|v| v.as_u64())
                        .map(|n| n as usize),
                    find_text: arguments
                        .get("findText")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    replace_text: arguments
                        .get("replaceText")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    bold: arguments.get("bold").and_then(|v| v.as_bool()),
                    font_size: arguments.get("fontSize").and_then(|v| v.as_f64()),
                    alignment: arguments
                        .get("alignment")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                };
                arunaki_docs::build_word_com_script(&params)
            } else {
                let params = arunaki_docs::PptComParams {
                    action,
                    file_path: Some(abs),
                    slide_number: arguments
                        .get("slideNumber")
                        .and_then(|v| v.as_u64())
                        .map(|n| n as usize),
                    shape_index: arguments
                        .get("shapeIndex")
                        .and_then(|v| v.as_u64())
                        .map(|n| n as usize),
                    shape_name: arguments
                        .get("shapeName")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    text: arguments
                        .get("text")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    title: arguments
                        .get("title")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    layout: None,
                };
                arunaki_docs::build_ppt_com_script(&params)
            };

            let prefix = name.to_string();
            let res = tokio::task::spawn_blocking(move || {
                arunaki_docs::run_powershell_script(&prefix, &script)
            })
            .await
            .unwrap_or_else(|e| Err(e.to_string()));

            match res {
                Ok(out) => {
                    if out.starts_with("ERROR:") {
                        json!({ "error": out })
                    } else {
                        json!({ "ok": true, "output": out })
                    }
                }
                Err(e) => json!({ "error": e }),
            }
        }
        Err(e) => json!({ "error": e }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cell_coord_parsing_and_conversion() {
        assert_eq!(parse_cell_coord("A1"), (1, 1));
        assert_eq!(parse_cell_coord("B14"), (2, 14));
        assert_eq!(parse_cell_coord("AA20"), (27, 20));
        assert_eq!(col_index_to_letter(1), "A");
        assert_eq!(col_index_to_letter(2), "B");
        assert_eq!(col_index_to_letter(26), "Z");
        assert_eq!(col_index_to_letter(27), "AA");
    }

    #[test]
    fn test_parse_cells_arg_array_of_objects() {
        let args = json!({
            "cells": [
                { "cell": "A14", "value": "CK GINTING" },
                { "cell": "B14", "value": 130 }
            ]
        });
        let parsed = parse_cells_arg(&args);
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0], ("A14".to_string(), "CK GINTING".to_string()));
        assert_eq!(parsed[1], ("B14".to_string(), "130".to_string()));
    }

    #[test]
    fn test_parse_cells_arg_rows_2d_array() {
        let args = json!({
            "startCell": "A14",
            "rows": [
                ["CK GINTING", "130", "BRI"],
                ["CK SHANK", "372", "BNI"]
            ]
        });
        let parsed = parse_cells_arg(&args);
        assert_eq!(parsed.len(), 6);
        assert_eq!(parsed[0], ("A14".to_string(), "CK GINTING".to_string()));
        assert_eq!(parsed[1], ("B14".to_string(), "130".to_string()));
        assert_eq!(parsed[2], ("C14".to_string(), "BRI".to_string()));
        assert_eq!(parsed[3], ("A15".to_string(), "CK SHANK".to_string()));
        assert_eq!(parsed[4], ("B15".to_string(), "372".to_string()));
        assert_eq!(parsed[5], ("C15".to_string(), "BNI".to_string()));
    }
}
