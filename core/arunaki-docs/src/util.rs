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

pub fn find_tag_blocks<'a>(xml: &'a str, open_prefix: &str, close_tag: &str) -> Vec<(usize, usize, &'a str)> {
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

pub fn find_tag_blocks_with_open<'a>(
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

pub fn extract_attr(tag: &str, attr_name: &str) -> Option<String> {
    let pattern = format!("{}=\"", attr_name);
    let start = tag.find(&pattern)? + pattern.len();
    let end = start + tag[start..].find('"')?;
    Some(tag[start..end].to_string())
}
