import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { chunksToCompletion, mapAntigravityEvent } from "../src/server/local-cli/upstream"
import { kiroEventToSse, newKiroStreamCtx, parseKiroFrame } from "../src/server/local-cli/kiro"

/**
 * Parallel tool calling broke the same way on two providers.
 *
 * Kiro streamed one call's arguments across several events sharing a toolUseId, and Antigravity
 * streamed one functionCall per event with its own parts array. Both derived the OpenAI tool_call
 * index from the event rather than from the call, so a second call reused the first's index and
 * chunksToCompletion merged them into one entry whose arguments were two JSON objects glued
 * together - not valid JSON, so nothing could execute it.
 *
 * These checks are lane-agnostic on purpose: they assert the shape every lane owes its caller,
 * so the next provider inherits the guarantee instead of rediscovering the bug.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function buildFrame(eventType: string, payload: unknown): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(payload))
  const name = new TextEncoder().encode(":event-type")
  const header = new Uint8Array(1 + name.length + 1 + 2 + eventType.length)
  const dv = new DataView(header.buffer)
  let o = 0
  header[o++] = name.length
  header.set(name, o)
  o += name.length
  header[o++] = 7
  dv.setUint16(o, eventType.length, false)
  o += 2
  header.set(new TextEncoder().encode(eventType), o)

  const total = 12 + header.length + body.length + 4
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  view.setUint32(0, total, false)
  view.setUint32(4, header.length, false)
  view.setUint32(8, crc32(out.subarray(0, 8)), false)
  out.set(header, 12)
  out.set(body, 12 + header.length)
  view.setUint32(total - 4, crc32(out.subarray(0, total - 4)), false)
  return out
}

const kiroFrame = (eventType: string, payload: unknown) => parseKiroFrame(buildFrame(eventType, payload))

const anticCtx = () => ({ id: "i", created: 0, model: "m", toolCallIndex: 0 })
const anticCall = (id: string, args: any) => ({
  candidates: [{ content: { parts: [{ functionCall: { id, name: "read_file", args } }] } }],
})

/** What every lane owes its caller, whatever it streams. */
function expectTwoValidCalls(chunks: string[], model = "m") {
  const completion = chunksToCompletion(chunks, model)
  const calls = completion.choices[0].message.tool_calls
  expect(calls).toHaveLength(2)
  for (const c of calls) {
    // Must parse: the old failure produced '{"a":1}{"b":2}', which throws here.
    expect(() => JSON.parse(c.function.arguments)).not.toThrow()
    expect(c.function.name).toBeTruthy()
    expect(c.id).toBeTruthy()
  }
  return calls.map((c: any) => JSON.parse(c.function.arguments))
}

describe("parallel tool calls survive on every lane", () => {
  test("Kiro: two toolUseIds in one turn", () => {
    const ctx = newKiroStreamCtx("i", 0, "m")
    const chunks = [
      kiroEventToSse(kiroFrame("toolUseEvent", { toolUseId: "tu_1", name: "read_file", input: '{"path":"a.txt"}' }), ctx)!,
      kiroEventToSse(kiroFrame("toolUseEvent", { toolUseId: "tu_2", name: "read_file", input: '{"path":"b.txt"}' }), ctx)!,
      kiroEventToSse(kiroFrame("messageStopEvent", {}), ctx)!,
    ]
    expect(expectTwoValidCalls(chunks)).toEqual([{ path: "a.txt" }, { path: "b.txt" }])
  })

  test("Kiro: one call whose arguments stream in fragments stays one call", () => {
    const ctx = newKiroStreamCtx("i", 0, "m")
    const chunks = [
      kiroEventToSse(kiroFrame("toolUseEvent", { toolUseId: "tu_1", name: "f", input: '{"city": ' }), ctx)!,
      kiroEventToSse(kiroFrame("toolUseEvent", { toolUseId: "tu_1", input: '"Jakarta"}' }), ctx)!,
      kiroEventToSse(kiroFrame("messageStopEvent", {}), ctx)!,
    ]
    const calls = chunksToCompletion(chunks, "m").choices[0].message.tool_calls
    expect(calls).toHaveLength(1)
    expect(JSON.parse(calls[0].function.arguments)).toEqual({ city: "Jakarta" })
  })

  test("Antigravity: two functionCalls across events", () => {
    const ctx = anticCtx()
    const chunks = [
      mapAntigravityEvent(anticCall("c1", { path: "a.txt" }), ctx)!,
      mapAntigravityEvent(anticCall("c2", { path: "b.txt" }), ctx)!,
    ]
    expect(expectTwoValidCalls(chunks)).toEqual([{ path: "a.txt" }, { path: "b.txt" }])
  })
})

describe("no lane reintroduces a fenced tool-call pseudo-protocol", () => {
  const sources = ["bridge.ts", "upstream.ts", "kiro.ts"].map((f) => ({
    file: f,
    text: readFileSync(new URL(`../src/server/local-cli/${f}`, import.meta.url), "utf8"),
  }))

  for (const { file, text } of sources) {
    test(`${file} never instructs a model to emit a tool call as text`, () => {
      expect(text).not.toContain("```tool_call")
      // The old directive also told the model it had no tools, which is why several providers
      // answered "I don't have that tool" while holding a perfectly good tool list.
      expect(text).not.toContain("you MUST output a tool call block")
    })
  }
})