use axum::{response::IntoResponse, response::Response, Json};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashSet;

/// Known Local CLI provider identifiers.
pub const CLI_PROVIDER_IDS: &[&str] = &[
    "claude-code",
    "claude-cli",
    "claude",
    "opencode",
    "opencode-zen",
    "codex",
    "codex-cli",
    "9router",
    "gemini",
    "gemini-cli",
    "antigravity",
    "antigravity-local",
    "kiro",
    "kiro-cli",
    "local-cli",
];

/// Identifies whether a provider configuration belongs to a Local CLI/Bridge
/// or a standard external Cloud API provider.
pub fn is_cli_provider(id: &str, base_url: &str, name: &str, api_key: &str) -> bool {
    let id_lower = id.trim().to_lowercase();
    if CLI_PROVIDER_IDS.contains(&id_lower.as_str()) {
        return true;
    }
    if id_lower.ends_with("-cli") || id_lower.contains("local-cli") {
        return true;
    }
    let url_lower = base_url.trim().to_lowercase();
    if url_lower.contains(":20188")
        || url_lower.contains(":20189")
        || url_lower.contains("localhost:20188")
        || url_lower.contains("127.0.0.1:20188")
    {
        return true;
    }
    let name_lower = name.trim().to_lowercase();
    let key_lower = api_key.trim().to_lowercase();
    if (id_lower == "gemini" || id_lower == "gemini-cli")
        && (key_lower == "antigravity-active"
            || key_lower == "gemini-local-session"
            || name_lower.contains("antigravity")
            || name_lower.contains("gemini cli"))
    {
        return true;
    }
    if name_lower.contains("(chatgpt subscription)")
        || name_lower.contains("(aws codewhisperer)")
        || name_lower.contains("(local subscription)")
        || name_lower.contains("(local cli)")
        || name_lower.contains("(local account)")
    {
        return true;
    }
    false
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProviderCategory {
    Cli,
    Cloud,
}

pub fn classify_provider(id: &str, base_url: &str, name: &str, api_key: &str) -> ProviderCategory {
    if is_cli_provider(id, base_url, name, api_key) {
        ProviderCategory::Cli
    } else {
        ProviderCategory::Cloud
    }
}

/// Splits a comma-separated model string into clean trimmed IDs.
pub fn parse_model_list(model_str: &str) -> Vec<String> {
    model_str
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

/// Toggles model selection in a pool while enforcing the rule that at least
/// 1 model must remain selected.
pub fn toggle_model_selection(
    current: &[String],
    target: &str,
) -> Result<Vec<String>, &'static str> {
    let target = target.trim();
    if target.is_empty() {
        return Ok(current.to_vec());
    }
    let exists = current.iter().any(|m| m == target);
    if exists {
        if current.len() <= 1 {
            return Err("At least 1 model must remain selected in the routing pool.");
        }
        Ok(current.iter().filter(|m| *m != target).cloned().collect())
    } else {
        let mut updated = current.to_vec();
        updated.push(target.to_string());
        Ok(updated)
    }
}

/// Combines existing, catalog, custom, and default model lists into a single deduplicated list
/// preserving priority order.
pub fn combine_model_pool(
    existing_models: &[String],
    catalog_models: &[String],
    custom_models: &[String],
    default_models: &[String],
) -> Vec<String> {
    let mut result = Vec::new();
    let mut seen = HashSet::new();

    for list in &[existing_models, catalog_models, custom_models, default_models] {
        for m in *list {
            let trimmed = m.trim();
            if !trimmed.is_empty() && seen.insert(trimmed.to_string()) {
                result.push(trimmed.to_string());
            }
        }
    }
    result
}

// ---------------------------------------------------------------------------
// HTTP Handlers
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct ClassifyRequest {
    #[serde(default)]
    pub id: String,
    #[serde(default, rename = "baseUrl")]
    pub base_url: String,
    #[serde(default)]
    pub name: String,
    #[serde(default, rename = "apiKey")]
    pub api_key: String,
}

pub async fn handle_classify_provider(Json(req): Json<ClassifyRequest>) -> Response {
    let is_cli = is_cli_provider(&req.id, &req.base_url, &req.name, &req.api_key);
    let category = if is_cli { "cli" } else { "cloud" };
    Json(json!({
        "success": true,
        "isCli": is_cli,
        "category": category,
        "id": req.id
    }))
    .into_response()
}

#[derive(Deserialize)]
pub struct ModelPoolRequest {
    #[serde(default)]
    pub existing: Vec<String>,
    #[serde(default)]
    pub catalog: Vec<String>,
    #[serde(default)]
    pub custom: Vec<String>,
    #[serde(default)]
    pub defaults: Vec<String>,
    pub toggle: Option<String>,
}

pub async fn handle_combine_model_pool(Json(req): Json<ModelPoolRequest>) -> Response {
    let combined = combine_model_pool(&req.existing, &req.catalog, &req.custom, &req.defaults);
    let mut selected = req.existing;
    if let Some(target) = req.toggle {
        match toggle_model_selection(&selected, &target) {
            Ok(new_sel) => selected = new_sel,
            Err(err_msg) => {
                return Json(json!({
                    "success": false,
                    "error": err_msg,
                    "combined": combined,
                    "selected": selected
                }))
                .into_response();
            }
        }
    }
    Json(json!({
        "success": true,
        "combined": combined,
        "selected": selected,
        "modelStr": selected.join(", ")
    }))
    .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_cli_provider() {
        assert!(is_cli_provider("claude-code", "", "", ""));
        assert!(is_cli_provider("custom-cli", "", "", ""));
        assert!(is_cli_provider("custom", "http://127.0.0.1:20188/v1", "", ""));
        assert!(is_cli_provider("gemini", "", "Antigravity Bridge", ""));
        assert!(is_cli_provider("kenari", "", "OpenAI (ChatGPT Subscription)", ""));
        
        // Pure cloud providers
        assert!(!is_cli_provider("groq", "https://api.groq.com/openai/v1", "Groq Cloud", "gsk_123"));
        assert!(!is_cli_provider("openrouter", "https://openrouter.ai/api/v1", "OpenRouter", "sk-or-123"));
    }

    #[test]
    fn test_toggle_model_selection() {
        let models = vec!["gpt-4o".to_string(), "claude-3.5".to_string()];
        let toggled = toggle_model_selection(&models, "claude-3.5").unwrap();
        assert_eq!(toggled, vec!["gpt-4o".to_string()]);

        // Attempting to remove last model fails
        let err = toggle_model_selection(&toggled, "gpt-4o");
        assert!(err.is_err());

        // Adding a new model
        let added = toggle_model_selection(&toggled, "deepseek-v3").unwrap();
        assert_eq!(added, vec!["gpt-4o".to_string(), "deepseek-v3".to_string()]);
    }

    #[test]
    fn test_combine_model_pool() {
        let existing = vec!["m1".to_string()];
        let catalog = vec!["m2".to_string(), "m1".to_string()];
        let custom = vec!["m3".to_string()];
        let defaults = vec!["m4".to_string(), "m2".to_string()];

        let combined = combine_model_pool(&existing, &catalog, &custom, &defaults);
        assert_eq!(combined, vec!["m1", "m2", "m3", "m4"]);
    }
}
