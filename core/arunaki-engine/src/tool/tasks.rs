//! Autonomous Operational Tasks & Agenda Board Tool
//! Manages `.arunaki/tasks.json` in the active workspace.
//! Allows the AI Assistant to autonomously inspect, create, update, and check off task checklist items.

use serde_json::{json, Value};
use std::fs;
use std::path::Path;

use crate::session::message::emit_event;

pub fn tasks_tool_definition() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "manage_operational_tasks",
            "description": "Autonomous Executive Assistant tool to manage, schedule, inspect, and update the operational agenda and task checklist (.arunaki/tasks.json). Call this tool whenever the user reports task progress, operational milestones, settlement notes, or requests to schedule meetings, create agenda items, update tasks, or check off checklist items on the tasks board.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["create_task", "complete_subtask", "list", "update_task", "delete_task"],
                        "description": "Action to perform: 'create_task' to schedule/add an agenda item, 'complete_subtask' to check off a subtask, 'list' to view tasks, 'update_task' to modify an existing task, 'delete_task' to remove a task."
                    },
                    "new_task_title": {
                        "type": "string",
                        "description": "Title when creating or updating a task (e.g. 'Ketemu client', 'Rekap transaksi harian', 'Audit invoice supplier')."
                    },
                    "target_date": {
                        "type": "string",
                        "description": "Target execution date in YYYY-MM-DD format (e.g. '2026-10-31'). When user says 'besok' (tomorrow) or 'lusa', calculate the exact date based on Today's date in <env>."
                    },
                    "reminder_time": {
                        "type": "string",
                        "description": "Execution or reminder time in 24-hour HH:mm format (e.g. '13:00' for 1 PM / 1 siang, '09:00' for 9 AM). Defaults to '09:00' if omitted."
                    },
                    "priority": {
                        "type": "string",
                        "enum": ["low", "medium", "high"],
                        "description": "Priority urgency level. Set 'high' if the user mentions 'penting', 'urgent', or 'critical'."
                    },
                    "column": {
                        "type": "string",
                        "enum": ["today", "upcoming", "inprogress", "done"],
                        "description": "Board column. Defaults automatically to 'today' if target_date is today, or 'upcoming' if target_date is in the future."
                    },
                    "notes": {
                        "type": "string",
                        "description": "Optional instructions, meeting agenda, location, or remarks to store with the task."
                    },
                    "task_query": {
                        "type": "string",
                        "description": "Search keyword matching the target task title or description when updating, checking off, or deleting."
                    },
                    "subtask_query": {
                        "type": "string",
                        "description": "Search keyword matching the target subtask checklist title."
                    },
                    "completed": {
                        "type": "boolean",
                        "description": "Whether the subtask checklist is marked completed (true) or pending (false). Defaults to true."
                    }
                },
                "required": ["action"]
            }
        }
    })
}

pub fn execute_manage_tasks(
    _session_id: &str,
    workspace_dir: &str,
    arguments: &Value,
) -> Value {
    let action = arguments
        .get("action")
        .and_then(|v| v.as_str())
        .unwrap_or("list");

    let task_query = arguments
        .get("task_query")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_lowercase();

    let subtask_query = arguments
        .get("subtask_query")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_lowercase();

    let mark_completed = arguments
        .get("completed")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let target_column = arguments
        .get("column")
        .and_then(|v| v.as_str());

    let notes = arguments
        .get("notes")
        .or_else(|| arguments.get("description"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let tasks_file_path = Path::new(workspace_dir).join(".arunaki").join("tasks.json");

    // Load existing tasks
    let mut tasks: Vec<Value> = if tasks_file_path.exists() {
        match fs::read_to_string(&tasks_file_path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| Vec::new()),
            Err(_) => Vec::new(),
        }
    } else {
        Vec::new()
    };

    match action {
        "create_task" => {
            let new_title = arguments
                .get("new_task_title")
                .or_else(|| arguments.get("title"))
                .and_then(|v| v.as_str())
                .unwrap_or("New Operational Task");

            let now = chrono::Local::now();
            let today_date_str = now.format("%Y-%m-%d").to_string();

            let target_date = arguments
                .get("target_date")
                .or_else(|| arguments.get("date"))
                .and_then(|v| v.as_str())
                .unwrap_or(&today_date_str);

            let reminder_time = arguments
                .get("reminder_time")
                .or_else(|| arguments.get("time"))
                .and_then(|v| v.as_str())
                .unwrap_or("09:00");

            let priority = arguments
                .get("priority")
                .and_then(|v| v.as_str())
                .unwrap_or("medium");

            let computed_col = if let Some(c) = target_column {
                if c == "tomorrow" {
                    "upcoming"
                } else {
                    c
                }
            } else if target_date > today_date_str.as_str() {
                "upcoming"
            } else {
                "today"
            };

            let reminder_datetime = format!("{}T{}:00", target_date, reminder_time);
            let now_iso = now.to_rfc3339();

            // Build standard Google Calendar URL with Asia/Jakarta timezone
            let gcal_title = format!("[Arunaki] {}", new_title);
            let gcal_details = format!(
                "Instruksi / Catatan Kerja:\n{}\n\nTingkat Prioritas: {}\nDikelola oleh Arunaki Autonomous Document Assistant",
                if notes.is_empty() { "-" } else { notes },
                priority.to_uppercase()
            );
            let gcal_date_compact = target_date.replace('-', "");
            let gcal_time_compact = reminder_time.replace(':', "");
            let gcal_url = format!(
                "https://calendar.google.com/calendar/render?action=TEMPLATE&text={}&dates={}T{}00/{}T{}00&details={}&ctz=Asia/Jakarta",
                percent_encode(&gcal_title),
                gcal_date_compact,
                gcal_time_compact,
                gcal_date_compact,
                gcal_time_compact,
                percent_encode(&gcal_details)
            );

            let new_task = json!({
                "id": format!("task_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()),
                "title": new_title,
                "description": notes,
                "columnId": computed_col,
                "targetDate": target_date,
                "reminderTime": reminder_time,
                "reminderDateTime": reminder_datetime,
                "telegramReminderEnabled": true,
                "notifiedAt": Value::Null,
                "priority": priority,
                "attachedFile": "",
                "gcalUrl": gcal_url,
                "subtasks": if !subtask_query.is_empty() {
                    vec![json!({
                        "id": format!("st_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()),
                        "title": subtask_query,
                        "completed": mark_completed
                    })]
                } else {
                    vec![]
                },
                "createdAt": now_iso,
                "updatedAt": now_iso
            });

            tasks.insert(0, new_task);
            if let Some(parent) = tasks_file_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(&tasks_file_path, serde_json::to_string_pretty(&tasks).unwrap_or_default());

            emit_event(
                workspace_dir,
                "tasks.updated",
                json!({ "tasks": tasks }),
            );

            json!({
                "status": "success",
                "title": new_title,
                "targetDate": target_date,
                "reminderTime": reminder_time,
                "priority": priority,
                "columnId": computed_col,
                "output": format!("Created new operational agenda item '{}' scheduled for {} at {} (Priority: {}) in column '{}'.", new_title, target_date, reminder_time, priority, computed_col)
            })
        }
        "complete_subtask" => {
            let mut matched_task_title = String::new();
            let mut matched_subtask_title = String::new();
            let mut found_task = false;
            let mut found_subtask = false;

            for task in tasks.iter_mut() {
                let title = task.get("title").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
                let desc = task.get("description").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();

                let matches_task = task_query.is_empty()
                    || title.contains(&task_query)
                    || desc.contains(&task_query)
                    || task_query.contains(&title);

                if matches_task {
                    found_task = true;
                    matched_task_title = task.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();

                    // Check subtasks
                    if let Some(subtasks) = task.get_mut("subtasks").and_then(|v| v.as_array_mut()) {
                        for st in subtasks.iter_mut() {
                            let st_title = st.get("title").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
                            if subtask_query.is_empty() || st_title.contains(&subtask_query) || subtask_query.contains(&st_title) {
                                st["completed"] = json!(mark_completed);
                                matched_subtask_title = st.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                found_subtask = true;
                                break;
                            }
                        }

                        // If subtask not found by name but subtask_query provided, add it as checked
                        if !found_subtask && !subtask_query.is_empty() {
                            let new_id = format!("st_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis());
                            subtasks.push(json!({
                                "id": new_id,
                                "title": subtask_query,
                                "completed": mark_completed
                            }));
                            matched_subtask_title = subtask_query.clone();
                        }

                        // Check if all subtasks are completed
                        let all_done = !subtasks.is_empty() && subtasks.iter().all(|st| st.get("completed").and_then(|v| v.as_bool()).unwrap_or(false));
                        if all_done {
                            task["columnId"] = json!("done");
                        } else if let Some(col) = target_column {
                            let c = if col == "tomorrow" { "upcoming" } else { col };
                            task["columnId"] = json!(c);
                        }
                    }

                    // Append note if provided
                    if !notes.is_empty() {
                        let prev_desc = task.get("description").and_then(|v| v.as_str()).unwrap_or("");
                        let new_desc = if prev_desc.is_empty() {
                            notes.to_string()
                        } else {
                            format!("{}\n[Assistant Note]: {}", prev_desc, notes)
                        };
                        task["description"] = json!(new_desc);
                    }

                    let now_iso = chrono::Local::now().to_rfc3339();
                    task["updatedAt"] = json!(now_iso);
                    break;
                }
            }

            if !found_task {
                return json!({
                    "status": "not_found",
                    "output": format!("No operational agenda item found matching query '{}'. Currently {} tasks on board.", task_query, tasks.len()),
                    "tasks": tasks
                });
            }

            // Save back
            if let Some(parent) = tasks_file_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(&tasks_file_path, serde_json::to_string_pretty(&tasks).unwrap_or_default());

            // Emit live event to UI
            emit_event(
                workspace_dir,
                "tasks.updated",
                json!({
                    "tasks": tasks,
                    "updatedTask": matched_task_title,
                    "checkedSubtask": matched_subtask_title
                }),
            );

            json!({
                "status": "success",
                "taskTitle": matched_task_title,
                "subtaskTitle": matched_subtask_title,
                "completed": mark_completed,
                "notes": notes,
                "output": format!(
                    "Successfully marked subtask '{}' on agenda '{}' as completed. Notes: {}.",
                    matched_subtask_title, matched_task_title, if notes.is_empty() { "None" } else { notes }
                )
            })
        }
        "update_task" => {
            let mut found_task = false;
            let mut matched_title = String::new();

            for task in tasks.iter_mut() {
                let title = task.get("title").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
                let desc = task.get("description").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();

                let matches_task = !task_query.is_empty() && (
                    title.contains(&task_query)
                    || desc.contains(&task_query)
                    || task_query.contains(&title)
                );

                if matches_task {
                    found_task = true;
                    if let Some(new_title) = arguments.get("new_task_title").or_else(|| arguments.get("title")).and_then(|v| v.as_str()) {
                        task["title"] = json!(new_title);
                    }
                    if let Some(t_date) = arguments.get("target_date").or_else(|| arguments.get("date")).and_then(|v| v.as_str()) {
                        task["targetDate"] = json!(t_date);
                    }
                    if let Some(r_time) = arguments.get("reminder_time").or_else(|| arguments.get("time")).and_then(|v| v.as_str()) {
                        task["reminderTime"] = json!(r_time);
                        let t_date = task.get("targetDate").and_then(|v| v.as_str()).unwrap_or("2026-10-30");
                        task["reminderDateTime"] = json!(format!("{}T{}:00", t_date, r_time));
                        task["notifiedAt"] = Value::Null; // Reset notification trigger on reschedule
                    }
                    if let Some(prio) = arguments.get("priority").and_then(|v| v.as_str()) {
                        task["priority"] = json!(prio);
                    }
                    if let Some(col) = target_column {
                        let c = if col == "tomorrow" { "upcoming" } else { col };
                        task["columnId"] = json!(c);
                    }
                    if !notes.is_empty() {
                        let prev_desc = task.get("description").and_then(|v| v.as_str()).unwrap_or("");
                        let new_desc = if prev_desc.is_empty() {
                            notes.to_string()
                        } else {
                            format!("{}\n{}", prev_desc, notes)
                        };
                        task["description"] = json!(new_desc);
                    }
                    let now_iso = chrono::Local::now().to_rfc3339();
                    task["updatedAt"] = json!(now_iso);
                    matched_title = task.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    break;
                }
            }

            if !found_task {
                return json!({
                    "status": "not_found",
                    "output": format!("No operational agenda item found matching query '{}'.", task_query),
                });
            }

            if let Some(parent) = tasks_file_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(&tasks_file_path, serde_json::to_string_pretty(&tasks).unwrap_or_default());

            emit_event(
                workspace_dir,
                "tasks.updated",
                json!({ "tasks": tasks }),
            );

            json!({
                "status": "success",
                "output": format!("Successfully updated agenda item '{}'.", matched_title)
            })
        }
        "delete_task" => {
            let initial_len = tasks.len();
            let mut removed_title = String::new();

            tasks.retain(|task| {
                let title = task.get("title").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
                let desc = task.get("description").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();

                let matches_task = !task_query.is_empty() && (
                    title.contains(&task_query)
                    || desc.contains(&task_query)
                    || task_query.contains(&title)
                );

                if matches_task && removed_title.is_empty() {
                    removed_title = task.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    false
                } else {
                    true
                }
            });

            if tasks.len() == initial_len {
                return json!({
                    "status": "not_found",
                    "output": format!("No operational agenda item found matching query '{}'.", task_query),
                });
            }

            if let Some(parent) = tasks_file_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(&tasks_file_path, serde_json::to_string_pretty(&tasks).unwrap_or_default());

            emit_event(
                workspace_dir,
                "tasks.updated",
                json!({ "tasks": tasks }),
            );

            json!({
                "status": "success",
                "output": format!("Successfully deleted agenda item '{}' from board.", removed_title)
            })
        }
        _ => {
            // list
            json!({
                "status": "success",
                "totalTasks": tasks.len(),
                "tasks": tasks,
                "output": format!("Retrieved {} operational agenda items from board.", tasks.len())
            })
        }
    }
}

fn percent_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.as_bytes() {
        match *b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char);
            }
            b' ' => out.push('+'),
            _ => {
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_and_manage_operational_task() {
        let tmp = std::env::temp_dir().join(format!("test_arunaki_tasks_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()));
        let _ = fs::create_dir_all(&tmp);
        let ws = tmp.to_str().unwrap();

        // 1. Create a task with specific date, time, priority
        let create_args = json!({
            "action": "create_task",
            "new_task_title": "Ketemu client",
            "target_date": "2099-12-31",
            "reminder_time": "13:00",
            "priority": "high",
            "notes": "Pertemuan di kantor client membahas kontrak"
        });
        let res = execute_manage_tasks("s1", ws, &create_args);
        assert_eq!(res["status"], "success");
        assert_eq!(res["title"], "Ketemu client");
        assert_eq!(res["priority"], "high");
        assert_eq!(res["reminderTime"], "13:00");
        assert_eq!(res["targetDate"], "2099-12-31");
        assert_eq!(res["columnId"], "upcoming");

        // 2. List tasks
        let list_args = json!({ "action": "list" });
        let list_res = execute_manage_tasks("s1", ws, &list_args);
        assert_eq!(list_res["totalTasks"], 1);

        // 3. Update task time
        let update_args = json!({
            "action": "update_task",
            "task_query": "Ketemu client",
            "reminder_time": "15:00"
        });
        let update_res = execute_manage_tasks("s1", ws, &update_args);
        assert_eq!(update_res["status"], "success");

        // 4. Delete task
        let del_args = json!({
            "action": "delete_task",
            "task_query": "Ketemu client"
        });
        let del_res = execute_manage_tasks("s1", ws, &del_args);
        assert_eq!(del_res["status"], "success");

        let list_res_after = execute_manage_tasks("s1", ws, &list_args);
        assert_eq!(list_res_after["totalTasks"], 0);

        let _ = fs::remove_dir_all(&tmp);
    }
}
