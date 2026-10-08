import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { loadAllCredentials, persistCredential, setCustomStorePath } from "../src/server/local-cli/credential-store"
import { scanLocalCredentials, invalidateCredentialCache } from "../src/server/local-cli/harvester"
import type { DiscoveredCredential } from "../src/server/local-cli/credential-store"

const HOME = path.join(os.tmpdir(), `arunaki-store-${Date.now()}-${Math.random().toString(16).slice(2)}`)
const STORE = path.join(HOME, "local-cli-credentials.json")

function oauth(provider: string, token: string): DiscoveredCredential {
  return {
    provider,
    displayName: provider,
    type: "oauth",
    accessToken: token,
    // OAuth tokens live only in the store, so there is no file to check.
    sourcePath: "",
  } as DiscoveredCredential
}

describe("credential store durability", () => {
  // setCustomStorePath is module-global, so leaving it pointed at the fixture would leak into
  // every other suite in this process.
  beforeEach(() => setCustomStorePath(STORE))
  afterEach(() => setCustomStorePath(null))

  test("keeps other providers when one is saved", async () => {
    fs.mkdirSync(HOME, { recursive: true })
    await persistCredential(oauth("codex", "tok_codex"))
    await persistCredential(oauth("kiro", "tok_kiro"))
    const all = await loadAllCredentials()
    expect(all.codex?.accessToken).toBe("tok_codex")
    expect(all.kiro?.accessToken).toBe("tok_kiro")
  })

  test("a corrupt store is reported instead of read as empty", async () => {
    // The failure that destroyed every credential: a parse error used to return {}, and the
    // scan then wrote that emptiness back over the real file.
    fs.writeFileSync(STORE, '{"codex": {"accessToken": "tok', "utf8")
    await expect(loadAllCredentials()).rejects.toThrow(/could not be read/)
  })

  test("a scan refuses to overwrite a store it could not read", async () => {
    const before = fs.readFileSync(STORE, "utf8")
    invalidateCredentialCache()
    await scanLocalCredentials(true)
    // The truncated file must survive untouched so it can still be recovered.
    expect(fs.readFileSync(STORE, "utf8")).toBe(before)
  })

  test("a valid store round-trips through a scan", async () => {
    setCustomStorePath(STORE)
    // Replace the truncated file from the previous case with a healthy one.
    fs.writeFileSync(STORE, JSON.stringify({}), "utf8")
    await persistCredential(oauth("kiro", "tok_kiro"))
    invalidateCredentialCache()
    const scanned = await scanLocalCredentials(true)
    expect(scanned.kiro?.accessToken).toBe("tok_kiro")
    const after = JSON.parse(fs.readFileSync(STORE, "utf8"))
    expect(after.kiro.accessToken).toBe("tok_kiro")
  })
})
