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
  // 9Router request/openai-responses.js hoists system/developer into `instructions`
  const systemParts: string[] = []
  for (const m of p.messages ?? []) {
    if (m.role === "system" || m.role === "developer") {
      const text = textOf(m.content)
      if (text) systemParts.push(text)
      continue
    }
    if (m.role === "user") {
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
  if (systemParts.length) out.instructions = systemParts.join("\n\n")
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

// --- OpenCode Zen (9Router open-sse/executors/opencode.js) ---------------------

const OPENCODE_BASE = "https://opencode.ai"
const OPENCODE_UA = "opencode/1.18.31"
// Free tier rejects requests without this exact quartet (403 FreeTierError).
const OPENCODE_FINGERPRINT_TOOLS = ["bash", "glob", "grep", "read"]
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

/** 9Router: quota is accounted per upstream session, and re-minting one per request
 *  burns it (429), so derive one stable id per conversation instead. */
const opencodeSessions = new Map<string, string>()

function fnv(seed: string, salt: number): number {
  let h = salt >>> 0
  for (const b of new TextEncoder().encode(seed)) h = Math.imul(h ^ b, 0x01000193) >>> 0
  return h >>> 0
}

function mintId(prefix: "ses" | "msg", seed: string): string {
  const h1 = fnv(seed, 0x811c9dc5)
  const h2 = fnv(seed, 0x85ebca6b)
  const hex = (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 12)
  let rand = ""
  for (let i = 0; i < 14; i++) rand += BASE62[(h1 >>> (i * 2)) % 62]
  return `${prefix}_${hex}${rand}`
}

export function opencodeSessionId(payload: any): string {
  const first = (payload?.messages ?? []).find((m: any) => m.role === "user")
  const seed = typeof first?.content === "string" ? first.content : JSON.stringify(first?.content ?? "")
  const existing = opencodeSessions.get(seed)
  if (existing) return existing
  const id = mintId("ses", seed || "arunaki")
  opencodeSessions.set(seed, id)
  if (opencodeSessions.size > 500) {
    const oldest = opencodeSessions.keys().next().value
    if (oldest !== undefined) opencodeSessions.delete(oldest)
  }
  return id
}

function mintRequestId(sessionId: string, payload: any): string {
  const last = (payload?.messages ?? []).filter((m: any) => m.role === "user").pop()
  const tail = typeof last?.content === "string" ? last.content : JSON.stringify(last?.content ?? "")
  return mintId("msg", `${sessionId}:${tail}`)
}

export function opencodeUrlFor(): string {
  // 9Router routes Responses/Messages-only models elsewhere; we expose the chat lane
  // (big-pickle and friends) and let anything else fall through.
  return `${OPENCODE_BASE}/zen/v1/chat/completions`
}

/** `accountToken` = the user's OpenCode account session from auth.json. Without it the
 *  free lane answers 403 "only from within OpenCode" — same as 9Router's pooled lane. */
export function buildOpenCodeHeaders(payload: any, accountToken?: string): Record<string, string> {
  const session = opencodeSessionId(payload)
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accountToken || "public"}`,
    "User-Agent": OPENCODE_UA,
    "x-opencode-client": "desktop",
    "x-opencode-session": session,
    "x-opencode-request": mintRequestId(session, payload),
    "x-opencode-project": "global",
    Accept: "text/event-stream",
  }
}

/** 9Router applyFingerprintTools: append the missing quartet and default tool_choice. */
export function applyOpenCodeFingerprint(body: any): void {
  if (!body || typeof body !== "object") return
  const hadClientTools = Array.isArray(body.tools) && body.tools.length > 0
  const list = Array.isArray(body.tools) ? body.tools.slice() : []
  const present = new Set(
    list.map((t: any) => String(t?.function?.name ?? t?.name ?? "").trim().toLowerCase()),
  )
  for (const name of OPENCODE_FINGERPRINT_TOOLS) {
    if (present.has(name)) continue
    list.push({
      type: "function",
      function: {
        name,
        description: "This tool is currently unavailable and must not be used.",
        parameters: { type: "object", properties: {} },
      },
    })
  }
  body.tools = list
  if (!body.tool_choice) body.tool_choice = hadClientTools ? undefined : "none"
}

export async function streamDirectOpenCodeCompletion(
  payload: any,
  res: http.ServerResponse,
  accountToken?: string,
): Promise<boolean> {
  const model = String(payload.model || "big-pickle").replace(/^opencode\//, "")
  const body: any = { ...payload, model, stream: true }
  delete body.stream_options
  applyOpenCodeFingerprint(body)

  let upstreamRes: Response
  try {
    upstreamRes = await fetch(opencodeUrlFor(), {
      method: "POST",
      headers: buildOpenCodeHeaders(payload, accountToken),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    })
  } catch (err: any) {
    console.warn("[FastPath:OpenCode] Network error:", err?.message)
    return false
  }

  // Pre-flight: fall back before any byte reaches the client.
  if (!upstreamRes.ok || !upstreamRes.body) {
    const errText = await upstreamRes.text().catch(() => "")
    console.warn(`[FastPath:OpenCode] HTTP ${upstreamRes.status}:`, errText.slice(0, 300))
    return false
  }

  const wantsStream = payload.stream !== false
  const buffered = wantsStream ? { chunks: [] as string[], res } : bufferSink()
  const sink = buffered.res
  const chunks = buffered.chunks

  if (wantsStream && !res.headersSent) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    })
  }

  const reader = upstreamRes.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""
      for (const line of lines) {
        // Forward verbatim: upstream already speaks OpenAI chat.completion chunks, so
        // [DONE] and error frames must survive untouched.
        if (line.trim()) sink.write(`${line}\n\n`)
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
    return false
  }

  if (wantsStream) {
    res.end()
    return true
  }

  const completion = chunksToCompletion(chunks, model)
  if (!completion) {
    console.warn("[FastPath:OpenCode] Could not aggregate non-stream response")
    return false
  }
  if (!res.headersSent) res.writeHead(200, { "Content-Type": "application/json" })
  res.end(JSON.stringify(completion))
  return true
}

// --- Antigravity / Google Cloud Code (9Router antigravity.js + projectId.js) ---

// Ide fingerprint is intentionally static (mirrors the IDE client, not the host OS).
const ANTIGRAVITY_IDE_UA = "antigravity/ide/2.11.0 darwin/arm64"
const ANTIGRAVITY_BASE = "https://daily-cloudcode-pa.googleapis.com"
// Project discovery stays on PROD: the daily host rejects auth/onboarding calls.
const CLOUD_CODE_PROD = "https://cloudcode-pa.googleapis.com"
const LOAD_CODE_ASSIST_METADATA = { ideType: 9, platform: 5, pluginType: 2 }
const MAX_ANTIGRAVITY_OUTPUT_TOKENS = 65536

export interface AntigravityAuth {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  projectId?: string
}

export function antigravityUrl(stream: boolean): string {
  const action = stream ? "streamGenerateContent?alt=sse" : "generateContent"
  return `${ANTIGRAVITY_BASE}/v1internal:${action}`
}

/** Real Antigravity resolves a real project bound to the account; random ids get the
 *  account flagged by Google's anti-abuse systems (9Router services/projectId.js). */
const projectIdCache = new Map<string, { projectId: string; fetchedAt: number }>()
const PROJECT_CACHE_TTL_MS = 60 * 60 * 1000

export async function resolveAntigravityProjectId(accessToken: string): Promise<string | null> {
  const cached = projectIdCache.get(accessToken.slice(-24))
  if (cached && Date.now() - cached.fetchedAt < PROJECT_CACHE_TTL_MS) return cached.projectId

  const res = await fetch(`${CLOUD_CODE_PROD}/v1internal:loadCodeAssist`, {
    method: "POST",
    // Deliberately no X-Goog-Api-Client / Client-Metadata: Google's backend
    // fingerprints them and silently refuses to provision a project.
    headers: {
      "Content-Type": "application/json",
      "User-Agent": ANTIGRAVITY_IDE_UA,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ metadata: LOAD_CODE_ASSIST_METADATA }),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    console.warn("[Antigravity] loadCodeAssist failed:", res.status)
    return null
  }
  const data: any = await res.json()
  const raw = data?.cloudaicompanionProject
  const projectId = typeof raw === "string" ? raw.trim() : typeof raw?.id === "string" ? raw.id.trim() : ""
  if (!projectId) return null
  projectIdCache.set(accessToken.slice(-24), { projectId, fetchedAt: Date.now() })
  return projectId
}

/** OpenAI chat -> Gemini/Antigravity `contents` + `parts`. */
export function chatToAntigravityContents(payload: any): any[] {
  const contents: any[] = []
  // Gemini matches functionResponse by name, not by id, so remember what each
  // assistant turn asked for.
  const toolNamesById = new Map<string, string>()

  for (const m of payload.messages ?? []) {
    if (m.role === "system" || m.role === "developer") continue
    const role = m.role === "assistant" ? "model" : "user"
    const parts: any[] = []

    if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (part.type === "text" && part.text) parts.push({ text: part.text })
        else if (part.type === "image_url" && part.image_url?.url?.startsWith("data:")) {
          const [header, data] = part.image_url.url.split(",")
          parts.push({
            inlineData: { mimeType: header.replace("data:", "").replace(";base64", ""), data },
          })
        }
      }
    } else if (typeof m.content === "string" && m.content) {
      parts.push({ text: m.content })
    }

    if (Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        let args: any = {}
        try {
          args = typeof tc.function?.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function?.arguments || {}
        } catch {
          args = {}
        }
        if (tc.id && tc.function?.name) toolNamesById.set(tc.id, tc.function.name)
        parts.push({ functionCall: { name: tc.function?.name, args, id: tc.id } })
      }
    }

    if (m.role === "tool") {
      const name = m.name ?? toolNamesById.get(m.tool_call_id) ?? "tool"
      parts.length = 0
      parts.push({
        functionResponse: {
          name,
          response: { content: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "") },
        },
      })
    }

    if (parts.length) contents.push({ role, parts })
  }

  // Gemini rejects empty turns and requires strict alternation on functionResponse.
  const merged: any[] = []
  for (const c of contents) {
    const prev = merged[merged.length - 1]
    if (prev && prev.role === c.role) prev.parts.push(...c.parts)
    else merged.push({ role: c.role, parts: c.parts })
  }
  return merged
}

export function chatToAntigravityTools(payload: any): any[] | undefined {
  if (!Array.isArray(payload.tools) || payload.tools.length === 0) return undefined
  const seen = new Set<string>()
  const declarations: any[] = []
  for (const t of payload.tools) {
    const fn = t.function || t
    const name = String(fn.name ?? "").trim().replace(/[^A-Za-z0-9_.-]/g, "_")
    if (!name || seen.has(name)) continue
    seen.add(name)
    declarations.push({
      name,
      description: fn.description || "",
      parameters: fn.parameters || {
        type: "object",
        properties: { reason: { type: "string", description: "Brief explanation" } },
        required: ["reason"],
      },
    })
  }
  return declarations.length ? [{ functionDeclarations: declarations }] : undefined
}

export function buildAntigravityBody(
  payload: any,
  projectId: string,
  sessionId: string,
  stream: boolean,
): any {
  const contents = chatToAntigravityContents(payload)
  if (!contents.length) return null

  const systemParts: string[] = []
  for (const m of payload.messages ?? []) {
    if (m.role !== "system" && m.role !== "developer") continue
    const t = textOf(m.content)
    if (t) systemParts.push(t)
  }

  const tools = chatToAntigravityTools(payload)
  const maxOut = Math.min(
    payload.max_tokens ?? payload.max_completion_tokens ?? MAX_ANTIGRAVITY_OUTPUT_TOKENS,
    MAX_ANTIGRAVITY_OUTPUT_TOKENS,
  )

  const request: any = {
    contents,
    generationConfig: {
      temperature: payload.temperature ?? undefined,
      topP: payload.top_p ?? undefined,
      maxOutputTokens: maxOut,
    },
    sessionId,
  }
  if (systemParts.length) request.systemInstruction = { parts: [{ text: systemParts.join("\n\n") }] }
  if (tools) {
    request.tools = tools
    request.toolConfig = { functionCallingConfig: { mode: "VALIDATED" } }
  }

  return {
    project: projectId,
    model: String(payload.model || "gemini-3.8-flash"),
    userAgent: "antigravity",
    requestId: `req-${sessionId}`,
    request,
  }
}

/** Gemini SSE chunk -> OpenAI chat.completion.chunk. */
export function mapAntigravityEvent(ev: any, ctx: { id: string; created: number; model: string }): string | null {
  const parts = ev?.candidates?.[0]?.content?.parts ?? []
  const out: string[] = []
  for (const p of parts) {
    if (typeof p.text === "string" && p.text) {
      out.push(
        sse({
          id: ctx.id,
          object: "chat.completion.chunk",
          created: ctx.created,
          model: ctx.model,
          choices: [{ index: 0, delta: { content: p.text }, finish_reason: null }],
        }),
      )
    }
    if (p.functionCall) {
      out.push(
        sse({
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
                    index: (ev.candidates?.[0]?.content?.parts ?? []).indexOf(p),
                    id: p.functionCall.id ?? `call_${Math.random().toString(36).slice(2, 12)}`,
                    type: "function",
                    function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args ?? {}) },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        }),
      )
    }
  }
  if (ev?.usageMetadata) {
    out.push(
      sse({
        id: ctx.id,
        object: "chat.completion.chunk",
        created: ctx.created,
        model: ctx.model,
        choices: [{ index: 0, delta: {}, finish_reason: null }],
        usage: {
          prompt_tokens: ev.usageMetadata.promptTokenCount ?? 0,
          completion_tokens: ev.usageMetadata.candidatesTokenCount ?? 0,
          total_tokens: ev.usageMetadata.totalTokenCount ?? 0,
        },
      }),
    )
  }
  return out.length ? out.join("") : null
}

export async function streamDirectAntigravityCompletion(
  payload: any,
  res: http.ServerResponse,
  auth: AntigravityAuth | null,
): Promise<boolean> {
  if (!auth?.accessToken) return false

  const projectId = auth.projectId || (await resolveAntigravityProjectId(auth.accessToken))
  if (!projectId) {
    console.warn("[FastPath:Antigravity] Could not resolve a project id, falling back")
    return false
  }

  const sessionId = opencodeSessionId(payload)
  // Sending requestType:"agent" makes Google bucket the request into a
  // detail-free 429, so the agent path must omit it (9Router antigravity.js).
  const body = buildAntigravityBody(payload, projectId, sessionId, true)
  if (!body) return false

  let upstreamRes: Response
  try {
    upstreamRes = await fetch(antigravityUrl(true), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.accessToken}`,
        "User-Agent": ANTIGRAVITY_IDE_UA,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    })
  } catch (err: any) {
    console.warn("[FastPath:Antigravity] Network error:", err?.message)
    return false
  }

  if (!upstreamRes.ok || !upstreamRes.body) {
    const errText = await upstreamRes.text().catch(() => "")
    console.warn(`[FastPath:Antigravity] HTTP ${upstreamRes.status}:`, errText.slice(0, 300))
    return false
  }

  const wantsStream = payload.stream !== false
  const buffered = wantsStream ? { chunks: [] as string[], res } : bufferSink()
  const sink = buffered.res
  const chunks = buffered.chunks

  if (wantsStream && !res.headersSent) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    })
  }

  const ctx = {
    id: `chatcmpl-antigravity-${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    model: payload.model || "gemini-3.8-flash",
  }

  const reader = upstreamRes.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

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
          const chunk = mapAntigravityEvent(JSON.parse(raw), ctx)
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
    return false
  }

  const tail = `${sse({
    id: ctx.id,
    object: "chat.completion.chunk",
    created: ctx.created,
    model: ctx.model,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  })}data: [DONE]\n\n`
  sink.write(tail)

  if (wantsStream) {
    res.end()
    return true
  }

  const completion = chunksToCompletion(chunks, ctx.model)
  if (!completion) {
    console.warn("[FastPath:Antigravity] Could not aggregate non-stream response")
    return false
  }
  if (!res.headersSent) res.writeHead(200, { "Content-Type": "application/json" })
  res.end(JSON.stringify(completion))
  return true
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
