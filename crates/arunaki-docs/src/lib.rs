use flate2::read::ZlibDecoder;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Read;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
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
            if next_ch != b'>'
                && next_ch != b' '
                && next_ch != b'\t'
                && next_ch != b'\r'
                && next_ch != b'\n'
                && next_ch != b'/'
            {
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
            if next_ch != b'>'
                && next_ch != b' '
                && next_ch != b'\t'
                && next_ch != b'\r'
                && next_ch != b'\n'
                && next_ch != b'/'
            {
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

fn extract_pdf_text_from_stream(stream_str: &str) -> String {
    let mut out = String::new();
    let bytes = stream_str.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'(' {
            i += 1;
            let mut literal = String::new();
            let mut depth = 1usize;
            while i < bytes.len() && depth > 0 {
                let b = bytes[i];
                if b == b'\\' && i + 1 < bytes.len() {
                    let next = bytes[i + 1];
                    match next {
                        b'n' => literal.push('\n'),
                        b'r' => literal.push('\r'),
                        b't' => literal.push('\t'),
                        b'(' => literal.push('('),
                        b')' => literal.push(')'),
                        b'\\' => literal.push('\\'),
                        _ => literal.push(next as char),
                    }
                    i += 2;
                    continue;
                }
                if b == b'(' {
                    depth += 1;
                    literal.push('(');
                } else if b == b')' {
                    depth -= 1;
                    if depth > 0 {
                        literal.push(')');
                    }
                } else if (0x20..=0x7E).contains(&b) {
                    literal.push(b as char);
                }
                i += 1;
            }
            if !literal.trim().is_empty() {
                if !out.is_empty() && !out.ends_with('\n') && !out.ends_with(' ') {
                    out.push(' ');
                }
                out.push_str(&literal);
            }
            continue;
        }
        if i + 2 <= bytes.len() && (&bytes[i..i + 2] == b"ET" || &bytes[i..i + 2] == b"T*") {
            if !out.is_empty() && !out.ends_with('\n') {
                out.push('\n');
            }
        }
        i += 1;
    }
    out.trim().to_string()
}

pub fn build_pdf_map_from_bytes(file_path: &str, data: &[u8], max_pages: Option<usize>) -> Result<String, String> {
    if !data.starts_with(b"%PDF") {
        return Err("Not a valid PDF file (missing %PDF header)".to_string());
    }
    let raw_latin1: String = data.iter().map(|&b| b as char).collect();

    // Count /Type /Page (excluding /Type /Pages)
    let mut page_count = 0usize;
    let mut search_idx = 0;
    while let Some(pos) = raw_latin1[search_idx..].find("/Type") {
        let abs = search_idx + pos + 5;
        let rest = raw_latin1[abs..].trim_start();
        if rest.starts_with("/Page") && !rest.starts_with("/Pages") {
            page_count += 1;
        }
        search_idx = abs;
    }
    if page_count == 0 {
        page_count = 1;
    }

    // Extract text from streams (both uncompressed and FlateDecode)
    let mut page_texts: Vec<String> = Vec::new();
    let mut s_pos = 0;
    while let Some(rel_stream) = raw_latin1[s_pos..].find("stream") {
        let abs_stream = s_pos + rel_stream;
        // Ensure it's not "endstream"
        if abs_stream >= 3 && &raw_latin1[abs_stream - 3..abs_stream] == "end" {
            s_pos = abs_stream + 6;
            continue;
        }
        let header_slice = &raw_latin1[s_pos..abs_stream];
        let is_flate = header_slice.contains("/FlateDecode");
        let mut data_start = abs_stream + 6;
        if data_start < data.len() && data[data_start] == b'\r' {
            data_start += 1;
        }
        if data_start < data.len() && data[data_start] == b'\n' {
            data_start += 1;
        }
        let Some(rel_end) = raw_latin1[data_start..].find("endstream") else {
            break;
        };
        let data_end = data_start + rel_end;
        let mut raw_stream = &data[data_start..data_end];
        while raw_stream.last() == Some(&b'\n') || raw_stream.last() == Some(&b'\r') {
            raw_stream = &raw_stream[..raw_stream.len() - 1];
        }

        let decoded_str = if is_flate {
            let mut dec = ZlibDecoder::new(raw_stream);
            let mut buf = Vec::new();
            if dec.read_to_end(&mut buf).is_ok() {
                buf.iter().map(|&b| b as char).collect::<String>()
            } else {
                String::new()
            }
        } else {
            raw_stream.iter().map(|&b| b as char).collect::<String>()
        };

        if decoded_str.contains("BT") && decoded_str.contains("ET") {
            let extracted = extract_pdf_text_from_stream(&decoded_str);
            if !extracted.is_empty() {
                page_texts.push(extracted);
            }
        }
        s_pos = data_end + 9;
    }

    if page_texts.is_empty() {
        let fallback = extract_pdf_text_from_stream(&raw_latin1);
        if !fallback.is_empty() {
            page_texts.push(fallback);
        }
    }

    let limit = max_pages
        .filter(|&m| m > 0)
        .map(|m| m.min(page_count.max(page_texts.len())))
        .unwrap_or_else(|| page_count.max(page_texts.len()).max(1));

    let mut pages_json = Vec::new();
    let mut combined_parts = Vec::new();
    let mut has_text = false;

    let actual_items = page_texts.len().max(1).min(limit);
    for idx in 0..actual_items {
        let p_num = idx + 1;
        let p_text = page_texts.get(idx).map(|s| s.trim()).unwrap_or("");
        if !p_text.is_empty() {
            has_text = true;
        }
        pages_json.push(format!(
            "{{\"number\":{},\"text\":{}}}",
            p_num,
            json_escape(p_text)
        ));
        combined_parts.push(format!("--- PAGE {} ---\n{}", p_num, p_text));
    }

    let is_scanned = !has_text;
    let final_text = if is_scanned {
        "[No selectable text found in this PDF. It appears to be a scanned document or image-only PDF.]".to_string()
    } else {
        combined_parts.join("\n\n").trim().to_string()
    };

    Ok(format!(
        "{{\"format\":\"pdf\",\"filePath\":{},\"pageCount\":{},\"isScanned\":{},\"text\":{},\"pages\":[{}],\"info\":null}}",
        json_escape(file_path),
        page_count,
        if is_scanned { "true" } else { "false" },
        json_escape(&final_text),
        pages_json.join(",")
    ))
}

pub fn build_pdf_map(file_path: &str, max_pages: Option<usize>) -> Result<String, String> {
    let bytes = fs::read(file_path).map_err(|e| e.to_string())?;
    build_pdf_map_from_bytes(file_path, &bytes, max_pages)
}

fn ps_escape(s: &str) -> String {
    s.replace('\'', "''")
}

pub fn run_powershell_script(prefix: &str, script: &str) -> Result<String, String> {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mut tmp_path: PathBuf = std::env::temp_dir();
    tmp_path.push(format!("arunaki-{}-{}-{}.ps1", prefix, std::process::id(), nanos));
    fs::write(&tmp_path, script).map_err(|e| e.to_string())?;

    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            tmp_path.to_string_lossy().as_ref(),
        ])
        .output();

    let _ = fs::remove_file(&tmp_path);

    let out = output.map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
    if !stderr.is_empty() && stdout.is_empty() {
        return Err(stderr);
    }
    Ok(stdout)
}

pub struct ExcelComParams {
    pub action: String,
    pub file_path: Option<String>,
    pub sheet_name: Option<String>,
    pub cell: Option<String>,
    pub value: Option<String>,
    pub cells: Vec<(String, String)>,
    pub bold: Option<bool>,
    pub italic: Option<bool>,
    pub font_size: Option<f64>,
    pub bg_color: Option<i64>,
    pub alignment: Option<String>,
    pub source_sheet: Option<String>,
    pub new_sheet_name: Option<String>,
}

pub fn build_excel_com_script(p: &ExcelComParams) -> String {
    let mut actions = vec![
        "$excel = $null".to_string(),
        "try {".to_string(),
        "  $excel = [System.Runtime.InteropServices.Marshal]::GetActiveObject('Excel.Application')".to_string(),
        "} catch {".to_string(),
        "  $excel = New-Object -ComObject Excel.Application".to_string(),
        "}".to_string(),
        "$excel.Visible = $false".to_string(),
        "$excel.DisplayAlerts = $false".to_string(),
    ];

    if let Some(fp) = &p.file_path {
        actions.push(format!("$wb = $excel.Workbooks.Open('{}')", ps_escape(fp)));
    } else {
        actions.push("$wb = $excel.ActiveWorkbook".to_string());
    }

    if let Some(sn) = &p.sheet_name {
        actions.push(format!("$ws = $wb.Sheets.Item('{}')", ps_escape(sn)));
        actions.push("$ws.Activate()".to_string());
    } else {
        actions.push("$ws = $wb.ActiveSheet".to_string());
    }

    let cell = p.cell.as_deref().unwrap_or("A1");
    match p.action.as_str() {
        "write_cell" => {
            let val = p.value.as_deref().unwrap_or("");
            actions.push(format!("$ws.Range('{}').Value2 = '{}'", ps_escape(cell), ps_escape(val)));
            actions.push(format!("Write-Output \"OK:write_cell:{}\"", cell));
        }
        "write_range" => {
            for (r, v) in &p.cells {
                actions.push(format!("$ws.Range('{}').Value2 = '{}'", ps_escape(r), ps_escape(v)));
            }
            actions.push(format!("Write-Output \"OK:write_range:{} cells\"", p.cells.len()));
        }
        "format_cell" => {
            if p.bold == Some(true) {
                actions.push(format!("$ws.Range('{}').Font.Bold = $true", ps_escape(cell)));
            }
            if p.italic == Some(true) {
                actions.push(format!("$ws.Range('{}').Font.Italic = $true", ps_escape(cell)));
            }
            if let Some(fs) = p.font_size {
                actions.push(format!("$ws.Range('{}').Font.Size = {}", ps_escape(cell), fs));
            }
            if let Some(bg) = p.bg_color {
                actions.push(format!("$ws.Range('{}').Interior.ColorIndex = {}", ps_escape(cell), bg));
            }
            if let Some(align) = &p.alignment {
                let code = match align.as_str() {
                    "center" => -4108,
                    "right" => -4152,
                    _ => -4131,
                };
                actions.push(format!("$ws.Range('{}').HorizontalAlignment = {}", ps_escape(cell), code));
            }
            actions.push(format!("Write-Output \"OK:format:{}\"", cell));
        }
        "clone_sheet" => {
            let src = p.source_sheet.as_deref().unwrap_or("Sheet1");
            actions.push(format!("$srcSheet = $wb.Sheets.Item('{}')", ps_escape(src)));
            actions.push("$srcSheet.Copy([System.Reflection.Missing]::Value, $wb.Sheets.Item($wb.Sheets.Count))".to_string());
            actions.push("$newSheet = $wb.Sheets.Item($wb.Sheets.Count)".to_string());
            if let Some(nn) = &p.new_sheet_name {
                actions.push(format!("$newSheet.Name = '{}'", ps_escape(nn)));
            }
            actions.push(format!(
                "Write-Output \"OK:clone_sheet:{}\"",
                p.new_sheet_name.as_deref().unwrap_or("Copy")
            ));
        }
        "delete_sheet" => {
            let sn = p.sheet_name.as_deref().unwrap_or("Sheet1");
            actions.push(format!("$wb.Sheets.Item('{}').Delete()", ps_escape(sn)));
            actions.push(format!("Write-Output \"OK:delete_sheet:{}\"", sn));
        }
        other => {
            actions.push(format!("Write-Output \"ERROR:unknown action '{}'\"", other));
        }
    }

    actions.extend([
        "$wb.Save()".to_string(),
        "$wb.Close()".to_string(),
        "[System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb) | Out-Null".to_string(),
        "[System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null".to_string(),
        "[System.GC]::Collect()".to_string(),
        "[System.GC]::WaitForPendingFinalizers()".to_string(),
    ]);

    actions.join("\n")
}

pub struct WordComParams {
    pub action: String,
    pub file_path: Option<String>,
    pub text: Option<String>,
    pub paragraph_index: Option<usize>,
    pub find_text: Option<String>,
    pub replace_text: Option<String>,
    pub bold: Option<bool>,
    pub font_size: Option<f64>,
    pub alignment: Option<String>,
}

pub fn build_word_com_script(p: &WordComParams) -> String {
    let mut actions = vec![
        "$word = $null".to_string(),
        "try {".to_string(),
        "  $word = [System.Runtime.InteropServices.Marshal]::GetActiveObject('Word.Application')".to_string(),
        "} catch {".to_string(),
        "  $word = New-Object -ComObject Word.Application".to_string(),
        "}".to_string(),
        "$word.Visible = $false".to_string(),
        "$word.DisplayAlerts = 0".to_string(),
    ];

    if let Some(fp) = &p.file_path {
        actions.push(format!("$doc = $word.Documents.Open('{}')", ps_escape(fp)));
    } else {
        actions.push("$doc = $word.ActiveDocument".to_string());
    }

    match p.action.as_str() {
        "write_text" => {
            let txt = p.text.as_deref().unwrap_or("");
            actions.push(format!("$doc.Content.InsertAfter('{}')", ps_escape(txt)));
            actions.push("Write-Output \"OK:write_text\"".to_string());
        }
        "write_at_paragraph" => {
            let idx = p.paragraph_index.unwrap_or(1);
            let txt = p.text.as_deref().unwrap_or("");
            actions.push(format!("$target = $doc.Paragraphs.Item({})", idx));
            actions.push(format!("$target.Range.InsertAfter('{}')", ps_escape(txt)));
            actions.push(format!("Write-Output \"OK:write_at_paragraph:{}\"", idx));
        }
        "find_replace" => {
            let f = p.find_text.as_deref().unwrap_or("");
            let r = p.replace_text.as_deref().unwrap_or("");
            actions.push(format!("$doc.Content.Find.Text = '{}'", ps_escape(f)));
            actions.push(format!("$doc.Content.Find.Replacement.Text = '{}'", ps_escape(r)));
            actions.push("$doc.Content.Find.Execute()".to_string());
            actions.push("Write-Output \"OK:find_replace\"".to_string());
        }
        "format" => {
            if p.bold == Some(true) {
                actions.push("$doc.Content.Font.Bold = $true".to_string());
            }
            if let Some(fs) = p.font_size {
                actions.push(format!("$doc.Content.Font.Size = {}", fs));
            }
            if let Some(align) = &p.alignment {
                let code = match align.as_str() {
                    "center" => 1,
                    "right" => 2,
                    _ => 0,
                };
                actions.push(format!("$doc.Content.ParagraphFormat.Alignment = {}", code));
            }
            actions.push("Write-Output \"OK:format\"".to_string());
        }
        other => {
            actions.push(format!("Write-Output \"ERROR:unknown action '{}'\"", other));
        }
    }

    actions.extend([
        "$doc.Save()".to_string(),
        "$doc.Close()".to_string(),
        "[System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null".to_string(),
        "[System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null".to_string(),
        "[System.GC]::Collect()".to_string(),
        "[System.GC]::WaitForPendingFinalizers()".to_string(),
    ]);

    actions.join("\n")
}

pub struct PptComParams {
    pub action: String,
    pub file_path: Option<String>,
    pub slide_number: Option<usize>,
    pub shape_index: Option<usize>,
    pub shape_name: Option<String>,
    pub text: Option<String>,
    pub title: Option<String>,
    pub layout: Option<usize>,
}

pub fn build_ppt_com_script(p: &PptComParams) -> String {
    let mut actions = vec![
        "$ppt = $null".to_string(),
        "try {".to_string(),
        "  $ppt = [System.Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application')".to_string(),
        "} catch {".to_string(),
        "  $ppt = New-Object -ComObject PowerPoint.Application".to_string(),
        "}".to_string(),
        "$ppt.Visible = [Microsoft.Office.Interop.PowerPoint.MsoTriState]::msoTrue".to_string(),
    ];

    if let Some(fp) = &p.file_path {
        actions.push(format!("$pres = $ppt.Presentations.Open('{}')", ps_escape(fp)));
    } else {
        actions.push("$pres = $ppt.ActivePresentation".to_string());
    }

    match p.action.as_str() {
        "add_slide" => {
            let layout = p.layout.unwrap_or(1);
            actions.push(format!("$layout = $pres.SlideMaster.CustomLayouts.Item({})", layout));
            actions.push("$slide = $pres.Slides.AddSlide($pres.Slides.Count + 1, $layout)".to_string());
            if let Some(t) = &p.title {
                actions.push(format!("$slide.Shapes.Title.TextFrame.TextRange.Text = '{}'", ps_escape(t)));
            }
            if let Some(txt) = &p.text {
                actions.push(format!("$slide.Shapes.Placeholders.Item(2).TextFrame.TextRange.Text = '{}'", ps_escape(txt)));
            }
            actions.push("Write-Output \"OK:add_slide:$($pres.Slides.Count)\"".to_string());
        }
        "set_shape_text" => {
            let slide_num = p.slide_number.unwrap_or(1);
            let txt = p.text.as_deref().unwrap_or("");
            actions.push(format!("$slide = $pres.Slides.Item({})", slide_num));
            if let Some(sn) = &p.shape_name {
                actions.push("foreach ($shape In $slide.Shapes) {".to_string());
                actions.push(format!("  if ($shape.Name -eq '{}') {{", ps_escape(sn)));
                actions.push(format!("    $shape.TextFrame.TextRange.Text = '{}'", ps_escape(txt)));
                actions.push(format!("    Write-Output \"OK:set_shape_text:{}\"", sn));
                actions.push("  }".to_string());
                actions.push("}".to_string());
            } else {
                let idx = p.shape_index.unwrap_or(1);
                actions.push(format!("$idx = {}", idx));
                actions.push("$shape = $slide.Shapes.Item($idx)".to_string());
                actions.push(format!("$shape.TextFrame.TextRange.Text = '{}'", ps_escape(txt)));
                actions.push("Write-Output \"OK:set_shape_text:shape$($idx)\"".to_string());
            }
        }
        other => {
            actions.push(format!("Write-Output \"ERROR:unknown action '{}'\"", other));
        }
    }

    actions.extend([
        "$pres.Save()".to_string(),
        "$pres.Close()".to_string(),
        "[System.Runtime.InteropServices.Marshal]::ReleaseComObject($pres) | Out-Null".to_string(),
        "[System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null".to_string(),
        "[System.GC]::Collect()".to_string(),
        "[System.GC]::WaitForPendingFinalizers()".to_string(),
    ]);

    actions.join("\n")
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
    fn csv_excel_map_extracts_cells_and_range() {
        let csv = "Item,Qty\nBaju M,15\n";
        let out = build_csv_excel_map("order.csv", csv);
        assert!(out.contains(r#""format":"excel""#));
        assert!(out.contains(r#""range":"A1:B2""#));
        assert!(out.contains(r#""ref":"B2","value":15,"text":"15","type":"n""#));
    }

    #[test]
    fn pdf_map_extracts_selectable_text() {
        let pdf = b"%PDF-1.4\n1 0 obj << /Type /Page >> endobj\n2 0 obj << /Length 44 >>\nstream\nBT /F1 12 Tf 72 720 Td (Laporan Bulanan) Tj ET\nendstream\nendobj\n%%EOF";
        let out = build_pdf_map_from_bytes("test.pdf", pdf, None).unwrap();
        assert!(out.contains(r#""format":"pdf""#));
        assert!(out.contains(r#""pageCount":1"#));
        assert!(out.contains(r#""isScanned":false"#));
        assert!(out.contains("Laporan Bulanan"));
    }

    #[test]
    fn com_scripts_generate_expected_powershell() {
        let script = build_excel_com_script(&ExcelComParams {
            action: "write_cell".to_string(),
            file_path: Some("E:/test.xlsx".to_string()),
            sheet_name: Some("Sheet1".to_string()),
            cell: Some("B5".to_string()),
            value: Some("42".to_string()),
            cells: vec![],
            bold: None,
            italic: None,
            font_size: None,
            bg_color: None,
            alignment: None,
            source_sheet: None,
            new_sheet_name: None,
        });
        assert!(script.contains("$ws.Range('B5').Value2 = '42'"));
        assert!(script.contains("OK:write_cell:B5"));
    }

    #[test]
    fn cell_ref_roundtrip() {
        assert_eq!(parse_cell_ref("A1"), Some((0, 0)));
        assert_eq!(parse_cell_ref("C6"), Some((5, 2)));
        assert_eq!(encode_cell_ref(5, 2), "C6");
    }
}
