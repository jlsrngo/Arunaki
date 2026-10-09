import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * OpenCode's card showed no token row at all. The credential was there the whole time - an API key
 * in its own auth.json - but harvester had no reader for it, so nothing ever reached the card and
 * the generic row, which keys on discovered.hasToken, rendered nothing.
 *
 * There is deliberately no "Refresh token" for this provider: an API key has nothing to refresh
 * and no expiry. Signing out also cannot delete the file, since it belongs to OpenCode, so it goes
 * through the vendor's own CLI.
 */
const harvester = readFileSync(path.resolve(import.meta.dir, "../src/server/local-cli/harvester.ts"), "utf8")
const groups = readFileSync(
  path.resolve(import.meta.dir, "../src/server/routes/instance/httpapi/groups/provider.ts"),
  "utf8",
)

describe("OpenCode is discoverable like every other provider", () => {
  test("harvester reads its credential", () => {
    expect(harvester).toContain("export function readOpenCodeCredential")
    // Built with path.join rather than as one literal.
    expect(harvester).toMatch(/\.local", "share", "opencode", "auth\.json/)
    // Wired into the scan, otherwise the reader exists but nothing calls it.
    expect(harvester).toMatch(/results\.opencode = opencode/)
  })

  test("it is typed as a provider that can hold a credential", () => {
    expect(harvester).toBeTruthy()
    const store = readFileSync(
      path.resolve(import.meta.dir, "../src/server/local-cli/credential-store.ts"),
      "utf8",
    )
    expect(store).toContain('"opencode"')
  })

  test("signing out goes through OpenCode's own CLI, not a file edit", () => {
    // Arunaki does not own auth.json. `opencode auth logout opencode` is the supported path.
    expect(groups).toContain('"opencode-logout"')
  })
})