use crate::util::{extract_attr, find_tag_blocks, find_tag_blocks_with_open, json_escape, xml_unescape};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Read;
use zip::ZipArchive;

pub fn parse_cell_ref(cell_ref: &str) -> Option<(usize, usize)> {
    let mut col: usize = 0;
    let mut row_str = String::new();
    for ch in cell_ref.chars() {
        if ch.is_ascii_alphabetic() {
            col = col * 26 + ((ch.to_ascii_uppercase() as u8 - b'A') as usize + 1);
        } else if ch.is_ascii_digit() {
            row_str.push(ch);
        }
    }
    if col == 0 || row_str.is_empty() {
        return None;
    }
    let row = row_str.parse::<usize>().ok()?;
    if row == 0 {
        return None;
    }
    Some((row - 1, col - 1))
}

pub fn encode_col(mut col: usize) -> String {
    let mut chars = Vec::new();
    loop {
        chars.push((b'A' + (col % 26) as u8) as char);
        if col < 26 {
            break;
        }
        col = col / 26 - 1;
    }
    chars.into_iter().rev().collect()
}

pub fn encode_cell_ref(row: usize, col: usize) -> String {
    format!("{}{}", encode_col(col), row + 1)
}

fn parse_csv_line(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut cur = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        if in_quotes {
            if c == '"' {
                if chars.peek() == Some(&'"') {
                    cur.push('"');
                    chars.next();
                } else {
                    in_quotes = false;
                }
            } else {
                cur.push(c);
            }
        } else if c == '"' {
            in_quotes = true;
        } else if c == ',' {
            fields.push(cur.clone());
            cur.clear();
        } else {
            cur.push(c);
        }
    }
    fields.push(cur);
    fields
}

pub fn build_csv_excel_map(file_path: &str, content: &str) -> String {
    let mut min_row = usize::MAX;
    let mut max_row = 0usize;
    let mut min_col = usize::MAX;
    let mut max_col = 0usize;
    let mut has_cells = false;
    let mut cells_json = Vec::new();

    for (r, line) in content.lines().enumerate() {
        let trimmed = line.trim_end_matches('\r');
        if trimmed.is_empty() {
            continue;
        }
        for (c, val) in parse_csv_line(trimmed).into_iter().enumerate() {
            let v = val.trim();
            if v.is_empty() {
                continue;
            }
            has_cells = true;
            if r < min_row {
                min_row = r;
            }
            if r > max_row {
                max_row = r;
            }
            if c < min_col {
                min_col = c;
            }
            if c > max_col {
                max_col = c;
            }
            let cell_ref = encode_cell_ref(r, c);
            let (val_json, text_json, effective_type) = if let Ok(num) = v.parse::<f64>() {
                (v.to_string(), json_escape(&num.to_string()), "n")
            } else {
                let esc = json_escape(v);
                (esc.clone(), esc, "s")
            };
            cells_json.push(format!(
                "{{\"ref\":{},\"value\":{},\"text\":{},\"type\":{},\"formula\":null}}",
                json_escape(&cell_ref),
                val_json,
                text_json,
                json_escape(effective_type)
            ));
        }
    }

    let (range_json, row_count, col_count) = if has_cells {
        let r_str = format!(
            "{}:{}",
            encode_cell_ref(min_row, min_col),
            encode_cell_ref(max_row, max_col)
        );
        (
            json_escape(&r_str),
            max_row - min_row + 1,
            max_col - min_col + 1,
        )
    } else {
        ("null".to_string(), 0, 0)
    };

    format!(
        "{{\"format\":\"excel\",\"filePath\":{},\"sheets\":[{{\"name\":\"Sheet1\",\"range\":{},\"rowCount\":{},\"colCount\":{},\"cells\":[{}],\"merges\":[]}}]}}",
        json_escape(file_path),
        range_json,
        row_count,
        col_count,
        cells_json.join(",")
    )
}

pub fn build_excel_map(file_path: &str) -> Result<String, String> {
    if file_path.to_ascii_lowercase().ends_with(".csv") {
        let text = fs::read_to_string(file_path).map_err(|e| e.to_string())?;
        return Ok(build_csv_excel_map(file_path, &text));
    }

    let mut file = File::open(file_path).map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    build_excel_map_from_bytes(file_path, &bytes)
}

pub fn build_excel_map_from_bytes(file_path: &str, bytes: &[u8]) -> Result<String, String> {
    if file_path.to_ascii_lowercase().ends_with(".csv") || !bytes.starts_with(b"PK\x03\x04") {
        let text = String::from_utf8_lossy(bytes);
        return Ok(build_csv_excel_map(file_path, &text));
    }

    let cursor = std::io::Cursor::new(bytes);
    let mut archive = ZipArchive::new(cursor).map_err(|e| e.to_string())?;

    // 1. Read sharedStrings.xml if present
    let mut shared_strings: Vec<String> = Vec::new();
    if let Ok(mut sst_file) = archive.by_name("xl/sharedStrings.xml") {
        let mut sst_xml = String::new();
        sst_file.read_to_string(&mut sst_xml).map_err(|e| e.to_string())?;
        for (_, _, si_content) in find_tag_blocks(&sst_xml, "<si", "</si>") {
            let mut parts = Vec::new();
            for (_, _, t_content) in find_tag_blocks(si_content, "<t", "</t>") {
                parts.push(xml_unescape(t_content));
            }
            shared_strings.push(parts.join(""));
        }
    }

    // 2. Read workbook relationships (xl/_rels/workbook.xml.rels)
    let mut rel_targets: HashMap<String, String> = HashMap::new();
    if let Ok(mut rels_file) = archive.by_name("xl/_rels/workbook.xml.rels") {
        let mut rels_xml = String::new();
        rels_file.read_to_string(&mut rels_xml).map_err(|e| e.to_string())?;
        for (open_tag, _) in find_tag_blocks_with_open(&rels_xml, "<Relationship", "</Relationship>") {
            if let (Some(id), Some(target)) = (extract_attr(open_tag, "Id"), extract_attr(open_tag, "Target")) {
                let normalized = if let Some(stripped) = target.strip_prefix("/xl/") {
                    format!("xl/{}", stripped)
                } else if let Some(stripped) = target.strip_prefix('/') {
                    stripped.to_string()
                } else if target.starts_with("xl/") {
                    target
                } else {
                    format!("xl/{}", target)
                };
                rel_targets.insert(id, normalized);
            }
        }
    }

    // 3. Read workbook.xml for sheet names & r:id
    let mut wb_xml = String::new();
    archive
        .by_name("xl/workbook.xml")
        .map_err(|_| "not an .xlsx (no xl/workbook.xml)".to_string())?
        .read_to_string(&mut wb_xml)
        .map_err(|e| e.to_string())?;

    let mut sheet_metas: Vec<(String, String)> = Vec::new();
    for (idx, (open_tag, _)) in find_tag_blocks_with_open(&wb_xml, "<sheet", "</sheet>")
        .into_iter()
        .enumerate()
    {
        if open_tag.starts_with("<sheets") {
            continue;
        }
        let name = extract_attr(open_tag, "name").unwrap_or_else(|| format!("Sheet{}", idx + 1));
        let rid = extract_attr(open_tag, "r:id").unwrap_or_default();
        let target = rel_targets
            .get(&rid)
            .cloned()
            .unwrap_or_else(|| format!("xl/worksheets/sheet{}.xml", sheet_metas.len() + 1));
        sheet_metas.push((name, target));
    }

    let mut sheets_json = Vec::new();
    for (sheet_name, target_path) in sheet_metas {
        let mut ws_xml = String::new();
        if let Ok(mut ws_file) = archive.by_name(&target_path) {
            ws_file.read_to_string(&mut ws_xml).map_err(|e| e.to_string())?;
        } else {
            continue;
        }

        let mut min_row = usize::MAX;
        let mut max_row = 0usize;
        let mut min_col = usize::MAX;
        let mut max_col = 0usize;
        let mut has_cells = false;
        let mut cells_json = Vec::new();

        for (c_open, c_content) in find_tag_blocks_with_open(&ws_xml, "<c", "</c>") {
            let Some(cell_ref) = extract_attr(c_open, "r") else {
                continue;
            };
            let cell_type = extract_attr(c_open, "t");
            let formula = find_tag_blocks(c_content, "<f", "</f>")
                .first()
                .map(|(_, _, f)| xml_unescape(f));
            let raw_v = find_tag_blocks(c_content, "<v", "</v>")
                .first()
                .map(|(_, _, v)| xml_unescape(v));
            let inline_t = find_tag_blocks(c_content, "<is", "</is>")
                .first()
                .and_then(|(_, _, is_c)| {
                    find_tag_blocks(is_c, "<t", "</t>")
                        .first()
                        .map(|(_, _, t)| xml_unescape(t))
                });

            if raw_v.is_none() && inline_t.is_none() && formula.is_none() {
                continue;
            }

            if let Some((r, c)) = parse_cell_ref(&cell_ref) {
                has_cells = true;
                if r < min_row {
                    min_row = r;
                }
                if r > max_row {
                    max_row = r;
                }
                if c < min_col {
                    min_col = c;
                }
                if c > max_col {
                    max_col = c;
                }
            }

            let (val_json, text_json, effective_type) = match cell_type.as_deref() {
                Some("s") => {
                    let idx = raw_v
                        .as_deref()
                        .and_then(|v| v.parse::<usize>().ok())
                        .unwrap_or(0);
                    let s = shared_strings.get(idx).cloned().unwrap_or_default();
                    let esc = json_escape(&s);
                    (esc.clone(), esc, "s")
                }
                Some("inlineStr") => {
                    let s = inline_t.or(raw_v).unwrap_or_default();
                    let esc = json_escape(&s);
                    (esc.clone(), esc, "s")
                }
                Some("str") => {
                    let s = raw_v.unwrap_or_default();
                    let esc = json_escape(&s);
                    (esc.clone(), esc, "s")
                }
                Some("b") => {
                    let b = raw_v.as_deref() == Some("1") || raw_v.as_deref() == Some("true");
                    (
                        if b { "true".to_string() } else { "false".to_string() },
                        if b { "\"TRUE\"".to_string() } else { "\"FALSE\"".to_string() },
                        "b",
                    )
                }
                _ => {
                    if let Some(v) = raw_v {
                        if let Ok(num) = v.parse::<f64>() {
                            (v.clone(), json_escape(&num.to_string()), "n")
                        } else {
                            let esc = json_escape(&v);
                            (esc.clone(), esc, "s")
                        }
                    } else {
                        ("null".to_string(), "null".to_string(), "n")
                    }
                }
            };

            let formula_json = match formula {
                Some(f) => json_escape(&f),
                None => "null".to_string(),
            };

            cells_json.push(format!(
                "{{\"ref\":{},\"value\":{},\"text\":{},\"type\":{},\"formula\":{}}}",
                json_escape(&cell_ref),
                val_json,
                text_json,
                json_escape(effective_type),
                formula_json
            ));
        }

        let (range_json, row_count, col_count) = if has_cells {
            let r_str = format!(
                "{}:{}",
                encode_cell_ref(min_row, min_col),
                encode_cell_ref(max_row, max_col)
            );
            (
                json_escape(&r_str),
                max_row - min_row + 1,
                max_col - min_col + 1,
            )
        } else {
            ("null".to_string(), 0, 0)
        };

        let mut merges_json = Vec::new();
        for (m_open, _) in find_tag_blocks_with_open(&ws_xml, "<mergeCell", "</mergeCell>") {
            if m_open.starts_with("<mergeCells") {
                continue;
            }
            if let Some(m_ref) = extract_attr(m_open, "ref") {
                if let Some((anchor, end)) = m_ref.split_once(':') {
                    merges_json.push(format!(
                        "{{\"anchor\":{},\"end\":{}}}",
                        json_escape(anchor),
                        json_escape(end)
                    ));
                }
            }
        }

        sheets_json.push(format!(
            "{{\"name\":{},\"range\":{},\"rowCount\":{},\"colCount\":{},\"cells\":[{}],\"merges\":[{}]}}",
            json_escape(&sheet_name),
            range_json,
            row_count,
            col_count,
            cells_json.join(","),
            merges_json.join(",")
        ));
    }

    Ok(format!(
        "{{\"format\":\"excel\",\"filePath\":{},\"sheets\":[{}]}}",
        json_escape(file_path),
        sheets_json.join(",")
    ))
}
