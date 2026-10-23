use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static COUNTER: AtomicU64 = AtomicU64::new(1);

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn now_iso() -> String {
    let ms = now_ms();
    let secs = ms / 1000;
    let millis = ms % 1000;
    let days = secs / 86400;
    let rem = secs % 86400;
    let hours = rem / 3600;
    let mins = (rem % 3600) / 60;
    let s = rem % 60;

    // Civil date calculation from days since 1970-01-01
    let z = days as i64 + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year, m, d, hours, mins, s, millis
    )
}

pub fn gen_id(prefix: &str) -> String {
    let ms = now_ms();
    let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
    let pid = std::process::id();
    format!("{}_{:x}{:04x}{:04x}", prefix, ms, pid & 0xffff, seq & 0xffff)
}

pub fn home_dir() -> PathBuf {
    if let Ok(profile) = std::env::var("USERPROFILE") {
        if !profile.trim().is_empty() {
            return PathBuf::from(profile);
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        if !home.trim().is_empty() {
            return PathBuf::from(home);
        }
    }
    PathBuf::from(".")
}

pub fn arunaki_dot_dir() -> PathBuf {
    let dir = home_dir().join(".arunaki");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

pub fn arunaki_config_dir() -> PathBuf {
    let base = if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME") {
        if !xdg.trim().is_empty() {
            PathBuf::from(xdg)
        } else {
            home_dir().join(".config")
        }
    } else {
        home_dir().join(".config")
    };
    let dir = base.join("arunaki");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

pub fn arunaki_data_dir() -> PathBuf {
    let base = if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
        if !xdg.trim().is_empty() {
            PathBuf::from(xdg)
        } else {
            home_dir().join(".local").join("share")
        }
    } else {
        home_dir().join(".local").join("share")
    };
    let dir = base.join("arunaki");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

pub fn normalize_workspace_path(raw: &str) -> String {
    let trimmed = raw.trim().replace('/', "\\");
    let clean = trimmed.trim_end_matches('\\');
    if clean.len() == 2 && clean.ends_with(':') {
        format!("{}\\", clean)
    } else {
        clean.to_string()
    }
}

fn resolve_lexical_or_canonical(path: &Path) -> PathBuf {
    let mut existing = path.to_path_buf();
    let mut tail = Vec::new();
    while !existing.exists() {
        if let Some(name) = existing.file_name() {
            tail.push(name.to_os_string());
        }
        if let Some(parent) = existing.parent() {
            if parent == existing {
                break;
            }
            existing = parent.to_path_buf();
        } else {
            break;
        }
    }
    let mut base = existing.canonicalize().unwrap_or(existing);
    for comp in tail.into_iter().rev() {
        base.push(comp);
    }
    base
}

fn clean_win_path_str(p: &Path) -> String {
    let s = p.to_string_lossy().replace('/', "\\");
    let stripped = s.strip_prefix("\\\\?\\").unwrap_or(&s);
    stripped.trim_end_matches('\\').to_lowercase()
}

/// Strictly verifies that `child` is inside `parent` (Project Folder Isolation).
pub fn contains_path(parent: &Path, child: &Path) -> bool {
    for comp in child.components() {
        if matches!(comp, std::path::Component::ParentDir) {
            return false;
        }
    }
    let p_canon = resolve_lexical_or_canonical(parent);
    let c_canon = resolve_lexical_or_canonical(child);

    let p_str = clean_win_path_str(&p_canon);
    let c_str = clean_win_path_str(&c_canon);

    if c_str == p_str {
        return true;
    }
    let prefix = format!("{}\\", p_str);
    c_str.starts_with(&prefix)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_contains_path_isolation() {
        let base = std::env::temp_dir().join("arunaki_test_ws");
        let _ = std::fs::create_dir_all(&base);
        let inside = base.join("sub").join("report.xlsx");
        let outside = std::env::temp_dir().join("other_folder").join("secret.txt");
        assert!(contains_path(&base, &inside));
        assert!(!contains_path(&base, &outside));
    }
}
