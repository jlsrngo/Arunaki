/**
 * Smoke test for every wired provider.
 *
 * Exists because unit tests passed while the engine was not running: three commits were written
 * against a product nobody had started. This is the check that would have caught it.
 *
 * Run against a live server: bun run scripts/smoke-local-cli.ts
 * Exits non-zero when the server is down or any provider fails, so it can gate a commit.
 */
import { readFileSync } from 'node:fs'

const BRIDGE = process.env.ARUNAKI_BRIDGE ?? "http://127.0.0.1:20188/v1/chat/completions"
function resolveHealthUrl(): string {
  if (process.env.ARUNAKI_HEALTH) return process.env.ARUNAKI_HEALTH
  try {
    const infoPath = `${process.env.USERPROFILE ?? process.env.HOME}/.arunaki/engine-info.json`
    const info = JSON.parse(readFileSync(infoPath, "utf8"))
    if (info?.url) return `${info.url}/api/health`
  } catch {}
  return "http://127.0.0.1:4096/api/health"
}

const HEALTH = resolveHealthUrl()

// /api/health is behind the engine's Basic auth along with everything else, so a health check
// without credentials gets a 401 and reports a perfectly healthy engine as unreachable. The
// launcher writes the current credentials here on every start.
const PASSWORD_FILE = process.env.ARUNAKI_PASSWORD_FILE
  ?? `${process.env.USERPROFILE ?? process.env.HOME}/.arunaki/dev-server-password`

function healthHeaders(): Record<string, string> {
  try {
    const [user, password] = readFileSync(PASSWORD_FILE, "utf8").trim().split(":")
    if (user && password) {
      return { Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}` }
    }
  } catch {}
  return {}
}

const tools = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get the current weather in a city",
      parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
    },
  },
]

type Case = { label: string; model: string; want: "answer" | "tool" }

const CASES: Case[] = [
  { label: "Kiro text", model: "kiro/claude-haiku-4.5", want: "answer" },
  { label: "Kiro tool", model: "kiro/claude-haiku-4.5", want: "tool" },
  { label: "OpenCode text", model: "opencode/big-pickle", want: "answer" },
  { label: "OpenCode tool", model: "opencode/big-pickle", want: "tool" },
  { label: "Antigravity text", model: "gemini-3.8-flash-medium", want: "answer" },
  { label: "Antigravity tool", model: "gemini-3.8-flash-medium", want: "tool" },
  { label: "Codex text (free)", model: "gpt-5.6-terra", want: "answer" },
]

const ok = (s: string) => `\x1b[32m${s}\x1b[0m`
const bad = (s: string) => `\x1b[31m${s}\x1b[0m`
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`

async function ping(c: Case): Promise<string> {
  const started = Date.now()
  const res = await fetch(BRIDGE, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer smoke" },
    body: JSON.stringify({
      model: c.model,
      messages: [
        { role: "user", content: c.want === "tool" ? "Weather in Jakarta? You must call get_weather." : "What is 17 times 23? Reply with only the number." },
      ],
      tools: c.want === "tool" ? tools : undefined,
      stream: false,
    }),
    signal: AbortSignal.timeout(120000),
  })
  const j: any = await res.json().catch(() => ({}))
  const ms = Date.now() - started
  if (!res.ok) return bad(`${c.label.padEnd(18)} HTTP ${res.status}  ${String(j?.error?.message ?? "").slice(0, 60)}`)

  const calls = j?.choices?.[0]?.message?.tool_calls ?? []
  const content = String(j?.choices?.[0]?.message?.content ?? "")
  const valid = calls.length > 0 && calls.every((t: any) => t.function?.name && (() => {
    try {
      JSON.parse(t.function.arguments)
      return true
    } catch {
      return false
    }
  })())

  if (c.want === "tool" && !valid) return bad(`${c.label.padEnd(18)} no usable tool call`)
  if (c.want === "answer" && !content.trim()) return bad(`${c.label.padEnd(18)} empty answer`)
  const detail = c.want === "tool" ? `tool ${calls[0].function.name}(${calls[0].function.arguments})` : `"${content.slice(0, 34).replace(/\n/g, " ")}"`
  return ok(`${c.label.padEnd(18)} ${String(ms).padStart(6)}ms  ${detail}`) + dim(`  [${c.model}]`)
}

/**
 * The bridge cases above stop at the bridge. Everything the engine does to a message on its way
 * there lives in the session path and nothing here touched it: catalogue lookup, provider/model
 * resolution, streaming back out. That gap is not hypothetical - Kiro answered every bridge case
 * while the chat path handed an unprefixed stale model id to the bridge, which routes on
 * substrings, fell through to the Claude catch-all and reported "Claude Code is not signed in".
 * All seven checks were green while the product could not send a message.
 *
 * So one case goes the whole way round, and it asserts the provider that actually answered: a
 * bridge request that silently lands on another upstream is the failure this is here to catch.
 */
const CHAT_CASE = { label: "Kiro chat", providerID: "kiro", model: "kiro/auto", want: "391" }

function resolveApiUrl(): string {
  if (process.env.ARUNAKI_API) return process.env.ARUNAKI_API
  try {
    const infoPath = `${process.env.USERPROFILE ?? process.env.HOME}/.arunaki/engine-info.json`
    const info = JSON.parse(readFileSync(infoPath, "utf8"))
    if (info?.url) return `${info.url}/api`
  } catch {}
  return "http://127.0.0.1:4096/api"
}

const API = resolveApiUrl()
const QUERY = process.env.ARUNAKI_SMOKE_DIRECTORY
  ? `?directory=${encodeURIComponent(process.env.ARUNAKI_SMOKE_DIRECTORY)}`
  : ""

async function api(path: string, init: RequestInit = {}) {
  return fetch(`${API}${path}${QUERY}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...healthHeaders(), ...(init.headers ?? {}) },
  })
}

async function chat(c: typeof CHAT_CASE): Promise<string> {
  const started = Date.now()
  const created: any = await (
    await api("/session", {
      method: "POST",
      body: JSON.stringify({ model: { providerID: c.providerID, id: c.model } }),
    })
  ).json()
  const id = created?.data?.id
  if (!id) return bad(`${c.label.padEnd(18)} session not created: ${String(created?.message ?? "").slice(0, 60)}`)

  try {
    const sent: any = await (
      await api(`/session/${id}/prompt`, {
        method: "POST",
        body: JSON.stringify({ prompt: { text: "What is 17 times 23? Reply with only the number." } }),
        signal: AbortSignal.timeout(180000),
      })
    ).json().catch(() => ({}))
    if (sent?.error) return bad(`${c.label.padEnd(18)} prompt rejected: ${String(sent?.message ?? sent.error).slice(0, 60)}`)

    // The reply arrives asynchronously, so wait for the message rather than for a duration.
    let reply: any
    const deadline = Date.now() + 120000
    while (Date.now() < deadline) {
      const listed: any = await (await api(`/session/${id}/message`)).json()
      reply = listed?.data?.find((m: any) => m?.type === "assistant" && m?.content?.length)
      if (reply) break
      await Bun.sleep(1000)
    }
    const ms = Date.now() - started
    if (!reply) return bad(`${c.label.padEnd(18)} no assistant reply within 120s`)

    const text = String(reply.content?.find((p: any) => p.type === "text")?.text ?? "")
    const asked = `${reply.model?.providerID}/${reply.model?.id}`
    if (reply.model?.providerID !== c.providerID || reply.model?.id !== c.model)
      return bad(`${c.label.padEnd(18)} answered by ${asked}, asked ${c.providerID}/${c.model}`)
    if (!text.includes(c.want)) return bad(`${c.label.padEnd(18)} answered "${text.slice(0, 40)}", expected ${c.want}`)
    return ok(`${c.label.padEnd(18)} ${String(ms).padStart(6)}ms  "${text.trim().slice(0, 34)}"`) + dim(`  [${asked}]`)
  } finally {
    await api(`/session/${id}`, { method: "DELETE" }).catch(() => {})
  }
}

async function main() {
  try {
    const health: any = await (await fetch(HEALTH, { headers: healthHeaders(), signal: AbortSignal.timeout(6000) })).json()
    if (!health?.healthy) throw new Error("engine reports unhealthy")
    console.log(ok("engine healthy"))
  } catch (err: any) {
    // This is the failure that cost three commits: unit tests green, product not running.
    console.log(bad(`engine not reachable at ${HEALTH}: ${err?.message ?? err}`))
    process.exit(1)
  }

let failed = 0
  for (const c of CASES) {
    try {
      const line = await ping(c)
      if (line.startsWith("\x1b[31m")) failed++
      console.log(line)
    } catch (err: any) {
      failed++
      console.log(bad(`${c.label.padEnd(18)} threw ${err?.message ?? err}`))
    }
  }

  try {
    const line = await chat(CHAT_CASE)
    if (line.startsWith("\x1b[31m")) failed++
    console.log(line)
  } catch (err: any) {
    failed++
    console.log(bad(`${CHAT_CASE.label.padEnd(18)} threw ${err?.message ?? err}`))
  }

console.log("")
  if (failed) {
    console.log(bad(`${failed} of ${CASES.length + 1} provider checks failed`))
    process.exit(1)
  }
  console.log(ok(`all ${CASES.length + 1} provider checks passed`))
}

await main()