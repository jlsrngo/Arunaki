import {
  type DiscoveredCredential,
  loadAllCredentials,
  persistCredential,
} from "./credential-store.js"
import { loadGoogleOAuthClient } from "./detector.js"

/**
 * Every vendor token endpoint gets a deadline.
 *
 * A refresh that never settles leaves the settings card spinning on "Refreshing..." forever,
 * because the UI clears its spinner in a finally that only runs once the request resolves. Four of
 * the five refresh calls had no timeout; only the Google one did, so the hang looked provider
 * specific when it was simply unguarded.
 */
const REFRESH_TIMEOUT_MS = 15_000

// Lead per provider â€” from 9Router registry
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

/** Keys whose refresh token is dead â€” re-auth required, never hit the network again. */
const reauthRequired = new Set<string>()

// 9Router tokenRefresh/providers.js classifyOAuthRefreshError
const PERMANENT_MARKERS = [
  "refresh_token_expired",
  "refresh_token_reused",
  "refresh_token_invalidated",
  "invalid_grant",
  "token_expired",
  "could not validate your token",
  "please try signing in again",
  "invalid_client",
  "unauthorized",
]

export class PermanentRefreshError extends Error {}

function permanentMarker(status: number, errorText: string): string | null {
  let parsed: any = null
  try {
    parsed = errorText ? JSON.parse(errorText) : null
  } catch {
    parsed = null
  }
  const code = parsed?.error?.code || parsed?.error || parsed?.error_code || ""
  const description = parsed?.error_description || parsed?.message || errorText || ""
  const combined = `${code} ${description}`.toLowerCase()
  return PERMANENT_MARKERS.find((m) => combined.includes(m)) ?? null
}

export function refreshCredential(cred: DiscoveredCredential): Promise<DiscoveredCredential | null> {
  const key = `${cred.provider}:${cred.sourcePath}`
  if (reauthRequired.has(key)) return Promise.resolve(null)
  const existing = inFlight.get(key)
  if (existing) return existing

  const p = doRefresh(cred)
    .catch((err) => {
      if (err instanceof PermanentRefreshError) {
        reauthRequired.add(key)
        cred.expiresAt = 0
        persistCredential(cred).catch(() => {})
        console.error(
          `[TokenRefresh] ${cred.provider}: refresh token unrecoverable (${err.message}) â€” re-auth required.`,
        )
      }
      return null
    })
    .finally(() => inFlight.delete(key))
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
      case "antigravity":
        return await refreshAntigravity(cred)
      default:
        return null
    }
  } catch (err: any) {
    if (err instanceof PermanentRefreshError) throw err
    console.warn(`[TokenRefresh] ${cred.provider} refresh failed:`, err?.message)
    return null
  }
}

// OPENAI/ChatGPT â€” JSON body, no scope (9Router tokenRefresh/providers.js refreshCodexToken)
async function refreshCodex(cred: DiscoveredCredential): Promise<DiscoveredCredential | null> {
  if (!cred.refreshToken) return null
  const res = await fetch("https://auth.openai.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
      grant_type: "refresh_token",
      refresh_token: cred.refreshToken,
    }),
    signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => "")
    const marker = permanentMarker(res.status, errText)
    if (marker) throw new PermanentRefreshError(marker)
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

// ANTHROPIC â€” JSON encoding, client_id Claude Code
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
    signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => "")
    const marker = permanentMarker(res.status, errText)
    if (marker) throw new PermanentRefreshError(marker)
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
    const region = cred.region || "us-east-1"
    // 9Router tokenRefresh/providers.js refreshKiroToken (AWS Identity Center branch):
    // JSON body with camelCase keys, region-qualified OIDC endpoint.
    const res = await fetch(`https://oidc.${region}.amazonaws.com/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        clientId: cred.clientId,
        clientSecret: cred.clientSecret,
        refreshToken: cred.refreshToken,
        grantType: "refresh_token",
      }),
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => "")
      const marker = permanentMarker(res.status, errText)
      if (marker) throw new PermanentRefreshError(marker)
      console.warn(`[TokenRefresh] Kiro refresh HTTP ${res.status}:`, errText)
      return null
    }
    const data = await res.json()
    const refreshed: DiscoveredCredential = {
      ...cred,
      accessToken: data.accessToken || data.access_token,
      refreshToken: data.refreshToken || data.refresh_token || cred.refreshToken,
      expiresAt: data.expiresIn ? Date.now() + data.expiresIn * 1000 : undefined,
      profileArn: data.profileArn || cred.profileArn,
      lastRefreshAt: Date.now(),
    }
    await persistCredential(refreshed)
    return refreshed
  } catch (err: any) {
    if (err instanceof PermanentRefreshError) throw err
    console.warn(`[TokenRefresh] Kiro refresh failed:`, err?.message)
    return null
  }
}

// Google/Antigravity OAuth refresh â€” same client resolution as detector.getAntigravityAuth
async function refreshAntigravity(cred: DiscoveredCredential): Promise<DiscoveredCredential | null> {
  if (!cred.refreshToken) return null
  const client = loadGoogleOAuthClient()
  if (!client) {
    console.warn(
      "[TokenRefresh] Antigravity: no OAuth client configured (GOOGLE_OAUTH_CLIENT_SECRET or ~/.arunaki/oauth-clients.json)",
    )
    return null
  }
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: cred.refreshToken,
        client_id: client.clientId,
        client_secret: client.clientSecret,
      }),
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => "")
      const marker = permanentMarker(res.status, errText)
      if (marker) throw new PermanentRefreshError(marker)
      console.warn(`[TokenRefresh] Antigravity refresh HTTP ${res.status}:`, errText.slice(0, 200))
      return null
    }
    const data: any = await res.json()
    const refreshed: DiscoveredCredential = {
      ...cred,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || cred.refreshToken,
      expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
      lastRefreshAt: Date.now(),
    }
    await persistCredential(refreshed)
    return refreshed
  } catch (err: any) {
    if (err instanceof PermanentRefreshError) throw err
    console.warn(`[TokenRefresh] Antigravity refresh failed:`, err?.message)
    return null
  }
}

// ponytail: 9Router has no cursor refresh handler (REFRESH_HANDLERS) â€” Cursor CLI keeps
// tokens in state.vscdb with no public refresh endpoint. Dropping the entry from the
// refresh list beats a fake network call; add one when Cursor ships an endpoint.
export const REFRESH_UNSUPPORTED = ["cursor"] as const

/** Tier 1 â€” Proactive check before request */
export async function checkBeforeRequest(cred: DiscoveredCredential): Promise<boolean> {
  if (!cred.refreshToken) return false
  const lead = REFRESH_LEAD_MS[cred.provider] ?? 60_000
  const maxAge = MAX_REFRESH_AGE_MS[cred.provider]
  const tooOld =
    maxAge != null && cred.lastRefreshAt != null && Date.now() - cred.lastRefreshAt > maxAge
  const soon =
    tooOld || (cred.expiresAt ? cred.expiresAt - Date.now() < lead : !cred.lastRefreshAt)
  if (!soon) return false

  const next = await refreshCredential(cred)
  if (next) {
    Object.assign(cred, next)
    return true
  }
  return false
}

/** Tier 3 â€” Reactive retry up to 3x for 401/403 */
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

/** Tier 2 â€” Background tick scheduler */
let timer: ReturnType<typeof setInterval> | null = null

export function scheduleBackgroundRefresh(intervalMs = 5 * 60_000): void {
  if (timer) return
  timer = setInterval(async () => {
    try {
      const creds = await loadAllCredentials()
      for (const cred of Object.values(creds)) {
        if (!cred.refreshToken) continue
        const key = `${cred.provider}:${cred.sourcePath}`
        if (reauthRequired.has(key)) continue
        if (cred.sourcePath === "mock") continue
        const horizon = cred.expiresAt ? cred.expiresAt - Date.now() : Infinity
        // Only refresh tokens that are still active but nearing expiration (0 < horizon < 30m)
        if (horizon <= 0 || horizon > 30 * 60_000) continue

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
