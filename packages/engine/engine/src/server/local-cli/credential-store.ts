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

function getStorePath(): string {
  if (customStorePath) return customStorePath
  const baseDir = path.join(os.homedir(), ".arunaki")
  try {
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true })
    }
  } catch {}
  return path.join(baseDir, "local-cli-credentials.json")
}

export async function loadAllCredentials(): Promise<Record<string, DiscoveredCredential>> {
  const storePath = getStorePath()
  if (!fs.existsSync(storePath)) return {}
  try {
    const raw = fs.readFileSync(storePath, "utf8")
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export async function persistCredential(cred: DiscoveredCredential): Promise<void> {
  if (cred.sourcePath === "mock") return
  const storePath = getStorePath()
  const all = await loadAllCredentials()
  all[cred.provider] = {
    ...all[cred.provider],
    ...cred,
  }
  try {
    fs.writeFileSync(storePath, JSON.stringify(all, null, 2), "utf8")
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
    fs.writeFileSync(storePath, JSON.stringify(cleanCreds, null, 2), "utf8")
  } catch (err: any) {
    console.warn("[CredentialStore] Failed to save credentials:", err.message)
  }
}
