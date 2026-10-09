import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * The smoke test caught this one, not a unit test: Kiro's card read Connected while every request
 * returned 403, because its access token had expired two and a half hours earlier and nothing had
 * refreshed it.
 *
 * Two things allowed that. The background loop skipped any credential whose horizon was already
 * negative, so one missed tick made it permanently invisible - an OAuth refresh token stays valid
 * for weeks, and it was never used. And the bridge never asked for a refresh at all, relying on a
 * timer that can lag five minutes behind expiry.
 */
const refresh = readFileSync(
  path.resolve(import.meta.dir, "../src/server/local-cli/refresh.ts"),
  "utf8",
)
const bridge = readFileSync(path.resolve(import.meta.dir, "../src/server/local-cli/bridge.ts"), "utf8")

describe("an expired token is still refreshable", () => {
  test("the background loop does not skip credentials past their expiry", () => {
    // `horizon <= 0 || horizon > 30min` meant the loop stopped looking the moment a token
    // expired, so the credential could only be recovered by signing in again.
    expect(refresh).not.toMatch(/horizon <= 0 \|\|/)
    expect(refresh).toMatch(/if \(horizon > 30 \* 60_000\) continue/)
  })

  test("a dead refresh token is still bounded", () => {
    // Removing the skip must not turn this into an endless retry loop.
    expect(refresh).toContain("reauthRequired")
    expect(refresh).toContain("MAX_REFRESH_AGE_MS")
  })

  test("the bridge refreshes before it uses a credential", () => {
    // The background timer can lag expiry by up to five minutes, so the request path has to ask.
    expect(bridge).toContain("checkBeforeRequest")
    for (const provider of ["kiro", "codex", "claude"]) {
      expect(bridge).toMatch(
        new RegExp(`read${provider === "kiro" ? "Kiro" : provider === "codex" ? "Codex" : "Claude"}Credential\\(\\)[\\s\\S]{0,120}await checkBeforeRequest\\(`),
      )
    }
  })
})