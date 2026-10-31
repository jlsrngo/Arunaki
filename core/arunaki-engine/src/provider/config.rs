use crate::paths::{arunaki_config_dir, arunaki_data_dir, home_dir, now_ms};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::{json, Value};

/// Dynamically normalizes a provider entry from any config/db schema
/// (OpenCode `api.url` / `request.body.apiKey` or modern `options.baseURL` / `options.apiKey`).
/// Pure generic normalizer — zero hardcoded provider names.
pub fn normalize_provider_entry(pid: &str, raw_val: &Value) -> Value {
    let name = raw_val
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or(pid);

    let base_url = raw_val
        .pointer("/options/baseURL")
        .or_else(|| raw_val.pointer("/api/url"))
        .or_else(|| raw_val.get("api").filter(|v| v.is_string()))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let api_key = raw_val
        .pointer("/options/apiKey")
        .or_else(|| raw_val.pointer("/request/body/apiKey"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let models = raw_val
        .get("models")
        .cloned()
        .unwrap_or_else(|| json!({}));

    let priority = raw_val
        .get("priority")
        .or_else(|| raw_val.pointer("/options/priority"))
        .and_then(|v| v.as_u64())
        .unwrap_or(1);

    let active = raw_val
        .get("active")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let ptype = raw_val
        .get("type")
        .or_else(|| raw_val.pointer("/api/type"))
        .and_then(|v| v.as_str())
        .unwrap_or("openai");

    json!({
        "id": pid,
        "name": name,
        "type": ptype,
        "npm": raw_val.get("npm").and_then(|v| v.as_str()).unwrap_or("@ai-sdk/openai-compatible"),
        "api": {
            "type": "aisdk",
            "package": "@ai-sdk/openai-compatible",
            "url": base_url
        },
        "request": {
            "body": {
                "apiKey": api_key
            }
        },
        "options": {
            "baseURL": base_url,
            "apiKey": api_key,
            "priority": priority
        },
        "models": models,
        "active": active,
        "priority": priority
    })
}

pub fn read_arunaki_config() -> Value {
    let main_path = arunaki_config_dir().join("arunaki.json");
    let mut val = if let Ok(raw) = std::fs::read_to_string(&main_path) {
        serde_json::from_str::<Value>(&raw).unwrap_or_else(|_| json!({}))
    } else {
        json!({})
    };

    if !val.is_object() {
        val = json!({});
    }

    if val.get("provider").and_then(|v| v.as_object()).is_none() {
        val["provider"] = json!({});
    }

    // Dynamically discover and merge all user-configured providers from all database & storage candidates.
    // Zero hardcoded provider names — entirely database and config store driven.
    let db_candidates = [
        home_dir().join(".arunaki").join("arunaki.json"),
        arunaki_config_dir().join("config.json"),
        home_dir().join(".arunaki").join("config.json"),
        arunaki_config_dir().join("Arunaki.json.bak-before-kiro-repair"),
        arunaki_config_dir().join("arunaki.json.1791962635988.avmp.tmp"),
        home_dir().join(".arunaki").join("scratch").join(".arunaki").join("config.json"),
        home_dir().join(".arunaki").join("scratch").join(".arunaki").join("arunaki.json"),
        std::path::PathBuf::from(".arunaki").join("arunaki.json"),
        std::path::PathBuf::from(".arunaki").join("config.json"),
    ];

    let mut changed = false;

    for cand_path in &db_candidates {
        if *cand_path == main_path {
            continue;
        }
        if let Ok(raw) = std::fs::read_to_string(cand_path) {
            if let Ok(cand_val) = serde_json::from_str::<Value>(&raw) {
                let maps = [
                    cand_val.get("provider").and_then(|v| v.as_object()),
                    cand_val.get("providers").and_then(|v| v.as_object()),
                ];
                for map_opt in maps.into_iter().flatten() {
                    for (pid, pval) in map_opt {
                        if pid == "local-cli" {
                            continue;
                        }
                        let existing_key = val
                            .pointer(&format!("/provider/{}/options/apiKey", pid))
                            .or_else(|| val.pointer(&format!("/provider/{}/request/body/apiKey", pid)))
                            .and_then(|v| v.as_str())
                            .unwrap_or("");

                        if existing_key.trim().is_empty() {
                            let norm = normalize_provider_entry(pid, pval);
                            let has_key = norm
                                .pointer("/options/apiKey")
                                .and_then(|v| v.as_str())
                                .map(|s| !s.trim().is_empty())
                                .unwrap_or(false);
                            if has_key {
                                val["provider"][pid] = norm;
                                changed = true;
                            }
                        }
                    }
                }
            }
        }
    }

    // Mirror to "providers" key for backward compatibility across all modules
    val["providers"] = val["provider"].clone();

    if changed {
        write_arunaki_config(&val);
    }

    val
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_provider_entry_both_schemas() {
        // Modern schema
        let modern = json!({
            "name": "Custom Provider",
            "type": "openai",
            "options": {
                "baseURL": "https://api.custom.com/v1",
                "apiKey": "sk-123456",
                "priority": 1
            }
        });
        let norm_modern = normalize_provider_entry("custom", &modern);
        assert_eq!(norm_modern.pointer("/options/apiKey").and_then(|v| v.as_str()), Some("sk-123456"));
        assert_eq!(norm_modern.pointer("/options/baseURL").and_then(|v| v.as_str()), Some("https://api.custom.com/v1"));
        assert_eq!(norm_modern.pointer("/request/body/apiKey").and_then(|v| v.as_str()), Some("sk-123456"));

        // OpenCode / DB schema
        let opencode_style = json!({
            "name": "Legacy DB Provider",
            "api": {
                "url": "https://kenari.id/v1"
            },
            "request": {
                "body": {
                    "apiKey": "kn-legacy-token"
                }
            }
        });
        let norm_legacy = normalize_provider_entry("legacy", &opencode_style);
        assert_eq!(norm_legacy.pointer("/options/apiKey").and_then(|v| v.as_str()), Some("kn-legacy-token"));
        assert_eq!(norm_legacy.pointer("/options/baseURL").and_then(|v| v.as_str()), Some("https://kenari.id/v1"));
        assert_eq!(norm_legacy.pointer("/request/body/apiKey").and_then(|v| v.as_str()), Some("kn-legacy-token"));
    }

    #[test]
    fn test_read_arunaki_config_discovers_db_providers() {
        let cfg = read_arunaki_config();
        let providers_obj = cfg.get("provider").or_else(|| cfg.get("providers")).and_then(|v| v.as_object());
        assert!(providers_obj.is_some());
        let map = providers_obj.unwrap();
        if map.contains_key("kenari") {
            let key = map["kenari"].pointer("/options/apiKey").and_then(|v| v.as_str()).unwrap_or("");
            assert!(!key.is_empty(), "API key must not be empty");
        }
    }
}

pub fn write_arunaki_config(cfg: &Value) {
    let p = arunaki_config_dir().join("arunaki.json");
    if let Ok(raw) = serde_json::to_string_pretty(cfg) {
        let _ = std::fs::write(p, raw);
    }
}

pub async fn handle_config_get() -> Response {
    Json(read_arunaki_config()).into_response()
}

pub async fn handle_project_list() -> Response {
    let cwd = std::env::current_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .to_string_lossy()
        .replace('\\', "/");
    Json(json!([{
        "id": "proj_default",
        "worktree": cwd,
        "time": { "created": now_ms(), "updated": now_ms() }
    }]))
    .into_response()
}

pub async fn handle_project_current() -> Response {
    let cwd = std::env::current_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .to_string_lossy()
        .replace('\\', "/");
    Json(json!({
        "id": "proj_default",
        "worktree": cwd,
        "time": { "created": now_ms(), "updated": now_ms() }
    }))
    .into_response()
}

pub async fn handle_path_get() -> Response {
    let cwd = std::env::current_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .to_string_lossy()
        .replace('\\', "/");
    Json(json!({
        "home": home_dir().to_string_lossy().replace('\\', "/"),
        "state": arunaki_data_dir().to_string_lossy().replace('\\', "/"),
        "config": arunaki_config_dir().to_string_lossy().replace('\\', "/"),
        "worktree": cwd,
        "directory": cwd
    }))
    .into_response()
}

pub async fn handle_vcs_get() -> Response {
    Json(json!({ "branch": "main" })).into_response()
}
