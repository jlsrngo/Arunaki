import { spawn } from "child_process"
import crossSpawn from "cross-spawn"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export interface ClaudeStatus {
  installed: boolean
  version?: string
  loggedIn: boolean
  authMethod?: string
  apiProvider?: string
  email?: string
  error?: string
}

export interface OpenCodeStatus {
  installed: boolean
  version?: string
  authenticatedProviders: string[]
  hasGroq: boolean
  has9Router: boolean
  error?: string
}

export interface AntigravityStatus {
  detected: boolean
  cliInstalled?: boolean
  agyInstalled?: boolean
  agyVersion?: string
  geminiCliInstalled?: boolean
  geminiVersion?: string
  path?: string
  environment: string
}

export interface NineRouterStatus {
  installed: boolean
  version?: string
  running: boolean
  url: string
  models: string[]
}

export interface CodexStatus {
  installed: boolean
  version?: string
  isCloudOnly: boolean
  message: string
}

export interface LocalCliStatusResult {
  claude: ClaudeStatus
  opencode: OpenCodeStatus
  antigravity: AntigravityStatus
  nineRouter: NineRouterStatus
  codex: CodexStatus
  bridgePort: number
  bridgeRunning: boolean
}

function clean<T extends Record<string, any>>(obj: T): T {
  const res: any = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      res[k] = v
    }
  }
  return res
}

export async function checkClaudeStatus(): Promise<ClaudeStatus> {
  return new Promise((resolve) => {
    try {
      // 1. Run claude --version to verify binary presence
      const verProc = crossSpawn("claude", ["--version"], {
        stdio: ["ignore", "pipe", "pipe"],
      })
      let verOut = ""
      verProc.stdout?.on("data", (d: Buffer) => (verOut += d.toString()))

      verProc.on("error", () => {
        resolve({ installed: false, loggedIn: false })
      })

      verProc.on("close", (verCode) => {
        if (verCode !== 0 && !verOut) {
          return resolve({ installed: false, loggedIn: false })
        }

        const version = verOut.trim().split("\n")[0] || undefined

        // 2. Run claude auth status
        const authProc = crossSpawn("claude", ["auth", "status"], {
          stdio: ["ignore", "pipe", "pipe"],
        })
        let authOut = ""
        authProc.stdout?.on("data", (d: Buffer) => (authOut += d.toString()))
        authProc.stderr?.on("data", (d: Buffer) => (authOut += d.toString()))

        authProc.on("close", () => {
          try {
            const parsed = JSON.parse(authOut.trim())
            resolve(clean({
              installed: true,
              version,
              loggedIn: Boolean(parsed.loggedIn),
              authMethod: parsed.authMethod,
              apiProvider: parsed.apiProvider,
              email: parsed.email,
            }))
          } catch {
            const isLogged = authOut.includes('"loggedIn": true') || authOut.includes('"loggedIn":true')
            resolve(clean({
              installed: true,
              version,
              loggedIn: isLogged,
              error: authOut.slice(0, 100) || undefined,
            }))
          }
        })

        authProc.on("error", () => {
          resolve(clean({ installed: true, version, loggedIn: false }))
        })
      })
    } catch (err: any) {
      resolve(clean({ installed: false, loggedIn: false, error: err?.message }))
    }
  })
}

export async function checkOpenCodeStatus(): Promise<OpenCodeStatus> {
  return new Promise((resolve) => {
    try {
      const verProc = crossSpawn("opencode", ["--version"], {
        stdio: ["ignore", "pipe", "pipe"],
      })
      let verOut = ""
      verProc.stdout?.on("data", (d: Buffer) => (verOut += d.toString()))

      verProc.on("error", () => {
        resolve({ installed: false, authenticatedProviders: [], hasGroq: false, has9Router: false })
      })

      verProc.on("close", (verCode) => {
        const installed = verCode === 0 || !!verOut
        const version = verOut.trim().split("\n")[0] || undefined

        // Read ~/.local/share/opencode/auth.json
        const authPath = path.join(os.homedir(), ".local", "share", "opencode", "auth.json")
        let authenticatedProviders: string[] = []
        let hasGroq = false
        let has9Router = false

        if (fs.existsSync(authPath)) {
          try {
            const authJson = JSON.parse(fs.readFileSync(authPath, "utf8"))
            authenticatedProviders = Object.keys(authJson)
            hasGroq = Boolean(authJson.groq?.key)
            has9Router = Boolean(authJson["9router"]?.key || authJson["9router"])
          } catch {
            // Ignore parse errors
          }
        }

        resolve(clean({
          installed,
          version,
          authenticatedProviders,
          hasGroq,
          has9Router,
        }))
      })
    } catch (err: any) {
      resolve(clean({
        installed: false,
        authenticatedProviders: [],
        hasGroq: false,
        has9Router: false,
        error: err?.message,
      }))
    }
  })
}

export function getOpenCodeGroqKey(): string | undefined {
  const authPath = path.join(os.homedir(), ".local", "share", "opencode", "auth.json")
  if (fs.existsSync(authPath)) {
    try {
      const authJson = JSON.parse(fs.readFileSync(authPath, "utf8"))
      return authJson.groq?.key
    } catch {
      return undefined
    }
  }
  return undefined
}

export function checkAntigravityStatus(): AntigravityStatus {
  const geminiDir = path.join(os.homedir(), ".gemini")
  const detected = fs.existsSync(geminiDir)
  let cliInstalled = false
  let agyVersion: string | undefined = undefined
  let geminiCliInstalled = false
  let geminiVersion: string | undefined = undefined

  try {
    const proc = crossSpawn.sync("agy", ["--version"])
    if (proc.status === 0 || proc.stdout?.toString().trim()) {
      cliInstalled = true
      agyVersion = proc.stdout?.toString().trim().split("\n")[0]
    }
  } catch {}

  try {
    const geminiProc = crossSpawn.sync("gemini", ["--version"])
    if (geminiProc.status === 0 || geminiProc.stdout?.toString().trim()) {
      geminiCliInstalled = true
      geminiVersion = geminiProc.stdout?.toString().trim().split("\n")[0]
    }
  } catch {}

  return clean({
    detected: detected || cliInstalled || geminiCliInstalled,
    cliInstalled,
    agyInstalled: cliInstalled,
    agyVersion,
    geminiCliInstalled,
    geminiVersion,
    path: detected ? geminiDir : undefined,
    environment: cliInstalled
      ? `Google Antigravity CLI (${agyVersion ? `agy ${agyVersion}` : "agy"})`
      : geminiCliInstalled
      ? "Google Gemini CLI (@google/gemini-cli)"
      : "Google Antigravity IDE (Gemini Ecosystem)",
  })
}

let opencodeProcess: any = null

export async function checkOpenCodeServerRunning(port = 4097): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(600),
    })
    return res.ok || res.status < 500
  } catch {
    return false
  }
}

export function launchOpenCodeServer(port = 4097): { success: boolean; message: string; port: number } {
  try {
    if (opencodeProcess && !opencodeProcess.killed) {
      return { success: true, message: `OpenCode server is already running on port ${port}.`, port }
    }
    opencodeProcess = crossSpawn("opencode", ["serve", "--port", String(port), "--hostname", "127.0.0.1"], {
      detached: true,
      stdio: "ignore",
    })
    opencodeProcess.unref()
    return { success: true, message: `OpenCode server launched on port ${port}.`, port }
  } catch (err: any) {
    return { success: false, message: `Failed to launch OpenCode server: ${err.message}`, port }
  }
}

export async function checkNineRouterStatus(): Promise<NineRouterStatus> {
  const url = "http://localhost:20128/v1"
  let installed = false
  let version: string | undefined = undefined

  // 1. Check if 9router CLI binary exists on the system
  await new Promise<void>((resolve) => {
    try {
      const proc = crossSpawn("9router", ["--version"], { stdio: ["ignore", "pipe", "pipe"] })
      let out = ""
      proc.stdout?.on("data", (d: Buffer) => (out += d.toString()))
      proc.on("close", (code) => {
        if (code === 0 || out.trim()) {
          installed = true
          version = out.trim().split("\n")[0] || undefined
        }
        resolve()
      })
      proc.on("error", () => resolve())
    } catch {
      resolve()
    }
  })

  // 2. Check if local gateway daemon is actively responding on port 20128
  try {
    const res = await fetch(`${url}/models`, {
      signal: AbortSignal.timeout(1200),
    })
    if (!res.ok) {
      return clean({ installed, version, running: false, url, models: [] })
    }
    const json = (await res.json()) as { data?: Array<{ id?: string }> }
    const models = (json.data ?? []).map((m) => m.id).filter(Boolean) as string[]
    return clean({ installed, version, running: true, url, models })
  } catch {
    return clean({ installed, version, running: false, url, models: [] })
  }
}

export async function checkCodexStatus(): Promise<CodexStatus> {
  return new Promise((resolve) => {
    try {
      const proc = crossSpawn("codex", ["--version"], { stdio: ["ignore", "pipe", "pipe"] })
      let out = ""
      proc.stdout?.on("data", (d: Buffer) => (out += d.toString()))
      proc.on("close", (code) => {
        if (code === 0 && out.trim()) {
          return resolve({
            installed: true,
            version: out.trim().split("\n")[0] || undefined,
            isCloudOnly: false,
            message: "OpenAI Codex CLI (@openai/codex) installed on local PATH.",
          })
        }
        resolve({
          installed: false,
          isCloudOnly: false,
          message: "OpenAI Codex CLI (@openai/codex) is not installed. Run 'npm i -g @openai/codex'.",
        })
      })
      proc.on("error", () => {
        resolve({
          installed: false,
          isCloudOnly: false,
          message: "OpenAI Codex CLI (@openai/codex) is not installed. Run 'npm i -g @openai/codex'.",
        })
      })
    } catch {
      resolve({
        installed: false,
        isCloudOnly: false,
        message: "OpenAI Codex CLI (@openai/codex) is not installed. Run 'npm i -g @openai/codex'.",
      })
    }
  })
}

export function launchTerminalWithCommand(cmd: string, title = "Arunaki CLI"): { success: boolean; message: string } {
  try {
    if (process.platform === "win32") {
      spawn("cmd.exe", ["/c", "start", title, "cmd.exe", "/k", cmd], {
        detached: true,
        stdio: "ignore",
      })
    } else if (process.platform === "darwin") {
      spawn("open", ["-a", "Terminal", "-e", cmd], {
        detached: true,
        stdio: "ignore",
      })
    } else {
      spawn("x-terminal-emulator", ["-e", cmd], {
        detached: true,
        stdio: "ignore",
      })
    }
    return {
      success: true,
      message: `Terminal window opened for: ${cmd}`,
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to open terminal: ${err.message}. Please run '${cmd}' manually in terminal.`,
    }
  }
}

export function launchClaudeLoginTerminal(): { success: boolean; message: string } {
  return launchTerminalWithCommand("claude", "Claude Code CLI")
}

export async function getCliSupportedModels(target: string): Promise<string[]> {
  if (target === "antigravity" || target === "agy" || target === "gemini" || target === "gemini-cli") {
    return [
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-1.5-flash",
      "gemini-1.5-pro",
      "gemini-3.8-flash",
      "gemini-3.7-flash",
      "claude-sonnet-4.6",
      "claude-opus-4.6",
      "gpt-oss-120b",
    ]
  }

  if (target === "opencode") {
    return new Promise((resolve) => {
      try {
        const proc = crossSpawn("opencode", ["models"], { stdio: ["ignore", "pipe", "pipe"] })
        let stdout = ""
        proc.stdout?.on("data", (d: Buffer) => (stdout += d.toString()))
        proc.on("close", (code) => {
          if (code === 0 && stdout.trim()) {
            const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
            if (lines.length > 0) return resolve(lines)
          }
          resolve([
            "groq/llama-3.3-70b-versatile",
            "groq/openai/gpt-oss-120b",
            "groq/qwen/qwen3.8-27b",
            "groq/llama-3.1-8b-instant",
            "9router/ComboMaut",
            "opencode/nemotron-3.5-lightning-free",
          ])
        })
        proc.on("error", () => {
          resolve([
            "groq/llama-3.3-70b-versatile",
            "groq/openai/gpt-oss-120b",
            "groq/qwen/qwen3.8-27b",
            "groq/llama-3.1-8b-instant",
          ])
        })
      } catch {
        resolve(["groq/llama-3.3-70b-versatile", "groq/openai/gpt-oss-120b"])
      }
    })
  }

  if (target === "claude") {
    return ["claude-3-7-sonnet", "claude-3-5-sonnet", "claude-3-5-haiku", "claude-3-opus"]
  }

  if (target === "codex") {
    return ["o3-mini", "o1", "gpt-4o", "gpt-4o-mini"]
  }

  if (target === "9router") {
    const nine = await checkNineRouterStatus()
    if (nine.models.length > 0) return nine.models
    return ["cx/gpt-5.6-terra", "cx/gemini-2.5-pro", "claude-3-5-sonnet", "deepseek-r1"]
  }

  return []
}
