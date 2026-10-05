import http from "node:http"
import crossSpawn from "cross-spawn"
import { checkClaudeStatus, resolveAgyCommand } from "./detector"

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

class AntigravityDaemonWorker {
  private child: any = null
  private isStarting = false
  private currentTurn: {
    stream: boolean
    res: http.ServerResponse
    model: string
    accumulatedText: string
    streamedText: string
    inToolCall: boolean
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

  private writeStreamChunk(res: http.ServerResponse, model: string, content: string) {
    if (!content) return
    const chunkObj = {
      id: `chatcmpl-antigravity-${Date.now()}`,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: model || "gemini-3.8-flash",
      choices: [
        {
          index: 0,
          delta: { content },
          finish_reason: null,
        },
      ],
    }
    res.write(`data: ${JSON.stringify(chunkObj)}\n\n`)
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
            const turn = this.currentTurn
            turn.accumulatedText += delta
            if (turn.stream) {
              const res = turn.res
              if (!res.headersSent) {
                res.writeHead(200, {
                  "Content-Type": "text/event-stream",
                  "Cache-Control": "no-cache",
                  Connection: "keep-alive",
                })
              }

              if (!turn.inToolCall) {
                // If the model starts spewing raw cell dumps, suppress streaming to user bubble!
                const isCellDump = /\{"ref"\s*:|formula"\s*:\s*null/i.test(turn.accumulatedText)
                if (isCellDump) {
                  turn.inToolCall = true
                }

                const toolCallMatch = turn.accumulatedText.match(/```tool_call|<tool_call>/i)
                if (toolCallMatch && toolCallMatch.index !== undefined) {
                  turn.inToolCall = true
                  const safeBefore = turn.accumulatedText.slice(0, toolCallMatch.index)
                  if (safeBefore.length > turn.streamedText.length) {
                    const chunkToStream = safeBefore.slice(turn.streamedText.length)
                    turn.streamedText += chunkToStream
                    this.writeStreamChunk(res, turn.model, chunkToStream)
                  }
                } else if (!isCellDump) {
                  // Buffer up to 15 chars to avoid leaking partial "```tool_call" or "<tool_call>"
                  const safeEnd = Math.max(0, turn.accumulatedText.length - 15)
                  if (safeEnd > turn.streamedText.length) {
                    const chunkToStream = turn.accumulatedText.slice(turn.streamedText.length, safeEnd)
                    turn.streamedText += chunkToStream
                    this.writeStreamChunk(res, turn.model, chunkToStream)
                  }
                }
              }
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
    const fullText = (text || turn.accumulatedText).trim()
    const toolCalls = parseToolCallsFromText(fullText)
    const hasToolCalls = toolCalls.length > 0

    if (turn.stream) {
      const res = turn.res
      if (!res.headersSent) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        })
      }

      if (hasToolCalls) {
        // Stream any remaining text before the tool call if not yet streamed
        if (!turn.inToolCall) {
          const match = fullText.match(/```tool_call|<tool_call>/i)
          const endIndex = match && match.index !== undefined ? match.index : fullText.length
          const safeBefore = fullText.slice(0, endIndex)
          if (safeBefore.length > turn.streamedText.length) {
            const chunk = safeBefore.slice(turn.streamedText.length)
            turn.streamedText += chunk
            this.writeStreamChunk(res, turn.model, chunk)
          }
          turn.inToolCall = true
        }

        // Send tool_calls delta
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
          id: `chatcmpl-antigravity-${Date.now()}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: turn.model || "gemini-3.8-flash",
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: toolCallsDelta,
              },
              finish_reason: null,
            },
          ],
        }
        res.write(`data: ${JSON.stringify(toolCallChunk)}\n\n`)

        // Send finish chunk with finish_reason: "tool_calls"
        const finishChunk = {
          id: `chatcmpl-antigravity-${Date.now()}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: turn.model || "gemini-3.8-flash",
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: "tool_calls",
            },
          ],
        }
        res.write(`data: ${JSON.stringify(finishChunk)}\n\n`)
      } else {
        // No tool calls: stream any remaining unstreamed text
        if (fullText.length > turn.streamedText.length) {
          const remaining = fullText.slice(turn.streamedText.length)
          this.writeStreamChunk(res, turn.model, remaining)
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
      }

      res.write("data: [DONE]\n\n")
      res.end()
    } else {
      // Non-streaming response
      const choice: any = {
        index: 0,
        message: {
          role: "assistant",
          content: hasToolCalls ? (stripToolCallsFromText(fullText) || null) : fullText,
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
        id: `chatcmpl-antigravity-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: turn.model || "gemini-3.8-flash",
        choices: [choice],
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

    // Always recycle daemon worker after each completed turn so agy context never compounds duplicate history!
    // this.prewarm() inside recycle() immediately prepares the next worker in warm standby (0ms delay).
    if (!this.currentTurn && this.turnQueue.length === 0) {
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
        this.currentTurn = active
        this.finishCurrentTurn(replyText)
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
        streamedText: "",
        inToolCall: false,
        timeoutId: setTimeout(() => {
          if (this.currentTurn) {
            console.warn("[LocalCliBridge] Antigravity turn timeout (60s), resetting worker...")
            this.handleExit(-1)
          }
        }, 60000),
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

    // ── Google Antigravity CLI (agy) Persistent Daemon ───
    if (isAntigravity) {
      const directive =
        `[SYSTEM INSTRUCTION: You are an AI document assistant in Arunaki Workstation.
Always wrap your preliminary thought process, calculations, and execution plan inside <think>...</think> tags at the very beginning of your response.
DO NOT invoke any native internal tools or execute shell commands.${toolsDirective}]`
      const fullPrompt = systemPrompt ? `${directive}\n\n${systemPrompt}\n\n${finalPrompt}` : `${directive}\n\n${finalPrompt}`
      await this.agyDaemon.executeTurn(fullPrompt, payload, res)
      return
    }

    // Append tools directive to systemPrompt for Claude Code as well
    if (toolsDirective) {
      systemPrompt += (systemPrompt ? "\n" : "") + toolsDirective
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
