import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it, afterEach } from "bun:test"
import { loadAllCredentials, persistCredential } from "../src/server/local-cli/credential-store"
import { scanLocalCredentials, invalidateCredentialCache } from "../src/server/local-cli/harvester"

const HOME = path.join(os.tmpdir(), `arunaki-oauth-persist-${Date.now()}-${Math.random().toString(16).slice(2)}`)

afterEach(() => {
  try {
    fs.rmSync(HOME, { recursive: true, force: true })
  } catch {}
})

describe("oauth credential persistence", () => {
  it("survives a rescan, because an oauth credential has no file on disk", async () => {
    process.env.HOME = HOME
    process.env.USERPROFILE = HOME
    fs.mkdirSync(path.join(HOME, ".arunaki"), { recursive: true })
    invalidateCredentialCache()

    // What the browser flow produces: the token lives only in this store, so sourcePath is
    // empty. A rescan used to drop it because the labelled file never existed.
    await persistCredential({
      provider: "codex",
      displayName: "OpenAI Codex / ChatGPT",
      type: "oauth",
      accessToken: "tok_live",
      refreshToken: "ref_live",
      sourcePath: "",
    } as any)
    expect(Object.keys(await loadAllCredentials())).toContain("codex")

    // A rescan with no Codex CLI on disk must keep it. Verified by reproduction: with the old
    // path harvester skipped the entry as a deleted file and the store became {}.
    invalidateCredentialCache()
    const after = await scanLocalCredentials()
    expect(after.codex?.accessToken).toBe("tok_live")
    expect((await loadAllCredentials()).codex?.accessToken).toBe("tok_live")
  })

  it("wipes a credential whose file really was deleted, so the fix is not a blanket keep", async () => {
    process.env.HOME = HOME
    process.env.USERPROFILE = HOME
    fs.mkdirSync(path.join(HOME, ".arunaki"), { recursive: true })
    invalidateCredentialCache()

    const filePath = path.join(HOME, ".claude", ".credentials.json")
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify({ claudeAiOauth: { accessToken: "on-disk" } }), "utf8")
    await persistCredential({
      provider: "claude",
      displayName: "Claude",
      type: "oauth",
      accessToken: "tok_claude",
      sourcePath: filePath,
    } as any)
    invalidateCredentialCache()
    // The file on disk wins, which is correct: it is the source of truth when present.
    expect((await scanLocalCredentials()).claude?.accessToken).toBe("on-disk")

    fs.rmSync(path.join(HOME, ".claude"), { recursive: true, force: true })
    invalidateCredentialCache()
    // scanLocalCredentials drops it. The sync store fallback in readStoredCredential would
    // resurrect it, but that reader only runs on the bridge path, not in the scan.
    expect((await scanLocalCredentials()).claude?.accessToken).toBeUndefined()
  })
})