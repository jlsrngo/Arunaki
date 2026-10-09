import fs from "fs"
import path from "path"
import os from "os"
import {
    type DiscoveredCredential,
    getStorePath,
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

function jwtClaims(token?: unknown): any {
  if (!token || typeof token !== "string") return undefined
  try {
    const parts = token.split(".")
    if (parts.length < 2) return undefined
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))
  } catch {
    return undefined
  }
}

function emailFromJwt(idToken?: string): string | undefined {
  return jwtClaims(idToken)?.email || undefined
}

/** ChatGPT account id lives only inside the access token; the Codex endpoint wants it as a header. */
function accountIdFromJwt(accessToken?: string): string | undefined {
  return jwtClaims(accessToken)?.["https://api.openai.com/auth"]?.chatgpt_account_id || undefined
}

/**
 * The plan the token belongs to.
 *
 * This is the difference between a card that says Connected and a card that is honest: a free
 * account's token is valid and refreshes fine, then every single request is refused with "not
 * supported when using Codex with a ChatGPT account". Reading the plan lets the card say so
 * before the user sends anything.
 */
export function chatgptPlanType(accessToken?: string): string | undefined {
  return jwtClaims(accessToken)?.["https://api.openai.com/auth"]?.chatgpt_plan_type || undefined
}

/**
 * Fall back to Arunaki's own store when the vendor wrote no file.
 *
 * A browser OAuth token has no home on disk â€” it is minted by us and kept in the store with
 * an empty sourcePath â€” so the file readers below would never see it and the bridge would
 * report the provider as signed out even though sign-in succeeded.
 */
function readStoredCredential(provider: string): DiscoveredCredential | null {
  // Synchronous on purpose: these readers are sync and the bridge calls them per request.
  try {
    // Go through credential-store rather than rebuilding the path, so a custom store path
    // (ARUNAKI_CREDENTIAL_STORE_PATH) is honoured. Ignoring it made the harvester read a
    // different file than the one the rest of the system persisted to.
    const storePath = getStorePath()
    if (!fs.existsSync(storePath)) return null
    const all = JSON.parse(fs.readFileSync(storePath, "utf8")) as Record<string, DiscoveredCredential>
    const stored = all[provider]
    if (!stored?.accessToken) return null
    // Only reach for the store when the credential never had a file. If it did have one and
    // that file is now gone, the user signed out and we must honour that instead of
    // resurrecting a deleted credential.
    if (stored.sourcePath && !fs.existsSync(stored.sourcePath)) return null
    // sourcePath is returned exactly as stored. Substituting a placeholder here looked
    // harmless, but the next scan persisted that placeholder, and the guard above then rejected
    // the credential for having a file that never existed - which is how a freshly signed-in
    // Kiro ended up reported as "Not installed".
    return { ...stored }
  } catch {
    return null
  }
}

export function readCodexCredential(customHome?: string): DiscoveredCredential | null {
  const p = path.join(customHome || os.homedir(), ".codex", "auth.json")
  const data = readJson(p)
  if (!data) {
    const stored = readStoredCredential("codex")
    // Backfill for credentials minted before account-id extraction existed, so an existing
    // token does not need a re-login to get the header.
    if (stored && !stored.accountId) return { ...stored, accountId: accountIdFromJwt(stored.accessToken) }
    return stored
  }

  // Mode OAuth: { tokens: { access_token, refresh_token, account_id, id_token?, expires_at? } }
  const t = data.tokens
  if (t?.access_token) {
    return {
      provider: "codex",
      displayName: "OpenAI Codex / ChatGPT Pro",
      type: "oauth",
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      accountId: t.account_id ?? accountIdFromJwt(t.access_token),
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

  // Browser sign-in writes no file, so check Arunaki's store before giving up.
  return readStoredCredential("claude")
}

export function readKiroCredential(customHome?: string): DiscoveredCredential | null {
  const cacheDir = path.join(customHome || os.homedir(), ".aws", "sso", "cache")
  // A browser device flow writes no AWS SSO cache file, so the store is the only place the
  // token exists. Without this the bridge reports Kiro as signed out right after a successful
  // sign-in, which is the same failure Codex had.
  const stored = readStoredCredential("kiro")
  if (!fs.existsSync(cacheDir)) return stored
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
    if (!tokenEntry) return stored
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
  let stored: Record<string, DiscoveredCredential>
  try {
    stored = await loadAllCredentials()
  } catch {
    // The store exists but is unreadable. Writing results now would replace a possibly
    // recoverable file with an empty one, which is how every credential on the machine was
    // destroyed once already. Leave the file alone and report what this scan found.
    console.warn("[CredentialStore] store unreadable during scan; not overwriting it")
    cachedScan = { timestamp: Date.now(), results }
    return results
  }
  for (const [k, v] of Object.entries(stored)) {
    // Prevent mock test fixtures or deleted files from resurrecting as live credentials
    if (v.sourcePath === "mock") continue
    // OAuth credentials have no file on disk: the token lives only in this store and the
    // path is just a label. Dropping them here wiped a freshly minted Codex token about a
    // minute after the browser said "Connected", so exempt anything that never had a file.
    if (v.sourcePath && !fs.existsSync(v.sourcePath)) continue
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
