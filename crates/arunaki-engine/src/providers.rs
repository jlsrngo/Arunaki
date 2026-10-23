use crate::bridge::LOCAL_CLI_BRIDGE_PORT;
use crate::cred_store::{
    fetch_all_quotas, get_all_credentials, get_credential, harvest_all, refresh_credential_source,
    register_local_cli_to_config, remove_credential, set_credential, CredentialEntry,
};
use crate::paths::{arunaki_config_dir, arunaki_data_dir, home_dir, now_iso, now_ms};
use axum::{
    extract::Path as AxumPath,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{delete, get, post},
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
        .route("/api/providers/status", get(handle_providers_status))
        .route("/api/providers/connect", post(handle_providers_connect))
        .route("/api/providers/test", post(handle_providers_test))
        .route("/api/providers/:providerId", delete(handle_providers_delete))
        .route(
            "/api/providers/local-cli/status",
            get(handle_local_cli_status),
        )
        .route(
            "/api/providers/local-cli/quotas",
            get(handle_local_cli_quotas),
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
            "/api/providers/local-cli/:source",
            delete(handle_local_cli_delete),
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
        .get("baseURL")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim_end_matches('/');
    let api_key = body.get("apiKey").and_then(|v| v.as_str()).unwrap_or("");
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
        Ok(r) if r.status().is_success() => Json(json!({ "ok": true })).into_response(),
        Ok(r) => Json(json!({ "ok": false, "error": format!("Status {}", r.status()) })).into_response(),
        Err(e) => Json(json!({ "ok": false, "error": e.to_string() })).into_response(),
    }
}

async fn handle_providers_delete(AxumPath(pid): AxumPath<String>) -> Response {
    let mut cfg = read_arunaki_config();
    if let Some(map) = cfg.get_mut("provider").and_then(|v| v.as_object_mut()) {
        map.remove(&pid);
        write_arunaki_config(&cfg);
    }
    Json(json!({ "ok": true })).into_response()
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

    Json(json!({
        "bridgeRunning": true,
        "bridgePort": LOCAL_CLI_BRIDGE_PORT,
        "bridgeUrl": format!("http://127.0.0.1:{}/v1", LOCAL_CLI_BRIDGE_PORT),
        "sources": sources,
        "quotas": quotas
    }))
    .into_response()
}

async fn handle_local_cli_quotas() -> Response {
    let quotas = fetch_all_quotas().await;
    Json(json!({ "ok": true, "quotas": quotas })).into_response()
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
    let target = body.get("source").and_then(|v| v.as_str());
    let creds = get_all_credentials();
    let mut results = serde_json::Map::new();
    for (src, entry) in creds {
        if let Some(t) = target {
            if t != src {
                continue;
            }
        }
        let ok = refresh_credential_source(&src, &entry).await.is_some();
        results.insert(src, Value::Bool(ok));
    }
    register_local_cli_to_config(LOCAL_CLI_BRIDGE_PORT);
    Json(json!({ "ok": true, "results": results })).into_response()
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
