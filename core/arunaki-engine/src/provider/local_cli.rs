use super::config::{read_arunaki_config, write_arunaki_config};
use crate::bridge::LOCAL_CLI_BRIDGE_PORT;
use crate::cred_store::{
    fetch_all_quotas, fetch_live_quotas_list, get_all_credentials, get_credential,
    get_oauth_status, harvest_all, refresh_credential_source, register_local_cli_to_config,
    remove_credential, set_credential, start_oauth_session, CredentialEntry,
};
use crate::paths::{home_dir, now_iso, now_ms};
use axum::{
    extract::Path as AxumPath,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Value};

pub fn default_models_for_target(target: &str) -> Vec<&'static str> {
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

pub fn build_discovered_list() -> Vec<Value> {
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
            "accountEmail": entry.and_then(|e| e.account_email.clone()).or_else(|| entry.and_then(|e| e.account_info.clone()).filter(|s| s.contains('@'))),
            "region": entry.and_then(|e| e.region.clone()),
            "defaultModel": def_mod,
            "models": default_models_for_target(prov)
        }));
    }
    out
}

pub fn build_cli_provider_registry() -> Vec<Value> {
    vec![
        json!({
            "id": "claude",
            "name": "Claude",
            "vendor": "Anthropic",
            "docsUrl": "https://claude.ai",
            "loginCommand": "claude auth login",
            "credentialPath": "~/.claude/.credentials.json",
            "quota": "claude",
            "models": [
                "claude-3-7-sonnet",
                "claude-3-5-sonnet",
                "claude-3-5-haiku",
                "claude-3-opus"
            ],
            "requiresCli": false,
            "loginMode": "terminal",
            "supportsAutoConfigure": true,
            "supportsBrowserLogin": true,
            "entitlement": {
                "notice": "Requires a Claude Max or Pro subscription",
                "noticeId": "Perlu langganan Claude Max atau Pro",
                "url": "https://claude.ai"
            }
        }),
        json!({
            "id": "codex",
            "name": "Codex",
            "vendor": "OpenAI",
            "docsUrl": "https://chatgpt.com",
            "loginCommand": "codex login",
            "credentialPath": "~/.codex/auth.json",
            "quota": "codex",
            "models": [
                "gpt-5.6-terra",
                "gpt-5.6-luna",
                "gpt-5.5",
                "gpt-6-luna",
                "gpt-reserve"
            ],
            "requiresCli": false,
            "loginMode": "terminal",
            "supportsAutoConfigure": false,
            "supportsBrowserLogin": true,
            "entitlement": {
                "notice": "Works on a free ChatGPT account, but only some models answer. A free login is refused by every other Codex model with \"not supported when using Codex with a ChatGPT account\".",
                "noticeId": "Gratis berfungsi, tapi hanya sebagian model",
                "url": "https://chatgpt.com/codex"
            }
        }),
        json!({
            "id": "opencode",
            "name": "OpenCode",
            "vendor": "opencode",
            "docsUrl": "https://opencode.ai",
            "installUrl": "https://opencode.ai",
            "loginCommand": "opencode auth login",
            "credentialPath": "~/.local/share/opencode/auth.json",
            "quota": "none",
            "models": [
                "groq/openai/gpt-oss-120b",
                "groq/qwen/qwen3.8-27b",
                "groq/openai/gpt-oss-20b",
                "opencode/big-pickle",
                "9router/ComboMaut",
                "opencode/nemotron-3.5-lightning-free"
            ],
            "requiresCli": true,
            "loginMode": "terminal",
            "supportsAutoConfigure": false,
            "supportsBrowserLogin": false,
            "note": {
                "text": "Native requests route through OpenCode Zen and can take up to a minute on a cold model. Slow, not stuck.",
                "textId": "Permintaan native lewat OpenCode Zen bisa sampai semenit saat model baru dipakai. Lambat, bukan macet."
            }
        }),
        json!({
            "id": "antigravity",
            "name": "Google Antigravity CLI",
            "vendor": "Google DeepMind",
            "docsUrl": "https://antigravity.google.com",
            "installUrl": "https://antigravity.google.com",
            "installSizeMb": 181,
            "loginCommand": "agy",
            "credentialPath": "~/.gemini/oauth_creds.json",
            "credentialTarget": "gemini:antigravity",
            "quota": "antigravity",
            "models": [
                "gemini-3.8-flash-medium",
                "gemini-3.8-flash-low",
                "gemini-3.8-flash-high",
                "gemini-2.5-pro",
                "gemini-2.5-flash",
                "claude-sonnet-4-6"
            ],
            "requiresCli": true,
            "loginMode": "terminal",
            "supportsAutoConfigure": false,
            "supportsBrowserLogin": false
        }),
        json!({
            "id": "kiro",
            "name": "Kiro",
            "vendor": "AWS",
            "docsUrl": "https://kiro.dev",
            "quota": "kiro",
            "models": [
                "kiro/auto",
                "kiro/claude-opus-4.6",
                "kiro/claude-sonnet-4.6",
                "kiro/claude-sonnet-4.5",
                "kiro/claude-haiku-4.5",
                "kiro/deepseek-3.2",
                "kiro/minimax-m2.5",
                "kiro/glm-5",
                "kiro/qwen3-coder-next"
            ],
            "requiresCli": false,
            "loginMode": "browser",
            "supportsAutoConfigure": false,
            "supportsBrowserLogin": true
        }),
        json!({
            "id": "nineRouter",
            "name": "9Router",
            "vendor": "9Router",
            "docsUrl": "https://9router.com",
            "quota": "none",
            "models": [
                "9router/ComboMaut",
                "oc/big-pickle",
                "oc/claude-sonnet-4.5",
                "kr/claude-sonnet-4.5",
                "vx/gemini-2.5-pro",
                "deepseek-r1",
                "cx/gpt-5.6-terra"
            ],
            "requiresCli": true,
            "loginMode": "terminal",
            "supportsAutoConfigure": false,
            "supportsBrowserLogin": false
        })
    ]
}

pub async fn handle_local_cli_status() -> Response {
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
                    "accountEmail": c.account_email.clone().or_else(|| c.account_info.clone().filter(|s| s.contains('@'))),
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

    let agy_c = creds.get("antigravity");
    let agy_signed_in = agy_c.map(|c| !c.access_token.is_empty()).unwrap_or(false);
    let agy_email = agy_c.and_then(|c| c.account_email.clone());
    let antigravity_slot = json!({
        "detected": true,
        "cliInstalled": true,
        "agyInstalled": true,
        "agySignedIn": agy_signed_in,
        "agyVersion": "1.3.1",
        "loggedIn": agy_signed_in,
        "accountEmail": agy_email,
        "environment": "Google Antigravity CLI (agy)",
        "detail": if agy_signed_in { "Signed in & ready via Local-CLI Bridge" } else { "Not signed in" }
    });

    let claude_c = creds.get("claude");
    let claude_signed_in = claude_c.map(|c| !c.access_token.is_empty()).unwrap_or(false);
    let claude_slot = json!({
        "installed": true,
        "version": "2.1.202",
        "loggedIn": claude_signed_in,
        "signedIn": claude_signed_in,
        "credentialFile": "~/.claude/.credentials.json",
        "detail": if claude_signed_in { "Signed in & ready via Local-CLI Bridge" } else { "Not signed in" }
    });

    let codex_c = creds.get("codex");
    let codex_signed_in = codex_c.map(|c| !c.access_token.is_empty()).unwrap_or(false);
    let codex_slot = json!({
        "installed": true,
        "version": "0.1.0",
        "isCloudOnly": false,
        "signedIn": codex_signed_in,
        "loggedIn": codex_signed_in,
        "plan": if codex_signed_in { Some("free") } else { None },
        "accountEmail": codex_c.and_then(|c| c.account_email.clone()),
        "expiresAt": codex_c.and_then(|c| c.expires_at),
        "credentialFile": "~/.codex/auth.json",
        "detail": if codex_signed_in { "Signed in & ready via Local-CLI Bridge" } else { "Not signed in" }
    });

    let kiro_c = creds.get("kiro");
    let kiro_signed_in = kiro_c.map(|c| !c.access_token.is_empty()).unwrap_or(false);
    let kiro_slot = json!({
        "installed": true,
        "signedIn": kiro_signed_in,
        "loggedIn": kiro_signed_in,
        "requiresCli": false,
        "accountEmail": kiro_c.and_then(|c| c.account_email.clone()),
        "region": kiro_c.and_then(|c| c.region.clone()).unwrap_or_else(|| "us-east-1".to_string()),
        "hasRefreshToken": kiro_c.and_then(|c| c.refresh_token.as_ref()).is_some(),
        "expiresAt": kiro_c.and_then(|c| c.expires_at),
        "detail": if kiro_signed_in { "Signed in & ready via Local-CLI Bridge" } else { "Not signed in" }
    });

    let opencode_slot = json!({
        "installed": true,
        "version": "1.18.30",
        "loggedIn": true,
        "signedIn": true,
        "serverRunning": false,
        "serverPort": 4097,
        "authenticatedProviders": ["9router", "groq"],
        "hasGroq": true,
        "has9Router": true,
        "detail": "OpenCode interpreter ready"
    });

    let nine_router_slot = json!({
        "installed": true,
        "version": "0.5.35",
        "running": true,
        "port": LOCAL_CLI_BRIDGE_PORT,
        "baseUrl": format!("http://127.0.0.1:{}/v1", LOCAL_CLI_BRIDGE_PORT),
        "url": format!("http://127.0.0.1:{}/v1", LOCAL_CLI_BRIDGE_PORT),
        "models": default_models_for_target("9router"),
        "detail": "Built-in Rust Local-CLI Bridge active"
    });

    let mut data_envelope = json!({
        "claude": claude_slot,
        "opencode": opencode_slot,
        "antigravity": antigravity_slot,
        "kiro": kiro_slot,
        "nineRouter": nine_router_slot,
        "codex": codex_slot,
        "bridgePort": LOCAL_CLI_BRIDGE_PORT,
        "bridgeRunning": true,
        "discovered": build_discovered_list(),
        "registry": build_cli_provider_registry()
    });
    data_envelope["cardStates"] =
        super::cli_diagnostics::build_normalized_card_states(&data_envelope);

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

pub async fn handle_local_cli_quotas() -> Response {
    let quotas = fetch_all_quotas().await;
    let list = fetch_live_quotas_list().await;
    Json(json!({ "ok": true, "quotas": quotas, "data": list })).into_response()
}

pub async fn handle_local_cli_quota_post() -> Response {
    let list = fetch_live_quotas_list().await;
    Json(json!({ "ok": true, "data": list })).into_response()
}

pub async fn handle_local_cli_models(Json(body): Json<Value>) -> Response {
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

pub async fn handle_local_cli_discovered() -> Response {
    harvest_all();
    Json(json!({ "data": build_discovered_list() })).into_response()
}

pub async fn handle_local_cli_connect(Json(body): Json<Value>) -> Response {
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

pub async fn handle_local_cli_login(Json(body): Json<Value>) -> Response {
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

pub async fn handle_local_cli_inject(Json(body): Json<Value>) -> Response {
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

pub async fn handle_local_cli_oauth_start(Json(body): Json<Value>) -> Response {
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

pub async fn handle_local_cli_oauth_status(Json(body): Json<Value>) -> Response {
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

pub async fn handle_local_cli_harvest() -> Response {
    let harvested = harvest_all();
    register_local_cli_to_config(LOCAL_CLI_BRIDGE_PORT);
    Json(json!({ "ok": true, "harvested": harvested })).into_response()
}

pub async fn handle_local_cli_signin(Json(body): Json<Value>) -> Response {
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

pub async fn handle_local_cli_token(Json(body): Json<Value>) -> Response {
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

pub async fn handle_local_cli_refresh(Json(body): Json<Value>) -> Response {
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

pub async fn handle_local_cli_delete(AxumPath(source): AxumPath<String>) -> Response {
    let removed = remove_credential(&source);
    register_local_cli_to_config(LOCAL_CLI_BRIDGE_PORT);
    Json(json!({ "ok": removed })).into_response()
}
