import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

/**
 * Guards the removal of the fenced tool_call directive.
 *
 * The directive told models to emit ```tool_call blocks. Nothing in Arunaki parsed them: the
 * frontend consumes native tool events, and the only code that produced that format was dead.
 * A compliant model therefore showed raw JSON to the user instead of running a tool.
 */
const bridge = readFileSync(new URL("../src/server/local-cli/bridge.ts", import.meta.url), "utf8")

describe("tool calling goes over the native path only", () => {
  test("no longer tells a model to fake a tool call in a fenced block", () => {
    expect(bridge).not.toContain("```tool_call")
  })

  test("no longer claims the runtime has no tool access", () => {
    expect(bridge).not.toContain("DO NOT execute commands or invoke native tools")
  })

  test("carries no leftover directive plumbing", () => {
    expect(bridge).not.toContain("toolsDirective")
  })

  test("no longer flattens a transcript nobody consumes", () => {
    // The CLI lanes that needed one prompt are gone; finalPrompt was assigned and never read.
    expect(bridge).not.toContain("finalPrompt")
    expect(bridge).not.toContain("conversationParts")
  })

  test("still forwards tool results to the lanes that take a flat prompt", () => {
    // The Groq lane replays payload.messages itself, so results must keep their shape rather
    // than being flattened into prose.
    expect(bridge).toContain("for (const msg of payload.messages ?? [])")
    expect(bridge).toContain("groqPayload.tools = payload.tools")
  })

  test("still lifts the system prompt out for the lanes that prepend one", () => {
    expect(bridge).toContain("let systemPrompt = \"\"")
  })
})