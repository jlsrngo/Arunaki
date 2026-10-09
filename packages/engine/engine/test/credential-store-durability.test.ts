import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { loadAllCredentials, persistCredential, setCustomStorePath } from "../src/server/local-cli/credential-store"
import { readKiroCredential, scanLocalCredentials, invalidateCredentialCache } from "../src/server/local-cli/harvester"
import type { DiscoveredCredential } from "../src/server/local-cli/credential-store"

/**
 * The store was wiped to 2 bytes with two providers signed in. loadAllCredentials caught a JSON
 * parse error and returned {}, and scanLocalCredentials merged that emptiness into its results
 * and wrote them back, so one unreadable store replaced every credential with nothing. Writes
 * were also non-atomic, which is how it became unreadable: concurrent scans, one reading the
 * file mid-write.
 */
let HOME = ""
let STORE = ""

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
  // setCustomStorePath is module-global, so pointing it at a shared fixture let one test read
  // another's tokens. A path per test removes the ordering dependency entirely.
  beforeEach(() => {
    HOME = path.join(os.tmpdir(), `arunaki-store-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    STORE = path.join(HOME, "local-cli-credentials.json")
    fs.mkdirSync(HOME, { recursive: true })
    setCustomStorePath(STORE)
    invalidateCredentialCache()
  })

  afterEach(() => {
    setCustomStorePath(null)
    invalidateCredentialCache()
    try {
      fs.rmSync(HOME, { recursive: true, force: true })
    } catch {}
  })

  test("keeps other providers when one is saved", async () => {
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
    fs.writeFileSync(STORE, '{"codex": {"accessToken": "tok', "utf8")
    const before = fs.readFileSync(STORE, "utf8")
    await scanLocalCredentials(true)
    // The truncated file must survive untouched so it can still be recovered.
    expect(fs.readFileSync(STORE, "utf8")).toBe(before)
  })

  test("a save refuses to overwrite a store it could not read", async () => {
    fs.writeFileSync(STORE, '{"codex": {"accessToken": "tok', "utf8")
    const before = fs.readFileSync(STORE, "utf8")
    await persistCredential(oauth("kiro", "tok_kiro"))
    expect(fs.readFileSync(STORE, "utf8")).toBe(before)
  })

  test("a valid store round-trips through a scan", async () => {
    await persistCredential(oauth("kiro", "tok_kiro"))
    const scanned = await scanLocalCredentials(true)
    expect(scanned.kiro?.accessToken).toBe("tok_kiro")
    expect(JSON.parse(fs.readFileSync(STORE, "utf8")).kiro.accessToken).toBe("tok_kiro")
  })

  test("an empty store stays empty rather than resurrecting", async () => {
    const scanned = await scanLocalCredentials(true)
    expect(Object.keys(scanned)).toHaveLength(0)
    expect(JSON.parse(fs.readFileSync(STORE, "utf8"))).toEqual({})
  })

  test("tolerates a BOM, which Windows editors add", async () => {
    // A BOM made JSON.parse throw, which now means "unreadable" - correct for corruption, but a
    // BOM is not corruption and would leave the user permanently signed out with no way back.
    await persistCredential(oauth("kiro", "tok_bom"))
    const text = fs.readFileSync(STORE, "utf8")
    fs.writeFileSync(STORE, `\uFEFF${text}`, "utf8")
    const all = await loadAllCredentials()
    expect(all.kiro?.accessToken).toBe("tok_bom")
  })
})

describe("a store credential keeps the sourcePath it was saved with", () => {
  beforeEach(() => {
    HOME = path.join(os.tmpdir(), `arunaki-store-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    STORE = path.join(HOME, "local-cli-credentials.json")
    fs.mkdirSync(HOME, { recursive: true })
    setCustomStorePath(STORE)
    invalidateCredentialCache()
  })

  afterEach(() => {
    setCustomStorePath(null)
    invalidateCredentialCache()
    try {
      fs.rmSync(HOME, { recursive: true, force: true })
    } catch {}
  })

  test("a browser-signed-in credential is not given a fabricated file path", async () => {
    // Substituting a placeholder looked harmless, but the next scan persisted it and the
    // deleted-file guard then rejected the credential for a file that never existed. Kiro was
    // reported signed out seconds after a successful sign-in because of it.
    await persistCredential(oauth("kiro", "tok_kiro"))
    const cred = readKiroCredential()
    expect(cred?.accessToken).toBe("tok_kiro")
    expect(cred?.sourcePath).toBe("")

    // And the value has to survive a scan, which is where the placeholder used to be written back.
    await scanLocalCredentials(true)
    expect(JSON.parse(fs.readFileSync(STORE, "utf8")).kiro.sourcePath).toBe("")
    expect(readKiroCredential()?.accessToken).toBe("tok_kiro")
  })
})