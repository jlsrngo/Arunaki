import fs from "fs"
import path from "path"
import os from "os"
import {
  type DiscoveredCredential,
  loadAllCredentials,
  saveAllCredentials,
} from "./credential-store.js"

export { type DiscoveredCredential }

const readJson = (p: string): any | null => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"))
  } catch {
    return null
  }
}

function emailFromJwt(idToken?: string): string | undefined {
  if (!idToken || typeof idToken !== "string") return undefined
  try {
    const parts = idToken.split(".")
    if (parts.length < 2) return undefined
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))
    return payload.email || undefined
  } catch {
    return undefined
  }
}

export function readCodexCredential(customHome?: string): DiscoveredCredential | null {
  const p = path.join(customHome || os.homedir(), ".codex", "auth.json")
  const data = readJson(p)
  if (!data) return null

  // Mode OAuth: { tokens: { access_token, refresh_token, account_id, id_token?, expires_at? } }
  const t = data.tokens
  if (t?.access_token) {
    return {
      provider: "codex",
      displayName: "OpenAI Codex / ChatGPT Pro",
      type: "oauth",
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      accountId: t.account_id,
      expiresAt: typeof t.expires_at === "number" ? t.expires_at * 1000 : undefined,
      accountEmail: emailFromJwt(t.id_token) || data.email,
      sourcePath: p,
      lastRefreshAt: Date.parse(data.last_refresh || "") || undefined,
    }
  }

  // Mode API key: { OPENAI_API_KEY: "sk-proj-..." }
  if (typeof data.OPENAI_API_KEY === "string" && data.OPENAI_API_KEY) {
    return {
      provider: "codex",
      displayName: "OpenAI API Key (Codex)",
      type: "api_key",
      accessToken: data.OPENAI_API_KEY,
      sourcePath: p,
    }
  }

  return null
}

export function readClaudeCredential(customHome?: string): DiscoveredCredential | null {
  const home = customHome || os.homedir()
  // Sumber utama: ~/.claude/.credentials.json
  const credPath = path.join(home, ".claude", ".credentials.json")
  const cred = readJson(credPath)
  const oauth = cred?.claudeAiOauth
  if (oauth?.accessToken) {
    return {
      provider: "claude",
      displayName: "Claude Code CLI",
      type: "oauth",
      accessToken: oauth.accessToken,
      refreshToken: oauth.refreshToken,
      expiresAt: typeof oauth.expiresAt === "number" ? oauth.expiresAt : undefined,
      sourcePath: credPath,
    }
  }

  // Fallback: ~/.claude/settings.json env
  const st = readJson(path.join(home, ".claude", "settings.json"))
  const key = st?.env?.ANTHROPIC_API_KEY || st?.env?.ANTHROPIC_AUTH_TOKEN
  if (typeof key === "string" && key) {
    return {
      provider: "claude",
      displayName: "Claude Code CLI",
      type: "api_key",
      accessToken: key,
      sourcePath: path.join(home, ".claude", "settings.json"),
    }
  }

  return null
}

export function readKiroCredential(customHome?: string): DiscoveredCredential | null {
  const cacheDir = path.join(customHome || os.homedir(), ".aws", "sso", "cache")
  if (!fs.existsSync(cacheDir)) return null
  try {
    const files = fs.readdirSync(cacheDir).filter((f) => f.endsWith(".json"))
    let tokenEntry: any = null
    let clientCreds: any = null
    for (const f of files) {
      const d = readJson(path.join(cacheDir, f))
      if (!d) continue
      if (typeof d.refreshToken === "string" && d.refreshToken.startsWith("aorAAAAAG")) {
        tokenEntry = { d, f }
      } else if (d.clientId && d.clientSecret) {
        clientCreds = d
      }
    }
    if (!tokenEntry) return null
    const d = tokenEntry.d
    return {
      provider: "kiro",
      displayName: "AWS Kiro AI (Free Sonnet)",
      type: "oauth",
      accessToken: d.accessToken || "",
      refreshToken: d.refreshToken,
      expiresAt: d.expiresAt ? Date.parse(d.expiresAt) : undefined,
      region: d.region || clientCreds?.region,
      clientId: clientCreds?.clientId,
      clientSecret: clientCreds?.clientSecret,
      profileArn: clientCreds?.profileArn,
      sourcePath: path.join(cacheDir, tokenEntry.f),
    }
  } catch {
    return null
  }
}

export function readCursorCredential(customAppdata?: string): DiscoveredCredential | null {
  const appData = customAppdata || process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
  const candidates = [
    path.join(appData, "state.vscdb"),
    path.join(appData, "Cursor", "User", "globalStorage", "state.vscdb"),
    path.join(os.homedir(), "Library", "Application Support", "Cursor", "User", "globalStorage", "state.vscdb"),
    path.join(os.homedir(), ".config", "Cursor", "User", "globalStorage", "state.vscdb"),
  ]

  for (const dbPath of candidates) {
    if (!fs.existsSync(dbPath)) continue
    let db: any = null
    try {
      const { Database } = require("bun:sqlite")
      db = new Database(dbPath, { readonly: true })
      const q = db.query("SELECT value FROM ItemTable WHERE key = ?")
      const at = q.get("cursorAuth/accessToken") as any
      const rt = q.get("cursorAuth/refreshToken") as any
      if (at?.value) {
        const atVal = at.value instanceof Uint8Array ? Buffer.from(at.value).toString("utf8") : String(at.value)
        const rtVal = rt?.value ? (rt.value instanceof Uint8Array ? Buffer.from(rt.value).toString("utf8") : String(rt.value)) : undefined
        return {
          provider: "cursor",
          displayName: "Cursor IDE Subscription",
          type: rtVal ? "oauth" : "api_key",
          accessToken: atVal,
          refreshToken: rtVal,
          sourcePath: dbPath,
        }
      }
    } catch (err: any) {
      console.warn("[Harvester] cursor read skipped:", err?.message)
    } finally {
      if (db) {
        try { db.close() } catch {}
      }
    }
  }
  return null
}

let cachedScan: { timestamp: number; results: Record<string, DiscoveredCredential> } | null = null

export async function scanLocalCredentials(forceRefresh = false): Promise<Record<string, DiscoveredCredential>> {
  if (!forceRefresh && cachedScan && Date.now() - cachedScan.timestamp < 60000) {
    return cachedScan.results
  }

  const results: Record<string, DiscoveredCredential> = {}

  const codex = readCodexCredential()
  if (codex) results.codex = codex

  const claude = readClaudeCredential()
  if (claude) results.claude = claude

  const kiro = readKiroCredential()
  if (kiro) results.kiro = kiro

  const cursor = readCursorCredential()
  if (cursor) results.cursor = cursor

  // Merge with previously saved state (which may contain fresh refreshed tokens)
  const stored = await loadAllCredentials()
  for (const [k, v] of Object.entries(stored)) {
    if (!results[k]) {
      results[k] = v
    } else if (v.lastRefreshAt && (!results[k].lastRefreshAt || v.lastRefreshAt > results[k].lastRefreshAt!)) {
      results[k] = { ...results[k], ...v }
    }
  }

  await saveAllCredentials(results)
  cachedScan = { timestamp: Date.now(), results }
  return results
}

export function invalidateCredentialCache(): void {
  cachedScan = null
}
