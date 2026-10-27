use crate::util::{find_tag_blocks, json_escape, strip_word_xml};
use std::fs::File;
use std::io::Read;
use zip::ZipArchive;

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

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

pub fn create_docx_from_markdown(markdown: &str) -> Result<Vec<u8>, String> {
    use std::io::{Cursor, Write};
    use zip::write::FileOptions;
    use zip::ZipWriter;

    let mut body_xml = String::new();
    let lines: Vec<&str> = markdown.lines().collect();
    let mut in_table = false;
    let mut table_rows: Vec<Vec<String>> = Vec::new();

    for line in lines {
        let trimmed = line.trim();

        if trimmed.starts_with('|') && trimmed.ends_with('|') {
            if trimmed.chars().all(|c| c == '|' || c == '-' || c == ':' || c.is_whitespace()) {
                continue;
            }
            let cells: Vec<String> = trimmed[1..trimmed.len() - 1]
                .split('|')
                .map(|c| c.trim().to_string())
                .collect();
            table_rows.push(cells);
            in_table = true;
            continue;
        } else if in_table {
            body_xml.push_str("<w:tbl><w:tblPr><w:tblW w:w=\"5000\" w:type=\"pct\"/><w:tblBorders><w:top w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"CCCCCC\"/><w:bottom w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"CCCCCC\"/><w:insideH w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"EEEEEE\"/></w:tblBorders></w:tblPr>");
            for (r_idx, row) in table_rows.iter().enumerate() {
                body_xml.push_str("<w:tr>");
                for cell in row {
                    let esc = escape_xml(cell);
                    if r_idx == 0 {
                        body_xml.push_str(&format!(
                            "<w:tc><w:tcPr><w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"F2F2F2\"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>{}</w:t></w:r></w:p></w:tc>",
                            esc
                        ));
                    } else {
                        body_xml.push_str(&format!(
                            "<w:tc><w:p><w:r><w:t>{}</w:t></w:r></w:p></w:tc>",
                            esc
                        ));
                    }
                }
                body_xml.push_str("</w:tr>");
            }
            body_xml.push_str("</w:tbl>");
            table_rows.clear();
            in_table = false;
        }

        if trimmed.is_empty() {
            body_xml.push_str("<w:p/>");
        } else if let Some(h1) = trimmed.strip_prefix("# ") {
            let esc = escape_xml(h1.trim());
            body_xml.push_str(&format!(
                "<w:p><w:pPr><w:pStyle w:val=\"Heading1\"/><w:spacing w:before=\"240\" w:after=\"120\"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val=\"36\"/></w:rPr><w:t>{}</w:t></w:r></w:p>",
                esc
            ));
        } else if let Some(h2) = trimmed.strip_prefix("## ") {
            let esc = escape_xml(h2.trim());
            body_xml.push_str(&format!(
                "<w:p><w:pPr><w:pStyle w:val=\"Heading2\"/><w:spacing w:before=\"200\" w:after=\"100\"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val=\"28\"/></w:rPr><w:t>{}</w:t></w:r></w:p>",
                esc
            ));
        } else if let Some(h3) = trimmed.strip_prefix("### ") {
            let esc = escape_xml(h3.trim());
            body_xml.push_str(&format!(
                "<w:p><w:pPr><w:pStyle w:val=\"Heading3\"/><w:spacing w:before=\"160\" w:after=\"80\"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val=\"24\"/></w:rPr><w:t>{}</w:t></w:r></w:p>",
                esc
            ));
        } else if let Some(bullet) = trimmed.strip_prefix("- ").or_else(|| trimmed.strip_prefix("* ")) {
            let esc = escape_xml(bullet.trim());
            body_xml.push_str(&format!(
                "<w:p><w:pPr><w:pStyle w:val=\"ListBullet\"/><w:spacing w:after=\"60\"/></w:pPr><w:r><w:t>• {}</w:t></w:r></w:p>",
                esc
            ));
        } else {
            let esc = escape_xml(trimmed);
            body_xml.push_str(&format!(
                "<w:p><w:pPr><w:spacing w:after=\"120\"/></w:pPr><w:r><w:t xml:space=\"preserve\">{}</w:t></w:r></w:p>",
                esc
            ));
        }
    }

    if in_table && !table_rows.is_empty() {
        body_xml.push_str("<w:tbl><w:tblPr><w:tblW w:w=\"5000\" w:type=\"pct\"/></w:tblPr>");
        for (r_idx, row) in table_rows.iter().enumerate() {
            body_xml.push_str("<w:tr>");
            for cell in row {
                let esc = escape_xml(cell);
                if r_idx == 0 {
                    body_xml.push_str(&format!(
                        "<w:tc><w:tcPr><w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"F2F2F2\"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>{}</w:t></w:r></w:p></w:tc>",
                        esc
                    ));
                } else {
                    body_xml.push_str(&format!(
                        "<w:tc><w:p><w:r><w:t>{}</w:t></w:r></w:p></w:tc>",
                        esc
                    ));
                }
            }
            body_xml.push_str("</w:tr>");
        }
        body_xml.push_str("</w:tbl>");
    }

    let document_xml = format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    {}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>"#,
        body_xml
    );

    let content_types = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"#;

    let rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#;

    let buf = Vec::new();
    let mut zip = ZipWriter::new(Cursor::new(buf));
    let options = FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    zip.start_file("[Content_Types].xml", options).map_err(|e| e.to_string())?;
    zip.write_all(content_types.as_bytes()).map_err(|e| e.to_string())?;

    zip.start_file("_rels/.rels", options).map_err(|e| e.to_string())?;
    zip.write_all(rels.as_bytes()).map_err(|e| e.to_string())?;

    zip.start_file("word/document.xml", options).map_err(|e| e.to_string())?;
    zip.write_all(document_xml.as_bytes()).map_err(|e| e.to_string())?;

    let cursor = zip.finish().map_err(|e| e.to_string())?;
    Ok(cursor.into_inner())
}
