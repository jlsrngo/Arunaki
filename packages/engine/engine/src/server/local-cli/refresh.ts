import {
  type DiscoveredCredential,
  loadAllCredentials,
  persistCredential,
} from "./credential-store.js"

// Lead per provider — from 9Router registry
const REFRESH_LEAD_MS: Record<string, number> = {
  codex: 600_000,     // 10 minutes (access token ~1 hour)
  claude: 14_400_000, // 4 hours
  kiro: 60_000,
  cursor: 60_000,
}

const MAX_REFRESH_AGE_MS: Record<string, number> = {
  codex: 691_200_000, // 8 days max age
}

const inFlight = new Map<string, Promise<DiscoveredCredential | null>>()

export async function refreshCredential(cred: DiscoveredCredential): Promise<DiscoveredCredential | null> {
  const key = `${cred.provider}:${cred.sourcePath}`
  const existing = inFlight.get(key)
  if (existing) return existing

  const p = doRefresh(cred).finally(() => inFlight.delete(key))
  inFlight.set(key, p)
  return p
}

async function doRefresh(cred: DiscoveredCredential): Promise<DiscoveredCredential | null> {
  try {
    switch (cred.provider) {
      case "codex":
        return await refreshCodex(cred)
      case "claude":
        return await refreshClaude(cred)
      case "kiro":
        return await refreshKiro(cred)
      case "cursor":
        return await refreshCursor(cred)
      default:
        return null
    }
  } catch (err: any) {
    console.warn(`[TokenRefresh] ${cred.provider} refresh failed:`, err?.message)
    return null
  }
}

// OPENAI/ChatGPT — FORM encoding, refresh token TERBARU
async function refreshCodex(cred: DiscoveredCredential): Promise<DiscoveredCredential | null> {
  if (!cred.refreshToken) return null
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: cred.refreshToken,
    client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
    scope: "openid profile email offline_access",
  })

  const res = await fetch("https://auth.openai.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => "")
    console.warn(`[TokenRefresh] Codex refresh HTTP ${res.status}:`, errText)
    return null
  }

  const data = await res.json()
  const refreshed: DiscoveredCredential = {
    ...cred,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || cred.refreshToken,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    lastRefreshAt: Date.now(),
  }
  await persistCredential(refreshed)
  return refreshed
}

// ANTHROPIC — JSON encoding, client_id Claude Code
async function refreshClaude(cred: DiscoveredCredential): Promise<DiscoveredCredential | null> {
  if (!cred.refreshToken) return null
  const res = await fetch("https://api.anthropic.com/v1/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: cred.refreshToken,
      client_id: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => "")
    console.warn(`[TokenRefresh] Claude refresh HTTP ${res.status}:`, errText)
    return null
  }

  const data = await res.json()
  const refreshed: DiscoveredCredential = {
    ...cred,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || cred.refreshToken,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    lastRefreshAt: Date.now(),
  }
  await persistCredential(refreshed)
  return refreshed
}

async function refreshKiro(cred: DiscoveredCredential): Promise<DiscoveredCredential | null> {
  if (!cred.clientId || !cred.clientSecret || !cred.refreshToken) return null
  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: cred.refreshToken,
      client_id: cred.clientId,
      client_secret: cred.clientSecret,
    })
    const region = cred.region || "us-east-1"
    const res = await fetch(`https://oidc.${region}.amazonaws.com/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    })
    if (!res.ok) return null
    const data = await res.json()
    const refreshed: DiscoveredCredential = {
      ...cred,
      accessToken: data.accessToken || data.access_token,
      refreshToken: data.refreshToken || data.refresh_token || cred.refreshToken,
      expiresAt: data.expiresIn ? Date.now() + data.expiresIn * 1000 : undefined,
      lastRefreshAt: Date.now(),
    }
    await persistCredential(refreshed)
    return refreshed
  } catch {
    return null
  }
}

async function refreshCursor(cred: DiscoveredCredential): Promise<DiscoveredCredential | null> {
  // Cursor uses in-memory or state.vscdb token; if refresh endpoint available:
  if (!cred.refreshToken) return null
  return null
}

/** Lapis 1 — Proaktif sebelum request */
export async function checkBeforeRequest(cred: DiscoveredCredential): Promise<boolean> {
  if (!cred.refreshToken) return false
  const lead = REFRESH_LEAD_MS[cred.provider] ?? 60_000
  const soon = cred.expiresAt ? cred.expiresAt - Date.now() < lead : !cred.lastRefreshAt
  if (!soon) return false

  const next = await refreshCredential(cred)
  if (next) {
    Object.assign(cred, next)
    return true
  }
  return false
}

/** Lapis 3 — Reaktif dengan retry maksimal 3x untuk 401/403 */
export async function refreshWithRetry(
  cred: DiscoveredCredential,
  maxRetries = 3,
): Promise<DiscoveredCredential | null> {
  let attempt = 0
  while (attempt < maxRetries) {
    attempt++
    const refreshed = await refreshCredential(cred)
    if (refreshed) {
      Object.assign(cred, refreshed)
      return refreshed
    }
    await new Promise((r) => setTimeout(r, 500 * attempt))
  }
  return null
}

/** Lapis 2 — Background tick scheduler */
let timer: ReturnType<typeof setInterval> | null = null

export function scheduleBackgroundRefresh(intervalMs = 5 * 60_000): void {
  if (timer) return
  timer = setInterval(async () => {
    try {
      const creds = await loadAllCredentials()
      for (const cred of Object.values(creds)) {
        if (!cred.refreshToken) continue
        const horizon = cred.expiresAt ? cred.expiresAt - Date.now() : Infinity
        if (horizon > 30 * 60_000) continue

        // Jitter to avoid hammering vendor servers simultaneously
        const jitter =
          cred.provider === "cursor"
            ? 12_000 + Math.random() * 4_000
            : 1_500 + Math.random() * 200

        setTimeout(async () => {
          const next = await refreshCredential(cred)
          if (next) await persistCredential(next)
        }, jitter)
      }
    } catch (err: any) {
      console.warn("[TokenRefresh] Background scheduler error:", err?.message)
    }
  }, intervalMs)
}

export function stopBackgroundRefresh(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
