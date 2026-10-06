import { describe, it, expect } from "bun:test"
import { readCodexCredential, readClaudeCredential } from "../src/server/local-cli/harvester"

describe("FastPath Routing Sanity", () => {
  it("detects model families matching OpenAI vs Claude regex", () => {
    const isCodexFamily = (m: string) => /^(gpt-|o[1-9]|codex)/.test(m)
    expect(isCodexFamily("gpt-4o")).toBe(true)
    expect(isCodexFamily("o3-mini")).toBe(true)
    expect(isCodexFamily("codex")).toBe(true)
    expect(isCodexFamily("claude-3-5-sonnet")).toBe(false)
    expect(isCodexFamily("gemini-2.5-pro")).toBe(false)
  })

  it("functions can be invoked safely without crashing on null credentials", () => {
    const codex = readCodexCredential("/nonexistent-dir-for-fastpath-test")
    expect(codex).toBeNull()

    const claude = readClaudeCredential("/nonexistent-dir-for-fastpath-test")
    expect(claude).toBeNull()
  })
})
