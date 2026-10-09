import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { CLI_PROVIDER_REGISTRY } from "../src/server/local-cli/registry"
import { CODEX_VERIFIED_FALLBACK } from "../src/server/local-cli/codex-models"

/**
 * Every provider's model list must come from the account, never from a hardcoded array. Three
 * separate failures proved it: Kiro's list named claude-sonnet-5, which AWS has never returned,
 * while omitting glm-5 and both MiniMax tiers; Codex's list named models OpenAI has dropped, and
 * the resulting error reads exactly like a subscription wall, which sent the investigation down
 * the wrong path for an afternoon.
 *
 * So these tests check the mechanism rather than the contents: a provider with a live catalogue
 * must call it, and must keep only a short verified fallback.
 */
const kiro = CLI_PROVIDER_REGISTRY.find((p) => p.id === "kiro")!
const codex = CLI_PROVIDER_REGISTRY.find((p) => p.id === "codex")!
const detector = readFileSync(path.resolve(import.meta.dir, "../src/server/local-cli/detector.ts"), "utf8")
const kiroSource = readFileSync(path.resolve(import.meta.dir, "../src/server/local-cli/kiro.ts"), "utf8")
const codexSource = readFileSync(path.resolve(import.meta.dir, "../src/server/local-cli/codex-models.ts"), "utf8")

describe("model catalogues come from the account", () => {
  test("Kiro asks CodeWhisperer for its catalogue", () => {
    expect(kiroSource).toContain("ListAvailableModels")
    expect(detector).toMatch(/target === "kiro"[\s\S]{0,400}fetchKiroModels\(\)/)
  })

  test("Codex asks OpenAI for its catalogue", () => {
    expect(codexSource).toContain("backend-api/codex/models")
    expect(detector).toMatch(/target === "codex"[\s\S]{0,400}fetchCodexModels\(\)/)
  })

  test("Codex sends the client_version the endpoint requires", () => {
    // Without it the endpoint answers 400 "Field required", so it is load-bearing.
    expect(codexSource).toContain("client_version")
  })

  test("no provider names a model the vendor does not return", () => {
    // The specific phantom that shipped once.
    expect(kiro.models).not.toContain("kiro/claude-sonnet-5")
  })

  test("fallbacks stay short, so they are a safety net rather than a shadow catalogue", () => {
    expect(kiro.models.length).toBeLessThanOrEqual(8)
    expect(codex.models.length).toBeLessThanOrEqual(8)
    expect(codex.models).toEqual(CODEX_VERIFIED_FALLBACK)
  })

  test("the Codex fallback carries only ids that were probed, not guesses", () => {
    for (const dead of ["gpt-5.1-codex", "gpt-5-codex", "codex-mini-latest", "gpt-5.6-sol"]) {
      expect(codex.models).not.toContain(dead)
    }
  })

  test("getCliSupportedModels has no dead codex branch returning stale ids", () => {
    // An older branch returned o3-mini/o1/gpt-4o and sat unreachable below the live fetch.
    const fn = detector.slice(detector.indexOf("export async function getCliSupportedModels"))
    expect(fn).not.toContain('["o3-mini", "o1", "gpt-4o", "gpt-4o-mini"]')
  })
})