import { describe, expect, it } from "bun:test"
import { CLI_PROVIDER_REGISTRY, getCliProviderDescriptor } from "../src/server/local-cli/registry"

describe("CLI provider registry", () => {
  it("has unique ids and docs urls", () => {
    const ids = CLI_PROVIDER_REGISTRY.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    const docs = CLI_PROVIDER_REGISTRY.filter((p) => p.docsUrl).map((p) => p.docsUrl)
    expect(new Set(docs).size).toBe(docs.length)
  })

  it("only uses quota kinds the settings UI can render", () => {
    for (const p of CLI_PROVIDER_REGISTRY) {
      expect(["antigravity", "claude", "codex", "none"]).toContain(p.quota)
    }
  })

  it("never offers browser login, since every vendor refuses it", () => {
    for (const p of CLI_PROVIDER_REGISTRY) {
      expect(p.supportsBrowserLogin).toBe(false)
    }
  })

  it("gives every provider that needs a CLI a way to get one", () => {
    // kiro, cursor and 9router ship no link yet; the UI hides Docs/Install for those
    // rather than guessing a URL that may not exist.
    const NO_INSTALL_URL = new Set(["kiro", "cursor", "nineRouter"])
    for (const p of CLI_PROVIDER_REGISTRY) {
      if (!p.requiresCli || NO_INSTALL_URL.has(p.id)) continue
      expect(p.installUrl).toBeTruthy()
    }
  })

  it("resolves descriptors by id", () => {
    expect(getCliProviderDescriptor("antigravity")?.quota).toBe("antigravity")
    expect(getCliProviderDescriptor("nope")).toBeUndefined()
  })

  it("records where Antigravity actually keeps its credential", () => {
    const agy = getCliProviderDescriptor("antigravity")!
    expect(agy.credentialTarget).toBe("gemini:antigravity")
    expect(agy.installSizeMb).toBe(181)
    expect(agy.loginCommand).toBe("agy")
  })
})
