import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { CLI_PROVIDER_REGISTRY } from "../src/server/local-cli/registry"
import { CODEX_VERIFIED_FALLBACK } from "../src/server/local-cli/codex-models"

/**
 * Codex on a free account was reported here as unusable, and that was wrong. The cause was the
 * model list, not the plan: gpt-5.1-codex and codex-mini-latest are names Codex has dropped, and
 * every request against them is refused with "not supported when using Codex with a ChatGPT
 * account" - which reads exactly like a subscription wall.
 *
 * Verified live on 2026-10-09 with a free token: gpt-5.6-terra and gpt-5.6-luna returned 200 and
 * produced correct output. gpt-6.1-sol, gpt-6-sol, gpt-6-astra and gpt-5.6-sol were refused.
 *
 * The list therefore has to come from somewhere verified rather than from memory, which is the
 * point of these assertions.
 */
const codex = CLI_PROVIDER_REGISTRY.find((p) => p.id === "codex")!
const registrySource = readFileSync(
  path.resolve(import.meta.dir, "../src/server/local-cli/registry.ts"),
  "utf8",
)

describe("Codex models are the ones that actually answer", () => {
  test("offers exactly the models verified against a live free account", () => {
    expect(codex.models).toEqual(CODEX_VERIFIED_FALLBACK)
    expect(CODEX_VERIFIED_FALLBACK).toEqual([
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-6-luna",
      "gpt-reserve",
    ])
  })

  test("does not offer the dead Codex CLI model names", () => {
    // Each of these was refused with "not supported when using Codex with a ChatGPT account",
    // which is indistinguishable from a paid-only wall and cost an afternoon of wrong conclusions.
    for (const dead of ["gpt-5.1-codex", "gpt-5-codex", "codex-mini-latest", "gpt-5-codex"]) {
      expect(codex.models).not.toContain(dead)
    }
  })

  test("does not offer models that were refused while others in the family answer", () => {
    // gpt-5.6-sol was refused while gpt-5.6-terra answered, so family membership decides nothing.
    for (const refused of ["gpt-6.1-sol", "gpt-6-sol", "gpt-6-astra", "gpt-5.6-sol"]) {
      expect(codex.models).not.toContain(refused)
    }
  })

  test("does not claim Codex needs a paid plan", () => {
    // The old notice said ChatGPT Plus or higher was required to run any request. It is not.
    expect(codex.entitlement?.notice ?? "").not.toMatch(/Plus or higher is required/i)
    expect(registrySource).toContain('"Works on a free ChatGPT account')
  })
})