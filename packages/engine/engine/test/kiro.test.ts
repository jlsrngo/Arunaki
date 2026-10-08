import { describe, expect, test } from "bun:test"
import { buildKiroRequest, kiroEventToSse, parseKiroFrame, takeKiroFrame } from "../src/server/local-cli/kiro"
import type { DiscoveredCredential } from "../src/server/local-cli/harvester"

const cred: DiscoveredCredential = {
  provider: "kiro",
  displayName: "Kiro (AWS)",
  type: "oauth",
  accessToken: "tok_kiro",
  region: "us-east-1",
  profileArn: "arn:aws:codewhisperer:us-east-1:1:profile/TEST",
  sourcePath: "",
} as DiscoveredCredential

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

/** Build a real EventStream frame so the parser is tested against bytes, not a mock. */
function buildFrame(eventType: string, payload: unknown): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(payload))
  const name = new TextEncoder().encode(":event-type")
  // type 7 = string: [len:u16][bytes]
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
  o += eventType.length

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

describe("Kiro AWS EventStream framing", () => {
  test("parses a frame with a string header and a JSON payload", () => {
    const frame = parseKiroFrame(buildFrame("assistantResponseEvent", { content: "hello" }))
    expect(frame.headers[":event-type"]).toBe("assistantResponseEvent")
    expect(frame.payload).toEqual({ content: "hello" })
  })

  test("round-trips content through the SSE mapper", () => {
    const frame = parseKiroFrame(buildFrame("assistantResponseEvent", { content: "hi there" }))
    const sse = kiroEventToSse(frame, { id: "id1", created: 1, model: "claude-sonnet-4.5" }) ?? ""
    expect(sse).toContain('"content":"hi there"')
  })

  test("maps a stop event to finish_reason stop", () => {
    const frame = parseKiroFrame(buildFrame("messageStopEvent", { stopReason: "end_turn" }))
    const sse = kiroEventToSse(frame, { id: "id1", created: 1, model: "m" })
    expect(sse).toContain('"finish_reason":"stop"')
  })

  test("surfaces an invalid-state event as an error rather than text", () => {
    const frame = parseKiroFrame(buildFrame("invalidStateEvent", { reason: "REQUEST_BODY_INVALID", message: "bad" }))
    const sse = kiroEventToSse(frame, { id: "id1", created: 1, model: "m" })
    expect(sse).toContain("kiro_invalid_state")
  })

  test("rejects a frame whose prelude CRC does not match", () => {
    const bytes = buildFrame("assistantResponseEvent", { content: "x" })
    new DataView(bytes.buffer).setUint32(8, 0, false)
    expect(() => parseKiroFrame(bytes)).toThrow(/prelude CRC/)
  })

  test("rejects a frame whose message CRC does not match", () => {
    const bytes = buildFrame("assistantResponseEvent", { content: "x" })
    new DataView(bytes.buffer).setUint32(bytes.length - 4, 0, false)
    expect(() => parseKiroFrame(bytes)).toThrow(/message CRC/)
  })

  test("reassembles a frame split across two network chunks", () => {
    const whole = buildFrame("assistantResponseEvent", { content: "streamed" })
    const first = whole.subarray(0, 20)
    expect(takeKiroFrame(first)).toBeNull() // incomplete, so wait for more bytes
    const second = whole.subarray(20)
    const joined = new Uint8Array(whole.length)
    joined.set(first)
    joined.set(second, first.length)
    const taken = takeKiroFrame(joined)!
    expect(taken.frame.payload.content).toBe("streamed")
    expect(taken.rest.byteLength).toBe(0)
  })

  test("splits two frames arriving in one chunk", () => {
    const a = buildFrame("assistantResponseEvent", { content: "one" })
    const b = buildFrame("assistantResponseEvent", { content: "two" })
    const both = new Uint8Array(a.length + b.length)
    both.set(a)
    both.set(b, a.length)
    const first = takeKiroFrame(both)!
    expect(first.frame.payload.content).toBe("one")
    const second = takeKiroFrame(first.rest)!
    expect(second.frame.payload.content).toBe("two")
  })
})

describe("Kiro request payload", () => {
  test("sends the token and profile ARN as Kiro headers", () => {
    const req = buildKiroRequest({ model: "claude-sonnet-4.5", messages: [{ role: "user", content: "hi" }] }, cred)
    expect(req.headers["x-amz-sso-bearer"]).toBe("tok_kiro")
    expect(req.headers["x-amzn-codewhisperer-profile-arn"]).toBe("arn:aws:codewhisperer:us-east-1:1:profile/TEST")
  })

  test("passes the model id straight through to currentMessage", () => {
    const req = buildKiroRequest({ model: "claude-haiku-4.5", messages: [{ role: "user", content: "hi" }] }, cred)
    const body = JSON.parse(req.body)
    expect(body.conversationState.currentMessage.userInputMessage.modelId).toBe("claude-haiku-4.5")
  })

  test("moves the system prompt into the first user turn, never a top-level field", () => {
    const req = buildKiroRequest(
      {
        model: "m",
        messages: [
          { role: "system", content: "be brief" },
          { role: "user", content: "hi" },
        ],
      },
      cred,
    )
    const body = JSON.parse(req.body)
    // Kiro answers 400 REQUEST_BODY_INVALID for a top-level systemPrompt.
    expect(body.systemPrompt).toBeUndefined()
    expect(body.conversationState.currentMessage.userInputMessage.content).toContain("be brief")
  })

  test("keeps earlier turns as history and the last user turn as currentMessage", () => {
    const req = buildKiroRequest(
      {
        model: "m",
        messages: [
          { role: "user", content: "first" },
          { role: "assistant", content: "answer" },
          { role: "user", content: "second" },
        ],
      },
      cred,
    )
    const { history, currentMessage } = JSON.parse(req.body).conversationState
    expect(history).toHaveLength(2)
    expect(history[0].userInputMessage.content).toBe("first")
    expect(history[1].assistantResponseMessage.content).toBe("answer")
    expect(currentMessage.userInputMessage.content).toBe("second")
  })
})