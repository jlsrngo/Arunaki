import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * Kiro was added to the engine registry, the status endpoint and the sign-in endpoint, but the
 * settings card had no entry in cardState. The generic card therefore fell back to a default of
 * not installed, and showed a sign-in button for a provider that was already serving requests.
 *
 * Adding a provider means touching several places that must agree. These checks keep the UI half
 * from being forgotten.
 */
// Resolved from this file rather than counted out by hand: the engine package and apps/web sit
// at different depths under the repo root and an off-by-one here only shows up as ENOENT.
const tab = readFileSync(
  path.resolve(import.meta.dir, "../../../../apps/web/src/components/settings/SettingsCliConnectionsTab.tsx"),
  "utf8",
)
const registry = readFileSync(
  path.resolve(import.meta.dir, "../src/server/local-cli/registry.ts"),
  "utf8",
)

/** Ids the engine offers a card for. */
const registryIds = [...registry.matchAll(/^\s{4}id: "([a-zA-Z0-9]+)"/gm)].map((m) => m[1])

describe("the settings card covers every provider the registry offers", () => {
  test("the registry parses to a non-trivial list", () => {
    expect(registryIds.length).toBeGreaterThan(4)
    expect(registryIds).toContain("kiro")
  })

  test("kiro has a cardState entry with a signedIn signal", () => {
    // Without an entry the card renders its default and reads "Not installed" forever.
    expect(tab).toMatch(/kiro:\s*\{\s*installed:/)
    expect(tab).toContain("data.kiro?.signedIn")
  })

  test("cursor has a cardState entry too", () => {
    expect(tab).toMatch(/cursor:\s*\{\s*installed:/)
  })

  test("every registry provider has a cardState entry", () => {
    const missing = registryIds.filter((id) => !new RegExp(`\\b${id}:\\s*\\{`).test(tab))
    expect(missing).toEqual([])
  })

  test("the browser sign-in button hides once a provider is signed in", () => {
    // The button already gates on this; the bug was that state.signedIn never became true.
    expect(tab).toContain("d.supportsBrowserLogin && !state.signedIn")
  })

  test("every wired provider id is a valid CliProviderId", () => {
    // This union drifted behind the engine registry, so kiro could not be referenced by id at all
    // and TypeScript rejected the comparison instead of the code being wrong.
    const union = /type CliProviderId =([^\n]+)/.exec(tab)?.[1] ?? ""
    for (const id of ["claude", "codex", "opencode", "antigravity", "nineRouter", "kiro"]) {
      expect(union).toContain(`"${id}"`)
    }
  })

  test("every CliProviderId has a PROVIDER_CONFIGS entry", () => {
    // A Record over the union needs all of them, which is what surfaced kiro as missing.
    const union = /type CliProviderId =([^\n]+)/.exec(tab)?.[1] ?? ""
    const ids = [...union.matchAll(/"([a-zA-Z0-9]+)"/g)].map((m) => m[1])
    expect(ids.length).toBeGreaterThan(3)
    for (const id of ids) {
      expect(tab).toMatch(new RegExp(`\\n    ${id}: \\{`))
    }
  })

  test("the card states the plan, because a valid token is not a working account", () => {
    // Codex on a free plan connects and then refuses every request; the card has to say so.
    expect(tab).toContain("data.codex?.plan")
    expect(tab).toMatch(/codexPlan === "free"/)
  })

  test("the card shows when the stored token expires", () => {
    expect(tab).toContain("tokenExpiresAt")
  })
})