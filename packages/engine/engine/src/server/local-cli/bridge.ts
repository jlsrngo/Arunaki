import http from "node:http"
import crossSpawn from "cross-spawn"
import { checkClaudeStatus, resolveAgyCommand, getCliQuota } from "./detector"

export const LOCAL_BRIDGE_PORT = 20188

class AntigravityDaemonWorker {
  private child: any = null
  private isStarting = false
  private currentTurn: {
    stream: boolean
    res: http.ServerResponse
    model: string
    accumulatedText: string
    timeoutId?: NodeJS.Timeout
  } | null = null
  private turnQueue: Array<{
    fullPrompt: string
    payload: any
    res: http.ServerResponse
  }> = []
  private stdoutBuffer = ""
  private stderrBuffer = ""
  private turnCount = 0
  private spawnedModel = "gemini-3.8-flash-high"

  private resolveAgyModel(target?: string): string {
    const lower = (target || "").toLowerCase()
    if (lower.includes("pro")) return "gemini-3.1-pro-high"
    if (lower.includes("3.7")) return "gemini-3.7-flash-high"
    if (lower.includes("3.6")) return "gemini-3.6-flash-high"
    if (lower.includes("claude-sonnet") || lower.includes("sonnet")) return "claude-sonnet-5-5-high"
    if (lower.includes("claude-opus") || lower.includes("opus")) return "claude-opus-5-5-high"
    return "gemini-3.8-flash-high"
  }

  public prewarm(): void {
    if (!this.child && !this.isStarting) {
      this.ensureProcess().catch((err) => {
        console.warn("[LocalCliBridge] Antigravity pre-warm warning:", err?.message)
      })
    }
  }

  public async ensureProcess(targetModel?: string): Promise<any> {
    const desiredModel = this.resolveAgyModel(targetModel)
    if (this.child && !this.child.killed && this.child.stdin?.writable) {
      if (this.spawnedModel === desiredModel) {
        return this.child
      }
      try {
        this.child.stdin?.end()
        this.child.kill()
      } catch {}
      this.child = null
    }

    if (this.isStarting) {
      return new Promise((resolve, reject) => {
        const interval = setInterval(() => {
          if (this.child && !this.child.killed && this.child.stdin?.writable) {
            clearInterval(interval)
            resolve(this.child)
          } else if (!this.isStarting) {
            clearInterval(interval)
            reject(new Error("Antigravity worker failed to initialize"))
          }
        }, 50)
      })
    }

    this.isStarting = true
    this.stdoutBuffer = ""
    this.stderrBuffer = ""
    this.turnCount = 0
    this.spawnedModel = desiredModel

    try {
      const cmd = resolveAgyCommand()
      const child = crossSpawn(
        cmd,
        [
          "--model",
          desiredModel,
          "--input-format",
          "stream-json",
          "--output-format",
          "stream-json",
          "--dangerously-skip-permissions",
        ],
        {
          stdio: ["pipe", "pipe", "pipe"],
        },
      )

      child.stdout?.on("data", (chunk: Buffer) => {
        this.handleStdout(chunk)
      })

      child.stderr?.on("data", (chunk: Buffer) => {
        this.stderrBuffer += chunk.toString()
      })

      child.on("close", (code: number | null) => {
        this.handleExit(code)
      })

      child.on("error", (err: any) => {
        this.handleError(err)
      })

      this.child = child
      this.isStarting = false
      return child
    } catch (err) {
      this.isStarting = false
      throw err
    }
  }

  private handleStdout(chunk: Buffer) {
    this.stdoutBuffer += chunk.toString()
    const lines = this.stdoutBuffer.split("\n")
    this.stdoutBuffer = lines.pop() ?? ""

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const parsed = JSON.parse(trimmed)
        if (parsed.event === "step_update" && parsed.step_update?.text_delta) {
          const delta = parsed.step_update.text_delta
          if (this.currentTurn) {
            this.currentTurn.accumulatedText += delta
            if (this.currentTurn.stream) {
              const res = this.currentTurn.res
              if (!res.headersSent) {
                res.writeHead(200, {
                  "Content-Type": "text/event-stream",
                  "Cache-Control": "no-cache",
                  Connection: "keep-alive",
                })
              }
              const chunkObj = {
                id: `chatcmpl-antigravity-${Date.now()}`,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model: this.currentTurn.model || "gemini-3.8-flash",
                choices: [
                  {
                    index: 0,
                    delta: { content: delta },
                    finish_reason: null,
                  },
                ],
              }
              res.write(`data: ${JSON.stringify(chunkObj)}\n\n`)
            }
          }
        } else if (parsed.event === "result") {
          let text = ""
          let usage: any
          if (parsed.result?.status === "SUCCESS") {
            text = parsed.result.response ?? this.currentTurn?.accumulatedText ?? ""
            if (parsed.result.usage) {
              usage = {
                input_tokens: parsed.result.usage.input_tokens,
                output_tokens: parsed.result.usage.output_tokens,
              }
            }
          } else if (parsed.result?.status === "ERROR") {
            this.stderrBuffer += (this.stderrBuffer ? "\n" : "") + (parsed.result.error || "Execution error")
          }

          this.finishCurrentTurn(text, usage)
        }
      } catch {}
    }
  }

  private finishCurrentTurn(text: string, usage?: any) {
    if (!this.currentTurn) return
    const turn = this.currentTurn
    this.currentTurn = null
    if (turn.timeoutId) clearTimeout(turn.timeoutId)

    this.turnCount++
    const replyText = (text || turn.accumulatedText).trim()

    if (turn.stream) {
      const res = turn.res
      if (!res.headersSent) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        })
      }
      const finishChunk = {
        id: `chatcmpl-antigravity-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: turn.model || "gemini-3.8-flash",
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
    } else {
      const completion = {
        id: `chatcmpl-antigravity-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: turn.model || "gemini-3.8-flash",
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
      turn.res.writeHead(200, { "Content-Type": "application/json" })
      turn.res.end(JSON.stringify(completion))
    }

    // Process next queued turn if any
    this.processQueue()

    // Periodically recycle daemon after 30 turns for memory hygiene
    if (this.turnCount >= 30 && !this.currentTurn && this.turnQueue.length === 0) {
      this.recycle()
    }
  }

  private handleExit(code: number | null) {
    const active = this.currentTurn
    this.currentTurn = null
    this.child = null

    if (active) {
      if (active.timeoutId) clearTimeout(active.timeoutId)
      const replyText = active.accumulatedText.trim()
      if (replyText) {
        if (active.stream && active.res.headersSent) {
          active.res.write("data: [DONE]\n\n")
          active.res.end()
        } else {
          active.res.writeHead(200, { "Content-Type": "application/json" })
          active.res.end(
            JSON.stringify({
              id: `chatcmpl-antigravity-${Date.now()}`,
              object: "chat.completion",
              created: Math.floor(Date.now() / 1000),
              model: active.model,
              choices: [{ index: 0, message: { role: "assistant", content: replyText }, finish_reason: "stop" }],
            }),
          )
        }
      } else {
        if (!active.res.headersSent) {
          active.res.writeHead(503, { "Content-Type": "application/json" })
          active.res.end(
            JSON.stringify({
              error: {
                message: `Antigravity CLI (agy) exited${code !== null ? ` (code ${code})` : ""}: ${
                  this.stderrBuffer.trim().slice(0, 300) || "Process ended. Run 'agy' once to sign in."
                }`,
                type: "cli_execution_failed",
              },
            }),
          )
        } else {
          active.res.end()
        }
      }
    }

    // Process next queued turn (which will re-spawn the worker)
    this.processQueue()
  }

  private handleError(err: any) {
    const active = this.currentTurn
    this.currentTurn = null
    this.child = null

    if (active) {
      if (active.timeoutId) clearTimeout(active.timeoutId)
      if (!active.res.headersSent) {
        active.res.writeHead(500, { "Content-Type": "application/json" })
        active.res.end(
          JSON.stringify({
            error: {
              message: `Antigravity daemon worker error: ${err.message}`,
              type: "cli_worker_error",
            },
          }),
        )
      } else {
        active.res.end()
      }
    }
    this.processQueue()
  }

  public async executeTurn(fullPrompt: string, payload: any, res: http.ServerResponse): Promise<void> {
    if (this.currentTurn) {
      this.turnQueue.push({ fullPrompt, payload, res })
      return
    }

    try {
      const child = await this.ensureProcess(payload.model)
      this.stderrBuffer = ""
      this.currentTurn = {
        stream: Boolean(payload.stream),
        res,
        model: payload.model || "gemini-3.8-flash",
        accumulatedText: "",
        timeoutId: setTimeout(() => {
          if (this.currentTurn) {
            console.warn("[LocalCliBridge] Antigravity turn timeout (120s), resetting worker...")
            this.handleExit(-1)
          }
        }, 120000),
      }

      const streamPayload = {
        event: "user",
        message: {
          content: fullPrompt,
        },
      }

      child.stdin?.write(JSON.stringify(streamPayload) + "\n")
    } catch (err: any) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: { message: `Failed to start Antigravity daemon: ${err?.message}` } }))
      } else {
        res.end()
      }
    }
  }

  private processQueue() {
    if (this.currentTurn || this.turnQueue.length === 0) return
    const next = this.turnQueue.shift()
    if (next) {
      this.executeTurn(next.fullPrompt, next.payload, next.res).catch(() => {})
    }
  }

  public recycle(): void {
    if (this.child) {
      try {
        this.child.stdin?.end()
        this.child.kill()
      } catch {}
      this.child = null
    }
    this.prewarm()
  }

  public stop(): void {
    if (this.child) {
      try {
        this.child.stdin?.end()
        this.child.kill()
      } catch {}
      this.child = null
    }
    this.currentTurn = null
    this.turnQueue = []
  }
}

class LocalCliBridge {
  private server: http.Server | null = null
  private isRunning = false
  private agyDaemon = new AntigravityDaemonWorker()

  public get running(): boolean {
    return this.isRunning
  }

  public get port(): number {
    return LOCAL_BRIDGE_PORT
  }

  public prewarmAgyWorker(): void {
    this.agyDaemon.prewarm()
  }

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
              ],
            }),
          )
          return
        }

        if (req.method === "GET" && (parsedUrl.pathname === "/v1/quota" || parsedUrl.pathname === "/quota")) {
          const target = parsedUrl.searchParams.get("target") || "antigravity"
          const quota = await getCliQuota(target)
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ data: quota }))
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
        // Pre-warm Antigravity daemon worker on bridge start
        this.agyDaemon.prewarm()
        resolve(true)
      })
    })
  }

  public stop(): Promise<void> {
    this.agyDaemon.stop()
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
    const isAntigravity =
      requestedModel.includes("gemini") ||
      requestedModel.includes("antigravity") ||
      requestedModel.includes("agy") ||
      requestedModel.includes("pro") ||
      requestedModel.includes("claude-sonnet") ||
      requestedModel.includes("claude-opus")

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

    // ── Google Antigravity CLI (agy) Persistent Daemon ───
    if (isAntigravity) {
      const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${finalPrompt}` : finalPrompt
      await this.agyDaemon.executeTurn(fullPrompt, payload, res)
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
