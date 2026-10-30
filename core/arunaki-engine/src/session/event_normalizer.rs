use axum::{
    extract::{Json, Path as AxumPath},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// Normalized UI event envelope compatible with Arunaki Workstation Chat stream.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NormalizedUiEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub data: Value,
}

/// Normalizes raw internal engine events into clean Workstation Chat stream events.
/// Returns `None` if the event is an internal/compaction event or belongs to a different session.
pub fn normalize_engine_event(event: &Value, current_session_id: &str) -> Option<Value> {
    let inner_payload = event.get("payload");

    let raw_type = event
        .get("type")
        .and_then(|v| v.as_str())
        .or_else(|| {
            inner_payload
                .and_then(|p| p.get("type"))
                .and_then(|v| v.as_str())
        })
        .unwrap_or("");

    // Determine payload object: innerPayload.properties | innerPayload.data | event.data | event.properties | innerPayload | event
    let payload = inner_payload
        .and_then(|p| p.get("properties").or_else(|| p.get("data")))
        .or_else(|| event.get("data").or_else(|| event.get("properties")))
        .or(inner_payload)
        .unwrap_or(event);

    // Session validation
    let session_id = payload
        .get("sessionID")
        .or_else(|| event.get("sessionID"))
        .or_else(|| inner_payload.and_then(|p| p.get("sessionID")))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if !current_session_id.is_empty() && !session_id.is_empty() && session_id != current_session_id {
        return None;
    }

    // Filter out internal compaction events from leaking into chat streams
    let is_compaction = event.get("agent").and_then(|v| v.as_str()) == Some("compaction")
        || payload.get("agent").and_then(|v| v.as_str()) == Some("compaction")
        || payload.get("summary").and_then(|v| v.as_bool()) == Some(true)
        || payload.get("mode").and_then(|v| v.as_str()) == Some("compaction")
        || event.get("summary").and_then(|v| v.as_bool()) == Some(true);

    if is_compaction {
        return None;
    }

    // Strip trailing numeric suffixes like ".1", ".0"
    let normalized_type = if let Some(idx) = raw_type.rfind('.') {
        if raw_type[idx + 1..].chars().all(|c| c.is_ascii_digit()) {
            &raw_type[..idx]
        } else {
            raw_type
        }
    } else {
        raw_type
    };

    match normalized_type {
        "session.updated" | "session.title.updated" => Some(json!({
            "type": "session_updated",
            "data": payload
        })),
        "session.next.prompt.admitted" | "session.next.prompted" | "session.prompted" => {
            Some(json!({
                "type": "thinking",
                "data": "Analyzing request & documents..."
            }))
        }
        "session.next.text.delta" => {
            let delta = payload
                .get("delta")
                .or_else(|| event.get("delta"))
                .cloned()
                .unwrap_or(Value::Null);
            Some(json!({
                "type": "text_delta",
                "data": delta
            }))
        }
        "session.next.text.ended" => {
            let text = payload
                .get("text")
                .or_else(|| event.get("text"))
                .cloned()
                .unwrap_or(Value::Null);
            Some(json!({
                "type": "text_end",
                "data": text
            }))
        }
        "session.next.reasoning.started" => Some(json!({
            "type": "thinking",
            "data": "Thinking..."
        })),
        "session.next.reasoning.delta" => {
            let delta = payload
                .get("delta")
                .or_else(|| event.get("delta"))
                .cloned()
                .unwrap_or(Value::Null);
            Some(json!({
                "type": "reasoning_delta",
                "data": delta
            }))
        }
        "session.next.reasoning.ended" => {
            let text = payload
                .get("text")
                .or_else(|| event.get("text"))
                .cloned()
                .unwrap_or(Value::Null);
            Some(json!({
                "type": "reasoning_end",
                "data": text
            }))
        }
        "session.next.step.started" => Some(json!({
            "type": "thinking",
            "data": "Processing..."
        })),
        "session.next.step.ended" => {
            let finish = payload
                .get("finish")
                .or_else(|| event.get("finish"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if finish == "tool-calls" {
                Some(json!({
                    "type": "step_continuation",
                    "data": payload
                }))
            } else {
                Some(json!({
                    "type": "done",
                    "data": payload
                }))
            }
        }
        "session.next.tool.input.started" => {
            let call_id = extract_call_id(payload, event);
            let tool_name = payload
                .get("name")
                .or_else(|| event.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("action");
            Some(json!({
                "type": "tool_preparing",
                "data": {
                    "callID": call_id,
                    "toolName": tool_name,
                    "preview": format!("Preparing {}...", tool_name)
                }
            }))
        }
        "question.asked" | "question.v2.asked" => {
            let questions = payload
                .get("questions")
                .or_else(|| event.get("questions"))
                .cloned()
                .unwrap_or_else(|| json!([]));
            let id = payload
                .get("id")
                .or_else(|| event.get("id"))
                .cloned()
                .unwrap_or(Value::Null);
            let tool = payload
                .get("tool")
                .or_else(|| event.get("tool"))
                .cloned()
                .unwrap_or(Value::Null);
            Some(json!({
                "type": "question_asked",
                "data": {
                    "id": id,
                    "sessionID": session_id,
                    "questions": questions,
                    "tool": tool
                }
            }))
        }
        "question.v2.replied" | "question.v2.rejected" => Some(json!({
            "type": "question_settled",
            "data": payload
        })),
        "session.next.tool.called" => {
            let call_id = extract_call_id(payload, event);
            let tool_name = payload
                .get("name")
                .or_else(|| event.get("name"))
                .or_else(|| payload.get("tool"))
                .or_else(|| event.get("tool"))
                .and_then(|v| v.as_str())
                .unwrap_or("action");
            let input = payload
                .get("input")
                .or_else(|| event.get("input"))
                .unwrap_or(&Value::Null);

            if tool_name == "question" && input.get("questions").and_then(|v| v.as_array()).is_some() {
                return Some(json!({
                    "type": "question_asked",
                    "data": {
                        "id": call_id,
                        "sessionID": session_id,
                        "questions": input.get("questions")
                    }
                }));
            }

            let preview = extract_target_preview(input);
            Some(json!({
                "type": "tool_start",
                "data": {
                    "callID": call_id,
                    "toolName": tool_name,
                    "args": input,
                    "preview": preview
                }
            }))
        }
        "session.next.tool.progress" => {
            let call_id = extract_call_id(payload, event);
            let tool_name = payload
                .get("tool")
                .or_else(|| event.get("tool"))
                .and_then(|v| v.as_str())
                .unwrap_or("action");
            Some(json!({
                "type": "tool_progress",
                "data": {
                    "callID": call_id,
                    "toolName": tool_name,
                    "preview": format!("Executing {}...", tool_name)
                }
            }))
        }
        "session.next.tool.success" => {
            let call_id = extract_call_id(payload, event);
            let tool_name = payload
                .get("tool")
                .or_else(|| event.get("tool"))
                .and_then(|v| v.as_str())
                .unwrap_or("action");
            Some(json!({
                "type": "tool_live_status",
                "data": {
                    "callID": call_id,
                    "toolName": tool_name,
                    "status": "completed",
                    "preview": format!("Completed {}", tool_name)
                }
            }))
        }
        "session.next.tool.failed" => {
            let call_id = extract_call_id(payload, event);
            let tool_name = payload
                .get("tool")
                .or_else(|| event.get("tool"))
                .and_then(|v| v.as_str())
                .unwrap_or("action");
            Some(json!({
                "type": "tool_live_status",
                "data": {
                    "callID": call_id,
                    "toolName": tool_name,
                    "status": "failed",
                    "preview": format!("Failed {}", tool_name)
                }
            }))
        }
        "session.next.step.failed" => {
            let err_msg = payload
                .pointer("/error/message")
                .or_else(|| event.pointer("/error/message"))
                .and_then(|v| v.as_str())
                .unwrap_or("An error occurred while processing your request.");
            Some(json!({
                "type": "error",
                "data": { "message": err_msg }
            }))
        }
        "session.status" => {
            let status_type = payload
                .pointer("/status/type")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if status_type == "busy" {
                Some(json!({ "type": "session_busy", "data": payload }))
            } else if status_type == "idle" {
                Some(json!({ "type": "done", "data": payload }))
            } else {
                None
            }
        }
        "session.idle" => Some(json!({ "type": "done", "data": payload })),
        "open_document_app" | "open_app" => Some(json!({ "type": "open_document_app", "data": payload })),
        _ => None,
    }
}

fn extract_call_id(payload: &Value, event: &Value) -> Option<String> {
    payload
        .get("callID")
        .or_else(|| event.get("callID"))
        .or_else(|| payload.get("id"))
        .or_else(|| event.get("id"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

/// Extracts a clean file basename preview or command snippet from tool arguments.
pub fn extract_target_preview(args: &Value) -> Option<String> {
    if !args.is_object() {
        return None;
    }

    let target = args
        .get("path")
        .or_else(|| args.get("TargetFile"))
        .or_else(|| args.get("filePath"))
        .or_else(|| args.get("targetFile"))
        .or_else(|| args.get("pattern"))
        .and_then(|v| v.as_str());

    if let Some(t) = target {
        let basename = t.split(['/', '\\']).last().unwrap_or(t);
        return Some(basename.to_string());
    }

    if let Some(cmd) = args.get("command").and_then(|v| v.as_str()) {
        let truncated: String = cmd.chars().take(40).collect();
        return Some(truncated);
    }

    None
}

// ---------------------------------------------------------------------------
// HTTP Handler
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct NormalizeRequest {
    pub event: Value,
    pub session_id: Option<String>,
}

pub async fn handle_normalize_session_event(
    AxumPath(session_id): AxumPath<String>,
    Json(body): Json<NormalizeRequest>,
) -> Response {
    let sid = body.session_id.unwrap_or(session_id);
    let normalized = normalize_engine_event(&body.event, &sid);
    Json(json!({
        "success": true,
        "normalized": normalized
    }))
    .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_filters_compaction_events() {
        let event = json!({
            "type": "session.next.text.delta",
            "agent": "compaction",
            "delta": "compacting..."
        });
        assert_eq!(normalize_engine_event(&event, "ses-1"), None);

        let event2 = json!({
            "type": "session.next.step.ended",
            "payload": {
                "summary": true
            }
        });
        assert_eq!(normalize_engine_event(&event2, "ses-1"), None);
    }

    #[test]
    fn test_normalizes_text_and_reasoning_deltas() {
        let text_evt = json!({
            "type": "session.next.text.delta",
            "payload": {
                "delta": "Halo Arunaki"
            }
        });
        let normalized = normalize_engine_event(&text_evt, "ses-1").unwrap();
        assert_eq!(normalized["type"], "text_delta");
        assert_eq!(normalized["data"], "Halo Arunaki");

        let reason_evt = json!({
            "type": "session.next.reasoning.delta",
            "payload": {
                "delta": "Checking files"
            }
        });
        let normalized_r = normalize_engine_event(&reason_evt, "ses-1").unwrap();
        assert_eq!(normalized_r["type"], "reasoning_delta");
        assert_eq!(normalized_r["data"], "Checking files");
    }

    #[test]
    fn test_normalizes_tool_called_with_basename_preview() {
        let tool_evt = json!({
            "type": "session.next.tool.called",
            "payload": {
                "callID": "call-123",
                "name": "edit_document",
                "input": {
                    "path": "C:/Projects/Arunaki/data/rekap_keuangan.xlsx"
                }
            }
        });
        let normalized = normalize_engine_event(&tool_evt, "ses-1").unwrap();
        assert_eq!(normalized["type"], "tool_start");
        assert_eq!(normalized["data"]["callID"], "call-123");
        assert_eq!(normalized["data"]["toolName"], "edit_document");
        assert_eq!(normalized["data"]["preview"], "rekap_keuangan.xlsx");
    }
}

