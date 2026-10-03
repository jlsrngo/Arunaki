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
  path?: string
  environment: string
}

export interface NineRouterStatus {
  running: boolean
  url: string
  models: string[]
}

export interface LocalCliStatusResult {
  claude: ClaudeStatus
  opencode: OpenCodeStatus
  antigravity: AntigravityStatus
  nineRouter: NineRouterStatus
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
  return clean({
    detected,
    path: detected ? geminiDir : undefined,
    environment: "Google Antigravity IDE (Gemini Ecosystem)",
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
  try {
    const res = await fetch(`${url}/models`, {
      signal: AbortSignal.timeout(1200),
    })
    if (!res.ok) {
      return { running: false, url, models: [] }
    }
    const json = (await res.json()) as { data?: Array<{ id?: string }> }
    const models = (json.data ?? []).map((m) => m.id).filter(Boolean) as string[]
    return { running: true, url, models }
  } catch {
    return { running: false, url, models: [] }
  }
}

export function launchClaudeLoginTerminal(): { success: boolean; message: string } {
  try {
    if (process.platform === "win32") {
      spawn("cmd.exe", ["/c", "start", "cmd.exe", "/k", "claude auth login --claudeai"], {
        detached: true,
        stdio: "ignore",
      })
    } else if (process.platform === "darwin") {
      spawn("open", ["-a", "Terminal", "-e", "claude auth login --claudeai"], {
        detached: true,
        stdio: "ignore",
      })
    } else {
      spawn("x-terminal-emulator", ["-e", "claude auth login --claudeai"], {
        detached: true,
        stdio: "ignore",
      })
    }
    return {
      success: true,
      message: "Terminal window opened. Complete the login in your browser, then click 'Scan Status'.",
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to open terminal: ${err.message}. Please run 'claude auth login --claudeai' manually in terminal.`,
    }
  }
}
