import { describe, expect, it } from "bun:test"
import { isListed, reasoningVariants } from "@arunaki/core/plugin/models-dev"

// These two rules are what stopped OpenCode's picker from ever appearing, and neither is visible
// from the outside: the catalogue either has variants or it silently does not. They are plain
// functions precisely so they can be checked here, without the ModelsDevPlugin's Config wiring,
// which the plugin test harness does not provide.
const effort = (values: Array<string | null>) =>
  ({ reasoning_options: [{ type: "effort", values }] }) as never

describe("reasoningVariants", () => {
  it("carries every level the provider advertises, including the ones beyond xhigh", () => {
    expect(reasoningVariants(effort(["low", "medium", "high", "xhigh", "max"]), "@ai-sdk/openai-compatible")).toEqual([
      { id: "low", headers: {}, body: { reasoning_effort: "low" } },
      { id: "medium", headers: {}, body: { reasoning_effort: "medium" } },
      { id: "high", headers: {}, body: { reasoning_effort: "high" } },
      { id: "xhigh", headers: {}, body: { reasoning_effort: "xhigh" } },
      { id: "max", headers: {}, body: { reasoning_effort: "max" } },
    ])
  })

  it("reproduces the GLM levels the deleted hardcoded allowlist used to produce", () => {
    // "glm-5.2" with ["high","max"] was the only thing VariantPlugin.generate knew about. It is
    // gone; models.dev describes the same model, so the result has to be the same.
    expect(reasoningVariants(effort(["high", "max"]), "@ai-sdk/openai-compatible")).toEqual([
      { id: "high", headers: {}, body: { reasoning_effort: "high" } },
      { id: "max", headers: {}, body: { reasoning_effort: "max" } },
    ])
  })

  it("reads a null level as none rather than dropping it", () => {
    expect(reasoningVariants(effort([null, "high"]), "@ai-sdk/openai-compatible")[0]).toEqual({
      id: "none",
      headers: {},
      body: { reasoning_effort: "none" },
    })
  })

  it("offers nothing on a transport that has no such knob", () => {
    // Guessing a field name for an API that does not have one is how a request starts getting
    // rejected, so an unknown transport stays variantless rather than best-guessed.
    expect(reasoningVariants(effort(["low", "high"]), "@ai-sdk/anthropic")).toEqual([])
    expect(reasoningVariants(effort(["low", "high"]), undefined)).toEqual([])
    expect(reasoningVariants(effort(["low", "high"]), "some-provider-nobody-knows")).toEqual([])
  })

  it("ignores options that are not effort levels, and models that advertise none", () => {
    expect(reasoningVariants({ reasoning_options: [{ type: "toggle" }] } as never, "@ai-sdk/openai-compatible")).toEqual([])
    expect(reasoningVariants({ reasoning_options: [] } as never, "@ai-sdk/openai-compatible")).toEqual([])
    expect(reasoningVariants({} as never, "@ai-sdk/openai-compatible")).toEqual([])
  })
})

describe("isListed", () => {
  it("matches the id config wrote, whether or not it carries the provider prefix", () => {
    // Config for the local-CLI providers is written by the bridge, so the prefixed spelling is the
    // common one; the bare spelling is what models.dev uses.
    expect(isListed("opencode", "space-bunny-free", new Set(["opencode/space-bunny-free"]))).toBe(true)
    expect(isListed("opencode", "space-bunny-free", new Set(["space-bunny-free"]))).toBe(true)
  })

  it("does not let one provider's list claim another provider's model", () => {
    expect(isListed("opencode", "claude-opus-4-5", new Set(["antigravity/claude-opus-4-5"]))).toBe(false)
  })

  it("leaves alone a model config never named, so a retired one cannot come back", () => {
    // This is the guard that keeps models.dev-only ids out of a provider whose list is config-owned.
    expect(isListed("opencode", "retired-model", new Set(["opencode/space-bunny-free"]))).toBe(false)
  })
})