import { describe, expect, it } from "bun:test"
import { Schema } from "effect"
import { getCliSupportedModels, getAntigravityAuth } from "../src/server/local-cli/detector"
import { resolveAntigravityProjectIdWithRefresh } from "../src/server/local-cli/upstream"
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

  // Regression guard: agySignedIn was added to the detector but missed in the API schema,
  // so Effect silently dropped it and every card rendered "Sign-in needed" while logged in.
  it("carries agySignedIn through the status endpoint schema", async () => {
    const { AntigravityStatusItem } = await import(
      "../src/server/routes/instance/httpapi/groups/provider"
    )
    const encoded = Schema.decodeUnknownSync(AntigravityStatusItem)({
      detected: true,
      cliInstalled: true,
      agyInstalled: true,
      agySignedIn: true,
      agyVersion: "1.3.1",
      geminiCliInstalled: false,
      path: "C:/Users/x/.gemini",
      environment: "Google Antigravity CLI (agy 1.3.1)",
      loggedIn: true,
      accountEmail: "someone@example.com",
    }) as Record<string, unknown>
    expect(encoded.agySignedIn).toBe(true)
  })

  // The old static list offered claude-sonnet-5-5 and gemini-3.7-flash, neither of which the
  // account's live catalogue contains, so the dropdown named models the endpoint rejects.
  it("keeps the Antigravity fallback list free of models outside the live catalogue", async () => {
    const live = new Set(await getCliSupportedModels("antigravity"))
    expect(live.size).toBeGreaterThan(0)
    const fallback = CLI_PROVIDER_REGISTRY.find((p) => p.id === "antigravity")!.models
    const notLive = fallback.filter((m) => !live.has(m))
    expect(notLive).toEqual([])
  })

  // fetchAvailableModels returns the IDE's whole menu, including chat_20706/23310 (isInternal,
// HTTP 400) and the tab_*_preview MODEL_PLACEHOLDER entries, which have no displayName.
  it("hides internal and placeholder ids from the live catalogue", async () => {
    const live = (await getCliSupportedModels("antigravity")) ?? []
    expect(live.length).toBeGreaterThan(0)
    expect(live.filter((m) => m.startsWith("chat_"))).toEqual([])
    expect(live.filter((m) => m.startsWith("tab_"))).toEqual([])
    // gemini-3.1-pro-high is deprecated in favour of gemini-pro-agent.
    expect(live).not.toContain("gemini-3.1-pro-high")
    // The models the subscription actually grants must survive the filter.
    expect(live).toContain("claude-sonnet-4-6")
    expect(live).toContain("gpt-oss-120b-medium")
    expect(live).toContain("gemini-3.8-flash-medium")
  })

  // The 401 path used to demand GOOGLE_OAUTH_CLIENT_* and then fall back to the slow agy
  // worker, which timed out. It must renew through agy and keep the direct route.
  it("antigravity: resolves a project id even when the credential needs renewing", async () => {
    const auth = await getAntigravityAuth(true)
    expect(auth?.accessToken).toBeTruthy()
    const resolved = await resolveAntigravityProjectIdWithRefresh(auth!)
    expect(resolved?.projectId).toBeTruthy()
    expect(resolved?.auth.accessToken).toBeTruthy()
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
