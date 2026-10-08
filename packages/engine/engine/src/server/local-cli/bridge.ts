import http from "node:http"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import crossSpawn from "cross-spawn"
import {
  checkClaudeStatus,
  resolveAgyCommand,
  getOpenCodeGroqKey,
  getOpenCodeAccountToken,
  getAntigravityAuth,
} from "./detector"
import { readCodexCredential, readClaudeCredential } from "./harvester.js"
import {
  streamDirectCodexCompletion,
  streamDirectAnthropicCompletion,
  streamDirectOpenCodeCompletion,
  streamDirectAntigravityCompletion,
} from "./upstream.js"
import { scheduleBackgroundRefresh, stopBackgroundRefresh } from "./refresh.js"

export const LOCAL_BRIDGE_PORT = 20188

export interface ParsedToolCall {
  name: string
  arguments: Record<string, any>
}

export function parseToolCallsFromText(rawText: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = []

  // 1. Match ```tool_call\n...\n``` or ```tool_call ... ```
  const mdRegex = /```tool_call\s*([\s\S]*?)\s*```/gi
  let match: RegExpExecArray | null
  while ((match = mdRegex.exec(rawText)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim())
      if (parsed?.name && typeof parsed.name === "string") {
        const args =
          typeof parsed.arguments === "object" && parsed.arguments !== null
            ? parsed.arguments
            : typeof parsed.arguments === "string"
              ? JSON.parse(parsed.arguments)
              : {}
        calls.push({ name: parsed.name, arguments: args })
      }
    } catch {}
  }

  // 2. Match <tool_call> ... </tool_call>
  const tagRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi
  while ((match = tagRegex.exec(rawText)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim())
      if (parsed?.name && typeof parsed.name === "string") {
        const args =
          typeof parsed.arguments === "object" && parsed.arguments !== null
            ? parsed.arguments
            : typeof parsed.arguments === "string"
              ? JSON.parse(parsed.arguments)
              : {}
        if (!calls.some((c) => c.name === parsed.name && JSON.stringify(c.arguments) === JSON.stringify(args))) {
          calls.push({ name: parsed.name, arguments: args })
        }
      }
    } catch {}
  }

  return calls
}

export function stripToolCallsFromText(rawText: string): string {
  let cleaned = rawText
    .replace(/```tool_call[\s\S]*?```/gi, "")
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")

  // Sanitize accidental raw Excel cell dumps or JSON sheet maps:
  // e.g. mula":null},{"ref":"S1","value":46313,... or {"sheets":[...]} or {"ref":"..."}
  cleaned = cleaned.replace(/(?:\{?"?for)?mula"?\s*:\s*null\s*\}?,?\s*\{"ref"[\s\S]*?\}\s*\]?\s*\}?/gi, "")
  cleaned = cleaned.replace(/\{"ref"\s*:\s*"[A-Z0-9]+"[^}]*\},?/gi, "")
  cleaned = cleaned.replace(/\[\s*\{"ref"[\s\S]*?\}\s*\]/gi, "")
  cleaned = cleaned.replace(/\{"sheets"\s*:\s*\[[\s\S]*?\]\s*\}/gi, "")

  return cleaned.trim()
}

class LocalCliBridge {
  private server: http.Server | null = null
  private isRunning = false

  public get running(): boolean {
    return this.isRunning
  }

  public get port(): number {
    return LOCAL_BRIDGE_PORT
  }

  // `agy --input-format stream-json` runs one turn per NDJSON line, so a multi-turn
  // conversation has to be replayed as a single prompt. Keep the tool directive attached
  // to it: the worker's tool calls come back as ```tool_call blocks that the host engine
  // executes, not as native function calling.
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

  private sendCompletionResponse(
    res: http.ServerResponse,
    payload: any,
    replyText: string,
    prefix = "cli",
    usage?: { input_tokens?: number; output_tokens?: number }
  ) {
    const toolCalls = parseToolCallsFromText(replyText)
    const hasToolCalls = toolCalls.length > 0
    const cleanText = hasToolCalls ? stripToolCallsFromText(replyText) : replyText

    if (payload.stream) {
      if (!res.headersSent) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        })
      }
      if (cleanText) {
        const chunk = {
          id: `chatcmpl-${prefix}-${Date.now()}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: payload.model || "default",
          choices: [
            {
              index: 0,
              delta: { content: cleanText },
              finish_reason: null,
            },
          ],
        }
        res.write(`data: ${JSON.stringify(chunk)}\n\n`)
      }

      if (hasToolCalls) {
        const toolCallsDelta = toolCalls.map((tc, idx) => ({
          index: idx,
          id: `call_${Date.now()}_${idx}`,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        }))
        const toolCallChunk = {
          id: `chatcmpl-${prefix}-${Date.now()}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: payload.model || "default",
          choices: [
            {
              index: 0,
              delta: { tool_calls: toolCallsDelta },
              finish_reason: null,
            },
          ],
        }
        res.write(`data: ${JSON.stringify(toolCallChunk)}\n\n`)
      }

      const finishChunk = {
        id: `chatcmpl-${prefix}-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: payload.model || "default",
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: hasToolCalls ? "tool_calls" : "stop",
          },
        ],
      }
      res.write(`data: ${JSON.stringify(finishChunk)}\n\n`)
      res.write("data: [DONE]\n\n")
      res.end()
      return
    }

    const choice: any = {
      index: 0,
      message: {
        role: "assistant",
        content: hasToolCalls ? (cleanText || null) : cleanText,
      },
      finish_reason: hasToolCalls ? "tool_calls" : "stop",
    }

    if (hasToolCalls) {
      choice.message.tool_calls = toolCalls.map((tc, idx) => ({
        id: `call_${Date.now()}_${idx}`,
        type: "function",
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      }))
    }

    const completion = {
      id: `chatcmpl-${prefix}-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: payload.model || "default",
      choices: [choice],
      usage: {
        prompt_tokens: usage?.input_tokens ?? 15,
        completion_tokens: usage?.output_tokens ?? 25,
        total_tokens: (usage?.input_tokens ?? 15) + (usage?.output_tokens ?? 25),
      },
    }

    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify(completion))
  }

  private async handleChatCompletion(payload: any, res: http.ServerResponse) {
    const requestedModel = (payload.model || "").toLowerCase()
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
      !isOpenCodeModel &&
      (requestedModel.includes("gemini") ||
        requestedModel.includes("antigravity") ||
        requestedModel.includes("agy") ||
        requestedModel.includes("pro") ||
        requestedModel.includes("claude-sonnet") ||
        requestedModel.includes("claude-opus"))

    const messages = payload.messages ?? []
    let systemPrompt = ""
    const conversationParts: string[] = []

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

    for (const msg of messages) {
      const contentStr = extractContent(msg.content)
      if (msg.role === "system") {
        systemPrompt += (systemPrompt ? "\n" : "") + contentStr
      } else if (msg.role === "user") {
        conversationParts.push(`User: ${contentStr}`)
      } else if (msg.role === "assistant") {
        let text = contentStr
        if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
          const callsStr = msg.tool_calls
            .map((tc: any) => {
              const name = tc?.function?.name || "unknown"
              const args = tc?.function?.arguments || "{}"
              return `\`\`\`tool_call\n{"name": "${name}", "arguments": ${typeof args === "string" ? args : JSON.stringify(args)}}\n\`\`\``
            })
            .join("\n")
          text = text ? `${text}\n${callsStr}` : callsStr
        }
        if (text) conversationParts.push(`Assistant: ${text}`)
      } else if (msg.role === "tool") {
        conversationParts.push(`[Tool Result for ${msg.tool_call_id || "call"}]:\n${contentStr}`)
      }
    }

    let toolsDirective = ""
    if (Array.isArray(payload.tools) && payload.tools.length > 0) {
      const toolDefs = payload.tools
        .map((t: any) => {
          const fn = t.function || t
          const props = fn.parameters?.properties
          const req = fn.parameters?.required ?? []
          const params = props
            ? Object.entries(props)
                .map(([k, v]: [string, any]) => `${k} (${v.type || "string"}${req.includes(k) ? ", required" : ""}): ${v.description || ""}`)
                .join("; ")
            : ""
          return `- ${fn.name}: ${fn.description || ""}${params ? ` [Parameters: ${params}]` : ""}`
        })
        .join("\n")

      toolsDirective = `\n\nAvailable Arunaki Workspace Tools:\n${toolDefs}\n\nCRITICAL TOOL USAGE INSTRUCTIONS:
- You DO NOT have direct file access or execution in your runtime environment. DO NOT execute commands or invoke native tools.
- When you need to read, write, edit, or search documents in the workspace, you MUST output a tool call block formatted EXACTLY as:
\`\`\`tool_call
{"name": "<tool_name>", "arguments": { <args> }}
\`\`\`
- Arunaki's host engine will execute your tool call and supply the result back to you in the next turn.
- To inspect or modify files, ALWAYS output the appropriate tool call instead of guessing or falsely claiming the file was already updated.
- NEVER regurgitate, paste, or dump raw JSON structures, cell maps (e.g. {"ref":"...", "value":...}), or raw tool results in your chat response. Always communicate in clean, human-readable Indonesian/English and clean markdown tables.
- CRITICAL CONVERSATION RULE: Always answer the user's latest question directly. If the user asks whether a specific item or file (e.g. ORDER.txt) was included, answer their question directly with a clear Yes/No and brief explanation instead of blindly repeating a previous confirmation table!`
    }

    const finalPrompt = conversationParts.join("\n\n") || "Hello"

    // ── Fast-Path: Direct Codex / ChatGPT Responses API ──
    const isOpenAIFamily =
      /^(gpt-|o[1-9]|codex)/.test(requestedModel) && !isOpenCodeModel && !is9RouterModel
    if (isOpenAIFamily) {
      const codexCred = readCodexCredential()
      if (codexCred?.accessToken) {
        const ok = await streamDirectCodexCompletion(payload, res, codexCred)
        if (ok) {
          console.info(`[FastPath] codex direct stream completed for model: ${payload.model}`)
          return
        }
        console.warn("[FastPath] codex direct stream pre-flight failed, falling back")
      }
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
      await this.handleOpenCodeCompletion(payload, res, systemPrompt, toolsDirective)
      return
    }

    // Append tools directive to systemPrompt for Claude Code as well
    if (toolsDirective) {
      systemPrompt += (systemPrompt ? "\n" : "") + toolsDirective
    }

    // ── Fast-Path: Direct Anthropic Messages API ─────────
    const claudeCred = readClaudeCredential()
    if (claudeCred?.accessToken) {
      const ok = await streamDirectAnthropicCompletion(payload, res, claudeCred)
      if (ok) {
        console.info(`[FastPath] claude direct stream completed for model: ${payload.model}`)
        return
      }
      console.warn("[FastPath] claude direct stream pre-flight failed, falling back to claude -p")
    }

    // ── Claude Code CLI Handler ──────────────────────────
    const status = await checkClaudeStatus()
    if (!status.installed) {
      res.writeHead(503, { "Content-Type": "application/json" })
      res.end(
        JSON.stringify({
          error: {
            message: "Claude Code CLI is not installed on this system. Run: npm install -g @anthropic-ai/claude-code",
            type: "cli_not_installed",
          },
        }),
      )
      return
    }

    if (!status.loggedIn) {
      res.writeHead(401, { "Content-Type": "application/json" })
      res.end(
        JSON.stringify({
          error: {
            message:
              "Claude Code CLI is not logged in. Please run 'claude auth login --claudeai' in terminal or click Login in Arunaki Settings.",
            type: "cli_not_logged_in",
          },
        }),
      )
      return
    }

    const args = ["-p", finalPrompt, "--output-format", "json"]

    if (systemPrompt) {
      args.push("--system-prompt", systemPrompt)
    }

    const child = crossSpawn("claude", args, {
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on("close", (code) => {
      try {
        const json = JSON.parse(stdout.trim())
        const replyText = json.result ?? json.message?.content?.[0]?.text ?? stdout.trim()

        if (json.is_error && replyText.includes("Not logged in")) {
          res.writeHead(401, { "Content-Type": "application/json" })
          res.end(
            JSON.stringify({
              error: {
                message: "Claude Code CLI authentication required. Please run 'claude auth login --claudeai'.",
                type: "cli_not_logged_in",
              },
            }),
          )
          return
        }

        this.sendCompletionResponse(res, payload, replyText, "claude", {
          input_tokens: json.usage?.input_tokens,
          output_tokens: json.usage?.output_tokens,
        })
      } catch {
        const replyText = stdout.trim() || stderr.trim() || "No response received from Claude CLI."
        this.sendCompletionResponse(res, payload, replyText, "claude")
      }
    })

    child.on("error", (err) => {
      res.writeHead(500, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: { message: `Claude CLI process error: ${err.message}` } }))
    })
  }

  private async handleOpenCodeCompletion(
    payload: any,
    res: http.ServerResponse,
    systemPrompt: string,
    toolsDirective: string,
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

    // 2. OpenCode Zen hosted (big-pickle, muse-spark, ...) — 9Router opencode.js lane.
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
      if (systemPrompt || toolsDirective) {
        messages.push({
          role: "system",
          content: [
            systemPrompt,
            toolsDirective,
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