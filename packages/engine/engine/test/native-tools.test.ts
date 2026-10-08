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

  test("still forwards tool results into the flat transcript", () => {
    // Dropping the block format must not drop the results: a lane that takes one prompt still
    // needs to see what came back.
    expect(bridge).toContain("[Tool Result for")
  })

  test("renders prior tool calls as readable prose", () => {
    expect(bridge).toContain("[called ")
  })
})