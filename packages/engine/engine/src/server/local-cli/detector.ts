import { spawn } from "child_process"
import crossSpawn from "cross-spawn"
import fs from "node:fs"
import http from "node:http"
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
  agySignedIn?: boolean
  agyVersion?: string
  geminiCliInstalled?: boolean
  geminiVersion?: string
  path?: string
  environment: string
  loggedIn?: boolean
  accountEmail?: string
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

const statusCache = new Map<string, { data: any; expires: number }>()

function getCached<T>(key: string): T | undefined {
  const item = statusCache.get(key)
  if (item && Date.now() < item.expires) return item.data as T
  return undefined
}

function setCached<T>(key: string, data: T, ttlMs = 120000): T {
  statusCache.set(key, { data, expires: Date.now() + ttlMs })
  return data
}

export function prewarmLocalCliStatus(): void {
  try {
    checkAntigravityStatus(true)
    checkClaudeStatus().catch(() => {})
    checkOpenCodeStatus().catch(() => {})
    checkNineRouterStatus().catch(() => {})
    checkCodexStatus().catch(() => {})
  } catch {}
}

export async function checkClaudeStatus(forceRefresh = false): Promise<ClaudeStatus> {
  if (!forceRefresh) {
    const cached = getCached<ClaudeStatus>("claude")
    if (cached) return cached
  }
  return new Promise((resolve) => {
    const resolveWithCache = (val: ClaudeStatus) => resolve(setCached("claude", val))
    try {
      // 1. Run claude --version to verify binary presence
      const verProc = crossSpawn("claude", ["--version"], {
        stdio: ["ignore", "pipe", "pipe"],
      })
      let verOut = ""
      verProc.stdout?.on("data", (d: Buffer) => (verOut += d.toString()))

      verProc.on("error", () => {
        resolveWithCache({ installed: false, loggedIn: false })
      })

      verProc.on("close", (verCode) => {
        if (verCode !== 0 && !verOut) {
          return resolveWithCache({ installed: false, loggedIn: false })
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
            resolveWithCache(clean({
              installed: true,
              version,
              loggedIn: Boolean(parsed.loggedIn),
              authMethod: parsed.authMethod,
              apiProvider: parsed.apiProvider,
              email: parsed.email,
            }))
          } catch {
            const isLogged = authOut.includes('"loggedIn": true') || authOut.includes('"loggedIn":true')
            resolveWithCache(clean({
              installed: true,
              version,
              loggedIn: isLogged,
              error: authOut.slice(0, 100) || undefined,
            }))
          }
        })

        authProc.on("error", () => {
          resolveWithCache(clean({ installed: true, version, loggedIn: false }))
        })
      })
    } catch (err: any) {
      resolveWithCache(clean({ installed: false, loggedIn: false, error: err?.message }))
    }
  })
}

export async function checkOpenCodeStatus(forceRefresh = false): Promise<OpenCodeStatus> {
  if (!forceRefresh) {
    const cached = getCached<OpenCodeStatus>("opencode")
    if (cached) return cached
  }
  return new Promise((resolve) => {
    const resolveWithCache = (val: OpenCodeStatus) => resolve(setCached("opencode", val))
    try {
      const verProc = crossSpawn("opencode", ["--version"], {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 1500,
        windowsHide: true,
      })
      let verOut = ""
      verProc.stdout?.on("data", (d: Buffer) => (verOut += d.toString()))

      verProc.on("error", () => {
        resolveWithCache({ installed: false, authenticatedProviders: [], hasGroq: false, has9Router: false })
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

        resolveWithCache(clean({
          installed,
          version,
          authenticatedProviders,
          hasGroq,
          has9Router,
        }))
      })
    } catch (err: any) {
      resolveWithCache(clean({
        installed: false,
        authenticatedProviders: [],
        hasGroq: false,
        has9Router: false,
        error: err?.message,
      }))
    }
  })
}

/**
 * OAuth client used to refresh the Gemini/Antigravity access token.
 *
 * Deliberately NOT committed: GitHub secret scanning rejects the repo for embedded
 * client secrets. These are Google's public installed-app credentials, so supply them
 * out-of-band, either as env vars or in a local (gitignored) file:
 *
 *   GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET
 *   ~/.arunaki/oauth-clients.json  ->  { "google": { "clientId": "...", "clientSecret": "..." } }
 *
 * The id_token audience of a stored credential tells you which client issued it; using
 * the other one returns 401.
 */
export function loadGoogleOAuthClient(): { clientId: string; clientSecret: string } | null {
  const envId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const envSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (envId && envSecret) return { clientId: envId, clientSecret: envSecret }

  try {
    const local = path.join(os.homedir(), ".arunaki", "oauth-clients.json")
    const parsed = JSON.parse(fs.readFileSync(local, "utf8"))
    const g = parsed?.google
    if (g?.clientId && g?.clientSecret) return { clientId: g.clientId, clientSecret: g.clientSecret }
  } catch {}

  return null
}

let antigravityAuth: { accessToken: string; refreshToken?: string; expiresAt?: number; projectId?: string } | null = null
let antigravityAuthCheckedAt = 0

/**
 * Access token for the Antigravity (Google AI Pro) subscription, refreshed when stale.
 * 9Router refreshLeadMs is 5 minutes; we use a wider lead because a stale token here
 * costs a failed round-trip plus a retry.
 */
export async function getAntigravityAuth(force = false): Promise<typeof antigravityAuth> {
  if (!force && antigravityAuth && Date.now() - antigravityAuthCheckedAt < 60_000) {
    return antigravityAuth
  }
  antigravityAuthCheckedAt = Date.now()

  // Credential Manager first: it is the Antigravity-scoped token (has cclog), unlike the
  // ~/.gemini copy which Google refuses with 403 PERMISSION_DENIED.
  const fromCredManager = readAntigravityCredentialManager()
  if (fromCredManager?.accessToken) {
    const fresh =
      !fromCredManager.expiresAt || fromCredManager.expiresAt - Date.now() > 5 * 60_000
    if (fresh) return (antigravityAuth = fromCredManager)
    // Stale but renewable: agy refreshes the shared Credential Manager entry for us, so
    // prefer that over demanding GOOGLE_OAUTH_CLIENT_* the user has no reason to set.
    const renewed = await refreshAntigravityCredentialViaAgy()
    const after = renewed ? readAntigravityCredentialManager() : undefined
    if (after?.accessToken) return (antigravityAuth = after)
  }

  const credsPath = path.join(os.homedir(), ".gemini", "oauth_creds.json")
  if (!fs.existsSync(credsPath)) return (antigravityAuth = null)
  let creds: any
  try {
    creds = JSON.parse(fs.readFileSync(credsPath, "utf8"))
  } catch {
    return (antigravityAuth = null)
  }

  const expiresAt = typeof creds.expiry_date === "number" ? creds.expiry_date : undefined
  const stillFresh = expiresAt != null && expiresAt - Date.now() > 5 * 60_000
  if (stillFresh && creds.access_token) {
    return (antigravityAuth = {
      accessToken: creds.access_token,
      refreshToken: creds.refresh_token,
      expiresAt,
    })
  }
  if (!creds.refresh_token) {
    return (antigravityAuth = creds.access_token ? { accessToken: creds.access_token, expiresAt } : null)
  }

  const client = loadGoogleOAuthClient()
  if (!client) {
    console.warn(
      "[Antigravity] Stored token expired and no OAuth client configured — set GOOGLE_OAUTH_CLIENT_ID/" +
        "GOOGLE_OAUTH_CLIENT_SECRET or ~/.arunaki/oauth-clients.json, then re-run.",
    )
    return (antigravityAuth = creds.access_token ? { accessToken: creds.access_token, expiresAt } : null)
  }

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: creds.refresh_token,
        client_id: client.clientId,
        client_secret: client.clientSecret,
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      console.warn(`[Antigravity] token refresh HTTP ${res.status}`)
      return (antigravityAuth = creds.access_token ? { accessToken: creds.access_token, expiresAt } : null)
    }
    const data: any = await res.json()
    return (antigravityAuth = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? creds.refresh_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    })
  } catch (err: any) {
    console.warn("[Antigravity] token refresh failed:", err?.message)
    return (antigravityAuth = creds.access_token ? { accessToken: creds.access_token, expiresAt } : null)
  }
}

/**
 * OpenCode account session from ~/.local/share/opencode/auth.json.
 * OpenCode Zen's free lane answers 403 "only from within OpenCode" unless the request
 * carries a real account token; the pooled `Bearer public` lane is the fallback
 * (same shape as 9Router's opencode.js executor).
 */
export function getOpenCodeAccountToken(): string | undefined {
  try {
    const authPath = path.join(os.homedir(), ".local", "share", "opencode", "auth.json")
    if (!fs.existsSync(authPath)) return undefined
    const auth = JSON.parse(fs.readFileSync(authPath, "utf8"))
    const entry = auth.opencode ?? auth["opencode-zen"]
    const token = entry?.refresh ?? entry?.key ?? entry?.access ?? entry?.token
    return typeof token === "string" && token ? token : undefined
  } catch {
    return undefined
  }
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

export function resolveAgyCommand(): string {
  const local = process.env.LOCALAPPDATA
  if (local) {
    const exe = path.join(local, "agy", "bin", process.platform === "win32" ? "agy.exe" : "agy")
    if (fs.existsSync(exe)) return exe
  }
  const unix = path.join(os.homedir(), ".local", "bin", "agy")
  if (process.platform !== "win32" && fs.existsSync(unix)) return unix
  return "agy"
}

export function checkAntigravityStatus(forceRefresh = false): AntigravityStatus {
  if (!forceRefresh) {
    const cached = getCached<AntigravityStatus>("antigravity")
    if (cached) return cached
  }
  const geminiDir = path.join(os.homedir(), ".gemini")
  const credsPath = path.join(geminiDir, "oauth_creds.json")
  const accountsPath = path.join(geminiDir, "google_accounts.json")
  const detected = fs.existsSync(geminiDir)
  let loggedIn = false
  let accountEmail: string | undefined = undefined

  if (fs.existsSync(credsPath)) {
    try {
      const creds = JSON.parse(fs.readFileSync(credsPath, "utf8"))
      if (creds.access_token || creds.refresh_token) {
        loggedIn = true
      }
    } catch {}
  }

  if (fs.existsSync(accountsPath)) {
    try {
      const acc = JSON.parse(fs.readFileSync(accountsPath, "utf8"))
      if (typeof acc.active === "string" && acc.active.includes("@")) {
        accountEmail = acc.active
      } else if (acc.active?.email) {
        accountEmail = acc.active.email
      }
    } catch {}
  }

  let cliInstalled = false
  let agyVersion: string | undefined = undefined
  let geminiCliInstalled = false
  let geminiVersion: string | undefined = undefined

  const agyCmd = resolveAgyCommand()
  if (path.isAbsolute(agyCmd) && fs.existsSync(agyCmd)) {
    cliInstalled = true
  }

  try {
    const proc = crossSpawn.sync(agyCmd, ["--version"], { timeout: 1500, windowsHide: true })
    if (proc.status === 0 || proc.stdout?.toString().trim()) {
      cliInstalled = true
      agyVersion = proc.stdout?.toString().trim().split("\n")[0]
    }
  } catch {}

  if (!cliInstalled) {
    try {
      const geminiProc = crossSpawn.sync("gemini", ["--version"], { timeout: 1500, windowsHide: true })
      if (geminiProc.status === 0 || geminiProc.stdout?.toString().trim()) {
        geminiCliInstalled = true
        geminiVersion = geminiProc.stdout?.toString().trim().split("\n")[0]
      }
    } catch {}
  }

  return setCached("antigravity", clean({
    detected: detected || cliInstalled || geminiCliInstalled,
    cliInstalled,
    agyInstalled: cliInstalled,
    agyVersion,
    // The credential that actually matters for the direct Cloud Code route lives in
    // Credential Manager, not in ~/.gemini, so report it separately from `loggedIn`.
    agySignedIn: cliInstalled ? readAntigravityCredentialManager()?.accessToken != null : false,
    geminiCliInstalled,
    geminiVersion,
    path: detected ? geminiDir : undefined,
    loggedIn,
    accountEmail,
    environment: cliInstalled
      ? `Google Antigravity CLI (${agyVersion ? `agy ${agyVersion}` : "agy"})`
      : geminiCliInstalled
      ? "Google Gemini CLI (@google/gemini-cli)"
      : "Google Antigravity IDE (Gemini Ecosystem)",
  }), 120000)
}

export function logoutAntigravity(): { success: boolean; message: string } {
  const geminiDir = path.join(os.homedir(), ".gemini")
  const credsPath = path.join(geminiDir, "oauth_creds.json")
  const accountsPath = path.join(geminiDir, "google_accounts.json")
  try {
    if (fs.existsSync(credsPath)) fs.unlinkSync(credsPath)
    if (fs.existsSync(accountsPath)) fs.unlinkSync(accountsPath)
    setCached("antigravity", undefined as any)
    return { success: true, message: "Logged out from Google Antigravity." }
  } catch (err: any) {
    return { success: false, message: `Failed to logout: ${err.message}` }
  }
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

/**
 * Antigravity's session lives in Windows Credential Manager, not in a readable file:
 * the IDE's `globalStorage/state.vscdb` copy is encrypted (bzip2 + protobuf envelope
 * keyed on "AuthStateWithContextSentinelKey"), but the same credential is stored in
 * plaintext as `gemini:antigravity`. Reading it lets us talk to the Cloud Code API
 * directly instead of routing every turn through the `agy` process (~2.8s vs ~12.7s).
 *
 * Windows-only; callers fall back to the `agy` worker elsewhere.
 */
export function readAntigravityCredentialManager(): {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
} | null {
  if (process.platform !== "win32") return null
  try {
    const { dlopen, FFIType, ptr, toBuffer } = require("bun:ffi") as typeof import("bun:ffi")

    const lib = dlopen("advapi32.dll", {
      CredReadW: {
        args: [FFIType.ptr, FFIType.i32, FFIType.i32, FFIType.ptr],
        returns: FFIType.i32,
      },
      // Declared as i64 rather than ptr: bun:ffi refuses to convert the bigint we read
      // back from the out-pointer into a Pointer, and the callee only frees memory.
      CredFree: { args: [FFIType.i64], returns: FFIType.void },
    })

    const target = Buffer.from("gemini:antigravity\0", "utf16le")
    const out = Buffer.alloc(8)

    const ok = lib.symbols.CredReadW(ptr(target), 1, 0, ptr(out))
    if (!ok) return null

    const credPtr = out.readBigInt64LE(0)
    if (!credPtr) return null

    // bun:ffi accepts a pointer (number/bigint) for toBuffer at runtime, but the bundled
    // type only declares TypedArray/DataView, hence the local view helper.
    const view = (address: number | bigint, length: number) =>
      toBuffer(address as never, 0, length)

    try {
      // CREDENTIAL on x64: Flags 0, Type 4, TargetName 8, Comment 16, LastWritten 24,
      // CredentialBlobSize 32, (pad 36), CredentialBlob 40.
      const struct = view(credPtr, 96)
      const size = struct.readUInt32LE(32)
      if (!size || size > 65536) return null
      const parsed = JSON.parse(view(struct.readBigUInt64LE(40), size).toString("utf8"))
      const t = parsed?.token
      if (!t?.access_token) return null
      // `expiry` is an ISO-8601 string with offset, not an epoch number.
      const parsedExpiry = typeof t.expiry === "string" ? Date.parse(t.expiry) : undefined
      return {
        accessToken: t.access_token,
        refreshToken: t.refresh_token,
        expiresAt: Number.isFinite(parsedExpiry) ? parsedExpiry : undefined,
      }
    } finally {
      try {
        lib.symbols.CredFree(credPtr)
      } catch {}
    }
  } catch {
    return null
  }
}

/**
 * Is the Antigravity CLI (`agy`) present and already signed in?
 *
 * `agy` has no login subcommand — it authenticates interactively when run in a terminal,
 * and refuses to do so in print mode ("Print mode: not logged in and no controlling
 * terminal"). So sign-in has to happen in a real terminal, which is what
 * `launchAntigravityLogin` opens.
 */
export function checkAntigravityCli(): { installed: boolean; signedIn: boolean } {
  const cmd = resolveAgyCommand()
  if (!cmd || !fs.existsSync(cmd)) return { installed: false, signedIn: false }

  // The Antigravity IDE keeps its session in its globalStorage database; the presence of
  // that key is what lets `agy` run in print mode.
  const dbPath = path.join(
    process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
    "Antigravity",
    "User",
    "globalStorage",
    "state.vscdb",
  )
  try {
    if (!fs.existsSync(dbPath)) return { installed: true, signedIn: false }
    const { Database } = require("bun:sqlite")
    const db = new Database(dbPath, { readonly: true })
    try {
      const row: any = db
        .query("SELECT value FROM ItemTable WHERE key = ?")
        .get("antigravityUnifiedStateSync.oauthToken")
      const raw = row?.value instanceof Uint8Array ? Buffer.from(row.value).toString("utf8") : row?.value
      return { installed: true, signedIn: typeof raw === "string" && raw.length > 64 }
    } finally {
      db.close()
    }
  } catch {
    return { installed: true, signedIn: false }
  }
}

/** Opens a real terminal running `agy` so the user can complete its Google sign-in. */
/**
 * Nudge `agy` so it refreshes its own stored credential, then re-read it.
 *
 * The Credential Manager copy carries a refresh_token, but spending it needs the
 * Antigravity OAuth client — which we deliberately do not commit. Running any `agy`
 * command makes it renew the shared credential itself (verified: an expired token went
 * from -2 minutes to +60 minutes after `agy models`), so we borrow that path instead.
 */
export async function refreshAntigravityCredentialViaAgy(): Promise<boolean> {
  const cmd = resolveAgyCommand()
  if (!cmd || !fs.existsSync(cmd)) return false
  const before = readAntigravityCredentialManager()?.accessToken
  try {
    crossSpawn.sync(cmd, ["models"], {
      timeout: 45000,
      windowsHide: true,
      stdio: ["ignore", "ignore", "ignore"],
    })
  } catch {
    return false
  }
  // Drop the short-lived cache so the next read picks up whatever agy just wrote.
  antigravityAuth = null
  antigravityAuthCheckedAt = 0
  const after = readAntigravityCredentialManager()
  if (!after?.accessToken) return false
  // Report whether we ended up with a usable token, not whether the string changed: agy can
  // refresh in place, and a still-valid token is a success for every caller here.
  const usable = !after.expiresAt || after.expiresAt - Date.now() > 60_000
  return usable || Boolean(after.accessToken && after.accessToken !== before)
}

export function launchAntigravityLogin(): { success: boolean; message: string } {
  const cmd = resolveAgyCommand()
  if (!cmd || !fs.existsSync(cmd)) {
    return { success: false, message: "Antigravity CLI (agy) is not installed on this system." }
  }
  const res = launchTerminalWithCommand(`"${cmd}"`, "Sign in to Antigravity")
  return res.success
    ? { success: true, message: "A terminal opened with Antigravity. Complete the Google sign-in there, then close it." }
    : res
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
  return launchTerminalWithCommand("claude auth login --claudeai", "Claude Code CLI (Login)")
}

export async function getCliSupportedModels(target: string): Promise<string[]> {
  if (target === "antigravity" || target === "agy" || target === "gemini" || target === "gemini-cli") {
    // Ask the account which models it can actually use; the list changes as Google ships
    // and retires tiers, so a hardcoded array goes stale. Keep the old list as fallback.
    const { fetchAntigravityModels } = await import("./upstream.js")
    const live = await fetchAntigravityModels(await getAntigravityAuth())
    if (live?.length) return live
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

  if (target === "kiro") {
    // Ask AWS what this account can run. Kiro's catalogue changed while this was being written:
    // a hardcoded list named a model the endpoint has never returned and missed two others.
    const { fetchKiroModels } = await import("./kiro.js")
    const live = await fetchKiroModels()
    if (live?.length) return live.map((m) => `kiro/${m}`)
    return ["kiro/claude-sonnet-4.5", "kiro/claude-haiku-4.5", "kiro/deepseek-3.2", "kiro/qwen3-coder-next"]
  }
  if (target === "codex") {
    // Codex publishes a catalogue too, but it answers an empty list on a free account while
    // individual models still answer. Fall back to the ones verified by probing.
    const { fetchCodexModels, CODEX_VERIFIED_FALLBACK } = await import("./codex-models.js")
    const live = await fetchCodexModels()
    if (live?.length) return live
    return CODEX_VERIFIED_FALLBACK
  }  if (target === "opencode") {
    return new Promise((resolve) => {
      try {
        const proc = crossSpawn("opencode", ["models"], {
          stdio: ["ignore", "pipe", "pipe"],
          // Enumerating the catalogue takes ~4s cold: it probes every configured provider.
          // At the old 1500ms budget the child was killed before it printed anything, so the
          // settings UI silently showed a 7-item fallback instead of the real 28 models.
          timeout: 15000,
          windowsHide: true,
        })
        let stdout = ""
        proc.stdout?.on("data", (d: Buffer) => (stdout += d.toString()))
        proc.on("close", (code) => {
          if (code === 0 && stdout.trim()) {
            const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
            if (lines.length > 0) return resolve(lines)
          }
          resolve([
            "opencode/big-pickle",
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
            "opencode/big-pickle",
            "groq/llama-3.3-70b-versatile",
            "groq/openai/gpt-oss-120b",
            "groq/qwen/qwen3.8-27b",
            "groq/llama-3.1-8b-instant",
          ])
        })
      } catch {
        resolve(["opencode/big-pickle", "groq/llama-3.3-70b-versatile", "groq/openai/gpt-oss-120b"])
      }
    })
  }

  if (target === "claude") {
    return ["claude-3-7-sonnet", "claude-3-5-sonnet", "claude-3-5-haiku", "claude-3-opus"]
  }

if (target === "9router") {
    const nine = await checkNineRouterStatus()
    if (nine.models.length > 0) return nine.models
    return ["cx/gpt-5.6-terra", "cx/gemini-2.5-pro", "claude-3-5-sonnet", "deepseek-r1"]
  }

  return []
}
