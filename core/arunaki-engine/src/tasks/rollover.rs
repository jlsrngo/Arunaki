//! Task rollover reconciliation & atomic `.arunaki/tasks.json` persistence.

use serde_json::Value;
use std::fs;
use std::path::Path;

/// Parses `"HH:mm"` into minutes since midnight (`0..1440`).
pub fn parse_hh_mm_minutes(s: &str) -> Option<u32> {
    let mut parts = s.trim().split(':');
    let h: u32 = parts.next()?.parse().ok()?;
    let m: u32 = parts.next()?.parse().ok()?;
    if h < 24 && m < 60 {
        Some(h * 60 + m)
    } else {
        None
    }
}

/// Reconciles task columns against the current local date (`today_ymd`, `YYYY-MM-DD`)
/// and time (`now_minutes` since midnight):
/// 1. Legacy `"tomorrow"` column -> `"today"` (if `<= today_ymd`) or `"upcoming"` (if `> today_ymd`).
/// 2. `"upcoming"` with `targetDate <= today_ymd` -> promoted to `"today"`.
/// 3. `"today"` with `targetDate < today_ymd` OR (`targetDate == today_ymd` and `reminderTime < now_minutes`) -> `"overdue"`.
pub fn reconcile_tasks_rollover(
    tasks: &mut [Value],
    today_ymd: &str,
    now_minutes: u32,
    now_iso: &str,
) -> bool {
    let mut has_changes = false;

    for task in tasks.iter_mut() {
        let col = task
            .get("columnId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let target_date = task
            .get("targetDate")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let reminder_time = task
            .get("reminderTime")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        // 1. Legacy 'tomorrow' column migration
        if col == "tomorrow" {
            let next_col = if !target_date.is_empty() && target_date.as_str() <= today_ymd {
                "today"
            } else {
                "upcoming"
            };
            task["columnId"] = Value::String(next_col.to_string());
            task["updatedAt"] = Value::String(now_iso.to_string());
            has_changes = true;
            continue;
        }

        // 2. Promote 'upcoming' -> 'today' when targetDate has arrived
        if col == "upcoming" && !target_date.is_empty() && target_date.as_str() <= today_ymd {
            task["columnId"] = Value::String("today".to_string());
            task["updatedAt"] = Value::String(now_iso.to_string());
            has_changes = true;
            continue;
        }

        // 3. Detect overdue tasks in 'today'
        if col == "today" && !target_date.is_empty() {
            if target_date.as_str() < today_ymd {
                task["columnId"] = Value::String("overdue".to_string());
                task["updatedAt"] = Value::String(now_iso.to_string());
                has_changes = true;
                continue;
            }
            if target_date.as_str() == today_ymd && !reminder_time.is_empty() {
                if let Some(task_mins) = parse_hh_mm_minutes(&reminder_time) {
                    if now_minutes > task_mins {
                        task["columnId"] = Value::String("overdue".to_string());
                        task["updatedAt"] = Value::String(now_iso.to_string());
                        has_changes = true;
                    }
                }
            }
        }
    }

    has_changes
}

/// Reads `.arunaki/tasks.json` from `workspace_dir`, applies rollover reconciliation,
/// and atomically writes back if any task column changed.
pub fn read_and_reconcile_tasks(workspace_dir: &str) -> (Vec<Value>, bool) {
    let tasks_path = Path::new(workspace_dir).join(".arunaki").join("tasks.json");
    if !tasks_path.exists() {
        return (Vec::new(), false);
    }

    let raw = match fs::read_to_string(&tasks_path) {
        Ok(s) => s,
        Err(_) => return (Vec::new(), false),
    };

    let mut tasks: Vec<Value> = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return (Vec::new(), false),
    };

    let now = chrono::Local::now();
    let today_ymd = now.format("%Y-%m-%d").to_string();
    let now_minutes = (now.format("%H").to_string().parse::<u32>().unwrap_or(0)) * 60
        + (now.format("%M").to_string().parse::<u32>().unwrap_or(0));
    let now_iso = now.to_rfc3339();

    let changed = reconcile_tasks_rollover(&mut tasks, &today_ymd, now_minutes, &now_iso);
    if changed {
        let _ = atomic_write_tasks(workspace_dir, &tasks);
    }

    (tasks, changed)
}

/// Atomically writes `.arunaki/tasks.json` via `.arunaki/tasks.json.tmp` + `fs::rename`.
pub fn atomic_write_tasks(workspace_dir: &str, tasks: &[Value]) -> Result<(), String> {
    let dot_dir = Path::new(workspace_dir).join(".arunaki");
    fs::create_dir_all(&dot_dir)
        .map_err(|e| format!("Failed to create .arunaki directory: {}", e))?;

    let target_path = dot_dir.join("tasks.json");
    let tmp_path = dot_dir.join("tasks.json.tmp");
    let serialized = serde_json::to_string_pretty(tasks)
        .map_err(|e| format!("Failed to serialize tasks: {}", e))?;

    fs::write(&tmp_path, serialized)
        .map_err(|e| format!("Failed to write temporary tasks file: {}", e))?;

    if fs::rename(&tmp_path, &target_path).is_err() {
        // Fallback on Windows if rename across locked handle fails
        fs::copy(&tmp_path, &target_path)
            .map_err(|e| format!("Failed to persist tasks.json: {}", e))?;
        let _ = fs::remove_file(&tmp_path);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn promotes_upcoming_and_shifts_overdue_tasks() {
        let mut tasks = vec![
            json!({
                "id": "t1",
                "title": "Upcoming arrived",
                "columnId": "upcoming",
                "targetDate": "2026-10-30",
                "reminderTime": "15:00"
            }),
            json!({
                "id": "t2",
                "title": "Today past reminder time",
                "columnId": "today",
                "targetDate": "2026-10-30",
                "reminderTime": "09:00"
            }),
            json!({
                "id": "t3",
                "title": "Legacy tomorrow in future",
                "columnId": "tomorrow",
                "targetDate": "2026-10-31",
                "reminderTime": "10:00"
            }),
        ];

        // Current time: 2026-10-30 at 11:00 (660 minutes)
        let changed = reconcile_tasks_rollover(
            &mut tasks,
            "2026-10-30",
            11 * 60,
            "2026-10-30T11:00:00+07:00",
        );

        assert!(changed);
        assert_eq!(tasks[0]["columnId"], "today");
        assert_eq!(tasks[1]["columnId"], "overdue");
        assert_eq!(tasks[2]["columnId"], "upcoming");
    }
}

