/**
 * Kiro (AWS) direct route.
 *
 * Kiro is the only provider here that needs no CLI and no paid subscription, so it is the
 * most valuable one to get right. Two things make it unusual:
 *
 *  1. Sign-in is an OAuth *device* flow, not PKCE. There is no loopback redirect: we register a
 *     throwaway client with AWS SSO OIDC, ask for a device code, and the user approves a URL
 *     that already carries the code. Completion is therefore driven by polling the token
 *     endpoint, not by a callback landing on our port.
 *
 *  2. The response is binary AWS EventStream, not SSE. Framing is length-prefixed with CRC32
 *     checks, so the bytes have to be reassembled before anything can be parsed.
 *
 * Shape follows 9Router: oauth/providers/kiro.js (device flow),
 * translator/request/claude-to-kiro.js (payload) and executors/kiro.js (framing).
 */

import crypto from "crypto"
import type { DiscoveredCredential } from "./harvester.js"
import { chunksToCompletion } from "./upstream.js"

const KIRO_REGION = "us-east-1"
const START_URL = "https://view.awsapps.com/start"
const CLIENT_NAME = "arunaki"

/** Endpoints, in the order 9Router tries them. Kiro deprecated the legacy path-style gateway. */
const BASE_URLS = [
  "https://q.us-east-1.amazonaws.com/generateAssistantResponse",
  "https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse",
  "https://runtime.us-east-1.kiro.dev/generateAssistantResponse",
]

/**
 * Kiro profiles the token is not allowed to guess. builder-id and social each get their own
 * public ARN; an unknown auth method falls back to builder-id.
 */
const DEFAULT_PROFILE_ARNS: Record<string, string> = {
  "builder-id": "arn:aws:codewhisperer:us-east-1:638616132270:profile/AAAACCCCXXXX",
  social: "arn:aws:codewhisperer:us-east-1:699475941385:profile/EHGA3GRVQMUK",
}

const SCOPES = ["codewhisperer:completions", "codewhisperer:analysis", "codewhisperer:conversations"]
const GRANT_TYPES = ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"]
const ISSUER_URL = "https://identitycenter.amazonaws.com/ssoins-722374e8c3c8e6c6"

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Sign-in â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface KiroDeviceStart {
  deviceCode: string
  userCode: string
  verificationUri: string
  /** The user is told to open this; it already has the code filled in. */
  verificationUriComplete: string
  expiresIn: number
  interval: number
  clientId: string
  clientSecret: string
  region: string
}

/**
 * Post JSON to AWS SSO OIDC and return the parsed body whatever the status.
 *
 * The token endpoint reports "still waiting for the user" as HTTP 400, so throwing on !ok here
 * would turn the normal polling state into a failure. Callers decide what a status means.
 */
async function oidcPost(region: string, path: string, body: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`https://oidc.${region}.amazonaws.com${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data: any = null
  try {
    data = JSON.parse(text)
  } catch {
    if (res.ok) throw new Error(`Kiro ${path} returned a non-JSON response`)
  }
  return { ok: res.ok, status: res.status, data }
}

/**
 * Register a throwaway client, then ask for a device code. AWS SSO OIDC answers camelCase.
 */
export async function startKiroDeviceFlow(region = KIRO_REGION): Promise<KiroDeviceStart> {
  const reg = await oidcPost(region, "/client/register", {
    clientName: CLIENT_NAME,
    clientType: "public",
    scopes: SCOPES,
    grantTypes: GRANT_TYPES,
    issuerUrl: ISSUER_URL,
  })
  if (!reg.ok || !reg.data?.clientId || !reg.data?.clientSecret) {
    throw new Error(`Kiro client registration failed (HTTP ${reg.status})`)
  }

  const dev = await oidcPost(region, "/device_authorization", {
    clientId: reg.data.clientId,
    clientSecret: reg.data.clientSecret,
    startUrl: START_URL,
  })
  if (!dev.ok || !dev.data?.deviceCode) {
    throw new Error(`Kiro device authorization failed (HTTP ${dev.status})`)
  }

  return {
    deviceCode: dev.data.deviceCode,
    userCode: dev.data.userCode ?? "",
    verificationUri: dev.data.verificationUri ?? "",
    verificationUriComplete: dev.data.verificationUriComplete ?? dev.data.verificationUri ?? "",
    expiresIn: (dev.data.expiresIn ?? 600) * 1000,
    interval: (dev.data.interval ?? 5) * 1000,
    clientId: reg.data.clientId,
    clientSecret: reg.data.clientSecret,
    region,
  }
}

export interface KiroDeviceStatus {
  done: boolean
  /** True while the user has not approved the code yet. */
  pending: boolean
  error?: string
  credential?: DiscoveredCredential
}

function jwtEmail(token?: string): string | undefined {
  if (!token) return undefined
  try {
    const parts = token.split(".")
    if (parts.length < 2) return undefined
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))
    return payload.email || payload.preferred_username || payload.sub || undefined
  } catch {
    return undefined
  }
}

/**
 * Poll once. Callers loop on the interval until `done`.
 *
 * The client id and secret are not optional here: AWS SSO OIDC issues both per registration
 * and needs them on every refresh, so they travel with the credential.
 */
export async function pollKiroDeviceFlow(start: KiroDeviceStart): Promise<KiroDeviceStatus> {
  const { status, data } = await oidcPost(start.region, "/token", {
    clientId: start.clientId,
    clientSecret: start.clientSecret,
    deviceCode: start.deviceCode,
    grantType: "urn:ietf:params:oauth:grant-type:device_code",
  })

  if (!data?.accessToken) {
    const err = data?.error ?? "authorization_pending"
    if (err === "authorization_pending" || err === "slow_down") return { done: false, pending: true }
    return { done: true, pending: false, error: String(data?.error_description ?? err) }
  }

  return {
    done: true,
    pending: false,
    credential: {
      provider: "kiro",
      displayName: "Kiro (AWS)",
      type: "oauth",
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresIn ? Date.now() + data.expiresIn * 1000 : undefined,
      accountEmail: jwtEmail(data.accessToken),
      region: start.region,
      clientId: start.clientId,
      clientSecret: start.clientSecret,
      profileArn: data.profileArn ?? DEFAULT_PROFILE_ARNS["builder-id"],
      lastRefreshAt: Date.now(),
      // Like the other browser sign-ins, this token only exists in Arunaki's store.
      sourcePath: "",
    },
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Upstream â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function textOf(content: any): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content.map((c: any) => (typeof c === "string" ? c : c?.text ?? "")).join("")
  }
  return content?.text ?? ""
}

export function kiroProfileArn(cred: DiscoveredCredential): string {
  return cred.profileArn || DEFAULT_PROFILE_ARNS["builder-id"]
}

/**
 * Drop the routing prefix. Kiro model ids must reach AWS exactly as AWS names them, so the
 * prefix only ever exists to make routing unambiguous inside Arunaki.
 */
export function stripKiroPrefix(model?: string): string {
  return (model || "").replace(/^kiro\//i, "")
}

export interface KiroRequest {
  url: string
  headers: Record<string, string>
  body: string
}

/**
 * OpenAI chat payload -> Kiro conversationState.
 *
 * Kiro rejects a top-level systemPrompt with 400 REQUEST_BODY_INVALID, so any system text is
 * prefixed onto the first user turn instead.
 *
 * Tool definitions ride on the current user turn, not at the top level, and a user turn that
 * carries only tool results still needs placeholder text: AWS answers 400 on empty content.
 */
export function buildKiroRequest(payload: any, cred: DiscoveredCredential): KiroRequest {
  const model = payload?.model || "claude-sonnet-4.5"
  const messages: any[] = Array.isArray(payload?.messages) ? payload.messages : []
  const system = [
    ...messages.filter((m) => m.role === "system" || m.role === "developer").map((m) => textOf(m.content)),
  ]
    .filter(Boolean)
    .join("\n\n")

  const specs = kiroToolSpecs(payload?.tools)

  /** Every turn in order; the last user turn becomes currentMessage at the end. */
  const turns: any[] = []
  /** Tool results belong to the user turn that follows the assistant's tool calls. */
  let pendingResults: any[] = []
  let leadingSystem = system

  const userTurn = (content: string) => {
    const turn: any = { userInputMessage: { content, modelId: model, origin: "AI_EDITOR" } }
    if (pendingResults.length) {
      turn.userInputMessage.userInputMessageContext = { toolResults: pendingResults }
      pendingResults = []
    }
    turns.push(turn)
    return turn
  }

  for (const m of messages.filter((m) => m.role !== "system" && m.role !== "developer")) {
    if (m.role === "tool") {
      pendingResults.push({
        toolUseId: m.tool_call_id,
        status: m.tool_error ? "error" : "success",
        content: [{ text: textOf(m.content) }],
      })
      continue
    }
    const content = textOf(m.content)
    if (!content && !m.tool_calls?.length) continue

    if (m.role === "user") {
      let text = content
      if (leadingSystem) {
        text = `${leadingSystem}\n\n${content}`
        leadingSystem = ""
      }
      userTurn(text)
    } else if (m.role === "assistant") {
      // A tool result still needs a user turn to hang off, even with no accompanying text.
      if (pendingResults.length) userTurn("Tool results:")
      const toolUses = (m.tool_calls ?? []).map((tc: any) => ({
        toolUseId: tc.id,
        name: tc.function?.name ?? tc.name,
        input: parseArgs(tc.function?.arguments ?? tc.arguments),
      }))
      turns.push({ assistantResponseMessage: { content: content || toolCallText(toolUses), toolUses } })
    }
  }

  // Tool results are the last thing sent when the client has nothing else to add. They still
  // need a turn to live on, otherwise they are silently dropped and Kiro never sees the answer.
  if (pendingResults.length) userTurn("Tool results:")

  // The final user turn is the one Kiro answers; everything before it is history. Turns after it
  // are trailing assistant output with nothing to answer, which Kiro has no place for.
  let currentIndex = -1
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].userInputMessage) {
      currentIndex = i
      break
    }
  }
  let history: any[]
  let current: any
  if (currentIndex === -1) {
    history = turns
    current = userTurn(leadingSystem || "hi")
    history = turns.slice(0, -1)
  } else {
    history = turns.slice(0, currentIndex)
    current = turns[currentIndex]
    if (leadingSystem) current.userInputMessage.content = `${leadingSystem}\n\n${current.userInputMessage.content}`
  }

  if (specs.length) {
    current.userInputMessage.userInputMessageContext ??= {}
    current.userInputMessage.userInputMessageContext.tools = specs
  }

  const body: any = {
    conversationState: {
      chatTriggerType: "MANUAL",
      conversationId: crypto.randomUUID(),
      currentMessage: current,
      history,
    },
    profileArn: kiroProfileArn(cred),
  }
  if (payload?.max_tokens) body.inferenceConfig = { maxTokens: payload.max_tokens }
  if (typeof payload?.temperature === "number") (body.inferenceConfig ??= {}).temperature = payload.temperature

  const region = (cred.region || KIRO_REGION).trim()
  const url = BASE_URLS.map((u) =>
    region && region !== KIRO_REGION ? u.replace(/([a-z]+)\.us-east-1\.amazonaws\.com/, `$1.${region}.amazonaws.com`) : u,
  )[0]

  return {
    url,
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      // Both spellings, because the surfaces disagree: the kiro.dev gateway reads
      // x-amz-sso-bearer while q.* answers "Missing bearer token in the authorization header".
      Authorization: `Bearer ${cred.accessToken}`,
      "x-amz-sso-bearer": cred.accessToken,
      "x-amzn-kiro-agent-mode": "spec",
      "x-amzn-codewhisperer-machine-id": "kiro-desktop",
      "x-amzn-codewhisperer-profile-arn": kiroProfileArn(cred),
    },
    body: JSON.stringify(body),
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Binary EventStream framing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

const decoder = new TextDecoder()

export interface KiroEvent {
  headers: Record<string, unknown>
  payload: any
}

/**
 * Parse one AWS EventStream frame: `[totalLen][headersLen][preludeCrc][headers][payload][crc]`.
 *
 * Both CRCs are verified. A stream that loses a frame in flight would otherwise silently
 * truncate an answer, which is far harder to notice than an explicit failure.
 */
export function parseKiroFrame(data: Uint8Array): KiroEvent {
  if (data.byteLength < 16) throw new Error("Kiro frame is shorter than 16 bytes")
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const totalLength = view.getUint32(0, false)
  const headersLength = view.getUint32(4, false)
  if (totalLength !== data.byteLength) throw new Error("Kiro frame length does not match its prelude")
  if (headersLength > totalLength - 16) throw new Error("Kiro frame header bounds are invalid")
  if (view.getUint32(8, false) !== crc32(data.subarray(0, 8))) throw new Error("Kiro frame prelude CRC mismatch")
  if (view.getUint32(totalLength - 4, false) !== crc32(data.subarray(0, totalLength - 4)))
    throw new Error("Kiro frame message CRC mismatch")

  const headers: Record<string, unknown> = {}
  let offset = 12
  const headerEnd = offset + headersLength
  while (offset < headerEnd) {
    const nameLength = data[offset++]
    const name = decoder.decode(data.subarray(offset, offset + nameLength))
    offset += nameLength
    const type = data[offset++]
    if (type === 0 || type === 1) headers[name] = type === 0
    else if (type === 2 || type === 3 || type === 4) {
      headers[name] = type === 2 ? view.getInt8(offset) : type === 3 ? view.getInt16(offset, false) : view.getInt32(offset, false)
      offset += type === 2 ? 1 : type === 3 ? 2 : 4
    } else if (type === 6 || type === 7) {
      const len = view.getUint16(offset, false)
      offset += 2
      const bytes = data.subarray(offset, offset + len)
      headers[name] = type === 7 ? decoder.decode(bytes) : bytes
      offset += len
    } else if (type === 5 || type === 8 || type === 9) offset += type === 5 || type === 8 ? 8 : 16
    else throw new Error(`Kiro frame header ${name} has unknown type ${type}`)
  }

  const payloadBytes = data.subarray(headerEnd, totalLength - 4)
  let payload: any = null
  if (payloadBytes.byteLength > 0) {
    const text = decoder.decode(payloadBytes)
    if (text.trim()) payload = JSON.parse(text)
  }
  return { headers, payload }
}

/**
 * Pull one completed frame off the buffer, or null when more bytes are needed.
 */
export function takeKiroFrame(buffer: Uint8Array): { frame: KiroEvent; rest: Uint8Array } | null {
  if (buffer.byteLength < 16) return null
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const totalLength = view.getUint32(0, false)
  if (totalLength < 16 || totalLength > 8 * 1024 * 1024) throw new Error("Kiro frame length is out of range")
  if (buffer.byteLength < totalLength) return null
  const frame = parseKiroFrame(buffer.subarray(0, totalLength))
  return { frame, rest: buffer.subarray(totalLength) }
}

function parseArgs(args: any): any {
  if (typeof args !== "string") return args ?? {}
  try {
    return JSON.parse(args)
  } catch {
    // Streaming clients can hand over a partial JSON fragment. Send the fragment as text
    // rather than dropping the call on the floor.
    return { _raw: args }
  }
}

/** Stand-in text for an assistant turn that only made tool calls; Kiro needs some content. */
function toolCallText(toolUses: any[]): string {
  return toolUses.map((t) => `[Tool call: ${t.name}(${JSON.stringify(t.input)})]`).join("\n")
}

/** Kiro only accepts tool names matching `[a-zA-Z0-9_-]`, so anything else is mapped. */
function kiroToolName(raw: string, index: number): string {
  const collapsed = String(raw).replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_")
  return /^[a-zA-Z]/.test(collapsed) ? collapsed : `tool_${index}_${collapsed}`
}

/** OpenAI tool list -> Kiro tool specifications, carried on the current user turn. */
export function kiroToolSpecs(tools: any): any[] {
  if (!Array.isArray(tools)) return []
  const specs: any[] = []
  tools.forEach((tool, i) => {
    const fn = tool?.function ?? tool
    if (!fn?.name) return
    specs.push({
      toolSpecification: {
        name: kiroToolName(fn.name, i),
        description: String(fn.description ?? `Tool: ${fn.name}`).slice(0, 1000),
        inputSchema: { json: fn.parameters ?? fn.input_schema ?? { type: "object", properties: {} } },
      },
    })
  })
  return specs
}

/** Mutable per-request stream state, since OpenAI's chunk shape depends on what preceded it. */
export interface KiroStreamCtx {
  id: string
  created: number
  model: string
  chunkIndex: number
  toolCallIndex: number
  hadToolUse: boolean
  /** toolUseId -> its OpenAI tool_calls index, so fragments of one call share an index. */
  toolIndexes: Map<string, number>
  /** toolUseIds whose identity has already been sent, so only the first chunk carries it. */
  toolNames: Set<string>
  /** Kiro ends the stream without a stop event, so the caller closes the turn itself. */
  sentFinish: boolean
  contextUsage?: number
  creditsUsed?: number
}

export function newKiroStreamCtx(id: string, created: number, model: string): KiroStreamCtx {
  return {
    id,
    created,
    model,
    chunkIndex: 0,
    toolCallIndex: 0,
    hadToolUse: false,
    toolIndexes: new Map(),
    toolNames: new Set(),
    sentFinish: false,
  }
}

/**
 * Kiro sends a tool call's arguments as string fragments while streaming, then the assembled
 * value on the final event. Pass strings through untouched so fragments are not double-encoded;
 * an already-parsed object is re-stringified once the call is complete.
 */
function fragmentArg(input: any): string {
  if (input === undefined || input === null) return ""
  if (typeof input === "string") return input
  return JSON.stringify(input)
}

/** Event type name, which lives in the `:event-type` header rather than the payload. */
export function kiroEventType(frame: KiroEvent): string {
  const h = frame.headers[":event-type"]
  return typeof h === "string" ? h : ""
}

/**
 * One Kiro event -> OpenAI SSE text. Returns null for events with nothing to send.
 *
 * `ctx` is mutable on purpose: OpenAI's stream shape depends on what came before. The first
 * chunk has to carry the assistant role, and each parallel tool call needs its own `index` so
 * a client can tell them apart.
 */
export function kiroEventToSse(frame: KiroEvent, ctx: KiroStreamCtx): string | null {
  const p = frame.payload ?? {}
  const type = kiroEventType(frame)
  const emit = (extra: any) => {
    ctx.chunkIndex++
    return `data: ${JSON.stringify({
      id: ctx.id,
      object: "chat.completion.chunk",
      created: ctx.created,
      model: ctx.model,
      choices: [{ index: 0, ...extra }],
    })}\n\n`
  }
  const chunk = (delta: any, finish: string | null = null) =>
    emit({ delta: ctx.chunkIndex === 0 ? { role: "assistant", ...delta } : delta, finish_reason: finish })

  if (type === "assistantResponseEvent" || p.assistantResponseEvent) {
    const content = p.assistantResponseEvent?.content ?? p.content ?? ""
    return content ? chunk({ content }) : null
  }

  if (type === "toolUseEvent" || p.toolUseEvent) {
    ctx.hadToolUse = true
    const use = p.toolUseEvent ?? p
    const id = String(use.toolUseId ?? `call_${ctx.toolCallIndex}`)
    // Kiro streams one call's arguments across several events under the same toolUseId. Index
    // by id, not by event: counting events would give a parallel second call the index 7 and
    // clients would treat the fragments as seven separate calls.
    let index = ctx.toolIndexes.get(id)
    if (index === undefined) {
      index = ctx.toolCallIndex++
      ctx.toolIndexes.set(id, index)
    }
    const first = !ctx.toolNames.has(id)
    ctx.toolNames.add(id)
    const call: any = { index, function: { arguments: fragmentArg(use.input) } }
    // Only the opening chunk carries identity; the rest are argument fragments, which is the
    // shape OpenAI clients already know how to accumulate.
    if (first) Object.assign(call, { id, type: "function", function: { name: String(use.name ?? "unknown"), arguments: call.function.arguments } })
    return chunk({ tool_calls: [call] })
  }

  if (type === "reasoningContentEvent" || p.reasoningContentEvent) {
    const content = p.reasoningContentEvent?.content ?? p.content ?? ""
    return content ? chunk({ reasoning_content: content }) : null
  }

  if (type === "messageMetadataEvent" || p.messageMetadataEvent) return null

  // Kiro never sends a stop event: the stream simply ends after contextUsageEvent and
  // meteringEvent. finish_reason is still set on stream close, or a client assembling a
  // non-streaming response waits for a terminator that never arrives and returns nothing.
  if (type === "contextUsageEvent" || p.contextUsageEvent) {
    ctx.contextUsage = p.contextUsageEvent?.contextUsagePercentage ?? p.contextUsagePercentage
    return null
  }
  if (type === "meteringEvent" || p.meteringEvent) {
    const m = p.meteringEvent ?? p
    ctx.creditsUsed = m.usage ?? ctx.creditsUsed
    return null
  }

  if (type === "messageStopEvent" || p.messageStopEvent) {
    ctx.sentFinish = true
    return chunk({}, ctx.hadToolUse ? "tool_calls" : "stop")
  }

  if (type === "invalidStateEvent" || p.invalidStateEvent) {
    const reason = p.invalidStateEvent?.reason ?? p.reason ?? "invalid state"
    const msg = p.invalidStateEvent?.message ?? p.message ?? String(reason)
    return `data: ${JSON.stringify({ error: { message: `Kiro rejected the request: ${msg}`, type: "kiro_invalid_state" } })}\n\n`
  }
  if (type === "internalServerException" || p.internalServerException || p.message) {
    const msg = p.internalServerException?.message ?? p.message ?? "unknown error"
    return `data: ${JSON.stringify({ error: { message: `Kiro upstream error: ${msg}`, type: "kiro_upstream_error" } })}\n\n`
  }
  return null
}

/**
 * POST to Kiro and relay the answer as OpenAI SSE.
 *
 * Returns false before anything is written when the request never reached Kiro, so the caller
 * can fall back; once bytes are on the wire the response is committed and we finish it here.
 */
export async function streamKiroCompletion(
  payload: any,
  res: {
    writeHead: (code: number, h: Record<string, string>) => void
    write: (s: string) => void
    end: (chunk?: any) => void
    headersSent?: boolean
  },
  cred: DiscoveredCredential,
): Promise<boolean> {
  const req = buildKiroRequest(payload, cred)
  const id = `chatcmpl-${crypto.randomUUID()}`
  const created = Math.floor(Date.now() / 1000)
  const model = payload?.model || "claude-sonnet-4.5"
  const ctx = newKiroStreamCtx(id, created, model)

  let upstream: Response
  try {
    upstream = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body })
  } catch (err: any) {
    console.warn("[Kiro] request failed:", err?.message)
    return false
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "")
    console.warn(`[Kiro] upstream HTTP ${upstream.status}: ${text.slice(0, 300)}`)
    if (!res.headersSent) {
      res.writeHead(upstream.status === 401 || upstream.status === 403 ? 502 : upstream.status, {
        "Content-Type": "application/json",
      })
      res.end(
        JSON.stringify({
          error: {
            message: `Kiro request failed with HTTP ${upstream.status}. Sign in again if this repeats.`,
            type: "kiro_unavailable",
          },
        }),
      )
    }
    return true
  }

// A client asking for stream:false expects one JSON object, not an SSE body. Every other
  // provider assembles one, and a client fed SSE here sees an empty answer instead of an error.
  const wantsJson = payload?.stream === false
  const buffered: string[] = []

  res.writeHead(200, wantsJson ? { "Content-Type": "application/json" } : {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  })

  const reader = upstream.body!.getReader()
  // Widened deliberately: chunks off the reader and slice() views are ArrayBufferLike, and a
  // narrow Uint8Array<ArrayBuffer> would reject every reassignment.
  let buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0)
  let sent = false
  let failed = false

  const emit = (text: string | null) => {
    if (text === null) return
    if (text.startsWith("data: {") && text.includes('"error"')) failed = true
    else sent = true
    buffered.push(text)
    if (!wantsJson) res.write(text)
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer = concat(buffer, value)

      for (;;) {
        const taken = takeKiroFrame(buffer)
        if (!taken) break
        buffer = taken.rest
        try {
          emit(kiroEventToSse(taken.frame, ctx))
        } catch (err: any) {
          console.warn("[Kiro] frame skipped:", err?.message)
        }
      }
    }
  } catch (err: any) {
    console.warn("[Kiro] stream aborted:", err?.message)
    emit(`data: ${JSON.stringify({ error: { message: `Kiro stream failed: ${err?.message}`, type: "kiro_stream_error" } })}\n\n`)
  }

  if (failed) {
    res.end()
    return true
  }

  // Close the turn ourselves since Kiro sends no stop event.
  if (!ctx.sentFinish) emit(kiroEventToSse({ headers: { ":event-type": "messageStopEvent" }, payload: {} }, ctx))

  if (wantsJson) {
    const completion = chunksToCompletion(buffered, model)
    if (completion?.usage === undefined) {
      completion.usage = {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        ...(ctx.creditsUsed !== undefined ? { kiro_credits: ctx.creditsUsed } : {}),
      }
    }
    res.end(JSON.stringify(completion))
    return true
  }

  res.write("data: [DONE]\n\n")
  res.end()
  return true
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}