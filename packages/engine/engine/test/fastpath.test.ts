import { afterEach, beforeEach, describe, it, expect } from "bun:test"
import os from "node:os"
import path from "node:path"
import fs from "node:fs"
import { readCodexCredential, readClaudeCredential } from "../src/server/local-cli/harvester"
import { setCustomStorePath } from "../src/server/local-cli/credential-store"

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
    // A fake home is not enough to make these null: the store fallback reads the store through
    // credential-store, which is one user-level file rather than something scoped to a home. Point
    // the store somewhere empty as well, or this picks up whatever is signed in on this machine.
    const dir = path.join(os.tmpdir(), `arunaki-fastpath-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    fs.mkdirSync(dir, { recursive: true })
    setCustomStorePath(path.join(dir, "local-cli-credentials.json"))
    try {
      const codex = readCodexCredential("/nonexistent-dir-for-fastpath-test")
      expect(codex).toBeNull()

      const claude = readClaudeCredential("/nonexistent-dir-for-fastpath-test")
      expect(claude).toBeNull()
    } finally {
      setCustomStorePath(null)
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it("returns null for a home that has nothing, without touching the real store", () => {
    const dir = path.join(os.tmpdir(), `arunaki-fastpath-empty-${Date.now()}`)
    setCustomStorePath(path.join(dir, "missing.json"))
    try {
      expect(readCodexCredential(path.join(dir, "nope"))).toBeNull()
    } finally {
      setCustomStorePath(null)
    }
  })
})
