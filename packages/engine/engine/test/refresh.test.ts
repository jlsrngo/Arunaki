import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import {
  refreshCredential,
  checkBeforeRequest,
  scheduleBackgroundRefresh,
  stopBackgroundRefresh,
} from "../src/server/local-cli/refresh"
import type { DiscoveredCredential } from "../src/server/local-cli/credential-store"

describe("Token Refresh", () => {
  beforeEach(() => {
    stopBackgroundRefresh()
  })

  afterEach(() => {
    stopBackgroundRefresh()
  })

  it("codex: refresh using latest RT + JSON encoding without scope (9Router parity)", async () => {
    const calls: any[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (url: any, init: any) => {
      calls.push({ url: String(url), body: String(init.body) })
      return new Response(
        JSON.stringify({
          access_token: "new-at",
          refresh_token: "new-rt",
          expires_in: 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }) as any

    try {
      const cred: DiscoveredCredential = {
        provider: "codex",
        displayName: "OpenAI Codex",
        type: "oauth",
        accessToken: "old-at",
        refreshToken: "rt-LATEST",
        sourcePath: "mock",
        lastRefreshAt: Date.now() - 7.2e6,
      }
      const out = await refreshCredential(cred)
      expect(calls[0].url).toContain("https://auth.openai.com/oauth/token")
      const parsed = JSON.parse(calls[0].body)
      expect(parsed.grant_type).toBe("refresh_token")
      expect(parsed.refresh_token).toBe("rt-LATEST")
      expect(parsed.client_id).toBe("app_EMoamEEZ73f0CkXaXp7hrann")
      expect(parsed.scope).toBeUndefined()
      expect(out?.accessToken).toBe("new-at")
      expect(out?.refreshToken).toBe("new-rt")
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it("invalid_grant → never attempts refresh again (re-auth required)", async () => {
    let calls = 0
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      calls++
      return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })
    }) as any

    try {
      const cred: DiscoveredCredential = {
        provider: "codex",
        displayName: "Codex",
        type: "oauth",
        accessToken: "at",
        refreshToken: "dead-rt",
        sourcePath: "mock-permanent-error",
      }
      expect(await refreshCredential(cred)).toBeNull()
      expect(await refreshCredential(cred)).toBeNull()
      expect(calls).toBe(1)
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it("claude: refresh encoding JSON + client_id Claude Code", async () => {
    const calls: any[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (url: any, init: any) => {
      calls.push({ url: String(url), body: String(init.body) })
      return new Response(
        JSON.stringify({
          access_token: "sk-ant-oat02-new",
          refresh_token: "rt2",
          expires_in: 86400,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }) as any

    try {
      const cred: DiscoveredCredential = {
        provider: "claude",
        displayName: "Claude Code",
        type: "oauth",
        accessToken: "sk-ant-oat01-old",
        refreshToken: "rt1",
        sourcePath: "mock",
        lastRefreshAt: 0,
      }
      const out = await refreshCredential(cred)
      expect(calls[0].url).toContain("https://api.anthropic.com/v1/oauth/token")
      const parsed = JSON.parse(calls[0].body)
      expect(parsed.grant_type).toBe("refresh_token")
      expect(parsed.client_id).toBe("9d1c250a-e61b-44d9-88ed-5944d1962f5e")
      expect(out?.accessToken).toContain("sk-ant-oat02-new")
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it("proactive: does not refresh when far from lead; refreshes when < lead", async () => {
    // expiresAt in 2 hours, codex lead 10 minutes → no-op
    const credFar: DiscoveredCredential = {
      provider: "codex",
      displayName: "Codex",
      type: "oauth",
      accessToken: "at",
      refreshToken: "rt",
      sourcePath: "mock",
      expiresAt: Date.now() + 7.2e6,
      lastRefreshAt: Date.now(),
    }
    expect(await checkBeforeRequest(credFar)).toBe(false)

    // expiresAt in 5 minutes (lead 10 minutes) → refresh is invoked
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ access_token: "n", refresh_token: "r", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as any

    try {
      const credSoon: DiscoveredCredential = {
        provider: "codex",
        displayName: "Codex",
        type: "oauth",
        accessToken: "old",
        refreshToken: "rt",
        sourcePath: "mock",
        expiresAt: Date.now() + 5 * 60_000,
      }
      expect(await checkBeforeRequest(credSoon)).toBe(true)
      expect(credSoon.accessToken).toBe("n")
    } finally {
      globalThis.fetch = realFetch
    }
  })
})
