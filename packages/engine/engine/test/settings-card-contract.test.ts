import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * The card-specific behaviours, kept separate from provider-derivation.test.ts, which covers how
 * provider state is obtained.
 *
 * This file used to assert that every registry id had a hand-written cardState entry and a
 * PROVIDER_CONFIGS entry. Those assertions described the duplication that caused six bugs, so they
 * were removed when the duplication was: there is no per-provider list left to check.
 */
const tab = readFileSync(
  path.resolve(import.meta.dir, "../../../../apps/web/src/components/settings/SettingsCliConnectionsTab.tsx"),
  "utf8",
)

describe("the connection card tells the truth", () => {
  test("the browser sign-in button hides once a provider is signed in", () => {
    // The button already gated on this; the bug was that state.signedIn never became true.
    expect(tab).toContain("d.supportsBrowserLogin && !state.signedIn")
  })

  test("a provider that installs nothing is never labelled as not installed", () => {
    // "Not installed" was shown for Codex and Claude purely because their CLI is absent, which is
    // expected for a browser sign-in and told the user nothing true.
    expect(tab).toMatch(/!d\.requiresCli[\s\S]{0,120}Sign-in needed/)
  })

  test("the card states the plan, because a valid token is not a working account", () => {
    expect(tab).toContain("data.codex?.plan")
    expect(tab).toMatch(/codexPlan === "free"/)
  })

  test("the card shows when the stored token expires", () => {
    expect(tab).toContain("tokenExpiresAt")
  })

  test("signing out is offered once a credential exists", () => {
    expect(tab).toMatch(/state\.signedIn && discovered\?\.hasToken &&/)
    // OpenCode's auth.json belongs to OpenCode, so it delegates to the vendor CLI.
    expect(tab).toContain("handleOpenCodeSignOut")
  })

  test("quota renders for every provider the registry marks as having one", () => {
    expect(tab).toContain("d.quota !== \"none\" && renderQuota(d.quota)")
    expect(tab).toMatch(/"antigravity" \| "claude" \| "codex" \| "kiro"/)
  })
})