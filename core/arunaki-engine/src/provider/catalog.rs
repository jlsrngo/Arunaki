use super::config::{read_arunaki_config, write_arunaki_config};
use crate::bridge::LOCAL_CLI_BRIDGE_PORT;
use crate::cred_store::register_local_cli_to_config;
use crate::paths::now_ms;
use axum::{
    extract::Path as AxumPath,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Value};

pub fn build_catalog() -> (Vec<Value>, Vec<Value>) {
    register_local_cli_to_config(LOCAL_CLI_BRIDGE_PORT);
    let cfg = read_arunaki_config();
    let mut providers = Vec::new();
    let mut models = Vec::new();

    if let Some(prov_map) = cfg.get("provider").and_then(|v| v.as_object()) {
        for (pid, pval) in prov_map {
            let pname = pval
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or(pid.as_str());
            let base_url = pval
                .pointer("/options/baseURL")
                .or_else(|| pval.get("api"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            providers.push(json!({
                "id": pid,
                "name": pname,
                "api": {
                    "type": "aisdk",
                    "package": pval.get("npm").and_then(|v| v.as_str()).unwrap_or("@ai-sdk/openai-compatible"),
                    "url": base_url,
                    "settings": pval.get("options").cloned().unwrap_or_else(|| json!({}))
                },
                "request": { "headers": {}, "body": {} }
            }));

            let mut combined_models = pval
                .get("models")
                .and_then(|v| v.as_object())
                .cloned()
                .unwrap_or_default();

            let cli_target = match pid.as_str() {
                "antigravity" | "antigravity-local" | "gemini" | "gemini-cli" => Some("antigravity"),
                "claude" | "claude-code" | "claude-cli" => Some("claude"),
                "codex" | "codex-cli" => Some("codex"),
                "kiro" | "kiro-cli" => Some("kiro"),
                "opencode" | "opencode-zen" => Some("opencode"),
                "9router" | "nineRouter" => Some("9router"),
                _ => None,
            };
            if let Some(t) = cli_target {
                for m in super::local_cli::default_models_for_target(t) {
                    combined_models.entry(m.to_string()).or_insert_with(|| {
                        json!({
                            "name": m,
                            "attachment": true,
                            "reasoning": true,
                            "tool_call": true,
                            "limit": { "context": 200000, "output": 32768 }
                        })
                    });
                }
            }

            for (mid, mval) in &combined_models {
                let mname = mval
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or(mid.as_str());
                let ctx_lim = mval
                    .pointer("/limit/context")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(200_000);
                let out_lim = mval
                    .pointer("/limit/output")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(32_768);
                models.push(json!({
                    "id": mid,
                    "providerID": pid,
                    "name": mname,
                    "api": {
                        "id": mid,
                        "type": "aisdk",
                        "package": "@ai-sdk/openai-compatible",
                        "url": base_url,
                        "settings": {}
                    },
                    "capabilities": {
                        "tools": mval.get("tool_call").and_then(|v| v.as_bool()).unwrap_or(true),
                        "input": ["text", "image"],
                        "output": ["text"]
                    },
                    "request": { "headers": {}, "body": {} },
                    "variants": [],
                    "time": { "released": 0 },
                    "cost": [],
                    "status": "active",
                    "enabled": true,
                    "limit": {
                        "context": ctx_lim,
                        "output": out_lim
                    }
                }));
            }
        }
    }

    (providers, models)
}

pub async fn handle_model_list() -> Response {
    let (_, models) = build_catalog();
    Json(json!({ "data": models })).into_response()
}

pub async fn handle_provider_list() -> Response {
    let (providers, _) = build_catalog();
    Json(json!({ "data": providers })).into_response()
}

pub async fn handle_provider_get(AxumPath(id): AxumPath<String>) -> Response {
    let (providers, _) = build_catalog();
    if let Some(p) = providers
        .into_iter()
        .find(|p| p.get("id").and_then(|v| v.as_str()) == Some(&id))
    {
        return Json(json!({ "data": p })).into_response();
    }
    (
        StatusCode::NOT_FOUND,
        Json(json!({ "error": format!("Provider not found: {}", id) })),
    )
        .into_response()
}

pub async fn handle_agent_list() -> Response {
    let agents = vec![
        json!({
            "id": "default",
            "description": "Arunaki Desktop Document Agent",
            "request": { "headers": {}, "body": {} },
            "mode": "primary",
            "hidden": false,
            "permissions": []
        }),
        json!({
            "id": "build",
            "description": "Arunaki Document Execution Agent",
            "request": { "headers": {}, "body": {} },
            "mode": "primary",
            "hidden": false,
            "permissions": []
        }),
    ];
    Json(json!({ "data": agents })).into_response()
}

pub async fn handle_agent_get(AxumPath(id): AxumPath<String>) -> Response {
    Json(json!({
        "data": {
            "id": id,
            "description": "Arunaki Desktop Document Agent",
            "request": { "headers": {}, "body": {} },
            "mode": "primary",
            "hidden": false,
            "permissions": []
        }
    }))
    .into_response()
}

pub fn build_ui_providers_list() -> Vec<Value> {
    register_local_cli_to_config(LOCAL_CLI_BRIDGE_PORT);
    let cfg = read_arunaki_config();
    let active_model_str = cfg.get("model").and_then(|v| v.as_str()).unwrap_or("");
    let mut out = Vec::new();
    if let Some(prov_map) = cfg.get("provider").and_then(|v| v.as_object()) {
        for (idx, (pid, pval)) in prov_map.iter().enumerate() {
            if pid == "local-cli" {
                continue;
            }
            let pname = pval
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or(pid.as_str());
            let base_url = pval
                .pointer("/options/baseURL")
                .or_else(|| pval.get("api"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let api_key = pval
                .pointer("/options/apiKey")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let first_model = pval
                .get("models")
                .and_then(|v| v.as_object())
                .and_then(|m| m.keys().next().cloned())
                .unwrap_or_default();
            let active = active_model_str.starts_with(&format!("{}/", pid))
                || pval.get("active").and_then(|v| v.as_bool()).unwrap_or(true);
            let selected_model = if let Some(rest) = active_model_str.strip_prefix(&format!("{}/", pid)) {
                rest.to_string()
            } else {
                pval.get("defaultModel")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or(first_model)
            };
            let priority = pval
                .get("priority")
                .and_then(|v| v.as_u64())
                .unwrap_or((idx + 1) as u64);

            let is_cli = super::cloud_manager::is_cli_provider(pid, base_url, pname, api_key);

            out.push(json!({
                "id": pid,
                "name": pname,
                "type": pval.get("type").and_then(|v| v.as_str()).unwrap_or("openai"),
                "baseUrl": base_url,
                "apiKey": api_key,
                "model": selected_model,
                "headerPrefix": pval.get("headerPrefix").and_then(|v| v.as_str()),
                "headerTitle": pval.get("headerTitle").and_then(|v| v.as_str()),
                "active": active,
                "priority": priority,
                "isCli": is_cli,
                "category": if is_cli { "cli" } else { "cloud" }
            }));
        }
    }
    out
}

pub async fn handle_ui_providers_list() -> Response {
    let list = build_ui_providers_list();
    Json(json!({ "data": list })).into_response()
}

pub fn slugify_id(name: &str) -> String {
    let s: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let trimmed = s.trim_matches('-').to_string();
    if trimmed.is_empty() {
        format!("provider-{}", now_ms())
    } else {
        trimmed
    }
}

pub async fn handle_ui_providers_upsert(Json(body): Json<Value>) -> Response {
    let name = body
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("Custom Provider");
    let pid = body
        .get("id")
        .or_else(|| body.get("providerId"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| slugify_id(name));
    upsert_ui_provider(&pid, &body)
}

pub async fn handle_ui_providers_update(
    AxumPath(pid): AxumPath<String>,
    Json(body): Json<Value>,
) -> Response {
    upsert_ui_provider(&pid, &body)
}

pub fn upsert_ui_provider(pid: &str, body: &Value) -> Response {
    let mut cfg = read_arunaki_config();
    if cfg.get("provider").and_then(|v| v.as_object()).is_none() {
        cfg["provider"] = json!({});
    }
    let name = body.get("name").and_then(|v| v.as_str()).unwrap_or(pid);
    let ptype = body.get("type").and_then(|v| v.as_str()).unwrap_or("openai");
    let base_url = body
        .get("baseUrl")
        .or_else(|| body.get("baseURL"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let api_key = body.get("apiKey").and_then(|v| v.as_str()).unwrap_or("");
    let model = body
        .get("model")
        .and_then(|v| v.as_str())
        .unwrap_or("gpt-4o");

    let mut models_obj = cfg
        .pointer(&format!("/provider/{}/models", pid))
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    if !model.is_empty() {
        models_obj.insert(
            model.to_string(),
            json!({
                "name": model,
                "attachment": true,
                "reasoning": true,
                "tool_call": true,
                "limit": { "context": 128000, "output": 16384 }
            }),
        );
    }

    cfg["provider"][pid] = json!({
        "name": name,
        "type": ptype,
        "npm": "@ai-sdk/openai-compatible",
        "api": base_url,
        "defaultModel": model,
        "active": true,
        "priority": 1,
        "options": {
            "baseURL": base_url,
            "apiKey": api_key
        },
        "models": models_obj
    });
    if !model.is_empty() {
        cfg["model"] = Value::String(format!("{}/{}", pid, model));
    }
    write_arunaki_config(&cfg);

    let item = json!({
        "id": pid,
        "name": name,
        "type": ptype,
        "baseUrl": base_url,
        "apiKey": api_key,
        "model": model,
        "active": true,
        "priority": 1
    });
    Json(json!({ "data": item })).into_response()
}

pub async fn handle_ui_providers_state(
    AxumPath(pid): AxumPath<String>,
    Json(body): Json<Value>,
) -> Response {
    let mut cfg = read_arunaki_config();
    if let Some(pobj) = cfg
        .pointer_mut(&format!("/provider/{}", pid))
        .and_then(|v| v.as_object_mut())
    {
        if let Some(act) = body.get("active").and_then(|v| v.as_bool()) {
            pobj.insert("active".to_string(), Value::Bool(act));
        }
        if let Some(prio) = body.get("priority").and_then(|v| v.as_u64()) {
            pobj.insert("priority".to_string(), json!(prio));
        }
        if let Some(m) = body.get("model").and_then(|v| v.as_str()) {
            if !m.is_empty() {
                pobj.insert("defaultModel".to_string(), Value::String(m.to_string()));
                if let Some(models_map) = pobj.get_mut("models").and_then(|v| v.as_object_mut()) {
                    models_map.entry(m.to_string()).or_insert_with(|| {
                        json!({
                            "name": m,
                            "attachment": true,
                            "reasoning": true,
                            "tool_call": true,
                            "limit": { "context": 200000, "output": 32768 }
                        })
                    });
                }
            }
        }
    }
    if let Some(m) = body.get("model").and_then(|v| v.as_str()) {
        if !m.is_empty() {
            cfg["model"] = Value::String(format!("{}/{}", pid, m));
        }
    }
    write_arunaki_config(&cfg);
    let updated = build_ui_providers_list()
        .into_iter()
        .find(|p| p.get("id").and_then(|v| v.as_str()) == Some(&pid))
        .unwrap_or_else(|| json!({ "id": pid, "active": true }));
    Json(json!({ "data": updated })).into_response()
}

pub async fn handle_ui_provider_id_test(
    AxumPath(pid): AxumPath<String>,
    body_bytes: axum::body::Bytes,
) -> Response {
    let body: Value = serde_json::from_slice(&body_bytes).unwrap_or_else(|_| json!({}));
    let cfg = read_arunaki_config();
    let base_url = cfg
        .pointer(&format!("/provider/{}/options/baseURL", pid))
        .or_else(|| cfg.pointer(&format!("/provider/{}/api", pid)))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let api_key = cfg
        .pointer(&format!("/provider/{}/options/apiKey", pid))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let model = body
        .get("model")
        .and_then(|v| v.as_str())
        .or_else(|| {
            cfg.pointer(&format!("/provider/{}/defaultModel", pid))
                .and_then(|v| v.as_str())
        })
        .or_else(|| {
            cfg.pointer(&format!("/provider/{}/models", pid))
                .and_then(|v| v.as_object())
                .and_then(|m| m.keys().next().map(|s| s.as_str()))
        })
        .unwrap_or("kiro/auto")
        .to_string();
    let prompt = body
        .get("prompt")
        .and_then(|v| v.as_str())
        .unwrap_or("Reply with one short line confirming this provider connection is working.")
        .to_string();

    run_provider_chat_test(&base_url, &api_key, &model, &prompt).await
}

pub async fn run_provider_chat_test(
    base_url: &str,
    api_key: &str,
    model: &str,
    prompt: &str,
) -> Response {
    let base = base_url.trim_end_matches('/');
    if base.is_empty() {
        return Json(json!({
            "ok": false,
            "error": "baseURL is required",
            "data": {
                "success": false,
                "status": 400,
                "error": "baseURL is required",
                "prompt": prompt,
                "model": model
            }
        }))
        .into_response();
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap();

    let mut req = client
        .post(format!("{}/chat/completions", base))
        .header("Content-Type", "application/json")
        .json(&json!({
            "model": model,
            "messages": [{ "role": "user", "content": prompt }],
            "max_tokens": 128,
            "stream": false
        }));
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }

    match req.send().await {
        Ok(r) => {
            let status_code = r.status().as_u16();
            if r.status().is_success() {
                let data: Value = r.json().await.unwrap_or_else(|_| json!({}));
                let reply = data
                    .pointer("/choices/0/message/content")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Connected!")
                    .to_string();
                Json(json!({
                    "ok": true,
                    "data": {
                        "success": true,
                        "status": status_code,
                        "reply": reply,
                        "prompt": prompt,
                        "model": model
                    }
                }))
                .into_response()
            } else {
                let err_txt = r.text().await.unwrap_or_default();
                Json(json!({
                    "ok": false,
                    "error": format!("HTTP {}: {}", status_code, err_txt),
                    "data": {
                        "success": false,
                        "status": status_code,
                        "error": format!("HTTP {}: {}", status_code, err_txt),
                        "prompt": prompt,
                        "model": model
                    }
                }))
                .into_response()
            }
        }
        Err(e) => Json(json!({
            "ok": false,
            "error": e.to_string(),
            "data": {
                "success": false,
                "status": 500,
                "error": e.to_string(),
                "prompt": prompt,
                "model": model
            }
        }))
        .into_response(),
    }
}

pub async fn handle_providers_fetch_models(Json(body): Json<Value>) -> Response {
    let base_url = body
        .get("baseUrl")
        .or_else(|| body.get("baseURL"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim_end_matches('/');
    let api_key = body.get("apiKey").and_then(|v| v.as_str()).unwrap_or("");
    if base_url.is_empty() {
        return Json(json!({ "data": { "models": [] } })).into_response();
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap();
    let mut req = client.get(format!("{}/models", base_url));
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }
    let mut models = Vec::new();
    if let Ok(r) = req.send().await {
        if let Ok(data) = r.json::<Value>().await {
            if let Some(arr) = data.get("data").and_then(|v| v.as_array()) {
                for item in arr {
                    if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                        models.push(Value::String(id.to_string()));
                    }
                }
            }
        }
    }
    Json(json!({ "data": { "models": models } })).into_response()
}

pub async fn handle_providers_status() -> Response {
    register_local_cli_to_config(LOCAL_CLI_BRIDGE_PORT);
    let cfg = read_arunaki_config();
    let mut list = Vec::new();
    if let Some(prov_map) = cfg.get("provider").and_then(|v| v.as_object()) {
        for (pid, pval) in prov_map {
            let api_key = pval
                .pointer("/options/apiKey")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let base_url = pval
                .pointer("/options/baseURL")
                .or_else(|| pval.get("api"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let masked = if api_key.len() > 8 {
                format!("{}••••{}", &api_key[..4], &api_key[api_key.len() - 4..])
            } else if !api_key.is_empty() {
                "••••••••".to_string()
            } else {
                String::new()
            };
            let models: Vec<String> = pval
                .get("models")
                .and_then(|v| v.as_object())
                .map(|m| m.keys().cloned().collect())
                .unwrap_or_default();
            list.push(json!({
                "id": pid,
                "name": pval.get("name").and_then(|v| v.as_str()).unwrap_or(pid),
                "connected": !api_key.is_empty() || !base_url.is_empty(),
                "baseURL": base_url,
                "maskedKey": masked,
                "models": models
            }));
        }
    }
    Json(json!({
        "providers": list,
        "activeModel": cfg.get("model").and_then(|v| v.as_str()).unwrap_or("")
    }))
    .into_response()
}

pub async fn handle_providers_connect(Json(body): Json<Value>) -> Response {
    let Some(pid) = body.get("providerId").and_then(|v| v.as_str()) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "providerId is required" })),
        )
            .into_response();
    };
    let mut cfg = read_arunaki_config();
    if cfg.get("provider").and_then(|v| v.as_object()).is_none() {
        cfg["provider"] = json!({});
    }
    let name = body.get("name").and_then(|v| v.as_str()).unwrap_or(pid);
    let base_url = body.get("baseURL").and_then(|v| v.as_str()).unwrap_or("");
    let api_key = body.get("apiKey").and_then(|v| v.as_str()).unwrap_or("");

    let mut models_obj = cfg
        .pointer(&format!("/provider/{}/models", pid))
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    if let Some(m_arr) = body.get("models").and_then(|v| v.as_array()) {
        for m in m_arr {
            if let Some(mid) = m.get("id").and_then(|v| v.as_str()) {
                models_obj.insert(
                    mid.to_string(),
                    json!({
                        "name": m.get("name").and_then(|v| v.as_str()).unwrap_or(mid),
                        "attachment": true,
                        "reasoning": true,
                        "tool_call": true,
                        "limit": { "context": 128000, "output": 16384 }
                    }),
                );
            }
        }
    }

    cfg["provider"][pid] = json!({
        "name": name,
        "npm": "@ai-sdk/openai-compatible",
        "api": base_url,
        "options": {
            "baseURL": base_url,
            "apiKey": api_key
        },
        "models": models_obj
    });

    if body
        .get("setAsDefault")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        if let Some(first_mod) = models_obj.keys().next() {
            cfg["model"] = Value::String(format!("{}/{}", pid, first_mod));
        }
    }

    write_arunaki_config(&cfg);
    Json(json!({ "ok": true, "providerId": pid })).into_response()
}

pub async fn handle_providers_test(Json(body): Json<Value>) -> Response {
    let base_url = body
        .get("baseUrl")
        .or_else(|| body.get("baseURL"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim_end_matches('/');
    let api_key = body.get("apiKey").and_then(|v| v.as_str()).unwrap_or("");
    let model = body
        .get("model")
        .and_then(|v| v.as_str())
        .unwrap_or("gpt-4o");
    let prompt = body
        .get("prompt")
        .and_then(|v| v.as_str())
        .unwrap_or("Reply with one short line confirming this provider connection is working.");

    if body.get("model").is_some() || body.get("prompt").is_some() {
        return run_provider_chat_test(base_url, api_key, model, prompt).await;
    }

    if base_url.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "ok": false, "error": "baseURL is required" })),
        )
            .into_response();
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap();
    let mut req = client.get(format!("{}/models", base_url));
    if !api_key.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }
    match req.send().await {
        Ok(r) if r.status().is_success() => Json(json!({
            "ok": true,
            "data": { "success": true, "status": 200, "reply": "Connected", "prompt": prompt, "model": model }
        }))
        .into_response(),
        Ok(r) => Json(json!({
            "ok": false,
            "error": format!("Status {}", r.status()),
            "data": { "success": false, "status": r.status().as_u16(), "error": format!("Status {}", r.status()), "prompt": prompt, "model": model }
        }))
        .into_response(),
        Err(e) => Json(json!({
            "ok": false,
            "error": e.to_string(),
            "data": { "success": false, "status": 500, "error": e.to_string(), "prompt": prompt, "model": model }
        }))
        .into_response(),
    }
}

pub async fn handle_providers_delete(AxumPath(pid): AxumPath<String>) -> Response {
    let mut cfg = read_arunaki_config();
    if let Some(map) = cfg.get_mut("provider").and_then(|v| v.as_object_mut()) {
        map.remove(&pid);
        write_arunaki_config(&cfg);
    }
    Json(json!({ "ok": true, "data": { "ok": true } })).into_response()
}
