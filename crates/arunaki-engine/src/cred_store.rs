use crate::paths::{arunaki_config_dir, arunaki_dot_dir, home_dir, now_iso, now_ms};
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CredentialEntry {
    #[serde(alias = "provider", default)]
    pub source: String,
    #[serde(default)]
    pub access_token: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_secret: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub region: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_arn: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_info: Option<String>,
    #[serde(default = "now_iso")]
    pub updated_at: String,
    #[serde(default)]
    pub auto_harvested: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CredentialStore {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub entries: HashMap<String, CredentialEntry>,
}

fn default_version() -> u32 {
    1
}

static STORE_CACHE: OnceLock<Mutex<CredentialStore>> = OnceLock::new();

fn cred_file_path() -> PathBuf {
    arunaki_dot_dir().join("local-cli-credentials.json")
}

fn load_store_from_disk() -> CredentialStore {
    let path = cred_file_path();
    let mut entries = HashMap::new();
    if let Ok(raw) = std::fs::read_to_string(&path) {
        let trimmed = raw.trim_start_matches('\u{feff}');
        if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
            let map_opt = val
                .get("entries")
                .and_then(|e| e.as_object())
                .or_else(|| val.as_object());
            if let Some(map) = map_opt {
                for (k, v) in map {
                    if k == "version" || k == "entries" {
                        continue;
                    }
                    if let Ok(mut entry) = serde_json::from_value::<CredentialEntry>(v.clone()) {
                        if entry.source.is_empty() {
                            entry.source = k.clone();
                        }
                        if !entry.access_token.is_empty() {
                            entries.insert(k.clone(), entry);
                        }
                    }
                }
            }
        }
    }
    CredentialStore {
        version: 1,
        entries,
    }
}

fn save_store_to_disk(store: &CredentialStore) {
    let path = cred_file_path();
    let mut root_map = serde_json::Map::new();
    if let Ok(raw) = std::fs::read_to_string(&path) {
        let trimmed = raw.trim_start_matches('\u{feff}');
        if let Ok(Value::Object(existing)) = serde_json::from_str::<Value>(trimmed) {
            if !existing.contains_key("entries") {
                root_map = existing;
            }
        }
    }

    for (k, entry) in &store.entries {
        let mut obj = root_map
            .get(k)
            .and_then(|v| v.as_object())
            .cloned()
            .unwrap_or_default();
        obj.insert("provider".to_string(), Value::String(k.clone()));
        if !obj.contains_key("displayName") {
            let disp = match k.as_str() {
                "codex" => "OpenAI Codex / ChatGPT",
                "kiro" => "Kiro (AWS)",
                "opencode" => "OpenCode Zen",
                "claude" => "Claude Code",
                "antigravity" => "Google Antigravity (agy)",
                _ => k.as_str(),
            };
            obj.insert("displayName".to_string(), Value::String(disp.to_string()));
        }
        if !obj.contains_key("type") {
            let t = if k == "opencode" { "api_key" } else { "oauth" };
            obj.insert("type".to_string(), Value::String(t.to_string()));
        }
        obj.insert(
            "accessToken".to_string(),
            Value::String(entry.access_token.clone()),
        );
        if let Some(ref rt) = entry.refresh_token {
            obj.insert("refreshToken".to_string(), Value::String(rt.clone()));
        }
        if let Some(exp) = entry.expires_at {
            obj.insert("expiresAt".to_string(), json!(exp));
        }
        if let Some(ref cid) = entry.client_id {
            obj.insert("clientId".to_string(), Value::String(cid.clone()));
        }
        if let Some(ref csec) = entry.client_secret {
            obj.insert("clientSecret".to_string(), Value::String(csec.clone()));
        }
        if let Some(ref reg) = entry.region {
            obj.insert("region".to_string(), Value::String(reg.clone()));
        }
        if let Some(ref parn) = entry.profile_arn {
            obj.insert("profileArn".to_string(), Value::String(parn.clone()));
        }
        if let Some(ref aid) = entry.account_id {
            obj.insert("accountId".to_string(), Value::String(aid.clone()));
        }
        if let Some(ref aem) = entry.account_email {
            obj.insert("accountEmail".to_string(), Value::String(aem.clone()));
        }
        obj.insert("lastRefreshAt".to_string(), json!(now_ms()));
        if !obj.contains_key("sourcePath") {
            obj.insert("sourcePath".to_string(), Value::String(String::new()));
        }
        root_map.insert(k.clone(), Value::Object(obj));
    }

    if let Ok(raw) = serde_json::to_string_pretty(&Value::Object(root_map)) {
        let _ = std::fs::write(path, raw);
    }
}

fn with_store<F, R>(f: F) -> R
where
    F: FnOnce(&mut CredentialStore) -> R,
{
    let mutex = STORE_CACHE.get_or_init(|| Mutex::new(load_store_from_disk()));
    let mut guard = mutex.lock().unwrap_or_else(|e| e.into_inner());
    f(&mut guard)
}

pub fn get_credential(source: &str) -> Option<CredentialEntry> {
    with_store(|store| store.entries.get(source).cloned())
}

pub fn set_credential(entry: CredentialEntry) {
    with_store(|store| {
        store.entries.insert(entry.source.clone(), entry);
        save_store_to_disk(store);
    });
}

pub fn remove_credential(source: &str) -> bool {
    with_store(|store| {
        let removed = store.entries.remove(source).is_some();
        if removed {
            save_store_to_disk(store);
        }
        removed
    })
}

pub fn get_all_credentials() -> HashMap<String, CredentialEntry> {
    with_store(|store| store.entries.clone())
}

pub fn is_expired(entry: &CredentialEntry, buffer_ms: u64) -> bool {
    match entry.expires_at {
        None => false,
        Some(exp) => now_ms() + buffer_ms >= exp,
    }
}

pub fn decode_jwt_payload(jwt: &str) -> Option<Value> {
    let parts: Vec<&str> = jwt.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    let payload_b64 = parts[1];
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload_b64)
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(payload_b64))
        .or_else(|_| base64::engine::general_purpose::STANDARD_NO_PAD.decode(payload_b64))
        .or_else(|_| base64::engine::general_purpose::STANDARD.decode(payload_b64))
        .ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn parse_iso_to_ms(iso: &str) -> Option<u64> {
    // Handles "YYYY-MM-DDTHH:MM:SSZ" or similar
    let s = iso.trim();
    if s.len() < 19 {
        return None;
    }
    let year: i64 = s.get(0..4)?.parse().ok()?;
    let month: u64 = s.get(5..7)?.parse().ok()?;
    let day: u64 = s.get(8..10)?.parse().ok()?;
    let hour: u64 = s.get(11..13)?.parse().ok()?;
    let min: u64 = s.get(14..16)?.parse().ok()?;
    let sec: u64 = s.get(17..19)?.parse().ok()?;

    // Inverse civil_from_days
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as u64;
    let m_adj = if month > 2 { month - 3 } else { month + 9 };
    let doy = (153 * m_adj + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + (doe as i64) - 719468;
    if days < 0 {
        return None;
    }
    let total_secs = (days as u64) * 86400 + hour * 3600 + min * 60 + sec;
    Some(total_secs * 1000)
}

#[cfg(windows)]
fn read_windows_generic_credential(target: &str) -> Option<String> {
    #[repr(C)]
    struct CREDENTIALW {
        flags: u32,
        cred_type: u32,
        target_name: *mut u16,
        comment: *mut u16,
        last_written: u64,
        credential_blob_size: u32,
        credential_blob: *const u8,
        persist: u32,
        attribute_count: u32,
        attributes: *mut std::ffi::c_void,
        target_alias: *mut u16,
        user_name: *mut u16,
    }

    #[link(name = "advapi32")]
    extern "system" {
        fn CredReadW(
            target_name: *const u16,
            cred_type: u32,
            flags: u32,
            credential: *mut *mut CREDENTIALW,
        ) -> i32;
        fn CredFree(buffer: *mut std::ffi::c_void);
    }

    let mut wide: Vec<u16> = target.encode_utf16().collect();
    wide.push(0);
    let mut pcred: *mut CREDENTIALW = std::ptr::null_mut();
    unsafe {
        let ok = CredReadW(wide.as_ptr(), 1, 0, &mut pcred);
        if ok == 0 || pcred.is_null() {
            return None;
        }
        let cred = &*pcred;
        let result = if !cred.credential_blob.is_null() && cred.credential_blob_size > 0 {
            let slice =
                std::slice::from_raw_parts(cred.credential_blob, cred.credential_blob_size as usize);
            Some(String::from_utf8_lossy(slice).to_string())
        } else {
            None
        };
        CredFree(pcred as *mut std::ffi::c_void);
        result
    }
}

#[cfg(not(windows))]
fn read_windows_generic_credential(_target: &str) -> Option<String> {
    None
}

fn harvest_codex() -> Option<CredentialEntry> {
    let auth_path = home_dir().join(".codex").join("auth.json");
    let raw = std::fs::read_to_string(auth_path).ok()?;
    let data: Value = serde_json::from_str(&raw).ok()?;
    let access_token = data
        .pointer("/tokens/access_token")
        .and_then(|v| v.as_str())?
        .to_string();
    let refresh_token = data
        .pointer("/tokens/refresh_token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let expires_at = decode_jwt_payload(&access_token)
        .and_then(|p| p.get("exp").and_then(|v| v.as_u64()))
        .map(|exp| exp * 1000);

    Some(CredentialEntry {
        source: "codex".to_string(),
        access_token,
        refresh_token,
        expires_at,
        client_id: None,
        client_secret: None,
        region: None,
        account_info: None,
        updated_at: now_iso(),
        auto_harvested: true,
        ..Default::default()
    })
}

fn harvest_claude() -> Option<CredentialEntry> {
    let cred_path = home_dir().join(".claude").join(".credentials.json");
    let raw = std::fs::read_to_string(cred_path).ok()?;
    let data: Value = serde_json::from_str(&raw).ok()?;
    let oauth = data.get("claudeAiOauth")?;
    let access_token = oauth.get("accessToken").and_then(|v| v.as_str())?.to_string();
    let refresh_token = oauth
        .get("refreshToken")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let expires_at = oauth.get("expiresAt").and_then(|v| v.as_u64());
    let sub_type = oauth
        .get("subscriptionType")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");

    Some(CredentialEntry {
        source: "claude".to_string(),
        access_token,
        refresh_token,
        expires_at,
        client_id: None,
        client_secret: None,
        region: None,
        account_info: Some(format!("subscription: {}", sub_type)),
        updated_at: now_iso(),
        auto_harvested: true,
        ..Default::default()
    })
}

fn harvest_opencode() -> Option<CredentialEntry> {
    let auth_path = home_dir()
        .join(".local")
        .join("share")
        .join("opencode")
        .join("auth.json");
    let raw = std::fs::read_to_string(auth_path).ok()?;
    let data: Value = serde_json::from_str(&raw).ok()?;
    if let Some(oc) = data.get("opencode") {
        let token = oc
            .get("access")
            .or_else(|| oc.get("key"))
            .or_else(|| oc.get("token"))
            .and_then(|v| v.as_str())?;
        let expires_at = oc
            .get("expires")
            .and_then(|v| v.as_u64())
            .filter(|&e| e > 0);
        return Some(CredentialEntry {
            source: "opencode".to_string(),
            access_token: token.to_string(),
            refresh_token: oc
                .get("refresh")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            expires_at,
            client_id: None,
            client_secret: None,
            region: None,
            account_info: Some("provider: opencode".to_string()),
            updated_at: now_iso(),
            auto_harvested: true,
            ..Default::default()
        });
    }
    None
}

fn harvest_kiro() -> Option<CredentialEntry> {
    let sso_dir = home_dir().join(".aws").join("sso").join("cache");
    let entries = std::fs::read_dir(&sso_dir).ok()?;
    let mut best_entry: Option<CredentialEntry> = None;
    let mut best_exp: u64 = 0;
    let mut client_id: Option<String> = None;
    let mut client_secret: Option<String> = None;
    let mut region: Option<String> = None;

    for item in entries.flatten() {
        let path = item.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        if let Ok(raw) = std::fs::read_to_string(&path) {
            if let Ok(data) = serde_json::from_str::<Value>(&raw) {
                if let (Some(cid), Some(csec)) = (
                    data.get("clientId").and_then(|v| v.as_str()),
                    data.get("clientSecret").and_then(|v| v.as_str()),
                ) {
                    if data.get("accessToken").is_none() {
                        client_id = Some(cid.to_string());
                        client_secret = Some(csec.to_string());
                        if let Some(r) = data.get("region").and_then(|v| v.as_str()) {
                            region = Some(r.to_string());
                        }
                    }
                }
                if let Some(at) = data.get("accessToken").and_then(|v| v.as_str()) {
                    let exp = data
                        .get("expiresAt")
                        .and_then(|v| v.as_str())
                        .and_then(parse_iso_to_ms)
                        .unwrap_or(0);
                    if exp >= best_exp {
                        best_exp = exp;
                        best_entry = Some(CredentialEntry {
                            source: "kiro".to_string(),
                            access_token: at.to_string(),
                            refresh_token: data
                                .get("refreshToken")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string()),
                            expires_at: if exp > 0 { Some(exp) } else { None },
                            client_id: data
                                .get("clientId")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string()),
                            client_secret: data
                                .get("clientSecret")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string()),
                            region: data
                                .get("region")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string()),
                            account_info: None,
                            updated_at: now_iso(),
                            auto_harvested: true,
                            ..Default::default()
                        });
                    }
                }
            }
        }
    }

    if let Some(mut entry) = best_entry {
        if entry.client_id.is_none() {
            entry.client_id = client_id;
        }
        if entry.client_secret.is_none() {
            entry.client_secret = client_secret;
        }
        if entry.region.is_none() {
            entry.region = Some(region.unwrap_or_else(|| "us-east-1".to_string()));
        }
        return Some(entry);
    }
    None
}

fn harvest_antigravity() -> Option<CredentialEntry> {
    let raw = read_windows_generic_credential("gemini:antigravity")?;
    let trimmed = raw.trim_matches(char::from(0)).trim();
    let idx = trimmed.find('{')?;
    let data: Value = serde_json::from_str(&trimmed[idx..]).ok()?;
    let token_obj = data.get("token")?;
    let access_token = token_obj
        .get("access_token")
        .and_then(|v| v.as_str())?
        .to_string();
    let refresh_token = token_obj
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let expires_at = token_obj
        .get("expiry")
        .and_then(|v| v.as_str())
        .and_then(parse_iso_to_ms);

    Some(CredentialEntry {
        source: "antigravity".to_string(),
        access_token,
        refresh_token,
        expires_at,
        client_id: None,
        client_secret: None,
        region: None,
        account_info: Some("Google Cloud Code (agy)".to_string()),
        updated_at: now_iso(),
        auto_harvested: true,
        ..Default::default()
    })
}

pub fn harvest_all() -> HashMap<String, bool> {
    let mut results = HashMap::new();
    let harvesters: [(&str, fn() -> Option<CredentialEntry>); 5] = [
        ("codex", harvest_codex),
        ("claude", harvest_claude),
        ("opencode", harvest_opencode),
        ("kiro", harvest_kiro),
        ("antigravity", harvest_antigravity),
    ];

    with_store(|store| {
        let mut changed = false;
        for (name, func) in harvesters {
            if let Some(harvested) = func() {
                let should_update = match store.entries.get(name) {
                    None => true,
                    Some(existing) => {
                        if !existing.auto_harvested {
                            false
                        } else {
                            let h_exp = harvested.expires_at.unwrap_or(0);
                            let e_exp = existing.expires_at.unwrap_or(0);
                            h_exp > e_exp || harvested.access_token != existing.access_token
                        }
                    }
                };
                if should_update {
                    store.entries.insert(name.to_string(), harvested);
                    changed = true;
                }
                results.insert(name.to_string(), true);
            } else {
                results.insert(name.to_string(), store.entries.contains_key(name));
            }
        }
        if changed {
            save_store_to_disk(store);
        }
    });

    results
}

pub async fn ensure_fresh_credential(source: &str) -> Option<CredentialEntry> {
    let mut entry = get_credential(source);
    if entry.is_none() {
        harvest_all();
        entry = get_credential(source);
    }
    let entry = entry?;

    if source == "opencode" {
        return Some(entry);
    }

    if !is_expired(&entry, 5 * 60 * 1000) {
        return Some(entry);
    }

    // Attempt refresh
    if let Some(refreshed) = refresh_credential_source(source, &entry).await {
        return Some(refreshed);
    }

    // Re-harvest fallback
    harvest_all();
    let reharvested = get_credential(source)?;
    if !is_expired(&reharvested, 0) {
        return Some(reharvested);
    }
    // Even if expired timestamp, return entry if opencode or if caller wants last-ditch attempt
    if !is_expired(&entry, 0) {
        Some(entry)
    } else {
        Some(reharvested)
    }
}

pub async fn refresh_credential_source(
    source: &str,
    entry: &CredentialEntry,
) -> Option<CredentialEntry> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .ok()?;

    match source {
        "antigravity" => {
            if let Some(fresh) = harvest_antigravity() {
                if !is_expired(&fresh, 60_000) {
                    set_credential(fresh.clone());
                    return Some(fresh);
                }
            }
            // Spawn `agy models` to let Antigravity CLI refresh Windows CredMan
            let _ = tokio::task::spawn_blocking(|| {
                std::process::Command::new("cmd")
                    .args(["/c", "agy", "models"])
                    .output()
            })
            .await;
            if let Some(fresh) = harvest_antigravity() {
                set_credential(fresh.clone());
                return Some(fresh);
            }
            None
        }
        "kiro" => {
            let mut cur = entry.clone();
            if cur.refresh_token.is_none() || cur.client_id.is_none() || cur.client_secret.is_none()
            {
                if let Some(h) = harvest_kiro() {
                    cur = h;
                }
            }
            let rt = cur.refresh_token.as_ref()?;
            let cid = cur.client_id.as_ref()?;
            let csec = cur.client_secret.as_ref()?;
            let region = cur.region.as_deref().unwrap_or("us-east-1");
            let url = format!("https://oidc.{}.amazonaws.com/token", region);

            let resp = client
                .post(&url)
                .json(&json!({
                    "clientId": cid,
                    "clientSecret": csec,
                    "grantType": "refresh_token",
                    "refreshToken": rt,
                }))
                .send()
                .await
                .ok()?;

            if !resp.status().is_success() {
                return None;
            }
            let data: Value = resp.json().await.ok()?;
            let new_at = data.get("accessToken").and_then(|v| v.as_str())?.to_string();
            let new_rt = data
                .get("refreshToken")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .or_else(|| cur.refresh_token.clone());
            let expires_in = data
                .get("expiresIn")
                .and_then(|v| v.as_u64())
                .unwrap_or(3600);

            let updated = CredentialEntry {
                source: "kiro".to_string(),
                access_token: new_at,
                refresh_token: new_rt,
                expires_at: Some(now_ms() + expires_in * 1000),
                client_id: Some(cid.clone()),
                client_secret: Some(csec.clone()),
                region: Some(region.to_string()),
                profile_arn: cur.profile_arn.clone(),
                account_id: cur.account_id.clone(),
                account_email: cur.account_email.clone(),
                account_info: cur.account_info.clone(),
                updated_at: now_iso(),
                auto_harvested: cur.auto_harvested,
            };
            set_credential(updated.clone());
            Some(updated)
        }
        "codex" => {
            let rt = entry.refresh_token.as_ref()?;
            let resp = client
                .post("https://auth.openai.com/oauth/token")
                .json(&json!({
                    "grant_type": "refresh_token",
                    "refresh_token": rt,
                    "client_id": "app_EMoamEEZ73f0CkXaXp7hrann",
                }))
                .send()
                .await
                .ok()?;
            if !resp.status().is_success() {
                return None;
            }
            let data: Value = resp.json().await.ok()?;
            let new_at = data
                .get("access_token")
                .and_then(|v| v.as_str())?
                .to_string();
            let new_rt = data
                .get("refresh_token")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .or_else(|| entry.refresh_token.clone());
            let expires_at = decode_jwt_payload(&new_at)
                .and_then(|p| p.get("exp").and_then(|v| v.as_u64()))
                .map(|exp| exp * 1000)
                .or_else(|| {
                    data.get("expires_in")
                        .and_then(|v| v.as_u64())
                        .map(|s| now_ms() + s * 1000)
                });
            let updated = CredentialEntry {
                source: "codex".to_string(),
                access_token: new_at,
                refresh_token: new_rt,
                expires_at,
                client_id: None,
                client_secret: None,
                region: None,
                profile_arn: entry.profile_arn.clone(),
                account_id: entry.account_id.clone(),
                account_email: entry.account_email.clone(),
                account_info: entry.account_info.clone(),
                updated_at: now_iso(),
                auto_harvested: entry.auto_harvested,
            };
            set_credential(updated.clone());
            Some(updated)
        }
        "claude" => {
            let rt = entry.refresh_token.as_ref()?;
            let resp = client
                .post("https://console.anthropic.com/v1/oauth/token")
                .json(&json!({
                    "grant_type": "refresh_token",
                    "refresh_token": rt,
                    "client_id": "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
                }))
                .send()
                .await
                .ok()?;
            if !resp.status().is_success() {
                return None;
            }
            let data: Value = resp.json().await.ok()?;
            let new_at = data
                .get("access_token")
                .and_then(|v| v.as_str())?
                .to_string();
            let new_rt = data
                .get("refresh_token")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .or_else(|| entry.refresh_token.clone());
            let expires_in = data
                .get("expires_in")
                .and_then(|v| v.as_u64())
                .unwrap_or(3600);
            let updated = CredentialEntry {
                source: "claude".to_string(),
                access_token: new_at,
                refresh_token: new_rt,
                expires_at: Some(now_ms() + expires_in * 1000),
                client_id: None,
                client_secret: None,
                region: None,
                profile_arn: entry.profile_arn.clone(),
                account_id: entry.account_id.clone(),
                account_email: entry.account_email.clone(),
                account_info: entry.account_info.clone(),
                updated_at: now_iso(),
                auto_harvested: entry.auto_harvested,
            };
            set_credential(updated.clone());
            Some(updated)
        }
        _ => None,
    }
}

pub async fn fetch_all_quotas() -> Value {
    let creds = get_all_credentials();
    let mut out = serde_json::Map::new();

    for source in ["codex", "claude", "opencode", "kiro", "antigravity"] {
        if let Some(entry) = creds.get(source) {
            let plan = match source {
                "codex" => decode_jwt_payload(&entry.access_token)
                    .and_then(|p| {
                        p.pointer("/https:~1~1api.openai.com~1auth/chatgpt_plan_type")
                            .and_then(|v| v.as_str())
                            .map(|s| format!("ChatGPT {}", s))
                    })
                    .unwrap_or_else(|| "ChatGPT Plus/Pro".to_string()),
                "claude" => entry
                    .account_info
                    .as_deref()
                    .map(|s| s.replace("subscription: ", "Claude "))
                    .unwrap_or_else(|| "Claude Max/Pro".to_string()),
                "opencode" => "OpenCode Zen (Free)".to_string(),
                "kiro" => format!(
                    "AWS CodeWhisperer ({})",
                    entry.region.as_deref().unwrap_or("us-east-1")
                ),
                "antigravity" => "Google Cloud Code (agy)".to_string(),
                _ => source.to_string(),
            };
            out.insert(
                source.to_string(),
                json!({
                    "source": source,
                    "plan": plan,
                    "windows": [],
                    "extraInfo": entry.account_info,
                    "fetchedAt": now_iso(),
                }),
            );
        }
    }

    Value::Object(out)
}

pub fn register_local_cli_to_config(bridge_port: u16) {
    let config_path = arunaki_config_dir().join("arunaki.json");
    let mut cfg: Value = if let Ok(raw) = std::fs::read_to_string(&config_path) {
        serde_json::from_str(&raw).unwrap_or_else(|_| json!({}))
    } else {
        json!({})
    };

    if !cfg.is_object() {
        cfg = json!({});
    }
    if cfg.get("provider").and_then(|v| v.as_object()).is_none() {
        cfg["provider"] = json!({});
    }

    let creds = get_all_credentials();
    let mut models = serde_json::Map::new();

    if creds.contains_key("codex") {
        for (id, name, reasoning) in [
            ("gpt-5.6-terra", "GPT-5.6 Terra (Codex CLI)", true),
            ("gpt-5.4", "GPT-5.4 (Codex CLI)", true),
            ("gpt-5.4-mini", "GPT-5.4 Mini (Codex CLI)", true),
            ("gpt-5.3-codex", "GPT-5.3 Codex (Codex CLI)", true),
            ("gpt-5.2-codex", "GPT-5.2 Codex (Codex CLI)", true),
            ("gpt-5.2", "GPT-5.2 (Codex CLI)", false),
            ("gpt-5.1-codex-max", "GPT-5.1 Codex Max (Codex CLI)", true),
            ("gpt-5.1-codex-mini", "GPT-5.1 Codex Mini (Codex CLI)", false),
        ] {
            models.insert(
                id.to_string(),
                json!({
                    "name": name,
                    "attachment": true,
                    "reasoning": reasoning,
                    "tool_call": true,
                    "limit": { "context": 200000, "output": 32768 }
                }),
            );
        }
    }

    if creds.contains_key("claude") {
        for (id, name, reasoning, out_limit) in [
            ("claude-sonnet-4-6", "Claude Sonnet 4.6 (Claude CLI)", true, 64000),
            ("claude-opus-4-6", "Claude Opus 4.6 (Claude CLI)", true, 64000),
            ("claude-haiku-4-5", "Claude Haiku 4.5 (Claude CLI)", false, 16384),
        ] {
            models.insert(
                id.to_string(),
                json!({
                    "name": name,
                    "attachment": true,
                    "reasoning": reasoning,
                    "tool_call": true,
                    "limit": { "context": 200000, "output": out_limit }
                }),
            );
        }
    }

    if creds.contains_key("kiro") {
        for (id, name, reasoning, out_limit) in [
            ("kiro/auto", "Auto (Kiro CLI)", false, 32768),
            ("kiro/claude-opus-4.6", "Claude Opus 4.6 (Kiro CLI)", true, 64000),
            ("kiro/claude-sonnet-4.6", "Claude Sonnet 4.6 (Kiro CLI)", true, 64000),
            ("kiro/claude-sonnet-4.5", "Claude Sonnet 4.5 (Kiro CLI)", true, 64000),
            ("kiro/claude-haiku-4.5", "Claude Haiku 4.5 (Kiro CLI)", false, 16384),
            ("kiro/deepseek-3.2", "DeepSeek 3.2 (Kiro CLI)", true, 32768),
            ("kiro/minimax-m2.5", "MiniMax M2.5 (Kiro CLI)", false, 32768),
            ("kiro/glm-5", "GLM-5 (Kiro CLI)", false, 32768),
            ("kiro/qwen3-coder-next", "Qwen3 Coder Next (Kiro CLI)", false, 32768),
        ] {
            models.insert(
                id.to_string(),
                json!({
                    "name": name,
                    "attachment": true,
                    "reasoning": reasoning,
                    "tool_call": true,
                    "limit": { "context": 200000, "output": out_limit }
                }),
            );
        }
    }

    if creds.contains_key("antigravity") {
        for (id, name, reasoning) in [
            ("gemini-3.8-pro-high", "Gemini 3.8 Pro High (Antigravity)", true),
            ("gemini-3.8-pro-low", "Gemini 3.8 Pro Low (Antigravity)", true),
            ("gemini-3.8-flash-high", "Gemini 3.8 Flash High (Antigravity)", true),
            ("gemini-3.8-flash-medium", "Gemini 3.8 Flash Medium (Antigravity)", true),
            ("gemini-3.8-flash-low", "Gemini 3.8 Flash Low (Antigravity)", false),
            ("gemini-3.8-flash-minimal", "Gemini 3.8 Flash Minimal (Antigravity)", false),
            ("claude-sonnet-4-6-agy", "Claude Sonnet 4.6 (Antigravity)", true),
            ("claude-opus-4-6-thinking", "Claude Opus 4.6 Thinking (Antigravity)", true),
            ("gpt-oss-120b-medium", "GPT-OSS 120B Medium (Antigravity)", false),
        ] {
            models.insert(
                id.to_string(),
                json!({
                    "name": name,
                    "attachment": true,
                    "reasoning": reasoning,
                    "tool_call": true,
                    "limit": { "context": 1000000, "output": 65536 }
                }),
            );
        }
    }

    if creds.contains_key("opencode") {
        for (id, name, reasoning) in [
            ("opencode/big-pickle", "Big Pickle (OpenCode Free)", true),
            ("opencode/mimo-v2-pro-free", "MiMo V2 Pro (OpenCode Free)", true),
            ("opencode/mimo-v2-omni-free", "MiMo V2 Omni (OpenCode Free)", true),
            ("opencode/nemotron-3-super-free", "Nemotron 3 Super (OpenCode Free)", true),
            ("opencode/minimax-m2.5-free", "MiniMax M2.5 (OpenCode Free)", true),
            ("opencode/gpt-5-nano", "GPT-5 Nano (OpenCode Free)", true),
        ] {
            models.insert(
                id.to_string(),
                json!({
                    "name": name,
                    "attachment": true,
                    "reasoning": reasoning,
                    "tool_call": true,
                    "limit": { "context": 200000, "output": 32768 }
                }),
            );
        }
    }

    if !models.is_empty() {
        cfg["provider"]["local-cli"] = json!({
            "name": "Local CLI (Zero-Config)",
            "npm": "@ai-sdk/openai-compatible",
            "api": format!("http://127.0.0.1:{}/v1", bridge_port),
            "options": {
                "baseURL": format!("http://127.0.0.1:{}/v1", bridge_port),
                "apiKey": "local-cli-bridge"
            },
            "models": models
        });
        let _ = std::fs::write(
            &config_path,
            serde_json::to_string_pretty(&cfg).unwrap_or_default(),
        );
    }
}
