import http from "node:http"
import os from "node:os"
import path from "node:path"
import {
  checkClaudeStatus,
  resolveAgyCommand,
  getOpenCodeGroqKey,
  getOpenCodeAccountToken,
  getAntigravityAuth,
} from "./detector"
import { readCodexCredential, readClaudeCredential, readKiroCredential } from "./harvester.js"
import {
  streamDirectCodexCompletion,
  streamDirectAnthropicCompletion,
  streamDirectOpenCodeCompletion,
  streamDirectAntigravityCompletion,
} from "./upstream.js"
import { streamKiroCompletion, stripKiroPrefix } from "./kiro.js"
import { scheduleBackgroundRefresh, stopBackgroundRefresh } from "./refresh.js"

export const LOCAL_BRIDGE_PORT = 20188


class LocalCliBridge {
  private server: http.Server | null = null
  private isRunning = false

  public get running(): boolean {
    return this.isRunning
  }

  public get port(): number {
    return LOCAL_BRIDGE_PORT
  }

  // Tools travel as native function calling on every lane. A former directive told models to
  // fake a tool call inside a fenced block; nothing parsed that, so a compliant model just
  // showed raw JSON to the user. The directive is gone, not merely unused.
  public start(): Promise<boolean> {
    if (this.isRunning) return Promise.resolve(true)

    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        const parsedUrl = new URL(req.url ?? "/", `http://${req.headers.host || "127.0.0.1"}`)

        // Set CORS headers
        res.setHeader("Access-Control-Allow-Origin", "*")
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

        if (req.method === "OPTIONS") {
          res.writeHead(204)
          res.end()
          return
        }

        if (req.method === "GET" && (parsedUrl.pathname === "/health" || parsedUrl.pathname === "/ping")) {
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ status: "ok", bridge: "running", port: LOCAL_BRIDGE_PORT }))
          return
        }

        if (req.method === "GET" && (parsedUrl.pathname === "/v1/models" || parsedUrl.pathname === "/models")) {
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(
            JSON.stringify({
              object: "list",
              data: [
                { id: "gemini-3.8-flash", object: "model", owned_by: "antigravity-cli" },
                { id: "gemini-3.1-pro", object: "model", owned_by: "antigravity-cli" },
                { id: "gemini-3.7-flash", object: "model", owned_by: "antigravity-cli" },
                { id: "claude-sonnet-5-5", object: "model", owned_by: "antigravity-cli" },
                { id: "gemini-2.5-flash", object: "model", owned_by: "antigravity-cli" },
                { id: "gemini-2.5-pro", object: "model", owned_by: "antigravity-cli" },
                { id: "claude-3-7-sonnet", object: "model", owned_by: "claude-cli" },
                { id: "claude-3-5-sonnet", object: "model", owned_by: "claude-cli" },
                { id: "claude-3-5-haiku", object: "model", owned_by: "claude-cli" },
                { id: "groq/openai/gpt-oss-120b", object: "model", owned_by: "opencode" },
                { id: "openai/gpt-oss-120b", object: "model", owned_by: "opencode" },
                { id: "groq/qwen/qwen3.8-27b", object: "model", owned_by: "opencode" },
                { id: "qwen/qwen3.8-27b", object: "model", owned_by: "opencode" },
                { id: "groq/openai/gpt-oss-20b", object: "model", owned_by: "opencode" },
                { id: "openai/gpt-oss-20b", object: "model", owned_by: "opencode" },
                { id: "opencode/big-pickle", object: "model", owned_by: "opencode" },
                { id: "big-pickle", object: "model", owned_by: "opencode" },
                { id: "9router/ComboMaut", object: "model", owned_by: "9router" },
              ],
            }),
          )
          return
        }

        if (
          req.method === "POST" &&
          (parsedUrl.pathname === "/v1/chat/completions" || parsedUrl.pathname === "/chat/completions")
        ) {
          let body = ""
          req.on("data", (chunk: Buffer) => {
            body += chunk.toString()
          })

          req.on("end", async () => {
            try {
              const payload = JSON.parse(body || "{}")
              await this.handleChatCompletion(payload, res)
            } catch (err: any) {
              res.writeHead(400, { "Content-Type": "application/json" })
              res.end(JSON.stringify({ error: { message: err?.message ?? "Invalid JSON" } }))
            }
          })
          return
        }

        res.writeHead(404, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: { message: "Not found" } }))
      })

      this.server.on("error", (err: any) => {
        if (err.code === "EADDRINUSE") {
          // Port already in use (possibly from another Arunaki worker), treat as running
          this.isRunning = true
          resolve(true)
        } else {
          this.isRunning = false
          resolve(false)
        }
      })

      this.server.listen(LOCAL_BRIDGE_PORT, "127.0.0.1", () => {
        this.isRunning = true
        // Deliberately NOT pre-warming the agy chat worker. All Antigravity traffic goes
        // direct to Cloud Code; agy is only needed to renew the Credential Manager token, and
        // spawning a 181MB process on every start cost ~5s and a resident child for nothing.
        // The worker is spawned on demand if the direct route ever fails.
        // Schedule background token refresh
        scheduleBackgroundRefresh()
        resolve(true)
      })
    })
  }

  public stop(): Promise<void> {
    stopBackgroundRefresh()
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.isRunning = false
          resolve()
        })
      } else {
        this.isRunning = false
        resolve()
      }
    })
  }

  private async handleChatCompletion(payload: any, res: http.ServerResponse) {
    const requestedModel = (payload.model || "").toLowerCase()
    // Kiro models overlap every other provider's names, so they carry an explicit prefix and
    // are matched before anything else. Without it "claude-sonnet-4.5" is a coin flip between
    // Kiro, Claude and Antigravity.
    const isKiroModel = requestedModel.startsWith("kiro/")
    const is9RouterModel =
      requestedModel.includes("9router") ||
      requestedModel.includes("combomaut") ||
      requestedModel.startsWith("oc/") ||
      requestedModel.startsWith("kr/") ||
      requestedModel.startsWith("vx/") ||
      requestedModel.startsWith("cx/")

    const isOpenCodeModel =
      is9RouterModel ||
      requestedModel.includes("opencode") ||
      requestedModel.includes("groq") ||
      requestedModel.includes("pickle") ||
      requestedModel.includes("nemotron") ||
      requestedModel.includes("qwen") ||
      requestedModel.includes("gpt-oss")

    const isAntigravity =
      !isKiroModel &&
      !isOpenCodeModel &&
      (requestedModel.includes("gemini") ||
        requestedModel.includes("antigravity") ||
        requestedModel.includes("agy") ||
        requestedModel.includes("pro") ||
        requestedModel.includes("claude-sonnet") ||
        requestedModel.includes("claude-opus"))

    const messages = payload.messages ?? []
    let systemPrompt = ""

    const extractContent = (content: any): string => {
      if (typeof content === "string") return content
      if (Array.isArray(content)) {
        return content
          .map((part) => {
            if (typeof part === "string") return part
            if (part && typeof part.text === "string") return part.text
            return ""
          })
          .filter(Boolean)
          .join("\n")
      }
      if (content && typeof content.text === "string") return content.text
      return typeof content === "object" ? JSON.stringify(content) : String(content ?? "")
    }

    // Only the system prompt is lifted out. An earlier version also flattened the conversation
    // into one "User:/Assistant:" transcript for the CLI lanes; those lanes are gone and the
    // joined prompt was assigned to a variable nothing ever read.
    for (const msg of messages) {
      if (msg.role !== "system" && msg.role !== "developer") continue
      const contentStr = extractContent(msg.content)
      if (contentStr) systemPrompt += (systemPrompt ? "\n" : "") + contentStr
    }

    // ── Kiro (AWS) direct route ──
    // Free tier, no CLI. Registered first so its shared model names never reach another
    // provider's matcher.
    if (isKiroModel) {
      const kiroCred = readKiroCredential()
      if (kiroCred?.accessToken) {
        await streamKiroCompletion({ ...payload, model: stripKiroPrefix(payload.model) }, res, kiroCred)
        return
      }
      res.writeHead(401, { "Content-Type": "application/json" })
      res.end(
        JSON.stringify({
          error: {
            message:
              "No Kiro credential found. Sign in from Settings > Connection CLI; Kiro is free and needs no CLI install.",
            type: "kiro_not_signed_in",
          },
        }),
      )
      return
    }

    // ── Fast-Path: Direct Codex / ChatGPT Responses API ──
    const isOpenAIFamily =
      /^(gpt-|o[1-9]|codex)/.test(requestedModel) && !isOpenCodeModel && !is9RouterModel && !isKiroModel
    if (isOpenAIFamily) {
      const codexCred = readCodexCredential()
      if (codexCred?.accessToken) {
        const ok = await streamDirectCodexCompletion(payload, res, codexCred)
        if (ok) {
          console.info(`[FastPath] codex direct stream completed for model: ${payload.model}`)
          return
        }
        console.warn("[FastPath] codex direct route failed")
        if (!res.headersSent) {
          res.writeHead(502, { "Content-Type": "application/json" })
          res.end(
            JSON.stringify({
              error: {
                message:
                  "The OpenAI Responses request did not succeed. Check the Arunaki terminal for the upstream status code.",
                type: "codex_unavailable",
              },
            }),
          )
        } else {
          res.end()
        }
        return
      }
      // Report the missing credential here. Falling through used to hand the request to the
      // Claude CLI, which answered it with the wrong model and a message about Claude.
      res.writeHead(401, { "Content-Type": "application/json" })
      res.end(
        JSON.stringify({
          error: {
            message:
              "No Codex credential found. Install the Codex CLI and sign in once from Settings > Connection CLI.",
            type: "codex_not_signed_in",
          },
        }),
      )
      return
    }

    // ── Google Antigravity CLI (agy) Persistent Daemon ───
    if (isAntigravity) {
      // 9Router (executors/antigravity.js) talks straight to the Cloud Code API, and so
      // do we. agy is only used to renew the credential, never to carry a conversation.
      const auth = await getAntigravityAuth()
      if (auth?.accessToken) {
        const handled = await streamDirectAntigravityCompletion(payload, res, auth)
        if (handled) return
      }
      // No silent degradation. agy is only used to renew the credential, never to carry a
      // conversation: its tool calls arrive as markdown text blocks rather than structured
      // parts, so falling back there silently loses multi-turn context and takes 60s per
      // turn. Surface the reason instead so a Google-side change stays diagnosable.
      const reason = auth?.accessToken
        ? "The Cloud Code request did not succeed. Check the Arunaki terminal for the upstream status code."
        : "No Antigravity credential found. Install the Antigravity CLI and sign in once from Settings > Connection CLI."
      console.warn("[LocalCliBridge] Antigravity direct route failed:", reason)
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: { message: reason, type: "antigravity_unavailable" } }))
      } else {
        res.end()
      }
      return
    }

    // ── OpenCode CLI Agent / Groq / 9Router ──────────────
    const isOpenCode =
      requestedModel.includes("opencode") ||
      requestedModel.includes("groq") ||
      requestedModel.includes("pickle") ||
      requestedModel.includes("nemotron") ||
      requestedModel.includes("qwen") ||
      requestedModel.includes("gpt-oss") ||
      requestedModel.includes("combomaut") ||
      requestedModel.includes("9router")

    if (isOpenCode) {
      await this.handleOpenCodeCompletion(payload, res, systemPrompt)
      return
    }

    // ── Fast-Path: Direct Anthropic Messages API ─────────
    const claudeCred = readClaudeCredential()

    // Direct only. Spawning the claude CLI as a fallback looked like a safety net, but its
    // tool calls are recovered by regex over markdown text blocks rather than the structured
    // parts the Messages API returns, so it silently lost multi-turn tool context and took
    // far longer per turn. The Antigravity fallback was removed for the same reason.
    if (!claudeCred?.accessToken) {
      const status = await checkClaudeStatus()
      if (!status.installed) {
        res.writeHead(503, { "Content-Type": "application/json" })
        res.end(
          JSON.stringify({
            error: {
              message:
                "No Claude credential found. Install Claude Code and sign in once from Settings > Connection CLI.",
              type: "cli_not_installed",
            },
          }),
        )
        return
      }
      res.writeHead(401, { "Content-Type": "application/json" })
      res.end(
        JSON.stringify({
          error: {
            message: "Claude Code is installed but not signed in. Run 'claude auth login --claudeai' once.",
            type: "cli_not_logged_in",
          },
        }),
      )
      return
    }
    
    const handled = await streamDirectAnthropicCompletion(payload, res, claudeCred)
    if (handled) {
      console.info(`[FastPath] claude direct stream completed for model: ${payload.model}`)
      return
    }
    // Direct is the only route now, so report the reason instead of degrading.
    console.warn("[FastPath] claude direct route failed")
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" })
      res.end(
        JSON.stringify({
          error: {
            message:
              "The Anthropic Messages request did not succeed. Check the Arunaki terminal for the upstream status code.",
            type: "claude_unavailable",
          },
        }),
      )
} else {
      res.end()
    }
  }

  private async handleOpenCodeCompletion(
    payload: any,
    res: http.ServerResponse,
    systemPrompt: string,
  ) {
    const rawModel = (payload.model || "").toLowerCase()
    const is9Router =
      rawModel.includes("9router") ||
      rawModel.includes("combomaut") ||
      rawModel.startsWith("oc/") ||
      rawModel.startsWith("kr/") ||
      rawModel.startsWith("vx/") ||
      rawModel.startsWith("cx/")

    // 1. 9Router gateway on port 20128 if 9Router model requested
    if (is9Router) {
      try {
        const checkRes = await fetch("http://localhost:20128/v1/models", { signal: AbortSignal.timeout(800) })
        if (checkRes.ok) {
          const forwardRes = await fetch("http://localhost:20128/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer 9router",
            },
            body: JSON.stringify(payload),
          })
          if (forwardRes.ok && payload.stream && forwardRes.body) {
            if (!res.headersSent) {
              res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
              })
            }
            const reader = forwardRes.body.getReader()
            const decoder = new TextDecoder()
            try {
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                res.write(decoder.decode(value, { stream: true }))
              }
            } finally {
              res.end()
            }
            return
          } else {
            const data = await forwardRes.json()
            res.writeHead(forwardRes.status, { "Content-Type": "application/json" })
            res.end(JSON.stringify(data))
            return
          }
        }
      } catch {}

      // 9Router is offline on port 20128
      res.writeHead(503, { "Content-Type": "application/json" })
      res.end(
        JSON.stringify({
          error: {
            message: "9Router Local Gateway is not running on http://localhost:20128. Please run '9router start' in terminal or click Launch in Arunaki Settings.",
            type: "gateway_offline",
          },
        }),
      )
      return
    }

    // 2. OpenCode Zen hosted (big-pickle, muse-spark, ...) ” 9Router opencode.js lane.
    //    Hosted on purpose: routing through the local `opencode serve` daemon made Arunaki
    //    write every turn as an opencode session (leaking into the CLI session list) and
    //    forced a flattened single-prompt message, which loses tool calling entirely.
    const isOpenCodeNative =
      rawModel.includes("pickle") ||
      rawModel.startsWith("opencode/") ||
      rawModel.includes("fledge") ||
      rawModel.includes("ling") ||
      rawModel.includes("longcat") ||
      rawModel.includes("mimo") ||
      rawModel.includes("muse-spark") ||
      rawModel.includes("space-bunny") ||
      rawModel === "opencode" ||
      rawModel === "big-pickle"

    if (isOpenCodeNative) {
      const handled = await streamDirectOpenCodeCompletion(payload, res, getOpenCodeAccountToken())
      if (handled) return
      // Upstream refused (403 FreeTierError, offline): fall through to the next lane
      // rather than surfacing a broken response.
    }

    // 3. OpenCode with Groq Integration (reads key from ~/.local/share/opencode/auth.json)
    const groqKey = getOpenCodeGroqKey()
    if (groqKey) {
      let groqModel = "openai/gpt-oss-120b"
      if (rawModel.includes("qwen")) {
        groqModel = "qwen/qwen3.8-27b"
      } else if (rawModel.includes("20b")) {
        groqModel = "openai/gpt-oss-20b"
      }

      const messages: any[] = []
      if (systemPrompt) {
        messages.push({
          role: "system",
          content: [
            systemPrompt,
            "[SYSTEM INSTRUCTION: You are Arunaki Workstation's intelligent document assistant powered by OpenCode and Groq. Answer directly, concisely, and helpfully.]",
          ]
            .filter(Boolean)
            .join("\n\n"),
        })
      }

      for (const msg of payload.messages ?? []) {
        if (msg.role === "system") continue
        messages.push(msg)
      }

      const groqPayload: any = {
        model: groqModel,
        messages,
        stream: Boolean(payload.stream),
        temperature: payload.temperature ?? 0.2,
      }

      if (Array.isArray(payload.tools) && payload.tools.length > 0) {
        groqPayload.tools = payload.tools
        if (payload.tool_choice) groqPayload.tool_choice = payload.tool_choice
      }

      try {
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${groqKey}`,
          },
          body: JSON.stringify(groqPayload),
        })

        if (!groqRes.ok) {
          const errText = await groqRes.text().catch(() => "")
          console.error("[LocalCliBridge] Groq API error:", groqRes.status, errText)
          if (!res.headersSent) {
            res.writeHead(groqRes.status, { "Content-Type": "application/json" })
            res.end(errText || JSON.stringify({ error: { message: `Groq error: ${groqRes.status}` } }))
          } else {
            res.end()
          }
          return
        }

        if (payload.stream && groqRes.body) {
          if (!res.headersSent) {
            res.writeHead(200, {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            })
          }
          const reader = groqRes.body.getReader()
          const decoder = new TextDecoder()
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              const chunk = decoder.decode(value, { stream: true })
              res.write(chunk)
            }
          } finally {
            res.end()
          }
          return
        } else {
          const json = await groqRes.json()
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify(json))
          return
        }
      } catch (err: any) {
        console.error("[LocalCliBridge] OpenCode Groq error:", err?.message)
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ error: { message: `OpenCode Groq connection failed: ${err?.message}` } }))
        } else {
          res.end()
        }
        return
      }
    }

    // 3. Fallback: prompt for provider
    res.writeHead(401, { "Content-Type": "application/json" })
    res.end(
      JSON.stringify({
        error: {
          message:
            "OpenCode CLI requires an active provider (Groq Cloud or 9Router). Run 'opencode providers' or add an API key.",
          type: "opencode_unauthenticated",
        },
      }),
    )
  }
}

export const localCliBridge = new LocalCliBridge()