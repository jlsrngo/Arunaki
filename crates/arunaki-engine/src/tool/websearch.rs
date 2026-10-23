//! Web Search Tool â€” mirrors `packages/engine/engine/src/tool/websearch.ts`.
//! Live internet search using DuckDuckGo HTML / instant API.

use serde_json::{json, Value};

fn encode_query(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' || b == b'~' {
            out.push(b as char);
        } else if b == b' ' {
            out.push('+');
        } else {
            out.push_str(&format!("%{:02X}", b));
        }
    }
    out
}

pub fn websearch_tool_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "websearch",
            "description": include_str!("prompt/websearch.txt"),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "Web search query." },
                    "numResults": { "type": "number", "description": "Number of search results to return (default: 5)." }
                },
                "required": ["query"]
            }
        }
    })
}

pub async fn execute_websearch(arguments: &Value) -> Value {
    let query = arguments
        .get("query")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if query.is_empty() {
        return json!({ "error": "Query cannot be empty." });
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .unwrap();

    let url = format!(
        "https://api.duckduckgo.com/?q={}&format=json&no_html=1&skip_disambig=1",
        encode_query(query)
    );

    let resp = client.get(&url).send().await;
    match resp {
        Ok(r) => {
            if let Ok(data) = r.json::<Value>().await {
                let abstract_txt = data
                    .get("AbstractText")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let heading = data
                    .get("Heading")
                    .and_then(|v| v.as_str())
                    .unwrap_or(query);

                let mut results = Vec::new();
                if !abstract_txt.is_empty() {
                    results.push(json!({
                        "title": heading,
                        "snippet": abstract_txt,
                        "url": data.get("AbstractURL").and_then(|v| v.as_str()).unwrap_or("")
                    }));
                }

                if let Some(topics) = data.get("RelatedTopics").and_then(|v| v.as_array()) {
                    for t in topics.iter().take(5) {
                        if let Some(txt) = t.get("Text").and_then(|v| v.as_str()) {
                            let u = t.get("FirstURL").and_then(|v| v.as_str()).unwrap_or("");
                            results.push(json!({
                                "title": txt,
                                "snippet": txt,
                                "url": u
                            }));
                        }
                    }
                }

                if results.is_empty() {
                    json!({
                        "query": query,
                        "results": [],
                        "output": format!("No instant results found for '{}'.", query)
                    })
                } else {
                    let total = results.len();
                    json!({
                        "query": query,
                        "matches": total,
                        "results": results,
                        "output": format!("Found {} web results for '{}'.", total, query)
                    })
                }
            } else {
                json!({ "output": format!("Completed search for '{}'", query) })
            }
        }
        Err(e) => json!({ "error": format!("Web search failed: {}", e) }),
    }
}
