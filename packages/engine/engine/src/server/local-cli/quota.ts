import type { DiscoveredCredential } from "./credential-store.js"
import { getAntigravityAuth } from "./detector.js"
import { readCodexCredential, readClaudeCredential } from "./harvester.js"

/**
 * Live quota/rate-limit reporting per subscription, normalised to one shape so the UI can
 * render every provider the same way. Endpoints mirror 9Router's registry/usage parsers:
 *   Antigravity  v1internal:retrieveUserQuotaSummary   (buckets with remainingFraction)
 *   Claude       /api/oauth/usage                       (five_hour / seven_day, utilization = % USED)
 *   Codex        /backend-api/wham/usage                (primary_window / secondary_window, used_percent)
 *
 * Nothing here is hardcoded: every number is read from the vendor on demand and cached
 * briefly, because these endpoints cost a round-trip per provider.
 */

export interface QuotaBucket {
  id: string
  /** Server-supplied label, already human readable (e.g. "Five Hour Limit Remaining"). */
  label: string
  /** 0..1 remaining. */
  remaining: number
  window: string
  resetAt?: number
  exhausted: boolean
}

export interface ProviderQuota {
  provider: string
  ok: boolean
  reason?: string
  buckets: QuotaBucket[]
}

const cache = new Map<string, { at: number; data: ProviderQuota }>()
const CACHE_TTL_MS = 2 * 60_000

const NOT_SIGNED_IN = (provider: string): ProviderQuota => ({
  provider,
  ok: false,
  reason: "not-signed-in",
  buckets: [],
})

const clamp = (n: unknown) => {
  const v = typeof n === "number" ? n : Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(1, v))
}

const asMs = (v: any): number | undefined => {
  if (v == null) return undefined
  if (typeof v === "number") return v > 1e12 ? v : v * 1000
  const t = Date.parse(String(v))
  return Number.isFinite(t) ? t : undefined
}

async function cached<T extends object>(key: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data as unknown as T
  const data = await fn()
  cache.set(key, { at: Date.now(), data: data as unknown as ProviderQuota })
  return data
}

export function invalidateQuotaCache(): void {
  cache.clear()
}

// --- Antigravity -----------------------------------------------------------

export async function fetchAntigravityQuota(): Promise<ProviderQuota> {
  return cached("antigravity", async () => {
    const auth = await getAntigravityAuth()
    if (!auth?.accessToken) {
      return NOT_SIGNED_IN("antigravity")
    }
    try {
      const res = await fetch(
        "https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "antigravity/ide/2.11.0 darwin/arm64",
            Authorization: `Bearer ${auth.accessToken}`,
          },
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(15000),
        },
      )
      if (!res.ok) {
        return { provider: "antigravity", ok: false, reason: `http-${res.status}`, buckets: [] }
      }
      const data: any = await res.json()
      const buckets: QuotaBucket[] = []
      for (const group of data?.groups ?? []) {
        for (const b of group.buckets ?? []) {
          const remaining = clamp(b.remainingFraction)
          buckets.push({
            id: String(b.bucketId ?? group.displayName ?? "bucket"),
            label: String(b.displayName ?? b.bucketId ?? ""),
            remaining,
            window: String(b.window ?? ""),
            resetAt: asMs(b.resetTime),
            exhausted: remaining <= 0,
          })
        }
      }
      return { provider: "antigravity", ok: true, buckets }
    } catch (err: any) {
      return {
        provider: "antigravity",
        ok: false,
        reason: err?.message ?? "error",
        buckets: [],
      }
    }
  }, { provider: "antigravity", ok: false, buckets: [] })
}

// --- Claude ----------------------------------------------------------------

export async function fetchClaudeQuota(): Promise<ProviderQuota> {
  return cached("claude", async () => {
    const cred: DiscoveredCredential | null = readClaudeCredential()
    if (!cred?.accessToken) {
      return NOT_SIGNED_IN("claude")
    }
    try {
      const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
        headers: {
          Authorization: `Bearer ${cred.accessToken}`,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "oauth-2025-04-20",
        },
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) {
        return { provider: "claude", ok: false, reason: `http-${res.status}`, buckets: [] }
      }
      const data: any = await res.json()
      const buckets: QuotaBucket[] = []
      for (const [key, label] of [
        ["five_hour", "Five Hour Limit"],
        ["seven_day", "Weekly Limit"],
        ["seven_day_opus", "Weekly Limit (Opus)"],
      ] as const) {
        const w = data?.[key]
        if (!w || typeof w.utilization !== "number") continue
        // Anthropic reports utilization as percent USED.
        const remaining = clamp(1 - w.utilization / 100)
        buckets.push({
          id: key,
          label,
          remaining,
          window: key === "five_hour" ? "5h" : "weekly",
          resetAt: asMs(w.resets_at),
          exhausted: remaining <= 0,
        })
      }
      return { provider: "claude", ok: true, buckets }
    } catch (err: any) {
      return { provider: "claude", ok: false, reason: err?.message ?? "error", buckets: [] }
    }
  }, { provider: "claude", ok: false, buckets: [] })
}

// --- Codex -----------------------------------------------------------------

export async function fetchCodexQuota(): Promise<ProviderQuota> {
  return cached("codex", async () => {
    const cred: DiscoveredCredential | null = readCodexCredential()
    if (!cred?.accessToken) {
      return NOT_SIGNED_IN("codex")
    }
    try {
      const res = await fetch("https://chatgpt.com/backend-api/wham/usage", {
        headers: {
          Authorization: `Bearer ${cred.accessToken}`,
          originator: "codex_cli_rs",
          "User-Agent": "codex_cli_rs/1.0",
          ...(cred.accountId ? { "ChatGPT-Account-ID": cred.accountId } : {}),
        },
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) {
        return { provider: "codex", ok: false, reason: `http-${res.status}`, buckets: [] }
      }
      const data: any = await res.json()
      const rateLimit = data?.rate_limit ?? data?.rateLimit ?? data ?? {}
      const buckets: QuotaBucket[] = []
      for (const [key, label, window] of [
        ["primary_window", "Session Limit", "5h"],
        ["secondary_window", "Weekly Limit", "weekly"],
      ] as const) {
        const w = rateLimit[key]
        if (!w) continue
        const used = typeof w.used_percent === "number" ? w.used_percent : w.percent_used
        if (typeof used !== "number") continue
        const remaining = clamp(1 - used / 100)
        buckets.push({
          id: key,
          label,
          remaining,
          window,
          resetAt: asMs(w.reset_at ?? w.resets_at ?? w.resetAt),
          exhausted: remaining <= 0,
        })
      }
      return { provider: "codex", ok: true, buckets }
    } catch (err: any) {
      return { provider: "codex", ok: false, reason: err?.message ?? "error", buckets: [] }
    }
  }, { provider: "codex", ok: false, buckets: [] })
}

export async function fetchAllQuotas(): Promise<ProviderQuota[]> {
  return Promise.all([fetchAntigravityQuota(), fetchClaudeQuota(), fetchCodexQuota()])
}
