use crate::util::{extract_attr, find_tag_blocks, json_escape, xml_unescape};
use std::fs::File;
use std::io::Read;
use zip::ZipArchive;

pub fn build_ppt_map(file_path: &str) -> Result<String, String> {
    let mut file = File::open(file_path).map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    build_ppt_map_from_bytes(file_path, &bytes)
}

pub fn build_ppt_map_from_bytes(file_path: &str, bytes: &[u8]) -> Result<String, String> {
    let cursor = std::io::Cursor::new(bytes);
    let mut archive = ZipArchive::new(cursor).map_err(|e| e.to_string())?;

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
