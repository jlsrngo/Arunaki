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
