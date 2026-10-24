use crate::util::json_escape;
use flate2::read::ZlibDecoder;
use std::fs;
use std::io::Read;

pub fn extract_pdf_text_from_stream(stream_str: &str) -> String {
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
