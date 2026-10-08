import { describe, expect, test } from "bun:test"
import { flattenPrompt as flattenPromptForTest } from "../src/server/local-cli/opencode-daemon"

/** The daemon flattens a chat into one prompt; OpenCode's session API takes text parts only. */
describe("OpenCode daemon prompt flattening", () => {
  test("labels user and assistant turns so the model can read the transcript", () => {
    const text = flattenPromptForTest({
      messages: [
        { role: "user", content: "first" },
        { role: "assistant", content: "answer" },
        { role: "user", content: "second" },
      ],
    })
    expect(text).toContain("User: first")
    expect(text).toContain("Assistant: answer")
    expect(text).toContain("User: second")
  })

  test("keeps the system prompt in a marked instruction block", () => {
    const text = flattenPromptForTest({
      messages: [
        { role: "system", content: "be terse" },
        { role: "user", content: "hi" },
      ],
    })
    expect(text).toContain("[SYSTEM INSTRUCTION: be terse]")
  })

  test("falls back to a greeting so the request is never empty", () => {
    expect(flattenPromptForTest({ messages: [] })).toBe("Hello")
  })
})