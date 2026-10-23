use crate::paths::{arunaki_config_dir, arunaki_dot_dir, gen_id, home_dir, now_iso, now_ms};
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OauthResult {
    pub request_id: String,
    pub target: String,
    pub status: String, // "pending" | "success" | "error"
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_url: Option<String>,
    pub updated_at: u64,
}

static OAUTH_RESULTS: OnceLock<Mutex<HashMap<String, OauthResult>>> = OnceLock::new();

fn update_oauth_result(res: OauthResult) {
    let m = OAUTH_RESULTS.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(mut guard) = m.lock() {
        guard.insert(res.request_id.clone(), res);
    }
}

pub fn get_oauth_status(request_id: &str) -> Option<OauthResult> {
    let m = OAUTH_RESULTS.get_or_init(|| Mutex::new(HashMap::new()));
    m.lock().ok()?.get(request_id).cloned()
}

pub fn open_browser_url(url: &str) {
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", url])
            .spawn();
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("xdg-open").arg(url).spawn();
    }
}

fn generate_pkce_pair() -> (String, String) {
    let seed = format!(
        "{}-{}-{}-pkce-arunaki-rust",
        now_ms(),
        std::process::id(),
        gen_id("pkce")
    );
    let mut hasher1 = Sha256::new();
    hasher1.update(seed.as_bytes());
    let hash1 = hasher1.finalize();
    let mut hasher2 = Sha256::new();
    hasher2.update(&hash1);
    hasher2.update(b"arunaki-verifier");
    let hash2 = hasher2.finalize();
    let mut combined = Vec::with_capacity(64);
    combined.extend_from_slice(&hash1);
    combined.extend_from_slice(&hash2);
    let verifier = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&combined[..48]);

    let mut ch_hasher = Sha256::new();
    ch_hasher.update(verifier.as_bytes());
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(ch_hasher.finalize());
    (verifier, challenge)
}

fn url_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

pub async fn start_oauth_session(target: &str, open_browser: bool) -> Result<Value, String> {
    let request_id = gen_id("oauth");
    let target_str = target.to_string();

    if target == "kiro" {
        let region = "us-east-1";
        let oidc_base = format!("https://oidc.{}.amazonaws.com", region);
        let start_url = "https://view.awsapps.com/start";
        let scopes = vec![
            "codewhisperer:completions",
            "codewhisperer:analysis",
            "codewhisperer:conversations",
            "codewhisperer:transformations",
            "codewhisperer:taskassist",
        ];

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|e| e.to_string())?;

        let reg_resp = client
            .post(format!("{}/client/register", oidc_base))
            .json(&json!({
                "clientName": "Kiro IDE",
                "clientType": "public",
                "scopes": scopes,
                "grantTypes": ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"]
            }))
            .send()
            .await
            .map_err(|e| format!("Kiro client registration failed: {}", e))?;

        if !reg_resp.status().is_success() {
            return Err(format!("Kiro register returned HTTP {}", reg_resp.status()));
        }
        let reg_json: Value = reg_resp.json().await.map_err(|e| e.to_string())?;
        let client_id = reg_json
            .get("clientId")
            .and_then(|v| v.as_str())
            .ok_or("Missing clientId")?
            .to_string();
        let client_secret = reg_json
            .get("clientSecret")
            .and_then(|v| v.as_str())
            .ok_or("Missing clientSecret")?
            .to_string();

        let dev_resp = client
            .post(format!("{}/device_authorization", oidc_base))
            .json(&json!({
                "clientId": client_id,
                "clientSecret": client_secret,
                "startUrl": start_url
            }))
            .send()
            .await
            .map_err(|e| format!("Kiro device authorization failed: {}", e))?;

        if !dev_resp.status().is_success() {
            return Err(format!(
                "Kiro device_authorization returned HTTP {}",
                dev_resp.status()
            ));
        }
        let dev_json: Value = dev_resp.json().await.map_err(|e| e.to_string())?;
        let device_code = dev_json
            .get("deviceCode")
            .and_then(|v| v.as_str())
            .ok_or("Missing deviceCode")?
            .to_string();
        let auth_url = dev_json
            .get("verificationUriComplete")
            .or_else(|| dev_json.get("verificationUri"))
            .and_then(|v| v.as_str())
            .ok_or("Missing verificationUri")?
            .to_string();
        let interval_secs = dev_json
            .get("interval")
            .and_then(|v| v.as_u64())
            .unwrap_or(5)
            .max(2);

        update_oauth_result(OauthResult {
            request_id: request_id.clone(),
            target: target_str.clone(),
            status: "pending".to_string(),
            message: "Waiting for AWS Builder ID confirmation in browser...".to_string(),
            auth_url: Some(auth_url.clone()),
            updated_at: now_ms(),
        });

        if open_browser {
            open_browser_url(&auth_url);
        }

        let req_id_clone = request_id.clone();
        tokio::spawn(async move {
            let deadline = now_ms() + 5 * 60 * 1000;
            while now_ms() < deadline {
                tokio::time::sleep(std::time::Duration::from_secs(interval_secs)).await;
                let poll = client
                    .post(format!("{}/token", oidc_base))
                    .json(&json!({
                        "clientId": client_id,
                        "clientSecret": client_secret,
                        "grantType": "urn:ietf:params:oauth:grant-type:device_code",
                        "deviceCode": device_code
                    }))
                    .send()
                    .await;
                if let Ok(resp) = poll {
                    if resp.status().is_success() {
                        if let Ok(tok_data) = resp.json::<Value>().await {
                            if let Some(at) = tok_data.get("accessToken").and_then(|v| v.as_str()) {
                                let rt = tok_data
                                    .get("refreshToken")
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string());
                                let exp_in = tok_data
                                    .get("expiresIn")
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(3600);
                                set_credential(CredentialEntry {
                                    source: "kiro".to_string(),
                                    access_token: at.to_string(),
                                    refresh_token: rt,
                                    expires_at: Some(now_ms() + exp_in * 1000),
                                    client_id: Some(client_id.clone()),
                                    client_secret: Some(client_secret.clone()),
                                    region: Some(region.to_string()),
                                    account_info: Some("AWS Builder ID".to_string()),
                                    updated_at: now_iso(),
                                    auto_harvested: false,
                                    ..Default::default()
                                });
                                register_local_cli_to_config(20188);
                                update_oauth_result(OauthResult {
                                    request_id: req_id_clone,
                                    target: "kiro".to_string(),
                                    status: "success".to_string(),
                                    message: "Signed in to Kiro (AWS) via browser OAuth!".to_string(),
                                    auth_url: None,
                                    updated_at: now_ms(),
                                });
                                return;
                            }
                        }
                    }
                }
            }
            update_oauth_result(OauthResult {
                request_id: req_id_clone,
                target: "kiro".to_string(),
                status: "error".to_string(),
                message: "Kiro OAuth timed out.".to_string(),
                auth_url: None,
                updated_at: now_ms(),
            });
        });

        return Ok(json!({
            "requestId": request_id,
            "target": target_str,
            "authUrl": auth_url
        }));
    }

    if target == "codex" || target == "claude" {
        let (verifier, challenge) = generate_pkce_pair();
        let state = gen_id("st");
        let bind_addr = if target == "codex" {
            "127.0.0.1:1455"
        } else {
            "127.0.0.1:0"
        };
        let listener = match tokio::net::TcpListener::bind(bind_addr).await {
            Ok(l) => l,
            Err(_) => tokio::net::TcpListener::bind("127.0.0.1:0")
                .await
                .map_err(|e| format!("Failed to bind local OAuth callback port: {}", e))?,
        };
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        let callback_path = if target == "codex" {
            "/auth/callback"
        } else {
            "/callback"
        };
        let redirect_uri = format!("http://localhost:{}{}", port, callback_path);

        let (auth_endpoint, token_endpoint, client_id, scopes) = if target == "codex" {
            (
                "https://auth.openai.com/oauth/authorize",
                "https://auth.openai.com/oauth/token",
                "app_EMoamEEZ73f0CkXaXp7hrann",
                "openid profile email offline_access api.connectors.read api.connectors.invoke",
            )
        } else {
            (
                "https://claude.ai/oauth/authorize",
                "https://console.anthropic.com/v1/oauth/token",
                "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
                "org:create_api_key user:profile user:inference",
            )
        };

        let mut auth_url = format!(
            "{}?response_type=code&client_id={}&redirect_uri={}&scope={}&state={}&code_challenge={}&code_challenge_method=S256",
            auth_endpoint,
            url_encode(client_id),
            url_encode(&redirect_uri),
            url_encode(scopes),
            url_encode(&state),
            url_encode(&challenge)
        );
        if target == "codex" {
            auth_url.push_str("&id_token_add_organizations=true&codex_cli_simplified_flow=true");
        } else {
            auth_url.push_str("&code=true");
        }

        update_oauth_result(OauthResult {
            request_id: request_id.clone(),
            target: target_str.clone(),
            status: "pending".to_string(),
            message: "Waiting for browser OAuth login...".to_string(),
            auth_url: Some(auth_url.clone()),
            updated_at: now_ms(),
        });

        if open_browser {
            open_browser_url(&auth_url);
        }

        let req_id_clone = request_id.clone();
        let target_clone = target_str.clone();
        let client_id_str = client_id.to_string();
        let token_ep_str = token_endpoint.to_string();
        let redirect_clone = redirect_uri.clone();

        tokio::spawn(async move {
            let accept_res = tokio::time::timeout(
                std::time::Duration::from_secs(300),
                listener.accept(),
            )
            .await;

            if let Ok(Ok((mut stream, _))) = accept_res {
                let mut buf = vec![0u8; 4096];
                let n = stream.read(&mut buf).await.unwrap_or(0);
                let req_str = String::from_utf8_lossy(&buf[..n]);
                let first_line = req_str.lines().next().unwrap_or("");
                let path_part = first_line.split_whitespace().nth(1).unwrap_or("");
                let mut code_opt = None;
                if let Some((_, query)) = path_part.split_once('?') {
                    for pair in query.split('&') {
                        if let Some((k, v)) = pair.split_once('=') {
                            if k == "code" {
                                code_opt = Some(v.to_string());
                            }
                        }
                    }
                }

                let html = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n<!DOCTYPE html><html><body style=\"background:#0c0c0e;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0\"><div style=\"text-align:center;padding:32px;border:1px solid #27272a;border-radius:16px\"><h2>Signed in to Arunaki</h2><p style=\"color:#a1a1aa\">You can close this tab and return to Arunaki.</p><script>setTimeout(()=>window.close(),1200)</script></div></body></html>";
                let _ = stream.write_all(html.as_bytes()).await;
                let _ = stream.shutdown().await;

                if let Some(code) = code_opt {
                    let http = reqwest::Client::new();
                    let tok_res = if target_clone == "claude" {
                        http.post(&token_ep_str)
                            .json(&json!({
                                "grant_type": "authorization_code",
                                "client_id": client_id_str,
                                "code": code,
                                "redirect_uri": redirect_clone,
                                "code_verifier": verifier,
                                "state": state
                            }))
                            .send()
                            .await
                    } else {
                        let form_body = format!(
                            "grant_type=authorization_code&client_id={}&code={}&redirect_uri={}&code_verifier={}",
                            url_encode(&client_id_str),
                            url_encode(&code),
                            url_encode(&redirect_clone),
                            url_encode(&verifier)
                        );
                        http.post(&token_ep_str)
                            .header("Content-Type", "application/x-www-form-urlencoded")
                            .body(form_body)
                            .send()
                            .await
                    };

                    if let Ok(resp) = tok_res {
                        if resp.status().is_success() {
                            if let Ok(tok_json) = resp.json::<Value>().await {
                                if let Some(at) =
                                    tok_json.get("access_token").and_then(|v| v.as_str())
                                {
                                    let rt = tok_json
                                        .get("refresh_token")
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string());
                                    let exp_in = tok_json
                                        .get("expires_in")
                                        .and_then(|v| v.as_u64())
                                        .unwrap_or(3600);
                                    let email = decode_jwt_payload(at).and_then(|p| {
                                        p.get("email")
                                            .or_else(|| {
                                                p.pointer("/https:~1~1api.openai.com~1profile/email")
                                            })
                                            .and_then(|v| v.as_str())
                                            .map(|s| s.to_string())
                                    });
                                    set_credential(CredentialEntry {
                                        source: target_clone.clone(),
                                        access_token: at.to_string(),
                                        refresh_token: rt,
                                        expires_at: Some(now_ms() + exp_in * 1000),
                                        account_email: email,
                                        updated_at: now_iso(),
                                        auto_harvested: false,
                                        ..Default::default()
                                    });
                                    register_local_cli_to_config(20188);
                                    update_oauth_result(OauthResult {
                                        request_id: req_id_clone,
                                        target: target_clone,
                                        status: "success".to_string(),
                                        message: "Browser OAuth sign-in succeeded!".to_string(),
                                        auth_url: None,
                                        updated_at: now_ms(),
                                    });
                                    return;
                                }
                            }
                        }
                    }
                }
            }

            update_oauth_result(OauthResult {
                request_id: req_id_clone,
                target: target_clone,
                status: "error".to_string(),
                message: "OAuth callback failed or timed out.".to_string(),
                auth_url: None,
                updated_at: now_ms(),
            });
        });

        return Ok(json!({
            "requestId": request_id,
            "target": target_str,
            "authUrl": auth_url
        }));
    }

    Err(format!("Unsupported OAuth target: {}", target))
}

pub async fn fetch_live_quotas_list() -> Vec<Value> {
    harvest_all();
    let creds = get_all_credentials();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap_or_default();

    let mut out = Vec::new();
    for prov in ["antigravity", "claude", "codex", "kiro", "opencode"] {
        let Some(entry) = creds.get(prov) else {
            out.push(json!({
                "provider": prov,
                "ok": false,
                "reason": "Not signed in",
                "buckets": []
            }));
            continue;
        };

        if is_expired(entry, 0) && prov != "opencode" {
            out.push(json!({
                "provider": prov,
                "ok": false,
                "reason": "Token expired",
                "buckets": []
            }));
            continue;
        }

        match prov {
            "antigravity" => {
                let mut buckets = Vec::new();
                if let Ok(resp) = client
                    .post("https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary")
                    .header("Authorization", format!("Bearer {}", entry.access_token))
                    .header("Content-Type", "application/json")
                    .json(&json!({}))
                    .send()
                    .await
                {
                    if resp.status().is_success() {
                        if let Ok(data) = resp.json::<Value>().await {
                            if let Some(arr) = data
                                .get("quotas")
                                .or_else(|| data.get("buckets"))
                                .and_then(|v| v.as_array())
                            {
                                for (idx, b) in arr.iter().enumerate() {
                                    let label = b
                                        .get("category")
                                        .or_else(|| b.get("model"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("Quota");
                                    let rem = b
                                        .get("remainingFraction")
                                        .and_then(|v| v.as_f64())
                                        .map(|f| (f * 100.0).round() as i64)
                                        .unwrap_or(100);
                                    buckets.push(json!({
                                        "id": format!("agy-{}", idx),
                                        "label": label,
                                        "remaining": rem,
                                        "resetAt": b.get("resetTime").and_then(|v| v.as_str()),
                                        "exhausted": rem <= 0
                                    }));
                                }
                            }
                        }
                    }
                }
                if buckets.is_empty() {
                    buckets.push(json!({
                        "id": "agy-active",
                        "label": "Google Cloud Code (agy)",
                        "remaining": 100,
                        "exhausted": false
                    }));
                }
                out.push(json!({
                    "provider": "antigravity",
                    "ok": true,
                    "buckets": buckets
                }));
            }
            "claude" => {
                let mut buckets = Vec::new();
                if let Ok(resp) = client
                    .get("https://api.anthropic.com/api/oauth/usage")
                    .header("Authorization", format!("Bearer {}", entry.access_token))
                    .header("anthropic-beta", "oauth-2025-04-20")
                    .send()
                    .await
                {
                    if resp.status().is_success() {
                        if let Ok(data) = resp.json::<Value>().await {
                            for (key, label) in [
                                ("five_hour", "5h Window"),
                                ("seven_day", "7d Window"),
                                ("seven_day_sonnet", "7d Sonnet"),
                            ] {
                                if let Some(w) = data.get(key) {
                                    if let Some(util) =
                                        w.get("utilization").and_then(|v| v.as_f64())
                                    {
                                        let rem = (100.0 - util).round().clamp(0.0, 100.0) as i64;
                                        buckets.push(json!({
                                            "id": key,
                                            "label": label,
                                            "remaining": rem,
                                            "resetAt": w.get("resets_at").and_then(|v| v.as_str()),
                                            "exhausted": rem <= 0
                                        }));
                                    }
                                }
                            }
                        }
                    }
                }
                if buckets.is_empty() {
                    buckets.push(json!({
                        "id": "claude-active",
                        "label": entry.account_info.as_deref().unwrap_or("Claude Pro/Max"),
                        "remaining": 100,
                        "exhausted": false
                    }));
                }
                out.push(json!({
                    "provider": "claude",
                    "ok": true,
                    "buckets": buckets
                }));
            }
            "codex" => {
                let mut buckets = Vec::new();
                if let Ok(resp) = client
                    .get("https://chatgpt.com/backend-api/wham/usage")
                    .header("Authorization", format!("Bearer {}", entry.access_token))
                    .send()
                    .await
                {
                    if resp.status().is_success() {
                        if let Ok(data) = resp.json::<Value>().await {
                            if let Some(pw) = data.pointer("/rate_limit/primary_window") {
                                if let Some(used) =
                                    pw.get("used_percent").and_then(|v| v.as_f64())
                                {
                                    let rem = (100.0 - used).round().clamp(0.0, 100.0) as i64;
                                    buckets.push(json!({
                                        "id": "primary",
                                        "label": "5h Window",
                                        "remaining": rem,
                                        "exhausted": rem <= 0
                                    }));
                                }
                            }
                            if let Some(sw) = data.pointer("/rate_limit/secondary_window") {
                                if let Some(used) =
                                    sw.get("used_percent").and_then(|v| v.as_f64())
                                {
                                    let rem = (100.0 - used).round().clamp(0.0, 100.0) as i64;
                                    buckets.push(json!({
                                        "id": "secondary",
                                        "label": "Weekly",
                                        "remaining": rem,
                                        "exhausted": rem <= 0
                                    }));
                                }
                            }
                        }
                    }
                }
                if buckets.is_empty() {
                    buckets.push(json!({
                        "id": "codex-active",
                        "label": "ChatGPT Plus/Pro",
                        "remaining": 100,
                        "exhausted": false
                    }));
                }
                out.push(json!({
                    "provider": "codex",
                    "ok": true,
                    "buckets": buckets
                }));
            }
            "kiro" => {
                let region = entry.region.as_deref().unwrap_or("us-east-1");
                let mut buckets = Vec::new();
                let mut body_map = serde_json::Map::new();
                body_map.insert("origin".to_string(), Value::String("AI_EDITOR".to_string()));
                body_map.insert(
                    "resourceType".to_string(),
                    Value::String("AGENTIC_REQUEST".to_string()),
                );
                if let Some(ref parn) = entry.profile_arn {
                    body_map.insert("profileArn".to_string(), Value::String(parn.clone()));
                }
                if let Ok(resp) = client
                    .post(format!(
                        "https://codewhisperer.{}.amazonaws.com/getUsageLimits",
                        region
                    ))
                    .header("Authorization", format!("Bearer {}", entry.access_token))
                    .header("Content-Type", "application/x-amz-json-1.0")
                    .header(
                        "x-amz-target",
                        "AmazonCodeWhispererService.GetUsageLimits",
                    )
                    .json(&Value::Object(body_map))
                    .send()
                    .await
                {
                    if resp.status().is_success() {
                        if let Ok(data) = resp.json::<Value>().await {
                            if let Some(list) =
                                data.get("usageBreakdownList").and_then(|v| v.as_array())
                            {
                                for (idx, item) in list.iter().enumerate() {
                                    let limit = item
                                        .get("usageLimitWithPrecision")
                                        .or_else(|| item.get("usageLimit"))
                                        .and_then(|v| v.as_f64())
                                        .unwrap_or(0.0);
                                    let cur = item
                                        .get("currentUsageWithPrecision")
                                        .or_else(|| item.get("currentUsage"))
                                        .and_then(|v| v.as_f64())
                                        .unwrap_or(0.0);
                                    if limit > 0.0 {
                                        let rem = (((limit - cur) / limit) * 100.0)
                                            .round()
                                            .clamp(0.0, 100.0)
                                            as i64;
                                        let label = item
                                            .get("displayName")
                                            .or_else(|| item.get("resourceType"))
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("Credits");
                                        buckets.push(json!({
                                            "id": format!("kiro-{}", idx),
                                            "label": format!("{} ({}/{})", label, (limit - cur).round() as i64, limit.round() as i64),
                                            "remaining": rem,
                                            "exhausted": rem <= 0
                                        }));
                                    }
                                }
                            }
                        }
                    }
                }
                if buckets.is_empty() {
                    buckets.push(json!({
                        "id": "kiro-active",
                        "label": format!("AWS CodeWhisperer ({})", region),
                        "remaining": 100,
                        "exhausted": false
                    }));
                }
                out.push(json!({
                    "provider": "kiro",
                    "ok": true,
                    "buckets": buckets
                }));
            }
            "opencode" => {
                out.push(json!({
                    "provider": "opencode",
                    "ok": true,
                    "buckets": [{
                        "id": "opencode-zen",
                        "label": "OpenCode Zen Free",
                        "remaining": 100,
                        "exhausted": false
                    }]
                }));
            }
            _ => {}
        }
    }
    out
}
