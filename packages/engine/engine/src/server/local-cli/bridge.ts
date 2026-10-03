import http from "node:http"
import crossSpawn from "cross-spawn"
import { checkClaudeStatus } from "./detector"

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

        const url = new URL(req.url ?? "/", `http://${req.headers.host}`)

        if (req.method === "GET" && (url.pathname === "/v1/models" || url.pathname === "/models")) {
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(
            JSON.stringify({
              object: "list",
              data: [
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

  private async handleChatCompletion(payload: any, res: http.ServerResponse) {
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

    const messages = payload.messages ?? []
    let systemPrompt = ""
    const conversationParts: string[] = []

    for (const msg of messages) {
      if (msg.role === "system") {
        systemPrompt += (systemPrompt ? "\n" : "") + (typeof msg.content === "string" ? msg.content : "")
      } else if (msg.role === "user") {
        conversationParts.push(`User: ${typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}`)
      } else if (msg.role === "assistant") {
        conversationParts.push(`Assistant: ${typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}`)
      }
    }

    const finalPrompt = conversationParts.join("\n\n") || "Hello"
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

        const completion = {
          id: `chatcmpl-claude-${Date.now()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: payload.model ?? "claude-3-7-sonnet",
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
            prompt_tokens: json.usage?.input_tokens ?? 10,
            completion_tokens: json.usage?.output_tokens ?? 20,
            total_tokens: (json.usage?.input_tokens ?? 10) + (json.usage?.output_tokens ?? 20),
          },
        }

        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify(completion))
      } catch {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(
          JSON.stringify({
            id: `chatcmpl-claude-${Date.now()}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: payload.model ?? "claude-3-7-sonnet",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: stdout.trim() || stderr.trim() || "No response received from Claude CLI.",
                },
                finish_reason: "stop",
              },
            ],
          }),
        )
      }
    })

    child.on("error", (err) => {
      res.writeHead(500, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: { message: `Claude CLI process error: ${err.message}` } }))
    })
  }
}

export const localCliBridge = new LocalCliBridge()
