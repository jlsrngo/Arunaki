// Engine API adapter — all requests go through Vite proxy /api → engine :4096

const ENGINE_BASE = "";

// Engine auth is HTTP Basic (engine/src/server/auth.ts). engineFetch did not send credentials at
// all, so enabling the password would have broken every one of its callers.
//
// Mirrors lib/api.ts: in the desktop shell the UI comes off disk and there is no Vite proxy, so the
// base has to be absolute and the credentials have to come from the shell at runtime.
function desktop() {
  return (globalThis as any).arunakiDesktop?.credentials?.();
}

function base(): string {
  if (typeof location !== "undefined" && location.protocol === "file:") {
    return desktop()?.engineUrl ?? "http://127.0.0.1:4096";
  }
  return ENGINE_BASE;
}

function authHeader(): Record<string, string> {
  const creds = desktop();
  const password = creds?.password ?? import.meta.env.VITE_ARUNAKI_SERVER_PASSWORD;
  if (!password) return {};
  const user = creds?.user ?? import.meta.env.VITE_ARUNAKI_SERVER_USER ?? "arunaki";
  return { Authorization: `Basic ${btoa(`${user}:${password}`)}` };
}

export async function engineFetch(path: string, init?: RequestInit) {
  const url = `${base()}${path}`;
  const activeFolder =
    (typeof localStorage !== "undefined" && localStorage.getItem("arunaki_active_folder")) || undefined;
  return fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
      ...(activeFolder ? { "x-arunaki-directory": activeFolder } : {}),
      ...init?.headers,
    },
  });
}

// --- Session (maps to old "chat") ---

export async function createSession(opts?: {
  agent?: string;
  model?: { providerID: string; id: string; variant?: string } | string;
  directory?: string;
}) {
  let modelPayload: { providerID: string; id: string; variant?: string } | undefined;
  if (opts?.model) {
    if (typeof opts.model === "object") {
      let id = opts.model.id;
      if (id && id.includes(",")) {
        id = id.split(",")[0].trim();
      }
      modelPayload = {
        providerID: opts.model.providerID,
        id,
        ...(opts.model.variant ? { variant: opts.model.variant } : {}),
      };
    } else if (typeof opts.model === "string") {
      let clean = opts.model.includes(",") ? opts.model.split(",")[0].trim() : opts.model.trim();
      if (clean.includes("/")) {
        const [providerID, id] = clean.split("/", 2);
        modelPayload = { providerID, id };
      } else {
        const activeProvider =
          (typeof localStorage !== "undefined" && localStorage.getItem("arunaki_active_provider")) || "default";
        modelPayload = { providerID: activeProvider, id: clean };
      }
    }
  }

  const params = new URLSearchParams();
  if (opts?.directory) {
    params.set("directory", opts.directory);
    params.set("location[directory]", opts.directory);
  }
  const queryString = params.toString() ? `?${params.toString()}` : "";
  const requestHeaders = {
    ...(opts?.directory && { "x-arunaki-directory": opts.directory }),
  };
  const requestBody = JSON.stringify({
    ...(opts?.agent && { agent: opts.agent }),
    ...(modelPayload && { model: modelPayload }),
    ...(opts?.directory && { location: { directory: opts.directory } }),
  });

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await engineFetch(`/api/session${queryString}`, {
        method: "POST",
        headers: requestHeaders,
        body: requestBody,
      });
      if (res.ok) {
        const json = await res.json();
        return json.data;
      }
      // Retry transient server reload/restart errors (500, 502, 503, 504)
      if (res.status >= 500 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        continue;
      }
      throw new Error(`createSession failed: ${res.status}`);
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastError || new Error("createSession failed");
}

export async function listSessions(opts?: { project?: string; limit?: number; directory?: string }) {
  const params = new URLSearchParams();
  if (opts?.project) params.set("project", opts.project);
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.directory) params.set("directory", opts.directory);
  const res = await engineFetch(`/api/session?${params}`, {
    headers: {
      ...(opts?.directory && { "x-arunaki-directory": opts.directory }),
    },
  });
  if (!res.ok) throw new Error(`listSessions failed: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function getSession(sessionID: string) {
  const res = await engineFetch(`/api/session/${sessionID}`);
  if (!res.ok) throw new Error(`getSession failed: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function switchSessionModel(sessionID: string, model: { providerID: string; id: string; variant?: string }) {
  let id = model.id;
  if (id && id.includes(",")) {
    id = id.split(",")[0].trim();
  }
  const res = await engineFetch(`/api/session/${sessionID}/model`, {
    method: "POST",
    body: JSON.stringify({
      model: {
        providerID: model.providerID,
        id,
        ...(model.variant ? { variant: model.variant } : {}),
      },
    }),
  });
  return res.ok;
}

export async function getMessages(sessionID: string, opts?: { limit?: number; order?: "asc" | "desc" }) {
  const allMessages: any[] = [];
  let nextCursor: string | undefined = undefined;
  const requestedLimit = opts?.limit;
  const pageLimit = Math.min(requestedLimit || 200, 200);

  do {
    const params = new URLSearchParams();
    if (nextCursor) {
      params.set("cursor", nextCursor);
      params.set("limit", String(pageLimit));
    } else {
      params.set("order", opts?.order ?? "asc");
      params.set("limit", String(pageLimit));
    }
    const res = await engineFetch(`/api/session/${sessionID}/message?${params}`);
    if (!res.ok) throw new Error(`getMessages failed: ${res.status}`);
    const json = await res.json();
    const data = json.data || [];
    allMessages.push(...data);

    if (requestedLimit && allMessages.length >= requestedLimit) {
      break;
    }
    nextCursor = json.cursor?.next;
  } while (nextCursor && allMessages.length < 1000);

  return allMessages;
}

// --- Prompt (send message) ---

export async function sendPrompt(
  sessionID: string,
  content: string,
  opts?: {
    files?: Array<{ name?: string; uri: string; mime?: string; description?: string }>;
    variant?: string;
    signal?: AbortSignal;
    directory?: string;
  }
) {
  const promptPayload: {
    text: string;
    files?: Array<{ name?: string; uri: string; mime?: string; description?: string }>;
  } = {
    text: content,
  };
  if (opts?.files && opts.files.length > 0) {
    promptPayload.files = opts.files;
  }

  const query = opts?.directory ? `?directory=${encodeURIComponent(opts.directory)}` : "";
  const res = await engineFetch(`/api/session/${sessionID}/prompt${query}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts?.directory ? { "x-arunaki-directory": opts.directory } : {}),
    },
    body: JSON.stringify({
      prompt: promptPayload,
      ...(opts?.variant ? { variant: opts.variant } : {}),
    }),
    signal: opts?.signal,
  });
  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`sendPrompt failed: ${res.status} ${errorBody}`);
  }
  const json = await res.json();
  return json.data;
}

// --- SSE event stream with auto-reconnect ---

export function subscribeEvents(
  onEvent: (event: { type: string; data?: any }) => void,
  signal?: AbortSignal,
  directory?: string,
) {
  const controller = new AbortController();
  const finalSignal = signal
    ? (() => {
        const c = new AbortController();
        const onAbort = () => {
          c.abort();
          try {
            controller.abort();
          } catch {}
        };
        if (signal.aborted || controller.signal.aborted) {
          c.abort();
        } else {
          signal.addEventListener("abort", onAbort, { once: true });
          controller.signal.addEventListener("abort", onAbort, { once: true });
        }
        return c.signal;
      })()
    : controller.signal;

  (async () => {
    while (!finalSignal.aborted) {
      let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      const onSignalAbort = () => {
        try {
          activeReader?.cancel().catch(() => {});
        } catch {}
      };
      finalSignal.addEventListener("abort", onSignalAbort, { once: true });

      try {
        const query = directory ? `?directory=${encodeURIComponent(directory)}` : "";
        const res = await fetch(`${base()}/api/event${query}`, {
          headers: {
            Accept: "text/event-stream",
            ...authHeader(),
            ...(directory && { "x-arunaki-directory": directory }),
          },
          signal: finalSignal,
        });
        const reader = res.body?.getReader();
        if (!reader) {
          finalSignal.removeEventListener("abort", onSignalAbort);
          if (!finalSignal.aborted) await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        activeReader = reader;
        const decoder = new TextDecoder();
        let buffer = "";

        while (!finalSignal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // An SSE stream consists of events separated by double newlines (\n\n or \r\n\r\n)
          const messages = buffer.split(/\r?\n\r?\n/);
          // Keep incomplete trailing fragment in buffer
          buffer = messages.pop() || "";

          for (const msg of messages) {
            const lines = msg.split(/\r?\n/);
            let eventData = "";
            let eventType = "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith("data:")) {
                const dataSlice = trimmed.slice(5).trim();
                eventData += (eventData ? "\n" : "") + dataSlice;
              } else if (trimmed.startsWith("event:")) {
                eventType = trimmed.slice(6).trim();
              }
            }

            if (eventData) {
              try {
                const parsed = JSON.parse(eventData);
                if (eventType && !parsed.type) parsed.type = eventType;
                // Avoid flooding devtools console with hundreds of token deltas per second
                if (parsed.type !== "text_delta" && parsed.type !== "reasoning_delta") {
                  console.log("[SSE-EVENT-RCVD]", parsed.type, parsed.data?.sessionID || parsed.sessionID);
                }
                onEvent(parsed);
              } catch {
                // Fallback for single data line parse
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (trimmed.startsWith("data:")) {
                    try {
                      const single = JSON.parse(trimmed.slice(5).trim());
                      onEvent(single);
                    } catch {}
                  }
                }
              }
            }
          }
        }
      } catch {
        // SSE connection dropped, canceled, or fetch failed
      } finally {
        finalSignal.removeEventListener("abort", onSignalAbort);
        try {
          activeReader?.cancel().catch(() => {});
        } catch {}
      }

      // If disconnected due to network drop and not explicitly aborted, wait and retry
      if (!finalSignal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  })();

  return controller;
}

// --- Event mapping: engine events → old frontend format ---

const toolCallNameMap = new Map<string, string>();

export function mapEngineEvent(
  event: { type: string; data?: any; sessionID?: string; [key: string]: any },
  currentSessionID: string,
): { type: string; data?: any } | null {
  const payload = event.data || event.properties || event;
  const sessionID = payload.sessionID || event.sessionID;
  if (sessionID && sessionID !== currentSessionID) return null;

  const normalizedType = event.type ? event.type.replace(/\.\d+$/, "") : "";

  switch (normalizedType || event.type) {
    case "session.next.prompt.admitted":
    case "session.next.prompted":
    case "session.prompted":
      return { type: "thinking", data: "Analyzing request & documents..." };
    case "session.next.text.delta":
      return { type: "text_delta", data: payload.delta || event.delta };
    case "session.next.text.ended":
      return { type: "text_end", data: payload.text };
    case "session.next.reasoning.started":
      return { type: "thinking", data: "Thinking..." };
    case "session.next.reasoning.delta":
      return { type: "reasoning_delta", data: payload.delta || event.delta };
    case "session.next.reasoning.ended":
      return { type: "reasoning_end", data: payload.text };
    case "session.next.step.started":
      return { type: "thinking", data: "Processing..." };
    case "session.next.step.ended": {
      const finish = payload.finish || event.finish;
      // If the model finished the step with tool-calls, continuation step will follow
      if (finish === "tool-calls") {
        return { type: "step_continuation", data: payload };
      }
      return { type: "done", data: payload };
    }
    case "session.next.tool.input.started": {
      const callID = payload.callID || event.callID || payload.id || event.id;
      const toolName = payload.name || event.name || "action";
      if (callID) toolCallNameMap.set(callID, toolName);
      return {
        type: "tool_preparing",
        data: {
          callID,
          toolName,
          preview: `Preparing ${toolName}...`,
        },
      };
    }
    case "question.asked": {
      return {
        type: "question_asked",
        data: {
          id: payload.id || event.id,
          sessionID: payload.sessionID || sessionID,
          questions: payload.questions || [],
          tool: payload.tool,
        },
      };
    }
    case "session.next.tool.called": {
      const callID = payload.callID || event.callID || payload.id || event.id;
      const toolName = payload.tool || event.tool || (callID ? toolCallNameMap.get(callID) : undefined) || "action";
      if (callID) toolCallNameMap.set(callID, toolName);
      const input = payload.input || event.input || {};

      if (toolName === "question" && Array.isArray(input.questions)) {
        return {
          type: "question_asked",
          data: {
            id: callID,
            sessionID,
            questions: input.questions,
          },
        };
      }

      const target =
        input.path ||
        input.TargetFile ||
        input.filePath ||
        input.targetFile ||
        input.pattern ||
        (typeof input.command === "string" ? input.command.slice(0, 40) : undefined);
      const filePreview = target && typeof target === "string" ? target.split(/[/\\]/).pop() : undefined;
      return {
        type: "tool_start",
        data: {
          callID,
          toolName,
          args: input,
          preview: filePreview || (typeof target === "string" ? target : undefined),
        },
      };
    }
    case "question.v2.asked": {
      return {
        type: "question_asked",
        data: payload,
      };
    }
    case "question.v2.replied":
    case "question.v2.rejected": {
      return {
        type: "question_settled",
        data: payload,
      };
    }
    case "session.next.tool.progress": {
      const callID = payload.callID || event.callID || payload.id || event.id;
      const toolName = payload.tool || event.tool || (callID ? toolCallNameMap.get(callID) : undefined) || "action";
      return {
        type: "tool_progress",
        data: {
          callID,
          toolName,
          preview: `Executing ${toolName}...`,
        },
      };
    }
    case "session.next.tool.success": {
      const callID = payload.callID || event.callID || payload.id || event.id;
      const toolName = payload.tool || event.tool || (callID ? toolCallNameMap.get(callID) : undefined) || "action";
      if (callID) toolCallNameMap.delete(callID);
      return {
        type: "tool_live_status",
        data: {
          callID,
          toolName,
          status: "completed",
          preview: `Completed ${toolName}`,
        },
      };
    }
    case "session.next.tool.failed": {
      const callID = payload.callID || event.callID || payload.id || event.id;
      const toolName = payload.tool || event.tool || (callID ? toolCallNameMap.get(callID) : undefined) || "action";
      if (callID) toolCallNameMap.delete(callID);
      return {
        type: "tool_live_status",
        data: {
          callID,
          toolName,
          status: "failed",
          preview: `Failed ${toolName}`,
        },
      };
    }
    case "session.next.step.failed":
      return {
        type: "error",
        data: {
          message: payload.error?.message || event.error?.message || "An error occurred while processing your request.",
        },
      };
    case "session.status": {
      const statusType = payload.status?.type;
      if (statusType === "busy") {
        return { type: "session_busy", data: payload };
      } else if (statusType === "idle") {
        return { type: "done", data: payload };
      }
      return null;
    }
    case "session.idle":
      return { type: "done", data: payload };
    default:
      return null;
  }
}

// --- Provider (maps to old "providers") ---

export async function listProviders() {
  const res = await engineFetch("/api/provider");
  if (!res.ok) throw new Error(`listProviders failed: ${res.status}`);
  const json = await res.json();
  return json.data;
}

// --- Agent ---

export async function listAgents() {
  const res = await engineFetch("/api/agent");
  if (!res.ok) throw new Error(`listAgents failed: ${res.status}`);
  const json = await res.json();
  return json.data;
}

// --- Model ---

export async function listModels() {
  const res = await engineFetch("/api/model");
  if (!res.ok) throw new Error(`listModels failed: ${res.status}`);
  const json = await res.json();
  return json.data;
}

// --- Question API ---

export async function fetchSessionQuestions(sessionId: string) {
  try {
    const res = await engineFetch(`/api/session/${sessionId}/question`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

export async function replySessionQuestion(
  sessionId: string,
  requestId: string,
  answers: string[][]
): Promise<boolean> {
  try {
    let targetQueId = requestId.startsWith("que_") ? requestId : "";

    // If not a valid que_ ID, query active pending questions for the session
    if (!targetQueId) {
      const pending = await fetchSessionQuestions(sessionId);
      const match =
        pending.find((p: any) => p.id === requestId || p.tool?.callID === requestId) ||
        pending[0];
      if (match?.id) {
        targetQueId = match.id;
      }
    }

    if (!targetQueId) {
      console.warn("[replySessionQuestion] No matching question found for session:", sessionId, requestId);
      return false;
    }

    const res = await engineFetch(`/api/session/${sessionId}/question/${targetQueId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });

    if (res.ok) return true;

    // Fallback if targetQueId failed (e.g. stale): refetch pending and retry with first pending
    const retryPending = await fetchSessionQuestions(sessionId);
    const retryMatch = retryPending.find((p: any) => p.id !== targetQueId) || retryPending[0];
    if (retryMatch?.id) {
      const retryRes = await engineFetch(`/api/session/${sessionId}/question/${retryMatch.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      return retryRes.ok;
    }

    return false;
  } catch (err) {
    console.error("[replySessionQuestion] Failed:", err);
    return false;
  }
}

export async function isSessionActive(sessionId: string): Promise<boolean> {
  try {
    const res = await engineFetch("/api/session/active");
    if (!res.ok) return false;
    const json = await res.json();
    const data = json.data || {};
    return Boolean(data[sessionId]);
  } catch {
    return false;
  }
}

export async function interruptSession(sessionId: string): Promise<boolean> {
  try {
    const res = await engineFetch(`/api/session/${sessionId}/interrupt`, {
      method: "POST",
    });
    return res.ok;
  } catch {
    return false;
  }
}

