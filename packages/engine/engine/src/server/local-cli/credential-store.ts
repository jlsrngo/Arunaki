import fs from "fs"
import path from "path"
import os from "os"

export interface DiscoveredCredential {
  provider: "codex" | "cursor" | "kiro" | "claude" | "antigravity"
  displayName: string
  type: "oauth" | "api_key"
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  accountEmail?: string
  accountId?: string
  clientId?: string
  clientSecret?: string
  profileArn?: string
  region?: string
  sourcePath: string
  lastRefreshAt?: number
}

let customStorePath: string | null = process.env.ARUNAKI_CREDENTIAL_STORE_PATH || null

export function setCustomStorePath(p: string | null): void {
  customStorePath = p
}

export function getStorePath(): string {
  if (customStorePath) return customStorePath
  const baseDir = path.join(os.homedir(), ".arunaki")
  try {
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true })
    }
  } catch {}
  return path.join(baseDir, "local-cli-credentials.json")
}

/** Raised when the store exists but cannot be parsed. Never treat this as "no credentials". */
export class CredentialStoreUnreadableError extends Error {
  constructor(public readonly storePath: string, cause?: any) {
    super(`Credential store at ${storePath} could not be read: ${cause?.message ?? cause}`)
    this.name = "CredentialStoreUnreadableError"
  }
}

export async function loadAllCredentials(): Promise<Record<string, DiscoveredCredential>> {
  const storePath = getStorePath()
  if (!fs.existsSync(storePath)) return {}
  const raw = fs.readFileSync(storePath, "utf8")
  // Windows editors write a BOM, which JSON.parse rejects. Strip it rather than treating the
  // whole store as unreadable, since that now means the credentials are unusable with no way out.
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
  if (!text.trim()) return {}
  try {
    return JSON.parse(text)
  } catch (err: any) {
    throw new CredentialStoreUnreadableError(storePath, err)
  }
}

/**
 * Write via a temp file and rename.
 *
 * A plain writeFileSync leaves a window where the store is truncated. A scan reading that
 * moment used to parse-fail, be told the store was empty, and write the emptiness back, which
 * silently destroyed every signed-in credential on the machine.
 */
function writeStoreAtomic(storePath: string, payload: string): void {
  const tmp = `${storePath}.${process.pid}.tmp`
  fs.writeFileSync(tmp, payload, "utf8")
  try {
    fs.renameSync(tmp, storePath)
  } catch (err: any) {
    try {
      fs.unlinkSync(tmp)
    } catch {}
    throw err
  }
}

export async function persistCredential(cred: DiscoveredCredential): Promise<void> {
  if (cred.sourcePath === "mock") return
  const storePath = getStorePath()
  let all: Record<string, DiscoveredCredential>
  try {
    all = await loadAllCredentials()
  } catch {
    // Refuse to write over a store we cannot read: the next save would replace whatever is
    // recoverable there with a single credential, or with nothing at all.
    console.warn(`[CredentialStore] ${storePath} unreadable; refusing to persist`)
    return
  }
  all[cred.provider] = {
    ...all[cred.provider],
    ...cred,
  }
  try {
    writeStoreAtomic(storePath, JSON.stringify(all, null, 2))
  } catch (err: any) {
    console.warn("[CredentialStore] Failed to persist credential:", err.message)
  }
}

export async function saveAllCredentials(creds: Record<string, DiscoveredCredential>): Promise<void> {
  const storePath = getStorePath()
  const cleanCreds: Record<string, DiscoveredCredential> = {}
  for (const [k, v] of Object.entries(creds)) {
    if (v.sourcePath !== "mock") cleanCreds[k] = v
  }
  try {
    writeStoreAtomic(storePath, JSON.stringify(cleanCreds, null, 2))
  } catch (err: any) {
    console.warn("[CredentialStore] Failed to save credentials:", err.message)
  }
}
