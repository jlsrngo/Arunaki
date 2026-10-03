import { spawn } from "child_process"
import crossSpawn from "cross-spawn"

export interface ClaudeStatus {
  installed: boolean
  version?: string
  loggedIn: boolean
  authMethod?: string
  apiProvider?: string
  email?: string
  error?: string
}

export interface NineRouterStatus {
  running: boolean
  url: string
  models: string[]
}

export interface LocalCliStatusResult {
  claude: ClaudeStatus
  nineRouter: NineRouterStatus
  bridgePort: number
  bridgeRunning: boolean
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
            resolve({
              installed: true,
              version,
              loggedIn: Boolean(parsed.loggedIn),
              authMethod: parsed.authMethod,
              apiProvider: parsed.apiProvider,
              email: parsed.email,
            })
          } catch {
            const isLogged = authOut.includes('"loggedIn": true') || authOut.includes('"loggedIn":true')
            resolve({
              installed: true,
              version,
              loggedIn: isLogged,
              error: authOut.slice(0, 100),
            })
          }
        })

        authProc.on("error", () => {
          resolve({ installed: true, version, loggedIn: false })
        })
      })
    } catch (err: any) {
      resolve({ installed: false, loggedIn: false, error: err?.message })
    }
  })
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
      message: "Terminal window opened. Complete the login in your browser, then click 'Scan Agents'.",
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to open terminal: ${err.message}. Please run 'claude auth login --claudeai' manually in terminal.`,
    }
  }
}
