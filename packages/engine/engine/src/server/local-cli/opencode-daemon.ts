/**
 * OpenCode via its own local server.
 *
 * The hosted Zen lane at opencode.ai/zen answers 403 "only from within OpenCode" without an
 * account session, and Arunaki has no way to obtain one headlessly. The local server needs no
 * credentials at all and serves the same built-ins, including big-pickle, so this is the route
 * that actually works on a fresh machine.
 *
 * Ported from the daemon worker that dc3f251d removed when it moved OpenCode to hosted Zen.
 * The server's health endpoint moved between versions (/api/health -> /global/health), so the
 * check accepts either rather than pinning a version.
 */

import os from "os"
import path from "path"
import fs from "fs"
import crossSpawn from "cross-spawn"

const PORT = 4097
const BASE = `http://127.0.0.1:${PORT}`

/** Empty sandbox so OpenCode never loads repo instructions or touches the user's files. */
export const sandboxDir = (() => {
  const dir = path.join(os.tmpdir(), "arunaki-opencode-sandbox")
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {}
  return dir
})()

let child: any = null
let starting = false

async function ping(): Promise<boolean> {
  for (const path of ["/global/health", "/api/health"]) {
    try {
      const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(800) })
      if (res.ok) return true
    } catch {}
  }
  return false
}

/** Make sure the local server answers, spawning it once if not. */
export async function ensureOpenCodeServer(): Promise<boolean> {
  if (await ping()) return true

  if (starting) {
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 200))
      if (await ping()) return true
    }
    return false
  }

  starting = true
  try {
    // cross-spawn resolves the npm `opencode.cmd` shim on Windows. Spawning "opencode" through
    // PowerShell would pick the .ps1 shim instead and fail with "not a valid Win32 application".
    const proc = crossSpawn("opencode", ["serve", "--port", String(PORT)], {
      cwd: sandboxDir,
      stdio: "ignore",
      windowsHide: true,
    })
    child = proc
    const clear = () => {
      if (child === proc) {
        child = null
        starting = false
      }
    }
    proc.on("close", clear)
    proc.on("error", clear)

    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 200))
      if (await ping()) return true
    }
    return false
  } catch {
    starting = false
    return false
  }
}

export function stopOpenCodeServer(): void {
  try {
    child?.kill()
  } catch {}
  child = null
  starting = false
}

export function flattenPrompt(payload: any): string {
  const parts: string[] = []
  const system = (payload?.messages ?? [])
    .filter((m: any) => m.role === "system" || m.role === "developer")
    .map((m: any) => (typeof m.content === "string" ? m.content : ""))
    .filter(Boolean)
    .join("\n\n")
  if (system) parts.push(`[SYSTEM INSTRUCTION: ${system}]`)

  for (const m of payload?.messages ?? []) {
    if (m.role === "system" || m.role === "developer") continue
    const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "")
    if (!content) continue
    parts.push(`${m.role === "user" ? "User" : "Assistant"}: ${content}`)
  }
  return parts.join("\n\n") || "Hello"
}

export interface OpenCodeSseRes {
  writeHead: (code: number, h: Record<string, string>) => void
  write: (s: string) => void
  end: (chunk?: any) => void
  headersSent?: boolean
}

function fail(res: OpenCodeSseRes, status: number, message: string, type: string): void {
  if (res.headersSent) {
    res.write(`data: ${JSON.stringify({ error: { message, type } })}\n\n`)
    res.write("data: [DONE]\n\n")
    res.end()
    return
  }
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(JSON.stringify({ error: { message, type } }))
}

/**
 * Ask the local server and relay the answer as OpenAI-shaped output.
 *
 * Returns false only when the request never reached the server, so the caller can fall back to
 * another route. Once bytes are on the wire the response is committed here.
 */
export async function streamOpenCodeDaemonCompletion(
  payload: any,
  res: OpenCodeSseRes,
  modelId: string,
): Promise<boolean> {
  if (!(await ensureOpenCodeServer())) {
    fail(
      res,
      503,
      `OpenCode server could not be started on port ${PORT}. Install it with "npm i -g opencode-ai".`,
      "opencode_server_offline",
    )
    return true
  }

  const wantsJson = payload?.stream === false
  const model = payload?.model || modelId || "big-pickle"

  let session: any
  try {
    const res2 = await fetch(`${BASE}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directory: sandboxDir }),
    })
    session = await res2.json()
  } catch (err: any) {
    fail(res, 502, `OpenCode server unreachable: ${err?.message}`, "opencode_server_offline")
    return true
  }
  if (!session?.id) {
    fail(res, 502, "OpenCode server returned no session id", "opencode_server_offline")
    return true
  }

  let msgRes: Response
  try {
    msgRes = await fetch(`${BASE}/session/${session.id}/message?directory=${encodeURIComponent(sandboxDir)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: { providerID: "opencode", modelID: modelId || "big-pickle" },
        parts: [{ type: "text", text: flattenPrompt(payload) }],
      }),
    })
  } catch (err: any) {
    fail(res, 502, `OpenCode request failed: ${err?.message}`, "opencode_request_failed")
    return true
  }

  if (!msgRes.ok) {
    const text = await msgRes.text().catch(() => "")
    fail(res, msgRes.status, `OpenCode server error: ${text.slice(0, 300)}`, "opencode_request_failed")
    return true
  }

  const data = await msgRes.json().catch(() => ({}))
  const text = (data.parts ?? []).filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n")
  const reasoning = (data.parts ?? []).filter((p: any) => p.type === "reasoning").map((p: any) => p.text).join("\n")
  const answer = reasoning ? `<think>\n${reasoning}\n</think>\n\n${text}` : text
  const usage = {
    prompt_tokens: data.info?.tokens?.input ?? 0,
    completion_tokens: data.info?.tokens?.output ?? 0,
    total_tokens: data.info?.tokens?.total ?? 0,
  }

  if (wantsJson) {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(
      JSON.stringify({
        id: `chatcmpl-${Date.now().toString(36)}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, message: { role: "assistant", content: answer }, finish_reason: "stop" }],
        usage,
      }),
    )
    return true
  }

  const id = `chatcmpl-${Date.now().toString(36)}`
  const created = Math.floor(Date.now() / 1000)
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  })
  const chunk = (delta: any, finish: string | null = null) =>
    `data: ${JSON.stringify({
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`

  res.write(chunk({ role: "assistant", content: answer }))
  res.write(chunk({ usage }, "stop"))
  res.write("data: [DONE]\n\n")
  res.end()
  return true
}