//! Arunaki System Telemetry & Environment Inspector Module (Pure Rust)
//!
//! Provides hardware telemetry, OS environment details, CLI binary discovery,
//! and high-precision system diagnostics for the desktop workstation.

use std::collections::HashMap;

#[derive(serde::Serialize, Debug)]
pub struct SystemTelemetry {
    pub os_name: String,
    pub os_arch: String,
    pub os_family: String,
    pub num_cpus: usize,
    pub app_name: String,
    pub app_version: String,
    pub runtime: String,
    pub desktop_shell: String,
    pub engine: String,
    pub docs_engine: String,
}

#[derive(serde::Serialize, Debug)]
pub struct BinaryCheck {
    pub name: String,
    pub installed: bool,
    pub path: Option<String>,
}

/// Returns hardware specifications and desktop environment details.
#[tauri::command]
pub fn get_system_telemetry() -> SystemTelemetry {
    SystemTelemetry {
        os_name: std::env::consts::OS.to_string(),
        os_arch: std::env::consts::ARCH.to_string(),
        os_family: std::env::consts::FAMILY.to_string(),
        num_cpus: std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1),
        app_name: "Arunaki — Autonomous Document Operating System".to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        runtime: "Pure-Rust Tauri v2".to_string(),
        desktop_shell: "Microsoft Edge WebView2".to_string(),
        engine: "Axum v0.7 + Tokio v1.40 (127.0.0.1:4096)".to_string(),
        docs_engine: "Native Win32 COM & Office XML Sidecar".to_string(),
    }
}

/// Scans the system PATH for known AI developer CLI tools.
#[tauri::command]
pub fn detect_cli_binaries() -> HashMap<String, BinaryCheck> {
    let targets = [
        ("claude", "claude.cmd"),
        ("codex", "codex.cmd"),
        ("antigravity", "agy.cmd"),
        ("opencode", "opencode.cmd"),
        ("kiro", "kiro.cmd"),
        ("9router", "9router.exe"),
        ("git", "git.exe"),
        ("node", "node.exe"),
    ];

    let mut map = HashMap::new();

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        for (key, bin_name) in targets {
            let mut cmd = std::process::Command::new("where.exe");
            cmd.arg(bin_name);
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
            if let Ok(output) = cmd.output() {
                if output.status.success() {
                    let path = String::from_utf8_lossy(&output.stdout)
                        .lines()
                        .next()
                        .unwrap_or("")
                        .trim()
                        .to_string();
                    map.insert(
                        key.to_string(),
                        BinaryCheck {
                            name: key.to_string(),
                            installed: !path.is_empty(),
                            path: if path.is_empty() { None } else { Some(path) },
                        },
                    );
                    continue;
                }
            }
            map.insert(
                key.to_string(),
                BinaryCheck {
                    name: key.to_string(),
                    installed: false,
                    path: None,
                },
            );
        }
    }

    #[cfg(not(windows))]
    {
        for (key, _) in targets {
            map.insert(
                key.to_string(),
                BinaryCheck {
                    name: key.to_string(),
                    installed: false,
                    path: None,
                },
            );
        }
    }

    map
}

/// High-precision latency ping test between webview frontend and pure-Rust engine.
#[tauri::command]
pub fn system_ping() -> serde_json::Value {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);

    serde_json::json!({
        "status": "ok",
        "timestamp": now,
        "mode": "Tauri v2 Native IPC (Zero-Network Latency)"
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_system_telemetry() {
        let t = get_system_telemetry();
        assert!(!t.os_name.is_empty());
        assert!(!t.os_arch.is_empty());
        assert!(t.num_cpus >= 1);
        assert_eq!(t.runtime, "Pure-Rust Tauri v2");
    }

    #[test]
    fn test_system_ping() {
        let p = system_ping();
        assert_eq!(p["status"], "ok");
        assert!(p["timestamp"].as_u64().unwrap_or(0) > 0);
    }

    #[test]
    fn test_detect_cli_binaries() {
        let bins = detect_cli_binaries();
        assert!(bins.contains_key("git"));
        assert!(bins.contains_key("node"));
        assert!(bins.contains_key("claude"));
        assert!(bins.contains_key("antigravity"));
    }
}
