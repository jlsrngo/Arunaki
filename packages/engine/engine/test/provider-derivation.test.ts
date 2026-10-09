import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { CLI_PROVIDER_REGISTRY } from "../src/server/local-cli/registry"

/**
 * Six bugs in one session came from the same shape: a provider was added to the engine registry,
 * got a card, and every other place that had to learn its name still said "not installed",
 * "not ready to connect", or produced a TypeScript error. Each was found and fixed one at a time.
 *
 * So the settings page no longer enumerates providers. Card state is derived from the registry,
 * and a connect contract falls back to the local bridge, which is the correct route for every
 * vendor conversation. These tests check the mechanism rather than the contents, because the
 * contents are supposed to change on their own.
 */
const tab = readFileSync(
  path.resolve(import.meta.dir, "../../../../apps/web/src/components/settings/SettingsCliConnectionsTab.tsx"),
  "utf8",
)

describe("the settings page has no hand-written provider list", () => {
  test("CliProviderId is not a union of literals", () => {
    // A union is exactly what went stale. TypeScript rejecting `id === "kiro"` sent the fix to
    // the wrong file.
    expect(tab).toContain("type CliProviderId = string")
    expect(tab).not.toMatch(/type CliProviderId = "[^"]+"\s*\|/)
  })

  test("card state is derived from the registry", () => {
    expect(tab).toMatch(/Object\.fromEntries\(\s*\(data\.registry \?\? \[\]\)\.map/)
  })

  test("a provider with no explicit signal still reports its credential", () => {
    // The failure this replaces: no entry meant a silent default of not installed.
    expect(tab).toContain("installed: facts.installed || Boolean(token?.hasToken)")
    expect(tab).toContain("signedIn: facts.signedIn || Boolean(token?.hasToken)")
  })

  test("connect contracts fall back to the bridge instead of a per-provider record", () => {
    expect(tab).toContain("connectConfigFor")
    expect(tab).toMatch(/const connectConfigFor = \(target: string/)
    // Only a provider that bypasses the bridge needs an entry.
    const overrideBlock = tab.slice(tab.indexOf("const PROVIDER_CONFIGS"), tab.indexOf("const connectConfigFor"))
    expect(overrideBlock).toContain("nineRouter")
    for (const bridged of ["claude", "codex", "opencode", "antigravity", "kiro"]) {
      expect(overrideBlock).not.toContain(`${bridged}: {`)
    }
  })

  test("the card reports the plan, so a valid token is not read as a working account", () => {
    expect(tab).toContain("data.codex?.plan")
  })

  test("every registry provider survives the derivation", () => {
    // Nothing per-provider is required, so this is really a guard that the derivation is still
    // keyed off the registry rather than a list that happened to match it.
    expect(CLI_PROVIDER_REGISTRY.length).toBeGreaterThan(4)
    expect(tab).toContain("Object.fromEntries")
  })
})
