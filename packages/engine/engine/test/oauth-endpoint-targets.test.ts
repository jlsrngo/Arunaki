import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

/**
 * Kiro's Sign in with browser button failed with HTTP 400. The endpoint schema listed only the
 * PKCE targets, so a device-flow target was rejected by validation before startOauthSession ran.
 */
const groups = readFileSync(
  new URL("../src/server/routes/instance/httpapi/groups/provider.ts", import.meta.url),
  "utf8",
)
const handlers = readFileSync(
  new URL("../src/server/routes/instance/httpapi/handlers/provider.ts", import.meta.url),
  "utf8",
)

describe("every browser sign-in target is accepted by the endpoint", () => {
  test("oauth start accepts kiro alongside the PKCE targets", () => {
    const block = groups.slice(
      groups.indexOf("LocalCliOauthStartInput"),
      groups.indexOf("LocalCliOauthStartResult"),
    )
    expect(block).toContain('"kiro"')
    expect(block).toContain('"claude"')
    expect(block).toContain('"codex"')
  })

  test("the handler signature agrees with the schema", () => {
    // The schema alone was not enough: the handler carried its own literal union, and TypeScript
    // caught the mismatch only after the schema was widened.
    const i = handlers.indexOf("localCliOauthStart = Effect.fnUntraced")
    expect(i).toBeGreaterThan(-1)
    const signature = handlers.slice(i, i + 400)
    expect(signature).toContain('"kiro"')
  })

  test("refresh accepts kiro", () => {
    const i = groups.indexOf('Schema.Literals(["claude", "codex", "kiro", "cursor", "all"])')
    expect(i).toBeGreaterThan(-1)
  })
})