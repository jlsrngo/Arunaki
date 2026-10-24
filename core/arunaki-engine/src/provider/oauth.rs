//! Web OAuth routes for Google and GitHub sign-in
//! Parity with `packages/engine/engine/src/server/routes/instance/httpapi/handlers/oauth.ts`.

use axum::{
    extract::{Path as AxumPath, Query},
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    routing::get,
    Json, Router,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use crate::paths::{gen_id, now_ms};

#[allow(dead_code)]
#[derive(Clone, Debug)]
pub struct PendingOAuthLogin {
    pub provider: String,
    pub expires_at: u64,
    pub profile: Option<OAuthProfile>,
}

#[derive(Clone, Debug)]
pub struct OAuthProfile {
    pub email: String,
    pub name: String,
    pub avatar: String,
}

static PENDING_LOGINS: OnceLock<Mutex<HashMap<String, PendingOAuthLogin>>> = OnceLock::new();

fn get_pending_map() -> &'static Mutex<HashMap<String, PendingOAuthLogin>> {
    PENDING_LOGINS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn router() -> Router {
    Router::new()
        .route("/api/oauth/:provider/start", get(handle_oauth_start))
        .route("/oauth/:provider/start", get(handle_oauth_start))
        .route("/api/oauth/:provider/result", get(handle_oauth_result))
        .route("/oauth/:provider/result", get(handle_oauth_result))
        .route("/api/oauth/:provider/callback", get(handle_oauth_callback))
        .route("/oauth/:provider/callback", get(handle_oauth_callback))
}

fn get_credentials(provider: &str) -> (String, String) {
    let prefix = format!("ARUNAKI_{}_CLIENT", provider.to_uppercase());
    let id = std::env::var(format!("{}_ID", prefix)).unwrap_or_default();
    let secret = std::env::var(format!("{}_SECRET", prefix)).unwrap_or_default();
    (id, secret)
}

fn redirect_base() -> String {
    std::env::var("ARUNAKI_OAUTH_REDIRECT_BASE")
        .unwrap_or_else(|_| "http://127.0.0.1:4096".to_string())
}

fn url_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => {
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}

pub async fn handle_oauth_start(AxumPath(provider): AxumPath<String>) -> Response {
    let provider = provider.to_lowercase();
    if provider != "google" && provider != "github" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "BadRequest",
                "message": format!("Unsupported OAuth provider: {}", provider),
                "data": { "message": format!("Unsupported OAuth provider: {}", provider) }
            })),
        )
            .into_response();
    }

    let (client_id, _) = get_credentials(&provider);
    if client_id.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "BadRequest",
                "message": format!("{} sign-in is not configured on this server.", provider),
                "data": { "message": format!("{} sign-in is not configured on this server.", provider) }
            })),
        )
            .into_response();
    }

    let state = gen_id("oauth_state");
    let expires_at = now_ms() + 10 * 60 * 1000;

    {
        let mut map = get_pending_map().lock().unwrap();
        // Prune expired
        let now = now_ms();
        map.retain(|_, v| v.expires_at > now);
        map.insert(
            state.clone(),
            PendingOAuthLogin {
                provider: provider.clone(),
                expires_at,
                profile: None,
            },
        );
    }

    let callback_url = format!("{}/api/oauth/{}/callback", redirect_base(), provider);
    let auth_url = if provider == "google" {
        format!(
            "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope=openid%20email%20profile&state={}",
            url_encode(&client_id),
            url_encode(&callback_url),
            url_encode(&state)
        )
    } else {
        format!(
            "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}&scope=read:user%20user:email&state={}",
            url_encode(&client_id),
            url_encode(&callback_url),
            url_encode(&state)
        )
    };

    Json(json!({
        "url": auth_url,
        "state": state
    }))
    .into_response()
}

pub async fn handle_oauth_result(
    AxumPath(_provider): AxumPath<String>,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let Some(state) = q.get("state") else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "state query parameter is required" })),
        )
            .into_response();
    };

    let map = get_pending_map().lock().unwrap();
    if let Some(entry) = map.get(state) {
        if entry.expires_at < now_ms() {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "OAuth session expired" })),
            )
                .into_response();
        }

        if let Some(profile) = &entry.profile {
            return Json(json!({
                "pending": false,
                "email": profile.email,
                "name": profile.name,
                "avatar": profile.avatar
            }))
            .into_response();
        }

        return Json(json!({
            "pending": true,
            "email": "",
            "name": "",
            "avatar": ""
        }))
        .into_response();
    }

    (
        StatusCode::BAD_REQUEST,
        Json(json!({ "error": "OAuth state not found" })),
    )
        .into_response()
}

pub async fn handle_oauth_callback(
    AxumPath(provider): AxumPath<String>,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let provider = provider.to_lowercase();
    let code = q.get("code").cloned().unwrap_or_default();
    let state = q.get("state").cloned().unwrap_or_default();

    if code.is_empty() || state.is_empty() {
        return Html("<html><body><h3>OAuth Error</h3><p>Missing code or state.</p></body></html>")
            .into_response();
    }

    let (client_id, client_secret) = get_credentials(&provider);
    if client_id.is_empty() || client_secret.is_empty() {
        return Html(
            "<html><body><h3>OAuth Error</h3><p>Server credentials not configured.</p></body></html>",
        )
        .into_response();
    }

    let callback_url = format!("{}/api/oauth/{}/callback", redirect_base(), provider);
    let client = reqwest::Client::new();

    let mut profile_result = None;

    if provider == "google" {
        let params = [
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("code", code.as_str()),
            ("grant_type", "authorization_code"),
            ("redirect_uri", callback_url.as_str()),
        ];
        if let Ok(res) = client
            .post("https://oauth2.googleapis.com/token")
            .form(&params)
            .send()
            .await
        {
            if let Ok(token_data) = res.json::<Value>().await {
                if let Some(access_token) = token_data.get("access_token").and_then(|v| v.as_str()) {
                    if let Ok(user_res) = client
                        .get("https://www.googleapis.com/oauth2/v2/userinfo")
                        .bearer_auth(access_token)
                        .send()
                        .await
                    {
                        if let Ok(user_info) = user_res.json::<Value>().await {
                            let email = user_info
                                .get("email")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            let name = user_info
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            let avatar = user_info
                                .get("picture")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            profile_result = Some(OAuthProfile { email, name, avatar });
                        }
                    }
                }
            }
        }
    } else if provider == "github" {
        let params = [
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("code", code.as_str()),
            ("redirect_uri", callback_url.as_str()),
        ];
        if let Ok(res) = client
            .post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/json")
            .form(&params)
            .send()
            .await
        {
            if let Ok(token_data) = res.json::<Value>().await {
                if let Some(access_token) = token_data.get("access_token").and_then(|v| v.as_str()) {
                    if let Ok(user_res) = client
                        .get("https://api.github.com/user")
                        .header("User-Agent", "Arunaki-Engine")
                        .bearer_auth(access_token)
                        .send()
                        .await
                    {
                        if let Ok(user_info) = user_res.json::<Value>().await {
                            let name = user_info
                                .get("name")
                                .or_else(|| user_info.get("login"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            let avatar = user_info
                                .get("avatar_url")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            let mut email = user_info
                                .get("email")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();

                            if email.is_empty() {
                                // Fetch private emails
                                if let Ok(emails_res) = client
                                    .get("https://api.github.com/user/emails")
                                    .header("User-Agent", "Arunaki-Engine")
                                    .bearer_auth(access_token)
                                    .send()
                                    .await
                                {
                                    if let Ok(emails) = emails_res.json::<Vec<Value>>().await {
                                        if let Some(primary) = emails.iter().find(|e| {
                                            e.get("primary").and_then(|v| v.as_bool()).unwrap_or(false)
                                        }) {
                                            email = primary
                                                .get("email")
                                                .and_then(|v| v.as_str())
                                                .unwrap_or("")
                                                .to_string();
                                        }
                                    }
                                }
                            }

                            profile_result = Some(OAuthProfile { email, name, avatar });
                        }
                    }
                }
            }
        }
    }

    if let Some(profile) = profile_result {
        let mut map = get_pending_map().lock().unwrap();
        if let Some(entry) = map.get_mut(&state) {
            entry.profile = Some(profile);
        }
        Html("<!DOCTYPE html><html><head><title>Authentication Successful</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#0f1117;color:#fff;margin:0}div{text-align:center;padding:2rem;background:#1a1d26;border-radius:12px;border:1px solid #2e3444}h2{color:#4ade80;margin-top:0}</style></head><body><div><h2>Authentication Successful</h2><p>You can close this window now and return to Arunaki.</p><script>window.close();</script></div></body></html>").into_response()
    } else {
        Html("<html><body><h3>OAuth Error</h3><p>Failed to exchange token or fetch user profile.</p></body></html>").into_response()
    }
}
