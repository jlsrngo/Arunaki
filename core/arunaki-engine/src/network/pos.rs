//! ArunakiZen POS discovery and handshake.

use super::port_scanner::open_loopback_ports;
use axum::{response::IntoResponse, Json};
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;

/// Ports ArunakiZen commonly binds to, in priority order.
pub const POS_CANDIDATE_PORTS: &[u16] = &[8000, 3000, 8080, 5000, 80, 8088];
const PROBE_TIMEOUT: Duration = Duration::from_millis(400);
const PING_PATH: &str = "/api/pos/v1/ping";

/// A port answering TCP is not necessarily ArunakiZen. Treat 2xx/401/403 on the ping path as
/// confirmation (auth-protected installs still prove the route exists).
fn is_pos_ping_status(status: u16) -> bool {
    (200..300).contains(&status) || status == 401 || status == 403
}

async fn confirm_pos(client: &reqwest::Client, host_url: &str) -> bool {
    match client.get(format!("{host_url}{PING_PATH}")).send().await {
        Ok(r) => is_pos_ping_status(r.status().as_u16()),
        Err(_) => false,
    }
}

pub async fn detect_pos_host() -> Option<String> {
    let open = open_loopback_ports(POS_CANDIDATE_PORTS, PROBE_TIMEOUT).await;
    let client = reqwest::Client::builder().timeout(Duration::from_millis(800)).build().ok()?;
    for port in open {
        let url = format!("http://127.0.0.1:{port}");
        if confirm_pos(&client, &url).await {
            return Some(url);
        }
    }
    None
}

pub async fn handle_pos_detect() -> impl IntoResponse {
    match detect_pos_host().await {
        Some(url) => Json(json!({ "data": { "hostUrl": url, "detected": true } })),
        None => Json(json!({ "data": { "hostUrl": null, "detected": false } })),
    }
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct PosTestRequest {
    pub host_url: String,
    pub api_key: String,
    pub username: String,
    pub password: String,
}

pub async fn handle_pos_test(Json(req): Json<PosTestRequest>) -> impl IntoResponse {
    let host = req.host_url.trim().trim_end_matches('/').to_string();
    if host.is_empty() {
        return Json(json!({ "data": { "connected": false, "message": "Host URL is required." } }));
    }
    let client = match reqwest::Client::builder().timeout(Duration::from_secs(4)).build() {
        Ok(c) => c,
        Err(e) => return Json(json!({ "data": { "connected": false, "message": e.to_string() } })),
    };

    let mut rb = client.get(format!("{host}{PING_PATH}"));
    if !req.api_key.trim().is_empty() {
        rb = rb.bearer_auth(req.api_key.trim()).header("x-api-key", req.api_key.trim());
    } else if !req.username.trim().is_empty() {
        rb = rb.basic_auth(req.username.trim(), Some(req.password.trim()));
    }

    match rb.send().await {
        Ok(r) if r.status().is_success() => {
            let body: Value = r.json().await.unwrap_or(Value::Null);
            let d = body.get("data").unwrap_or(&body);
            Json(json!({ "data": {
                "connected": true,
                "store": d.get("store").cloned().unwrap_or(Value::Null),
                "operator": d.get("operator").cloned().unwrap_or(Value::Null),
                "permissions": d.get("permissions").cloned().unwrap_or(Value::Null),
            }}))
        }
        Ok(r) => Json(json!({ "data": {
            "connected": false,
            "message": format!("ArunakiZen responded HTTP {}", r.status().as_u16()),
        }})),
        Err(e) => Json(json!({ "data": { "connected": false, "message": e.to_string() } })),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ping_status_classification() {
        assert!(is_pos_ping_status(200));
        assert!(is_pos_ping_status(401));
        assert!(is_pos_ping_status(403));
        assert!(!is_pos_ping_status(404));
        assert!(!is_pos_ping_status(500));
    }

    #[tokio::test]
    async fn test_rejects_empty_host() {
        let resp = handle_pos_test(Json(PosTestRequest::default())).await.into_response();
        let bytes = axum::body::to_bytes(resp.into_body(), 4096).await.unwrap();
        let v: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(v["data"]["connected"], false);
    }
}

