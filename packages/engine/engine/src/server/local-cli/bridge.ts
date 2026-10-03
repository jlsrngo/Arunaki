import http from "node:http"
import crossSpawn from "cross-spawn"
import { checkClaudeStatus, resolveAgyCommand } from "./detector"

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

  public start(): Promise<boolean> {
    if (this.isRunning) return Promise.resolve(true)

    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        // Set CORS headers
        res.setHeader("Access-Control-Allow-Origin", "*")
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

        if (req.method === "OPTIONS") {
          res.writeHead(204)
          res.end()
          return
        }

        if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/ping")) {
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ status: "ok", bridge: "running", port: LOCAL_BRIDGE_PORT }))
          return
        }

        if (req.method === "GET" && (url.pathname === "/v1/models" || url.pathname === "/models")) {
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(
            JSON.stringify({
              object: "list",
              data: [
                { id: "claude-3-7-sonnet", object: "model", owned_by: "claude-cli" },
                { id: "claude-3-5-sonnet", object: "model", owned_by: "claude-cli" },
                { id: "claude-3-5-haiku", object: "model", owned_by: "claude-cli" },
                { id: "gemini-2.5-flash", object: "model", owned_by: "gemini-cli" },
                { id: "gemini-2.5-pro", object: "model", owned_by: "gemini-cli" },
                { id: "gemini-1.5-flash", object: "model", owned_by: "gemini-cli" },
                { id: "gemini-1.5-pro", object: "model", owned_by: "gemini-cli" },
              ],
            }),
          )
          return
        }

        if (
          req.method === "POST" &&
          (url.pathname === "/v1/chat/completions" || url.pathname === "/chat/completions")
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
        resolve(true)
      })
    })
  }

  public stop(): Promise<void> {
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
    if (payload.stream) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      })
      const chunk = {
        id: `chatcmpl-${prefix}-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: payload.model || "default",
        choices: [
          {
            index: 0,
            delta: { content: replyText },
            finish_reason: null,
          },
        ],
      }
      res.write(`data: ${JSON.stringify(chunk)}\n\n`)
      const finishChunk = {
        id: `chatcmpl-${prefix}-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: payload.model || "default",
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: "stop",
          },
        ],
      }
      res.write(`data: ${JSON.stringify(finishChunk)}\n\n`)
      res.write("data: [DONE]\n\n")
      res.end()
      return
    }

    const completion = {
      id: `chatcmpl-${prefix}-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: payload.model || "default",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: replyText,
          },
          finish_reason: "stop",
        },
      ],
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
    const isGemini = requestedModel.includes("gemini")

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
        conversationParts.push(`Assistant: ${contentStr}`)
      }
    }

    const finalPrompt = conversationParts.join("\n\n") || "Hello"

    // ── Google Antigravity CLI (agy) Handler ─────────────
    // Uses stdin streaming mode to bypass Windows 32,767 char CLI argument limit (ENAMETOOLONG).
    if (isGemini) {
      const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${finalPrompt}` : finalPrompt
      const child = crossSpawn(
        resolveAgyCommand(),
        ["--input-format", "stream-json", "--output-format", "stream-json", "--dangerously-skip-permissions"],
        {
          stdio: ["pipe", "pipe", "pipe"],
        },
      )
      let responded = false
      let stdoutBuffer = ""
      let stderr = ""
      let finalResultText = ""
      let usage: { input_tokens?: number; output_tokens?: number } | undefined

      child.stdout?.on("data", (chunk: Buffer) => {
        stdoutBuffer += chunk.toString()
        const lines = stdoutBuffer.split("\n")
        stdoutBuffer = lines.pop() ?? ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const parsed = JSON.parse(trimmed)
            if (parsed.event === "step_update" && parsed.step_update?.text_delta) {
              if (payload.stream && !res.headersSent) {
                res.writeHead(200, {
                  "Content-Type": "text/event-stream",
                  "Cache-Control": "no-cache",
                  Connection: "keep-alive",
                })
              }
              if (payload.stream && res.headersSent) {
                const chunkObj = {
                  id: `chatcmpl-antigravity-${Date.now()}`,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model: payload.model || "default",
                  choices: [
                    {
                      index: 0,
                      delta: { content: parsed.step_update.text_delta },
                      finish_reason: null,
                    },
                  ],
                }
                res.write(`data: ${JSON.stringify(chunkObj)}\n\n`)
              }
            } else if (parsed.event === "result") {
              if (parsed.result?.status === "SUCCESS") {
                finalResultText = parsed.result.response ?? ""
                if (parsed.result.usage) {
                  usage = {
                    input_tokens: parsed.result.usage.input_tokens,
                    output_tokens: parsed.result.usage.output_tokens,
                  }
                }
              } else if (parsed.result?.status === "ERROR") {
                stderr += (stderr ? "\n" : "") + (parsed.result.error || "Execution error")
              }
            }
          } catch {}
        }
      })

      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString()
      })

      child.on("close", (code) => {
        if (responded) return
        responded = true

        if (stdoutBuffer.trim()) {
          try {
            const parsed = JSON.parse(stdoutBuffer.trim())
            if (parsed.event === "result" && parsed.result?.status === "SUCCESS") {
              finalResultText = parsed.result.response ?? ""
              if (parsed.result.usage) {
                usage = {
                  input_tokens: parsed.result.usage.input_tokens,
                  output_tokens: parsed.result.usage.output_tokens,
                }
              }
            }
          } catch {}
        }

        const replyText = finalResultText.trim()

        if (!replyText || (code !== 0 && !replyText)) {
          if (!res.headersSent) {
            res.writeHead(503, { "Content-Type": "application/json" })
            res.end(
              JSON.stringify({
                error: {
                  message: `Antigravity CLI (agy) failed${code !== null ? ` (exit ${code})` : ""}: ${
                    stderr.trim().slice(0, 300) || "no output. Run 'agy' once in a terminal to sign in."
                  }`,
                  type: "cli_execution_failed",
                },
              }),
            )
          } else {
            res.end()
          }
          return
        }

        if (payload.stream && res.headersSent) {
          const finishChunk = {
            id: `chatcmpl-antigravity-${Date.now()}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: payload.model || "default",
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: "stop",
              },
            ],
          }
          res.write(`data: ${JSON.stringify(finishChunk)}\n\n`)
          res.write("data: [DONE]\n\n")
          res.end()
          return
        }

        this.sendCompletionResponse(res, payload, replyText, "antigravity", usage)
      })

      child.on("error", (err: any) => {
        if (responded || res.headersSent) return
        responded = true
        if (err.code === "ENOENT") {
          res.writeHead(503, { "Content-Type": "application/json" })
          res.end(
            JSON.stringify({
              error: {
                message:
                  "Antigravity CLI (agy) is not installed. Install: irm https://antigravity.google/cli/install.ps1 | iex — then run 'agy' once to sign in.",
                type: "cli_not_installed",
              },
            }),
          )
        } else {
          res.writeHead(500, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ error: { message: `Antigravity CLI process error: ${err.message}` } }))
        }
      })

      // Pipe prompt cleanly via stdin
      const streamPayload = {
        event: "user",
        message: {
          content: fullPrompt,
        },
      }
      child.stdin?.write(JSON.stringify(streamPayload) + "\n", () => {
        child.stdin?.end()
      })
      return
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
}

export const localCliBridge = new LocalCliBridge()
