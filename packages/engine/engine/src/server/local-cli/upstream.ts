import type http from "http"
import type { DiscoveredCredential } from "./credential-store.js"
import { checkBeforeRequest, refreshWithRetry } from "./refresh.js"
import { openaiToAnthropic, streamAnthropicToOpenAI } from "./translator.js"

// Exact Anthropic-Beta string from 9Router registry/claude.js
export const ANTHROPIC_BETA =
  "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,context-management-2025-06-27,prompt-caching-scope-2026-01-05,advanced-tool-use-2025-11-20,effort-2025-11-24,structured-outputs-2025-12-15,fast-mode-2026-02-01,redact-thinking-2026-02-12,token-efficient-tools-2026-03-28"

export const anthropicUrl = "https://api.anthropic.com/v1/messages?beta=true"

export function buildAnthropicHeaders(cred: DiscoveredCredential): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
    "Anthropic-Beta": ANTHROPIC_BETA,
    "User-Agent": "claude-cli/0.2.14 (external, cli)",
  }
  if (cred.type === "oauth" || cred.accessToken.startsWith("sk-ant-oat")) {
    h.Authorization = `Bearer ${cred.accessToken}`
  } else {
    h["x-api-key"] = cred.accessToken
  }
  return h
}

export interface CodexRequest {
  url: string
  headers: Record<string, string>
  body: string
}

export function buildCodexRequest(openaiPayload: any, cred: DiscoveredCredential): CodexRequest {
  const body = chatToResponses(openaiPayload)
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cred.accessToken}`,
    originator: "codex_cli_rs",
    session_id: cred.accountId || "arunaki",
  }
  if (cred.accountId) {
    headers["ChatGPT-Account-ID"] = cred.accountId
  }
  return {
    url: "https://chatgpt.com/backend-api/codex/responses",
    headers,
    body: JSON.stringify(body),
  }
}

const textOf = (content: any): string => {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content.map((c: any) => (typeof c === "string" ? c : c?.text || "")).join("")
  }
  return content && typeof content.text === "string" ? content.text : ""
}

/** OpenAI chat -> ChatGPT Responses API format */
export function chatToResponses(p: any): any {
  const input: any[] = []
  for (const m of p.messages ?? []) {
    if (m.role === "system" || m.role === "user") {
      input.push({
        type: "message",
        role: m.role,
        content: [{ type: "input_text", text: textOf(m.content) }],
      })
    } else if (m.role === "assistant") {
      if (m.tool_calls?.length) {
        if (textOf(m.content)) {
          input.push({
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: textOf(m.content) }],
          })
        }
        for (const tc of m.tool_calls) {
          input.push({
            type: "function_call",
            call_id: tc.id,
            name: tc.function?.name,
            arguments: tc.function?.arguments ?? "{}",
          })
        }
      } else {
        input.push({
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: textOf(m.content) }],
        })
      }
    } else if (m.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: m.tool_call_id,
        output: textOf(m.content),
      })
    }
  }

  const out: any = {
    model: p.model,
    input,
    // Always stream upstream (9Router request/openai-responses.js) and translate back
    // for non-stream clients — the Responses parser only understands SSE.
    stream: true,
    store: false,
  }
  if (p.temperature != null) out.temperature = p.temperature
  if (p.max_tokens != null) out.max_output_tokens = p.max_tokens
  if (Array.isArray(p.tools) && p.tools.length) {
    out.tools = p.tools.map((t: any) => {
      const f = t.function || t
      return {
        type: "function",
        name: f.name,
        description: f.description,
        parameters: f.parameters,
      }
    })
  }
  if (p.tool_choice) out.tool_choice = p.tool_choice === "auto" ? "auto" : "auto"
  return out
}

const sse = (o: any) => `data: ${JSON.stringify(o)}\n\n`

/** Transform Codex Responses events to OpenAI chat.completion.chunk SSE */
export function mapCodexEventToOpenAI(
  ev: any,
  ctx: { id: string; created: number; model: string },
): string | null {
  if (ev.type === "response.output_text.delta") {
    return sse({
      id: ctx.id,
      object: "chat.completion.chunk",
      created: ctx.created,
      model: ctx.model,
      choices: [{ index: 0, delta: { content: ev.delta }, finish_reason: null }],
    })
  }

  if (ev.type === "response.function_call_arguments.delta") {
    return sse({
      id: ctx.id,
      object: "chat.completion.chunk",
      created: ctx.created,
      model: ctx.model,
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              { index: ev.output_index ?? 0, function: { arguments: ev.delta } },
            ],
          },
          finish_reason: null,
        },
      ],
    })
  }

  // Announce id/name up front (9Router response/openai-responses.js emits
  // output_item.added) — never after the argument deltas.
  if (ev.type === "response.output_item.added" && ev.item?.type === "function_call") {
    return sse({
      id: ctx.id,
      object: "chat.completion.chunk",
      created: ctx.created,
      model: ctx.model,
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: ev.output_index ?? 0,
                id: ev.item.call_id || ev.item.id,
                type: "function",
                function: { name: ev.item.name, arguments: "" },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    })
  }

  if (ev.type === "response.completed") {
    const calls = (ev.response?.output ?? []).filter((o: any) => o.type === "function_call")
    const finish = calls.length ? "tool_calls" : "stop"
    const usage = ev.response?.usage
    const chunk = sse({
      id: ctx.id,
      object: "chat.completion.chunk",
      created: ctx.created,
      model: ctx.model,
      choices: [{ index: 0, delta: {}, finish_reason: finish }],
      usage: usage
        ? {
            prompt_tokens: usage.input_tokens,
            completion_tokens: usage.output_tokens,
            total_tokens: usage.total_tokens,
          }
        : undefined,
    })
    return chunk + "data: [DONE]\n\n"
  }

  return null
}

/** Aggregate translated chat.completion.chunk SSE into a single chat.completion body. */
export function chunksToCompletion(chunks: string[], model: string): any | null {
  let text = ""
  let finish: string | null = null
  let usage: any
  let parsed = 0
  const tools: any[] = []

  for (const c of chunks) {
    for (const line of c.split("\n")) {
      if (!line.startsWith("data: ")) continue
      const raw = line.slice(6).trim()
      if (!raw || raw === "[DONE]") continue
      let o: any
      try {
        o = JSON.parse(raw)
      } catch {
        continue
      }
      if (o.error) return null
      parsed++
      const choice = o.choices?.[0]
      if (choice?.delta?.content) text += choice.delta.content
      for (const tc of choice?.delta?.tool_calls ?? []) {
        const i = tc.index ?? 0
        const t = tools[i] ??= {
          index: i,
          type: "function",
          id: undefined,
          function: { name: undefined, arguments: "" },
        }
        if (tc.id) t.id = tc.id
        if (tc.function?.name) t.function.name = tc.function.name
        if (tc.function?.arguments) t.function.arguments += tc.function.arguments
      }
      if (choice?.finish_reason) finish = choice.finish_reason
      if (o.usage) usage = o.usage
    }
  }

  if (!parsed) return null
  const message: any = { role: "assistant", content: text }
  if (tools.length) {
    if (tools.some((t) => !t.id)) return null
    message.tool_calls = tools
  }
  return {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message, finish_reason: finish || "stop" }],
    ...(usage ? { usage } : {}),
  }
}

/** Collecting stand-in for http.ServerResponse used by non-stream requests. */
function bufferSink(): { chunks: string[]; res: http.ServerResponse } {
  const chunks: string[] = []
  const res = {
    headersSent: true,
    write: (c: string) => {
      chunks.push(String(c))
      return true
    },
    writeHead: () => res,
    end: () => res,
  } as unknown as http.ServerResponse
  return { chunks, res }
}

async function fetchCodex(req: CodexRequest): Promise<Response> {
  return fetch(req.url, {
    method: "POST",
    headers: req.headers,
    body: req.body,
    signal: AbortSignal.timeout(60000),
  })
}

export async function streamDirectCodexCompletion(
  payload: any,
  res: http.ServerResponse,
  cred: DiscoveredCredential,
): Promise<boolean> {
  if (!cred.accessToken) return false

  // 1. Proactive check
  await checkBeforeRequest(cred)

  const wantsStream = payload.stream !== false

  let req = buildCodexRequest(payload, cred)
  let upstreamRes: Response
  try {
    upstreamRes = await fetchCodex(req)
  } catch (err: any) {
    console.warn("[FastPath:Codex] Network error:", err?.message)
    return false
  }

  // 2. Reactive 401/403 refresh + 1 retry
  if ((upstreamRes.status === 401 || upstreamRes.status === 403) && cred.refreshToken) {
    console.info("[FastPath:Codex] 401/403 received, refreshing token...")
    const refreshed = await refreshWithRetry(cred, 2)
    if (refreshed) {
      req = buildCodexRequest(payload, refreshed)
      try {
        upstreamRes = await fetchCodex(req)
      } catch {
        return false
      }
    }
  }

  // Pre-flight check: if response failed and headers not yet sent, fail gracefully to fallback
  if (!upstreamRes.ok || !upstreamRes.body) {
    const errText = await upstreamRes.text().catch(() => "")
    console.warn(`[FastPath:Codex] HTTP ${upstreamRes.status}:`, errText)
    return false
  }

  // Write headers
  if (wantsStream && !res.headersSent) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    })
  }

  const buffered = wantsStream ? { chunks: [] as string[], res } : bufferSink()
  const sink = buffered.res
  const chunks = buffered.chunks

  const ctx = {
    id: `chatcmpl-codex-${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    model: payload.model || "gpt-5.1-codex",
  }

  const reader = upstreamRes.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let failed = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        const raw = line.slice(6).trim()
        if (!raw || raw === "[DONE]") continue
        try {
          const ev = JSON.parse(raw)
          const chunk = mapCodexEventToOpenAI(ev, ctx)
          if (chunk) sink.write(chunk)
        } catch {}
      }
    }
  } catch (err: any) {
    if (wantsStream) {
      if (res.headersSent) {
        res.write(
          `data: ${JSON.stringify({ error: { message: err?.message } })}\n\ndata: [DONE]\n\n`,
        )
        res.end()
      }
      return true
    }
    failed = true
  }

  if (wantsStream) {
    res.end()
    return true
  }
  if (failed) return false

  const body = chunksToCompletion(chunks, ctx.model)
  if (!body) {
    console.warn("[FastPath:Codex] Could not aggregate non-stream response")
    return false
  }
  if (!res.headersSent) res.writeHead(200, { "Content-Type": "application/json" })
  res.end(JSON.stringify(body))
  return true
}

export async function streamDirectAnthropicCompletion(
  payload: any,
  res: http.ServerResponse,
  cred: DiscoveredCredential,
): Promise<boolean> {
  if (!cred.accessToken) return false

  // 1. Proactive check
  await checkBeforeRequest(cred)

  const anthropicBody = openaiToAnthropic(payload)
  if (!anthropicBody) {
    console.warn("[FastPath:Claude] Payload not supported by translator, falling back")
    return false
  }

  let headers = buildAnthropicHeaders(cred)
  let upstreamRes: Response
  try {
    upstreamRes = await fetch(anthropicUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(anthropicBody),
      signal: AbortSignal.timeout(60000),
    })
  } catch (err: any) {
    console.warn("[FastPath:Claude] Network error:", err?.message)
    return false
  }

  // 2. Reactive 401/403 refresh + 1 retry
  if ((upstreamRes.status === 401 || upstreamRes.status === 403) && cred.refreshToken) {
    console.info("[FastPath:Claude] 401/403 received, refreshing token...")
    const refreshed = await refreshWithRetry(cred, 2)
    if (refreshed) {
      headers = buildAnthropicHeaders(refreshed)
      try {
        upstreamRes = await fetch(anthropicUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(anthropicBody),
          signal: AbortSignal.timeout(60000),
        })
      } catch {
        return false
      }
    }
  }

  // Pre-flight check
  if (!upstreamRes.ok || !upstreamRes.body) {
    const errText = await upstreamRes.text().catch(() => "")
    console.warn(`[FastPath:Claude] HTTP ${upstreamRes.status}:`, errText)
    return false
  }

  // Stream translation
  if (payload.stream !== false) {
    return await streamAnthropicToOpenAI(upstreamRes, res, payload)
  }

  // Non-stream client: aggregate the upstream SSE into one JSON body. Nothing has
  // been written to the real response yet, so a failed aggregation still falls back.
  const buffered = bufferSink()
  await streamAnthropicToOpenAI(upstreamRes, buffered.res, payload)
  const body = chunksToCompletion(buffered.chunks, payload.model || "claude-3-5-sonnet")
  if (!body) {
    console.warn("[FastPath:Claude] Could not aggregate non-stream response")
    return false
  }
  if (!res.headersSent) res.writeHead(200, { "Content-Type": "application/json" })
  res.end(JSON.stringify(body))
  return true
}
