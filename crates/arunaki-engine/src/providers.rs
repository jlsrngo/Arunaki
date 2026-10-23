use crate::bridge::LOCAL_CLI_BRIDGE_PORT;
use crate::cred_store::{
    fetch_all_quotas, fetch_live_quotas_list, get_all_credentials, get_credential,
    get_oauth_status, harvest_all, refresh_credential_source, register_local_cli_to_config,
    remove_credential, set_credential, start_oauth_session, CredentialEntry,
};
use crate::paths::{arunaki_config_dir, arunaki_data_dir, home_dir, now_iso, now_ms};
use axum::{
    extract::Path as AxumPath,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
    Json, Router,
};
use serde_json::{json, Value};

pub fn router() -> Router {
    Router::new()
        .route("/api/model", get(handle_model_list))
        .route("/model", get(handle_model_list))
        .route("/api/provider", get(handle_provider_list))
        .route("/provider", get(handle_provider_list))
        .route("/api/provider/:id", get(handle_provider_get))
        .route("/api/agent", get(handle_agent_list))
        .route("/agent", get(handle_agent_list))
        .route("/api/agent/:id", get(handle_agent_get))
        // UI Provider CRUD endpoints (ModelProviderSettings.tsx & SettingsCliConnectionsTab.tsx)
        .route(
            "/api/providers",
            get(handle_ui_providers_list).post(handle_ui_providers_upsert),
        )
        .route(
            "/providers",
            get(handle_ui_providers_list).post(handle_ui_providers_upsert),
        )
        .route("/api/providers/status", get(handle_providers_status))
        .route("/api/providers/connect", post(handle_providers_connect))
        .route("/api/providers/test", post(handle_providers_test))
        .route("/providers/test", post(handle_providers_test))
        .route(
            "/api/providers/fetch-models",
            post(handle_providers_fetch_models),
        )
        .route(
            "/providers/fetch-models",
            post(handle_providers_fetch_models),
        )
        // Local-CLI endpoints (SettingsCliConnectionsTab.tsx)
        .route(
            "/api/providers/local-cli/status",
            get(handle_local_cli_status),
        )
        .route("/providers/local-cli/status", get(handle_local_cli_status))
        .route(
            "/api/providers/local-cli/quotas",
            get(handle_local_cli_quotas).post(handle_local_cli_quota_post),
        )
        .route(
            "/api/providers/local-cli/quota",
            get(handle_local_cli_quota_post).post(handle_local_cli_quota_post),
        )
        .route(
            "/providers/local-cli/quota",
            get(handle_local_cli_quota_post).post(handle_local_cli_quota_post),
        )
        .route(
            "/api/providers/local-cli/models",
            post(handle_local_cli_models),
        )
        .route("/providers/local-cli/models", post(handle_local_cli_models))
        .route(
            "/api/providers/local-cli/discovered",
            get(handle_local_cli_discovered),
        )
        .route(
            "/providers/local-cli/discovered",
            get(handle_local_cli_discovered),
        )
        .route(
            "/api/providers/local-cli/connect",
            post(handle_local_cli_connect),
        )
        .route(
            "/providers/local-cli/connect",
            post(handle_local_cli_connect),
        )
        .route(
            "/api/providers/local-cli/login",
            post(handle_local_cli_login),
        )
        .route("/providers/local-cli/login", post(handle_local_cli_login))
        .route(
            "/api/providers/local-cli/inject",
            post(handle_local_cli_inject),
        )
        .route("/providers/local-cli/inject", post(handle_local_cli_inject))
        .route(
            "/api/providers/local-cli/oauth/start",
            post(handle_local_cli_oauth_start),
        )
        .route(
            "/providers/local-cli/oauth/start",
            post(handle_local_cli_oauth_start),
        )
        .route(
            "/api/providers/local-cli/oauth/status",
            post(handle_local_cli_oauth_status),
        )
        .route(
            "/providers/local-cli/oauth/status",
            post(handle_local_cli_oauth_status),
        )
        .route(
            "/api/providers/local-cli/harvest",
            post(handle_local_cli_harvest),
        )
        .route(
            "/api/providers/local-cli/signin",
            post(handle_local_cli_signin),
        )
        .route(
            "/api/providers/local-cli/token",
            post(handle_local_cli_token),
        )
        .route(
            "/api/providers/local-cli/refresh",
            post(handle_local_cli_refresh),
        )
        .route(
            "/providers/local-cli/refresh",
            post(handle_local_cli_refresh),
        )
        .route(
            "/api/providers/local-cli/:source",
            delete(handle_local_cli_delete),
        )
        // Wildcard provider ID routes last so they don't shadow /api/providers/local-cli/*
        .route(
            "/api/providers/:providerId",
            put(handle_ui_providers_update).delete(handle_providers_delete),
        )
        .route(
            "/providers/:providerId",
            put(handle_ui_providers_update).delete(handle_providers_delete),
        )
        .route(
            "/api/providers/:providerId/state",
            put(handle_ui_providers_state),
        )
        .route(
            "/providers/:providerId/state",
            put(handle_ui_providers_state),
        )
        .route(
            "/api/providers/:providerId/test",
            post(handle_ui_provider_id_test),
        )
        .route(
            "/providers/:providerId/test",
            post(handle_ui_provider_id_test),
        )
        .route("/config", get(handle_config_get))
        .route("/api/config", get(handle_config_get))
        .route("/project", get(handle_project_list))
        .route("/project/current", get(handle_project_current))
        .route("/path", get(handle_path_get))
        .route("/vcs", get(handle_vcs_get))
}

pub fn read_arunaki_config() -> Value {
    let p = arunaki_config_dir().join("arunaki.json");
    if let Ok(raw) = std::fs::read_to_string(&p) {
        if let Ok(val) = serde_json::from_str::<Value>(&raw) {
            return val;
        }
    }
    json!({})
}

pub fn write_arunaki_config(cfg: &Value) {
    let p = arunaki_config_dir().join("arunaki.json");
    if let Ok(raw) = serde_json::to_string_pretty(cfg) {
        let _ = std::fs::write(p, raw);
    }
}

fn build_catalog() -> (Vec<Value>, Vec<Value>) {
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

            if let Some(mod_map) = pval.get("models").and_then(|v| v.as_object()) {
                for (mid, mval) in mod_map {
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
    }

    (providers, models)
}

fn build_ui_providers_list() -> Vec<Value> {
    register_local_cli_to_config(LOCAL_CLI_BRIDGE_PORT);
    let cfg = read_arunaki_config();
    let active_model_str = cfg.get("model").and_then(|v| v.as_str()).unwrap_or("");
    let mut out = Vec::new();
    if let Some(prov_map) = cfg.get("provider").and_then(|v| v.as_object()) {
        for (idx, (pid, pval)) in prov_map.iter().enumerate() {
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
                "priority": priority
            }));
        }
    }
    out
}

async fn handle_ui_providers_list() -> Response {
    let list = build_ui_providers_list();
    Json(json!({ "data": list })).into_response()
}

fn slugify_id(name: &str) -> String {
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

async fn handle_ui_providers_upsert(Json(body): Json<Value>) -> Response {
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

async fn handle_ui_providers_update(
    AxumPath(pid): AxumPath<String>,
    Json(body): Json<Value>,
) -> Response {
    upsert_ui_provider(&pid, &body)
}

fn upsert_ui_provider(pid: &str, body: &Value) -> Response {
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

async fn handle_ui_providers_state(
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

async fn handle_ui_provider_id_test(
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

async fn run_provider_chat_test(
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

async fn handle_providers_fetch_models(Json(body): Json<Value>) -> Response {
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

async fn handle_model_list() -> Response {
    let (_, models) = build_catalog();
    Json(json!({ "data": models })).into_response()
}

async fn handle_provider_list() -> Response {
    let (providers, _) = build_catalog();
    Json(json!({ "data": providers })).into_response()
}

async fn handle_provider_get(AxumPath(id): AxumPath<String>) -> Response {
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

async fn handle_agent_list() -> Response {
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

async fn handle_agent_get(AxumPath(id): AxumPath<String>) -> Response {
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

async fn handle_providers_status() -> Response {
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

async fn handle_providers_connect(Json(body): Json<Value>) -> Response {
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

async fn handle_providers_test(Json(body): Json<Value>) -> Response {
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

async fn handle_providers_delete(AxumPath(pid): AxumPath<String>) -> Response {
    let mut cfg = read_arunaki_config();
    if let Some(map) = cfg.get_mut("provider").and_then(|v| v.as_object_mut()) {
        map.remove(&pid);
        write_arunaki_config(&cfg);
    }
    Json(json!({ "ok": true, "data": { "ok": true } })).into_response()
}

fn default_models_for_target(target: &str) -> Vec<&'static str> {
    match target {
        "claude" => vec![
            "claude-sonnet-4-6",
            "claude-opus-4-6",
            "claude-haiku-4-5",
        ],
        "codex" => vec![
            "gpt-5.6-terra",
            "gpt-5.4",
            "gpt-5.4-mini",
            "gpt-5.3-codex",
            "gpt-5.2-codex",
            "gpt-5.2",
            "gpt-5.1-codex-max",
            "gpt-5.1-codex-mini",
        ],
        "kiro" => vec![
            "kiro/auto",
            "kiro/claude-opus-4.6",
            "kiro/claude-sonnet-4.6",
            "kiro/claude-sonnet-4.5",
            "kiro/claude-haiku-4.5",
            "kiro/deepseek-3.2",
            "kiro/minimax-m2.5",
            "kiro/glm-5",
            "kiro/qwen3-coder-next",
        ],
        "antigravity" => vec![
            "gemini-3.8-pro-high",
            "gemini-3.8-pro-low",
            "gemini-3.8-flash-high",
            "gemini-3.8-flash-medium",
            "gemini-3.8-flash-low",
            "gemini-3.8-flash-minimal",
            "claude-sonnet-4-6-agy",
            "claude-opus-4-6-thinking",
            "gpt-oss-120b-medium",
        ],
        "opencode" => vec![
            "opencode/big-pickle",
            "opencode/mimo-v2-pro-free",
            "opencode/mimo-v2-omni-free",
            "opencode/nemotron-3-super-free",
            "opencode/minimax-m2.5-free",
            "opencode/gpt-5-nano",
        ],
        "9router" => vec![
            "claude-sonnet-4-6",
            "gpt-5.4",
            "gemini-3.8-pro-high",
        ],
        _ => vec![],
    }
}

fn build_discovered_list() -> Vec<Value> {
    let creds = get_all_credentials();
    let mut out = Vec::new();
    let specs = [
        (
            "antigravity",
            "Google Antigravity (agy)",
            "oauth",
            "Windows CredMan (gemini:antigravity)",
            "gemini-3.8-flash-high",
        ),
        (
            "claude",
            "Claude Code",
            "oauth",
            "~/.claude/.credentials.json",
            "claude-sonnet-4-6",
        ),
        (
            "codex",
            "OpenAI Codex / ChatGPT",
            "oauth",
            "~/.codex/auth.json",
            "gpt-5.4",
        ),
        (
            "kiro",
            "Kiro (AWS)",
            "oauth",
            "~/.aws/sso/cache",
            "kiro/auto",
        ),
        (
            "opencode",
            "OpenCode Zen",
            "api_key",
            "~/.local/share/opencode/auth.json",
            "opencode/big-pickle",
        ),
    ];

    for (prov, disp, ctype, src_path, def_mod) in specs {
        let entry = creds.get(prov);
        let has_token = entry.map(|e| !e.access_token.is_empty()).unwrap_or(false);
        let expired = entry
            .and_then(|e| e.expires_at)
            .map(|exp| now_ms() >= exp)
            .unwrap_or(false);
        out.push(json!({
            "provider": prov,
            "displayName": disp,
            "type": ctype,
            "sourcePath": src_path,
            "hasToken": has_token,
            "hasRefreshToken": entry.and_then(|e| e.refresh_token.as_ref()).is_some(),
            "isExpired": expired,
            "expiresAt": entry.and_then(|e| e.expires_at),
            "region": entry.and_then(|e| e.region.clone()),
            "defaultModel": def_mod,
            "models": default_models_for_target(prov)
        }));
    }
    out
}

async fn handle_local_cli_status() -> Response {
    harvest_all();
    register_local_cli_to_config(LOCAL_CLI_BRIDGE_PORT);
    let creds = get_all_credentials();
    let quotas = fetch_all_quotas().await;

    let mut sources = serde_json::Map::new();
    for s in ["codex", "claude", "opencode", "kiro", "antigravity", "groq"] {
        if let Some(c) = creds.get(s) {
            let expired = c
                .expires_at
                .map(|exp| now_ms() >= exp)
                .unwrap_or(false);
            sources.insert(
                s.to_string(),
                json!({
                    "connected": true,
                    "expired": expired,
                    "expiresAt": c.expires_at,
                    "updatedAt": c.updated_at,
                    "autoHarvested": c.auto_harvested,
                    "accountInfo": c.account_info,
                    "hasRefreshToken": c.refresh_token.is_some(),
                    "quota": quotas.get(s).cloned()
                }),
            );
        } else {
            sources.insert(
                s.to_string(),
                json!({
                    "connected": false,
                    "expired": false
                }),
            );
        }
    }

    let make_slot = |prov: &str, cred_file: &str| -> Value {
        if let Some(c) = creds.get(prov) {
            let expired = c.expires_at.map(|exp| now_ms() >= exp).unwrap_or(false);
            json!({
                "installed": true,
                "loggedIn": !c.access_token.is_empty() && !expired,
                "credentialFile": cred_file,
                "detail": if expired { "Token expired (auto-refresh ready)" } else { "Signed in & ready via Local-CLI Bridge" },
                "expiresAt": c.expires_at,
                "hasRefreshToken": c.refresh_token.is_some()
            })
        } else {
            json!({
                "installed": true,
                "loggedIn": false,
                "credentialFile": cred_file,
                "detail": "Not signed in"
            })
        }
    };

    let data_envelope = json!({
        "claude": make_slot("claude", "~/.claude/.credentials.json"),
        "opencode": make_slot("opencode", "~/.local/share/opencode/auth.json"),
        "antigravity": make_slot("antigravity", "Windows CredMan (gemini:antigravity)"),
        "kiro": make_slot("kiro", "~/.aws/sso/cache"),
        "nineRouter": {
            "installed": true,
            "running": false,
            "port": 20128,
            "baseUrl": "http://127.0.0.1:20128/v1",
            "detail": "Built-in Rust Local-CLI Bridge active on :20188"
        },
        "codex": make_slot("codex", "~/.codex/auth.json"),
        "bridgePort": LOCAL_CLI_BRIDGE_PORT,
        "bridgeRunning": true,
        "discovered": build_discovered_list(),
        "registry": []
    });

    Json(json!({
        "bridgeRunning": true,
        "bridgePort": LOCAL_CLI_BRIDGE_PORT,
        "bridgeUrl": format!("http://127.0.0.1:{}/v1", LOCAL_CLI_BRIDGE_PORT),
        "sources": sources,
        "quotas": quotas,
        "data": data_envelope
    }))
    .into_response()
}

async fn handle_local_cli_quotas() -> Response {
    let quotas = fetch_all_quotas().await;
    let list = fetch_live_quotas_list().await;
    Json(json!({ "ok": true, "quotas": quotas, "data": list })).into_response()
}

async fn handle_local_cli_quota_post() -> Response {
    let list = fetch_live_quotas_list().await;
    Json(json!({ "ok": true, "data": list })).into_response()
}

async fn handle_local_cli_models(Json(body): Json<Value>) -> Response {
    let target = body
        .get("target")
        .and_then(|v| v.as_str())
        .unwrap_or("kiro");
    let models = default_models_for_target(target);
    Json(json!({
        "data": {
            "target": target,
            "models": models
        }
    }))
    .into_response()
}

async fn handle_local_cli_discovered() -> Response {
    harvest_all();
    Json(json!({ "data": build_discovered_list() })).into_response()
}

async fn handle_local_cli_connect(Json(body): Json<Value>) -> Response {
    let target = body
        .get("target")
        .and_then(|v| v.as_str())
        .unwrap_or("kiro");
    let default_mods = default_models_for_target(target);
    let chosen_model = body
        .get("model")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| default_mods.first().copied().unwrap_or("kiro/auto"));

    harvest_all();
    register_local_cli_to_config(LOCAL_CLI_BRIDGE_PORT);

    let pid = match target {
        "claude" => "claude-cli",
        "opencode" => "opencode-zen",
        "antigravity" => "antigravity-local",
        "9router" => "9router",
        "codex" => "codex-cli",
        "kiro" => "kiro-cli",
        other => other,
    };
    let disp_name = match target {
        "claude" => "Claude Code (Local Subscription)",
        "opencode" => "OpenCode Zen (Local CLI)",
        "antigravity" => "Antigravity (Local Account)",
        "9router" => "9Router (Local AI Hub)",
        "codex" => "OpenAI Codex (ChatGPT Subscription)",
        "kiro" => "Kiro (AWS CodeWhisperer)",
        other => other,
    };
    let base_url = format!("http://127.0.0.1:{}/v1", LOCAL_CLI_BRIDGE_PORT);

    let mut cfg = read_arunaki_config();
    if cfg.get("provider").and_then(|v| v.as_object()).is_none() {
        cfg["provider"] = json!({});
    }
    let mut models_obj = serde_json::Map::new();
    for m in &default_mods {
        models_obj.insert(
            (*m).to_string(),
            json!({
                "name": m,
                "attachment": true,
                "reasoning": true,
                "tool_call": true,
                "limit": { "context": 200000, "output": 32768 }
            }),
        );
    }
    models_obj.entry(chosen_model.to_string()).or_insert_with(|| {
        json!({
            "name": chosen_model,
            "attachment": true,
            "reasoning": true,
            "tool_call": true,
            "limit": { "context": 200000, "output": 32768 }
        })
    });

    cfg["provider"][pid] = json!({
        "name": disp_name,
        "type": "openai",
        "npm": "@ai-sdk/openai-compatible",
        "api": base_url,
        "defaultModel": chosen_model,
        "active": true,
        "priority": 1,
        "options": {
            "baseURL": base_url,
            "apiKey": format!("local-cli-{}", target)
        },
        "models": models_obj
    });
    cfg["model"] = Value::String(format!("local-cli/{}", chosen_model));
    write_arunaki_config(&cfg);

    Json(json!({
        "data": {
            "id": pid,
            "name": disp_name,
            "type": "openai",
            "baseUrl": base_url,
            "apiKey": format!("local-cli-{}", target),
            "model": chosen_model,
            "active": true,
            "priority": 1
        }
    }))
    .into_response()
}

async fn handle_local_cli_login(Json(body): Json<Value>) -> Response {
    let target = body.get("target").and_then(|v| v.as_str()).unwrap_or("");
    match target {
        "antigravity-logout" => {
            remove_credential("antigravity");
            return Json(json!({
                "data": { "success": true, "message": "Signed out from Antigravity." }
            }))
            .into_response();
        }
        "opencode-logout" => {
            remove_credential("opencode");
            return Json(json!({
                "data": { "success": true, "message": "Signed out from OpenCode." }
            }))
            .into_response();
        }
        "claude" | "codex" | "opencode-terminal" | "antigravity-cli" => {
            let cmd_str = match target {
                "claude" => "claude",
                "codex" => "codex",
                "opencode-terminal" => "opencode auth login",
                "antigravity-cli" => "agy login",
                _ => "cmd",
            };
            #[cfg(windows)]
            {
                let _ = std::process::Command::new("cmd")
                    .args(["/c", "start", "cmd", "/k", cmd_str])
                    .spawn();
            }
            return Json(json!({
                "data": {
                    "success": true,
                    "message": format!("Launched '{}' in terminal window.", cmd_str)
                }
            }))
            .into_response();
        }
        _ => Json(json!({
            "data": {
                "success": true,
                "message": "Built-in Rust Local-CLI Bridge is active."
            }
        }))
        .into_response(),
    }
}

async fn handle_local_cli_inject(Json(body): Json<Value>) -> Response {
    let target = body
        .get("target")
        .and_then(|v| v.as_str())
        .unwrap_or("all");
    let action = body
        .get("action")
        .and_then(|v| v.as_str())
        .unwrap_or("inject");
    let bridge_url = format!("http://127.0.0.1:{}", LOCAL_CLI_BRIDGE_PORT);
    let mut paths_touched = Vec::new();

    if target == "claude" || target == "all" {
        let claude_dir = home_dir().join(".claude");
        let _ = std::fs::create_dir_all(&claude_dir);
        let settings_path = claude_dir.join("settings.json");
        let mut val: Value = std::fs::read_to_string(&settings_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_else(|| json!({}));
        if !val.is_object() {
            val = json!({});
        }
        if action == "inject" {
            if val.get("env").and_then(|v| v.as_object()).is_none() {
                val["env"] = json!({});
            }
            val["env"]["ANTHROPIC_BASE_URL"] = Value::String(bridge_url.clone());
            val["env"]["ANTHROPIC_AUTH_TOKEN"] = Value::String("arunaki-bridge".to_string());
        } else if let Some(env_obj) = val.get_mut("env").and_then(|v| v.as_object_mut()) {
            env_obj.remove("ANTHROPIC_BASE_URL");
            env_obj.remove("ANTHROPIC_AUTH_TOKEN");
        }
        if let Ok(raw) = serde_json::to_string_pretty(&val) {
            let _ = std::fs::write(&settings_path, raw);
            paths_touched.push(settings_path.to_string_lossy().to_string());
        }
    }

    if target == "codex" || target == "all" {
        let codex_dir = home_dir().join(".codex");
        let _ = std::fs::create_dir_all(&codex_dir);
        let cfg_path = codex_dir.join("config.toml");
        if action == "inject" {
            let toml_content = format!(
                "# Injected by Arunaki Local-CLI Bridge\nmodel_provider = \"arunaki\"\n\n[model_providers.arunaki]\nname = \"Arunaki Local Bridge\"\nbase_url = \"{}/v1\"\n",
                bridge_url
            );
            let _ = std::fs::write(&cfg_path, toml_content);
        } else if cfg_path.exists() {
            let _ = std::fs::remove_file(&cfg_path);
        }
        paths_touched.push(cfg_path.to_string_lossy().to_string());
    }

    let joined = paths_touched.join(", ");
    Json(json!({
        "data": {
            "success": true,
            "action": action,
            "path": joined,
            "message": format!("CLI config {} complete ({})", action, joined)
        }
    }))
    .into_response()
}

async fn handle_local_cli_oauth_start(Json(body): Json<Value>) -> Response {
    let target = body
        .get("target")
        .and_then(|v| v.as_str())
        .unwrap_or("kiro");
    let open_browser = body
        .get("openBrowser")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    match start_oauth_session(target, open_browser).await {
        Ok(data) => Json(json!({ "data": data })).into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": e, "data": { "status": "error", "message": e } })),
        )
            .into_response(),
    }
}

async fn handle_local_cli_oauth_status(Json(body): Json<Value>) -> Response {
    let req_id = body
        .get("requestId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if let Some(st) = get_oauth_status(req_id) {
        Json(json!({
            "data": {
                "requestId": st.request_id,
                "target": st.target,
                "status": st.status,
                "message": st.message,
                "authUrl": st.auth_url
            }
        }))
        .into_response()
    } else {
        Json(json!({
            "data": {
                "requestId": req_id,
                "target": "unknown",
                "status": "error",
                "message": "OAuth session not found"
            }
        }))
        .into_response()
    }
}

async fn handle_local_cli_harvest() -> Response {
    let harvested = harvest_all();
    register_local_cli_to_config(LOCAL_CLI_BRIDGE_PORT);
    Json(json!({ "ok": true, "harvested": harvested })).into_response()
}

async fn handle_local_cli_signin(Json(body): Json<Value>) -> Response {
    let source = body
        .get("source")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    harvest_all();
    if let Some(c) = get_credential(&source) {
        if let Some(refreshed) = refresh_credential_source(&source, &c).await {
            register_local_cli_to_config(LOCAL_CLI_BRIDGE_PORT);
            return Json(json!({
                "ok": true,
                "source": source,
                "method": "refresh",
                "expiresAt": refreshed.expires_at
            }))
            .into_response();
        }
        register_local_cli_to_config(LOCAL_CLI_BRIDGE_PORT);
        return Json(json!({
            "ok": true,
            "source": source,
            "method": "harvest",
            "expiresAt": c.expires_at
        }))
        .into_response();
    }
    (
        StatusCode::BAD_REQUEST,
        Json(json!({ "ok": false, "error": format!("No local credentials found for {}", source) })),
    )
        .into_response()
}

async fn handle_local_cli_token(Json(body): Json<Value>) -> Response {
    let Some(source) = body.get("source").and_then(|v| v.as_str()) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "source is required" })),
        )
            .into_response();
    };
    let Some(token) = body.get("accessToken").and_then(|v| v.as_str()) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "accessToken is required" })),
        )
            .into_response();
    };
    set_credential(CredentialEntry {
        source: source.to_string(),
        access_token: token.trim().to_string(),
        refresh_token: body
            .get("refreshToken")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        expires_at: None,
        client_id: None,
        client_secret: None,
        region: body
            .get("region")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        account_info: Some("Manual token".to_string()),
        updated_at: now_iso(),
        auto_harvested: false,
        ..Default::default()
    });
    register_local_cli_to_config(LOCAL_CLI_BRIDGE_PORT);
    Json(json!({ "ok": true, "source": source })).into_response()
}

async fn handle_local_cli_refresh(Json(body): Json<Value>) -> Response {
    let target = body
        .get("source")
        .or_else(|| body.get("target"))
        .and_then(|v| v.as_str());
    let action = body.get("action").and_then(|v| v.as_str()).unwrap_or("refresh");

    if action == "logout" {
        if let Some(t) = target {
            remove_credential(t);
            register_local_cli_to_config(LOCAL_CLI_BRIDGE_PORT);
            return Json(json!({
                "ok": true,
                "data": { "success": true, "message": format!("Signed out from {}.", t) }
            }))
            .into_response();
        }
    }

    harvest_all();
    let creds = get_all_credentials();
    let mut results = serde_json::Map::new();
    let mut any_ok = false;
    for (src, entry) in creds {
        if let Some(t) = target {
            if t != src {
                continue;
            }
        }
        let ok = refresh_credential_source(&src, &entry).await.is_some();
        if ok {
            any_ok = true;
        }
        results.insert(src, Value::Bool(ok));
    }
    register_local_cli_to_config(LOCAL_CLI_BRIDGE_PORT);
    Json(json!({
        "ok": true,
        "results": results,
        "data": {
            "success": any_ok || target.is_none(),
            "message": if any_ok { "Token refreshed successfully." } else { "Credentials re-harvested." }
        }
    }))
    .into_response()
}

async fn handle_local_cli_delete(AxumPath(source): AxumPath<String>) -> Response {
    let removed = remove_credential(&source);
    register_local_cli_to_config(LOCAL_CLI_BRIDGE_PORT);
    Json(json!({ "ok": removed })).into_response()
}

async fn handle_config_get() -> Response {
    Json(read_arunaki_config()).into_response()
}

async fn handle_project_list() -> Response {
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

async fn handle_project_current() -> Response {
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

async fn handle_path_get() -> Response {
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

async fn handle_vcs_get() -> Response {
    Json(json!({ "branch": "main" })).into_response()
}
