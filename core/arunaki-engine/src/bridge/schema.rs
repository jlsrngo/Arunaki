use serde_json::Value;

/// Sanitizes a JSON Schema for Google Gemini API (`functionDeclarations.parameters`).
///
/// Gemini API is strict:
/// 1. Rejecting non-supported keywords ($schema, additionalProperties, default, title, etc.).
/// 2. Rejecting union types like `type: ["string", "null"]`.
/// 3. Throwing a 400 BAD REQUEST if any entry in `required` is not present in `properties`.
/// 4. Crucially: Property NAMES inside `properties` that happen to match JSON Schema keywords
///    (e.g. "title", "default") MUST NOT be stripped.
pub fn sanitize_gemini_schema(schema: &Value) -> Value {
    match schema {
        Value::Array(arr) => Value::Array(arr.iter().map(sanitize_gemini_schema).collect()),
        Value::Object(map) => {
            let mut out = serde_json::Map::new();

            // Check if anyOf / oneOf is present: simplify to first branch if found
            let effective_map = if let Some(branches) = map.get("anyOf").or_else(|| map.get("oneOf")).and_then(|v| v.as_array()) {
                if let Some(first) = branches.first().and_then(|v| v.as_object()) {
                    let mut merged = map.clone();
                    for (k, v) in first {
                        merged.entry(k.clone()).or_insert_with(|| v.clone());
                    }
                    merged
                } else {
                    map.clone()
                }
            } else {
                map.clone()
            };

            for (k, v) in &effective_map {
                // Strip disallowed JSON schema keywords at schema level
                if matches!(
                    k.as_str(),
                    "$schema"
                        | "additionalProperties"
                        | "default"
                        | "title"
                        | "examples"
                        | "exclusiveMinimum"
                        | "exclusiveMaximum"
                        | "propertyNames"
                        | "const"
                        | "$ref"
                        | "anyOf"
                        | "oneOf"
                        | "allOf"
                ) {
                    continue;
                }

                // Gemini expects single string type, not array of types
                if k == "type" {
                    if let Some(arr) = v.as_array() {
                        let non_null = arr
                            .iter()
                            .filter_map(|x| x.as_str())
                            .find(|&t| t != "null")
                            .unwrap_or("string");
                        out.insert(k.clone(), Value::String(non_null.to_string()));
                        continue;
                    }
                }

                // Property map: user-defined property names must be preserved!
                if k == "properties" {
                    if let Some(props) = v.as_object() {
                        let mut p_out = serde_json::Map::new();
                        for (pk, pv) in props {
                            p_out.insert(pk.clone(), sanitize_gemini_schema(pv));
                        }
                        out.insert(k.clone(), Value::Object(p_out));
                        continue;
                    }
                }

                out.insert(k.clone(), sanitize_gemini_schema(v));
            }

            // Prune required: remove any key not declared in properties
            if let Some(Value::Array(req)) = out.get("required").cloned() {
                let props = out.get("properties").and_then(|p| p.as_object());
                let filtered: Vec<Value> = req
                    .into_iter()
                    .filter(|r| {
                        r.as_str()
                            .map_or(false, |name| props.map_or(false, |p| p.contains_key(name)))
                    })
                    .collect();
                if filtered.is_empty() {
                    out.remove("required");
                } else {
                    out.insert("required".to_string(), Value::Array(filtered));
                }
            }

            if out.contains_key("properties") && !out.contains_key("type") {
                out.insert("type".to_string(), Value::String("object".to_string()));
            }

            Value::Object(out)
        }
        _ => schema.clone(),
    }
}

/// Normalizes a JSON Schema for OpenAI / Codex Responses API.
/// Ensures object type when properties exist, and prunes invalid required entries.
pub fn normalize_openai_schema(schema: &Value) -> Value {
    match schema {
        Value::Array(arr) => Value::Array(arr.iter().map(normalize_openai_schema).collect()),
        Value::Object(map) => {
            let mut out = serde_json::Map::new();
            for (k, v) in map {
                if k == "properties" {
                    if let Some(props) = v.as_object() {
                        let mut p_out = serde_json::Map::new();
                        for (pk, pv) in props {
                            p_out.insert(pk.clone(), normalize_openai_schema(pv));
                        }
                        out.insert(k.clone(), Value::Object(p_out));
                        continue;
                    }
                }
                out.insert(k.clone(), normalize_openai_schema(v));
            }

            // Prune required
            if let Some(Value::Array(req)) = out.get("required").cloned() {
                let props = out.get("properties").and_then(|p| p.as_object());
                let filtered: Vec<Value> = req
                    .into_iter()
                    .filter(|r| {
                        r.as_str()
                            .map_or(false, |name| props.map_or(false, |p| p.contains_key(name)))
                    })
                    .collect();
                if filtered.is_empty() {
                    out.remove("required");
                } else {
                    out.insert("required".to_string(), Value::Array(filtered));
                }
            }

            if out.contains_key("properties") && !out.contains_key("type") {
                out.insert("type".to_string(), Value::String("object".to_string()));
            }

            Value::Object(out)
        }
        _ => schema.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tool::build_tool_definitions;
    use serde_json::json;

    #[test]
    fn test_gemini_preserves_reserved_names_and_prunes_required() {
        let s = json!({
            "type": "object",
            "properties": {
                "title": { "type": "string", "title": "Field Title", "default": "hello" },
                "default": { "type": "string" },
                "valid": { "type": "boolean" }
            },
            "required": ["title", "default", "missing_prop"]
        });

        let out = sanitize_gemini_schema(&s);
        let props = out.get("properties").unwrap().as_object().unwrap();
        assert!(props.contains_key("title"), "User property 'title' must be preserved");
        assert!(props.contains_key("default"), "User property 'default' must be preserved");
        assert!(props.contains_key("valid"));

        // Metadata inside title property must be stripped
        let title_prop = props.get("title").unwrap();
        assert!(title_prop.get("title").is_none());
        assert!(title_prop.get("default").is_none());

        // missing_prop must be pruned
        let req = out.get("required").unwrap().as_array().unwrap();
        let req_names: Vec<&str> = req.iter().filter_map(|v| v.as_str()).collect();
        assert_eq!(req_names, vec!["title", "default"]);
    }

    #[test]
    fn test_gemini_nested_schema_sanitization() {
        let s = json!({
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "code": { "type": "string" }
                        },
                        "required": ["code", "nonexistent"]
                    }
                }
            }
        });

        let out = sanitize_gemini_schema(&s);
        let nested_req = out
            .pointer("/properties/items/items/required")
            .unwrap()
            .as_array()
            .unwrap();
        assert_eq!(nested_req.len(), 1);
        assert_eq!(nested_req[0].as_str(), Some("code"));
    }

    fn assert_valid_schema_recursive(val: &Value, path: &str) {
        if let Some(obj) = val.as_object() {
            // Check forbidden keys
            for forbidden in &["$schema", "additionalProperties", "title", "default"] {
                if obj.contains_key(*forbidden) && path != "root" && !path.ends_with(".properties") {
                    // Note: if the object itself is inside a property value, title/default metadata must not be present
                    panic!("Schema at '{}' contains forbidden keyword '{}'", path, forbidden);
                }
            }

            // Check required subset of properties
            if let Some(req) = obj.get("required").and_then(|v| v.as_array()) {
                let props = obj.get("properties").and_then(|v| v.as_object());
                for r in req {
                    let r_str = r.as_str().expect("required item must be a string");
                    assert!(
                        props.map_or(false, |p| p.contains_key(r_str)),
                        "Schema at '{}' has required property '{}' not found in properties!",
                        path,
                        r_str
                    );
                }
            }

            for (k, v) in obj {
                let next_path = format!("{}.{}", path, k);
                assert_valid_schema_recursive(v, &next_path);
            }
        } else if let Some(arr) = val.as_array() {
            for (idx, item) in arr.iter().enumerate() {
                let next_path = format!("{}[{}]", path, idx);
                assert_valid_schema_recursive(item, &next_path);
            }
        }
    }

    #[test]
    fn test_all_registered_tools_produce_valid_gemini_and_openai_schemas() {
        let defs = build_tool_definitions();
        assert!(!defs.is_empty(), "Tool definitions must not be empty");

        for (idx, tool) in defs.iter().enumerate() {
            let fn_obj = tool.get("function").unwrap_or(tool);
            let name = fn_obj.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
            let raw_params = fn_obj
                .get("parameters")
                .cloned()
                .unwrap_or_else(|| json!({ "type": "object", "properties": {} }));

            // 1. Gemini sanitization
            let gemini_params = sanitize_gemini_schema(&raw_params);
            assert_valid_schema_recursive(&gemini_params, &format!("gemini.tools[{}]:{}", idx, name));

            // 2. OpenAI normalization
            let openai_params = normalize_openai_schema(&raw_params);
            if let Some(req) = openai_params.get("required").and_then(|v| v.as_array()) {
                let props = openai_params.get("properties").and_then(|v| v.as_object());
                for r in req {
                    let r_str = r.as_str().unwrap();
                    assert!(
                        props.map_or(false, |p| p.contains_key(r_str)),
                        "OpenAI schema for tool '{}' has required '{}' not in properties",
                        name,
                        r_str
                    );
                }
            }
        }
    }
}

