use std::collections::HashMap;
use std::env;
use std::fs::File;
use std::io::Read;
use std::process;
use zip::ZipArchive;

pub fn json_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                out.push_str(&format!("\\u{:04x}", c as u32));
            }
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

pub fn xml_unescape(s: &str) -> String {
    s.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

pub fn strip_word_xml(xml: &str) -> String {
    let mut out = String::with_capacity(xml.len());
    let bytes = xml.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'<' {
            if let Some(rel_end) = xml[i..].find('>') {
                let tag = &xml[i..=i + rel_end];
                if tag.starts_with("<w:tab") && tag.ends_with("/>") {
                    out.push(' ');
                } else if tag.starts_with("<w:br") && tag.ends_with("/>") {
                    out.push('\n');
                }
                i += rel_end + 1;
                continue;
            }
        }
        let ch = xml[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    xml_unescape(out.trim())
}

fn find_tag_blocks<'a>(xml: &'a str, open_prefix: &str, close_tag: &str) -> Vec<(usize, usize, &'a str)> {
    let mut results = Vec::new();
    let mut search_from = 0;
    while let Some(rel_start) = xml[search_from..].find(open_prefix) {
        let start = search_from + rel_start;
        let after_prefix = start + open_prefix.len();
        if after_prefix < xml.len() {
            let next_ch = xml.as_bytes()[after_prefix];
            if next_ch != b'>' && next_ch != b' ' && next_ch != b'\t' && next_ch != b'\r' && next_ch != b'\n' && next_ch != b'/' {
                search_from = after_prefix;
                continue;
            }
        }
        let Some(rel_open_end) = xml[start..].find('>') else {
            break;
        };
        let open_end = start + rel_open_end;
        if xml[start..=open_end].ends_with("/>") {
            search_from = open_end + 1;
            continue;
        }
        let content_start = open_end + 1;
        let Some(rel_close) = xml[content_start..].find(close_tag) else {
            break;
        };
        let content_end = content_start + rel_close;
        let end = content_end + close_tag.len();
        results.push((start, end, &xml[content_start..content_end]));
        search_from = end;
    }
    results
}

fn find_tag_blocks_with_open<'a>(
    xml: &'a str,
    open_prefix: &str,
    close_tag: &str,
) -> Vec<(&'a str, &'a str)> {
    let mut results = Vec::new();
    let mut search_from = 0;
    while let Some(rel_start) = xml[search_from..].find(open_prefix) {
        let start = search_from + rel_start;
        let after_prefix = start + open_prefix.len();
        if after_prefix < xml.len() {
            let next_ch = xml.as_bytes()[after_prefix];
            if next_ch != b'>' && next_ch != b' ' && next_ch != b'\t' && next_ch != b'\r' && next_ch != b'\n' && next_ch != b'/' {
                search_from = after_prefix;
                continue;
            }
        }
        let Some(rel_open_end) = xml[start..].find('>') else {
            break;
        };
        let open_end = start + rel_open_end;
        let open_tag = &xml[start..=open_end];
        if open_tag.ends_with("/>") {
            results.push((open_tag, ""));
            search_from = open_end + 1;
            continue;
        }
        let content_start = open_end + 1;
        let Some(rel_close) = xml[content_start..].find(close_tag) else {
            break;
        };
        let content_end = content_start + rel_close;
        let end = content_end + close_tag.len();
        results.push((open_tag, &xml[content_start..content_end]));
        search_from = end;
    }
    results
}

fn extract_attr(tag: &str, attr_name: &str) -> Option<String> {
    let pattern = format!("{}=\"", attr_name);
    let start = tag.find(&pattern)? + pattern.len();
    let end = start + tag[start..].find('"')?;
    Some(tag[start..end].to_string())
}

pub fn build_word_map_from_xml(file_path: &str, xml: &str) -> String {
    let body = match (xml.find("<w:body>"), xml.rfind("</w:body>")) {
        (Some(s), Some(e)) if s + 8 <= e => &xml[s + 8..e],
        _ => xml,
    };

    #[derive(Clone)]
    enum Event<'a> {
        Para(usize, usize, &'a str),
        Table(usize, &'a str),
    }

    let mut events: Vec<Event> = Vec::new();
    for (s, e, content) in find_tag_blocks(body, "<w:p", "</w:p>") {
        events.push(Event::Para(s, e, content));
    }
    let tables_raw = find_tag_blocks(body, "<w:tbl", "</w:tbl>");
    for &(s, _, content) in &tables_raw {
        events.push(Event::Table(s, content));
    }
    events.sort_by_key(|ev| match *ev {
        Event::Para(s, _, _) | Event::Table(s, _) => s,
    });

    let mut paragraphs_json = Vec::new();
    let mut tables_json = Vec::new();
    let mut para_index = 0usize;
    let mut table_index = 0usize;

    for ev in events {
        match ev {
            Event::Para(pos, end, content) => {
                let inside_table = tables_raw.iter().any(|&(ts, te, _)| pos > ts && end < te);
                if inside_table {
                    continue;
                }
                let text = strip_word_xml(content);
                if !text.is_empty() {
                    para_index += 1;
                    paragraphs_json.push(format!(
                        "{{\"index\":{},\"text\":{}}}",
                        para_index,
                        json_escape(&text)
                    ));
                }
            }
            Event::Table(_, content) => {
                let mut rows_json = Vec::new();
                for (_, _, tr_content) in find_tag_blocks(content, "<w:tr", "</w:tr>") {
                    let mut cells_json = Vec::new();
                    for (_, _, tc_content) in find_tag_blocks(tr_content, "<w:tc", "</w:tc>") {
                        let cell_text = strip_word_xml(tc_content);
                        cells_json.push(json_escape(&cell_text));
                    }
                    rows_json.push(format!("[{}]", cells_json.join(",")));
                }
                table_index += 1;
                tables_json.push(format!(
                    "{{\"index\":{},\"rows\":[{}]}}",
                    table_index,
                    rows_json.join(",")
                ));
            }
        }
    }

    format!(
        "{{\"format\":\"word\",\"filePath\":{},\"paragraphs\":[{}],\"tables\":[{}]}}",
        json_escape(file_path),
        paragraphs_json.join(","),
        tables_json.join(",")
    )
}

pub fn build_word_map(file_path: &str) -> Result<String, String> {
    let file = File::open(file_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut doc_file = archive
        .by_name("word/document.xml")
        .map_err(|_| "not a .docx (no word/document.xml)".to_string())?;
    let mut xml = String::new();
    doc_file.read_to_string(&mut xml).map_err(|e| e.to_string())?;
    Ok(build_word_map_from_xml(file_path, &xml))
}

pub fn build_ppt_map(file_path: &str) -> Result<String, String> {
    let file = File::open(file_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    let mut slide_entries: Vec<(usize, String)> = Vec::new();
    for i in 0..archive.len() {
        if let Ok(f) = archive.by_index(i) {
            let name = f.name().to_string();
            if let Some(rest) = name.strip_prefix("ppt/slides/slide") {
                if let Some(num_str) = rest.strip_suffix(".xml") {
                    if let Ok(num) = num_str.parse::<usize>() {
                        slide_entries.push((num, name));
                    }
                }
            }
        }
    }
    slide_entries.sort_by_key(|(num, _)| *num);

    let mut slides_json = Vec::new();
    for (number, name) in slide_entries {
        let mut xml = String::new();
        archive
            .by_name(&name)
            .map_err(|e| e.to_string())?
            .read_to_string(&mut xml)
            .map_err(|e| e.to_string())?;

        let mut shapes_json = Vec::new();
        for (_, _, sp_content) in find_tag_blocks(&xml, "<p:sp", "</p:sp>") {
            let mut shape_id: i64 = -1;
            let mut shape_name: Option<String> = None;
            if let Some(cnv_pos) = sp_content.find("<p:cNvPr") {
                if let Some(cnv_end) = sp_content[cnv_pos..].find('>') {
                    let cnv_tag = &sp_content[cnv_pos..=cnv_pos + cnv_end];
                    if let Some(id_str) = extract_attr(cnv_tag, "id") {
                        if let Ok(parsed_id) = id_str.parse::<i64>() {
                            shape_id = parsed_id;
                        }
                    }
                    shape_name = extract_attr(cnv_tag, "name");
                }
            }
            let mut texts = Vec::new();
            for (_, _, t_content) in find_tag_blocks(sp_content, "<a:t", "</a:t>") {
                texts.push(xml_unescape(t_content));
            }
            let joined = texts.join("\n").trim().to_string();
            let name_json = match shape_name {
                Some(n) => json_escape(&n),
                None => "null".to_string(),
            };
            let text_json = if joined.is_empty() {
                "null".to_string()
            } else {
                json_escape(&joined)
            };
            shapes_json.push(format!(
                "{{\"id\":{},\"name\":{},\"text\":{}}}",
                shape_id, name_json, text_json
            ));
        }

        slides_json.push(format!(
            "{{\"number\":{},\"shapes\":[{}]}}",
            number,
            shapes_json.join(",")
        ));
    }

    Ok(format!(
        "{{\"format\":\"ppt\",\"filePath\":{},\"slides\":[{}]}}",
        json_escape(file_path),
        slides_json.join(",")
    ))
}

fn parse_cell_ref(cell_ref: &str) -> Option<(usize, usize)> {
    // Returns 0-indexed (row, col)
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

fn encode_col(mut col: usize) -> String {
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

fn encode_cell_ref(row: usize, col: usize) -> String {
    format!("{}{}", encode_col(col), row + 1)
}

pub fn build_excel_map(file_path: &str) -> Result<String, String> {
    let file = File::open(file_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

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

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 3 {
        eprintln!("Usage: arunaki-docs <excel|word|ppt> <filePath>");
        process::exit(2);
    }
    let cmd = args[1].as_str();
    let file_path = args[2].as_str();

    let result = match cmd {
        "excel" => build_excel_map(file_path),
        "word" => build_word_map(file_path),
        "ppt" => build_ppt_map(file_path),
        other => Err(format!("Unsupported command: {}", other)),
    };

    match result {
        Ok(json) => {
            println!("{}", json);
        }
        Err(err) => {
            eprintln!("{}", err);
            process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn word_xml_extracts_paragraphs_and_tables_matching_docmap() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:p><w:r><w:t>Daftar Ukuran Seragam</w:t></w:r></w:p>
            <w:tbl>
              <w:tr>
                <w:tc><w:p><w:r><w:t>Ukuran</w:t></w:r></w:p></w:tc>
                <w:tc><w:p><w:r><w:t>Jumlah</w:t></w:r></w:p></w:tc>
              </w:tr>
              <w:tr>
                <w:tc><w:p><w:r><w:t>M</w:t></w:r></w:p></w:tc>
                <w:tc><w:p><w:r><w:t>10</w:t></w:r></w:p></w:tc>
              </w:tr>
            </w:tbl>
          </w:body>
        </w:document>"#;

        let out = build_word_map_from_xml("laporan.docx", xml);
        assert_eq!(
            out,
            r#"{"format":"word","filePath":"laporan.docx","paragraphs":[{"index":1,"text":"Daftar Ukuran Seragam"}],"tables":[{"index":1,"rows":[["Ukuran","Jumlah"],["M","10"]]}]}"#
        );
    }

    #[test]
    fn cell_ref_roundtrip() {
        assert_eq!(parse_cell_ref("A1"), Some((0, 0)));
        assert_eq!(parse_cell_ref("C6"), Some((5, 2)));
        assert_eq!(encode_cell_ref(5, 2), "C6");
    }
}
