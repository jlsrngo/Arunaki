import { describe, expect, test } from "bun:test"
import {
  buildKiroRequest,
  newKiroStreamCtx,
  kiroEventToSse,
  parseKiroFrame,
  stripKiroPrefix,
  takeKiroFrame,
} from "../src/server/local-cli/kiro"
import { chunksToCompletion } from "../src/server/local-cli/upstream"
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

/** Fresh stream state per event, the way a real request would hold it. */
const ctx = (model: string) => newKiroStreamCtx("id1", 1, model)

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
    const sse = kiroEventToSse(frame, ctx("claude-sonnet-4.5")) ?? ""
    expect(sse).toContain('"content":"hi there"')
  })

  test("maps a stop event to finish_reason stop", () => {
    const frame = parseKiroFrame(buildFrame("messageStopEvent", { stopReason: "end_turn" }))
    const sse = kiroEventToSse(frame, ctx("m"))
    expect(sse).toContain('"finish_reason":"stop"')
  })

  test("surfaces an invalid-state event as an error rather than text", () => {
    const frame = parseKiroFrame(buildFrame("invalidStateEvent", { reason: "REQUEST_BODY_INVALID", message: "bad" }))
    const sse = kiroEventToSse(frame, ctx("m"))
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

  test("sends Authorization as well as x-amz-sso-bearer", () => {
    // Verified live: q.us-east-1.amazonaws.com answers "Missing bearer token in the
    // authorization header" when only the x-amz-* spelling is present, while the kiro.dev
    // gateway reads the other one.
    const req = buildKiroRequest({ model: "m", messages: [{ role: "user", content: "hi" }] }, cred)
    expect(req.headers["Authorization"]).toBe("Bearer tok_kiro")
  })

  test("strips the routing prefix before the request reaches AWS", () => {
    expect(stripKiroPrefix("kiro/claude-sonnet-4.5")).toBe("claude-sonnet-4.5")
    expect(stripKiroPrefix("claude-sonnet-4.5")).toBe("claude-sonnet-4.5")
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

describe("Kiro tool calling", () => {
  const tools = [
    {
      type: "function",
      function: {
        name: "get_weather",
        description: "Weather for a city",
        parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
      },
    },
  ]

  test("converts OpenAI tools into Kiro tool specifications on the current turn", () => {
    const req = buildKiroRequest(
      { model: "m", messages: [{ role: "user", content: "weather?" }], tools },
      cred,
    )
    const current = JSON.parse(req.body).conversationState.currentMessage
    const spec = current.userInputMessage.userInputMessageContext.tools[0].toolSpecification
    expect(spec.name).toBe("get_weather")
    expect(spec.inputSchema.json.properties.city.type).toBe("string")
  })

  test("sanitises tool names Kiro would refuse", () => {
    const req = buildKiroRequest(
      {
        model: "m",
        messages: [{ role: "user", content: "x" }],
        tools: [{ type: "function", function: { name: "mcp__fs__read", parameters: {} } }],
      },
      cred,
    )
    const name = JSON.parse(req.body).conversationState.currentMessage.userInputMessage.userInputMessageContext
      .tools[0].toolSpecification.name
    expect(name).toMatch(/^[a-zA-Z][a-zA-Z0-9_-]*$/)
    expect(name).not.toContain("__")
  })

  test("turns prior assistant tool_calls into Kiro toolUses", () => {
    // Realistic shape: a tool call is history once the client has sent the result and asked
    // the next question. A request ending on the assistant turn has nothing to answer.
    const req = buildKiroRequest(
      {
        model: "m",
        messages: [
          { role: "user", content: "weather?" },
          {
            role: "assistant",
            content: null,
            tool_calls: [
              { id: "call_1", type: "function", function: { name: "get_weather", arguments: '{"city":"Jakarta"}' } },
            ],
          },
          { role: "tool", tool_call_id: "call_1", content: "31C sunny" },
          { role: "user", content: "and tomorrow?" },
        ],
        tools,
      },
      cred,
    )
    const history = JSON.parse(req.body).conversationState.history
    const assistant = history.find((h: any) => h.assistantResponseMessage)?.assistantResponseMessage
    expect(assistant.toolUses[0]).toMatchObject({ toolUseId: "call_1", name: "get_weather" })
    expect(assistant.toolUses[0].input).toEqual({ city: "Jakarta" })
  })

  test("sends tool results on the current turn, never as a top-level field", () => {
    const req = buildKiroRequest(
      {
        model: "m",
        messages: [
          { role: "user", content: "weather?" },
          { role: "assistant", tool_calls: [{ id: "call_1", type: "function", function: { name: "get_weather", arguments: "{}" } }] },
          { role: "tool", tool_call_id: "call_1", content: "31C sunny" },
          { role: "user", content: "and tomorrow?" },
        ],
        tools,
      },
      cred,
    )
    const body = JSON.parse(req.body)
    expect(body.toolResults).toBeUndefined()
    const ctx = body.conversationState.currentMessage.userInputMessage.userInputMessageContext
    expect(ctx.toolResults[0]).toMatchObject({ toolUseId: "call_1", status: "success" })
    expect(ctx.toolResults[0].content[0].text).toBe("31C sunny")
  })

  test("gives a tool-result-only turn placeholder text, since AWS rejects empty content", () => {
    const req = buildKiroRequest(
      {
        model: "m",
        messages: [
          { role: "user", content: "weather?" },
          { role: "assistant", tool_calls: [{ id: "c1", type: "function", function: { name: "get_weather", arguments: "{}" } }] },
          { role: "tool", tool_call_id: "c1", content: "31C" },
        ],
        tools,
      },
      cred,
    )
    const current = JSON.parse(req.body).conversationState.currentMessage
    expect(current.userInputMessage.content.length).toBeGreaterThan(0)
    expect(current.userInputMessage.userInputMessageContext.toolResults).toHaveLength(1)
  })

  test("maps a toolUseEvent to an OpenAI tool_calls chunk", () => {
    const frame = parseKiroFrame(buildFrame("toolUseEvent", { toolUseId: "tu_1", name: "get_weather", input: { city: "Jakarta" } }))
    const state = ctx("m")
    const sse = kiroEventToSse(frame, state) ?? ""
    const data = JSON.parse(sse.slice(6))
    expect(data.choices[0].delta.tool_calls[0]).toMatchObject({
      index: 0,
      id: "tu_1",
      type: "function",
    })
    expect(JSON.parse(data.choices[0].delta.tool_calls[0].function.arguments)).toEqual({ city: "Jakarta" })
    expect(state.hadToolUse).toBe(true)
  })

  test("gives parallel tool calls distinct indexes so a client can tell them apart", () => {
    const state = ctx("m")
    const a = parseKiroFrame(buildFrame("toolUseEvent", { toolUseId: "tu_1", name: "a", input: {} }))
    const b = parseKiroFrame(buildFrame("toolUseEvent", { toolUseId: "tu_2", name: "b", input: {} }))
    const first = JSON.parse((kiroEventToSse(a, state) ?? "").slice(6)).choices[0].delta.tool_calls[0]
    const second = JSON.parse((kiroEventToSse(b, state) ?? "").slice(6)).choices[0].delta.tool_calls[0]
    expect(first.index).toBe(0)
    expect(second.index).toBe(1)
    expect(first.function.name).toBe("a")
    expect(second.function.name).toBe("b")
  })

  test("ends a turn that called tools with finish_reason tool_calls", () => {
    const state = ctx("m")
    kiroEventToSse(parseKiroFrame(buildFrame("toolUseEvent", { toolUseId: "t", name: "a", input: {} })), state)
    const stop = JSON.parse((kiroEventToSse(parseKiroFrame(buildFrame("messageStopEvent", {})), state) ?? "").slice(6))
    expect(stop.choices[0].finish_reason).toBe("tool_calls")
  })

  test("captures credit usage Kiro reports in meteringEvent", () => {
    const state = ctx("m")
    const frame = parseKiroFrame(buildFrame("meteringEvent", { unit: "credit", usage: 0.00296 }))
    expect(kiroEventToSse(frame, state)).toBeNull()
    expect(state.creditsUsed).toBeCloseTo(0.00296, 5)
  })

  test("captures context usage so the card can show it later", () => {
    const state = ctx("m")
    const frame = parseKiroFrame(buildFrame("contextUsageEvent", { contextUsagePercentage: 2.05 }))
    expect(kiroEventToSse(frame, state)).toBeNull()
    expect(state.contextUsage).toBeCloseTo(2.05, 2)
  })

  test("does not claim a stop event that Kiro never sent", () => {
    // Verified live: Kiro streams assistantResponseEvent, contextUsageEvent, meteringEvent and
    // then just ends. Nothing marks the turn finished, so a non-streaming client waits forever.
    const state = ctx("m")
    kiroEventToSse(parseKiroFrame(buildFrame("assistantResponseEvent", { content: "PING" })), state)
    kiroEventToSse(parseKiroFrame(buildFrame("contextUsageEvent", { contextUsagePercentage: 2 })), state)
    kiroEventToSse(parseKiroFrame(buildFrame("meteringEvent", { usage: 0.003 })), state)
    expect(state.sentFinish).toBe(false)
  })
})

describe("Kiro non-streaming assembly", () => {
  test("assembles the same SSE a client would accumulate into one JSON body", () => {
    // The bug this covers: Kiro always wrote an SSE body, so a client that asked for
    // stream:false got JSON.parse failure and reported an empty answer with no error.
    const state = ctx("claude-haiku-4.5")
    const chunks = [
      kiroEventToSse(parseKiroFrame(buildFrame("assistantResponseEvent", { content: "PI" })), state),
      kiroEventToSse(parseKiroFrame(buildFrame("assistantResponseEvent", { content: "NG" })), state),
      kiroEventToSse({ headers: { ":event-type": "messageStopEvent" }, payload: {} }, state),
    ].filter((c): c is string => c !== null)

    const completion = chunksToCompletion(chunks, "claude-haiku-4.5")
    expect(completion.choices[0].message.content).toBe("PING")
    expect(completion.choices[0].finish_reason).toBe("stop")
  })

  test("keeps parallel tool calls intact through assembly", () => {
    const state = ctx("m")
    const chunks: string[] = []
    for (const [id, name, city] of [
      ["tu_1", "get_weather", "Jakarta"],
      ["tu_2", "get_weather", "Bandung"],
    ]) {
      // Kiro streams arguments in fragments, so emit opening then a fragment.
      chunks.push(kiroEventToSse(parseKiroFrame(buildFrame("toolUseEvent", { toolUseId: id, name, input: `{"city": "${city}"}` })), state)!)
      chunks.push(kiroEventToSse(parseKiroFrame(buildFrame("toolUseEvent", { toolUseId: id, input: "" })), state)!)
    }
    chunks.push(kiroEventToSse({ headers: { ":event-type": "messageStopEvent" }, payload: {} }, state)!)

    const completion = chunksToCompletion(chunks, "m")
    const calls = completion.choices[0].message.tool_calls
    expect(calls).toHaveLength(2)
    expect(JSON.parse(calls[0].function.arguments)).toEqual({ city: "Jakarta" })
    expect(JSON.parse(calls[1].function.arguments)).toEqual({ city: "Bandung" })
    expect(completion.choices[0].finish_reason).toBe("tool_calls")
  })

  test("sends the assistant role on the first chunk only", () => {
    const state = ctx("m")
    const first = JSON.parse((kiroEventToSse(parseKiroFrame(buildFrame("assistantResponseEvent", { content: "hi" })), state) ?? "").slice(6))
    const second = JSON.parse((kiroEventToSse(parseKiroFrame(buildFrame("assistantResponseEvent", { content: " there" })), state) ?? "").slice(6))
    expect(first.choices[0].delta.role).toBe("assistant")
    expect(second.choices[0].delta.role).toBeUndefined()
  })
})