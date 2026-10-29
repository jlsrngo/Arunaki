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
            "description": "Autonomous Executive Assistant tool to manage, inspect, and update the operational agenda and task checklist (.arunaki/tasks.json). Call this tool whenever the user reports operational progress, completed deliveries, receipt of expenses (e.g., 'pengeluaran pengiriman paket pak arnol 30rb' implies package was delivered/sent), or wants to view/create/check off subtasks on their agenda board.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["complete_subtask", "list", "create_task", "update_task", "delete_task"],
                        "description": "Action to perform. Use 'complete_subtask' to check off a subtask/checklist item."
                    },
                    "task_query": {
                        "type": "string",
                        "description": "Search term matching the task title or description (e.g. 'pak arnol', 'faktur'). Case-insensitive."
                    },
                    "subtask_query": {
                        "type": "string",
                        "description": "Search term matching the subtask checklist title (e.g. 'terkirim', 'kirim', 'rekap', 'verifikasi'). Case-insensitive."
                    },
                    "completed": {
                        "type": "boolean",
                        "description": "Whether the subtask checklist is marked completed (true) or pending (false). Defaults to true."
                    },
                    "column": {
                        "type": "string",
                        "enum": ["today", "tomorrow", "inprogress", "done"],
                        "description": "Optional column to transition the task into."
                    },
                    "notes": {
                        "type": "string",
                        "description": "Optional additional notes or expense details to append to the task (e.g. 'Biaya pengiriman Rp 30.000 tercatat')."
                    },
                    "new_task_title": {
                        "type": "string",
                        "description": "Title when creating a new task."
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
                            found_subtask = true;
                        }

                        // Check if all subtasks are completed
                        let all_done = !subtasks.is_empty() && subtasks.iter().all(|st| st.get("completed").and_then(|v| v.as_bool()).unwrap_or(false));
                        if all_done {
                            task["columnId"] = json!("done");
                        } else if let Some(col) = target_column {
                            task["columnId"] = json!(col);
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

                    task["updatedAt"] = json!(chrono_iso_now());
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
        "create_task" => {
            let new_title = arguments.get("new_task_title").and_then(|v| v.as_str()).unwrap_or("New Operational Task");
            let new_col = target_column.unwrap_or("today");
            let now_str = chrono_iso_now();
            let today_date = now_str.split('T').next().unwrap_or("2026-10-29");

            let new_task = json!({
                "id": format!("task_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()),
                "title": new_title,
                "description": notes,
                "columnId": new_col,
                "targetDate": today_date,
                "reminderTime": "09:00",
                "reminderDateTime": format!("{}T09:00:00", today_date),
                "telegramReminderEnabled": true,
                "notifiedAt": Value::Null,
                "priority": "medium",
                "attachedFile": "",
                "subtasks": if !subtask_query.is_empty() {
                    vec![json!({
                        "id": format!("st_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()),
                        "title": subtask_query,
                        "completed": mark_completed
                    })]
                } else {
                    vec![]
                },
                "createdAt": now_str,
                "updatedAt": now_str
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
                "output": format!("Created new operational agenda item '{}' in column '{}'.", new_title, new_col)
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

fn chrono_iso_now() -> String {
    // Simple ISO string without external chrono dependency
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Approximate UTC ISO representation
    let days = now / 86400;
    let secs_of_day = now % 86400;
    let hours = secs_of_day / 3600;
    let minutes = (secs_of_day % 3600) / 60;
    let seconds = secs_of_day % 60;

    // Approximate calculation from 1970
    let mut y = 1970;
    let mut rem_days = days;
    loop {
        let leap = if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 { 1 } else { 0 };
        let days_in_year = 365 + leap;
        if rem_days < days_in_year {
            let months = [31, 28 + leap, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
            let mut m = 0;
            while m < 12 && rem_days >= months[m] {
                rem_days -= months[m];
                m += 1;
            }
            return format!(
                "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
                y, m + 1, rem_days + 1, hours, minutes, seconds
            );
        }
        rem_days -= days_in_year;
        y += 1;
    }
}
