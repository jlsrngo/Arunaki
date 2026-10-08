import { describe, expect, test } from "bun:test"
import { chunksToCompletion, mapAntigravityEvent } from "../src/server/local-cli/upstream"

/**
 * Gemini streams one functionCall per event. The index used to come from parts.indexOf(p), and
 * each event carries its own parts array, so every call got index 0. Two parallel calls then
 * collapsed into one tool_call whose arguments were two JSON objects glued together.
 */
function event(callId: string, name: string, args: any) {
  return { candidates: [{ content: { parts: [{ functionCall: { id: callId, name, args } }] } }] }
}

describe("Antigravity parallel tool calls", () => {
  test("gives each call its own index instead of reusing the event position", () => {
    const ctx = { id: "i", created: 0, model: "m", toolCallIndex: 0 }
    const a = mapAntigravityEvent(event("c1", "read_file", { path: "notes.txt" }), ctx)!
    const b = mapAntigravityEvent(event("c2", "read_file", { path: "todo.txt" }), ctx)!

    const first = JSON.parse(a.slice(6)).choices[0].delta.tool_calls[0]
    const second = JSON.parse(b.slice(6)).choices[0].delta.tool_calls[0]
    expect(first.index).toBe(0)
    expect(second.index).toBe(1)
  })

  test("two calls in separate events survive assembly as two tool_calls", () => {
    const ctx = { id: "i", created: 0, model: "m", toolCallIndex: 0 }
    const chunks = [
      mapAntigravityEvent(event("c1", "read_file", { path: "notes.txt" }), ctx)!,
      mapAntigravityEvent(event("c2", "read_file", { path: "todo.txt" }), ctx)!,
    ]

    const completion = chunksToCompletion(chunks, "m")
    const calls = completion.choices[0].message.tool_calls
    expect(calls).toHaveLength(2)
    // The old behaviour produced one call with {"a":1}{"b":2} glued together.
    expect(JSON.parse(calls[0].function.arguments)).toEqual({ path: "notes.txt" })
    expect(JSON.parse(calls[1].function.arguments)).toEqual({ path: "todo.txt" })
  })

  test("defaults the counter when a caller omits it", () => {
    const ctx = { id: "i", created: 0, model: "m" } as any
    expect(mapAntigravityEvent(event("c1", "f", {}), ctx)).toBeTruthy()
    expect(mapAntigravityEvent(event("c2", "f", {}), ctx)).toBeTruthy()
    expect(ctx.toolCallIndex).toBe(2)
  })
})