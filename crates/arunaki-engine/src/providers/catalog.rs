use super::config::read_arunaki_config;
use crate::bridge::LOCAL_CLI_BRIDGE_PORT;
use crate::cred_store::register_local_cli_to_config;
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
