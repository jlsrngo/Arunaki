import { describe, it, expect } from "bun:test"
import {
  buildCodexRequest,
  buildAnthropicHeaders,
  chatToResponses,
  mapCodexEventToOpenAI,
  chunksToCompletion,
  anthropicUrl,
} from "../src/server/local-cli/upstream"
import type { DiscoveredCredential } from "../src/server/local-cli/credential-store"

describe("Upstream request builders", () => {
  it("codex → chatgpt.com/backend-api/codex/responses (BUKAN api.openai.com)", () => {
    const cred: DiscoveredCredential = {
      provider: "codex",
      displayName: "Codex",
      type: "oauth",
      accessToken: "mock-token",
      accountId: "acct-1",
      sourcePath: "mock",
    }
    const req = buildCodexRequest(
      {
        model: "gpt-5.1-codex",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      },
      cred,
    )

    expect(req.url).toBe("https://chatgpt.com/backend-api/codex/responses")
    expect(req.headers["ChatGPT-Account-ID"]).toBe("acct-1")
    expect(req.headers["originator"]).toBe("codex_cli_rs")
    expect(req.headers["Authorization"]).toContain("Bearer mock-token")
    const body = JSON.parse(req.body)
    expect(body.input).toBeDefined()
    expect(body.messages).toBeUndefined()
  })

  it("anthropic oauth → Authorization Bearer + Anthropic-Beta + ?beta=true", () => {
    const cred: DiscoveredCredential = {
      provider: "claude",
      displayName: "Claude",
      type: "oauth",
      accessToken: "sk-ant-oat01-x",
      sourcePath: "mock",
    }
    const h = buildAnthropicHeaders(cred)
    expect(h.Authorization).toBe("Bearer sk-ant-oat01-x")
    expect(h["anthropic-version"]).toBe("2023-06-01")
    expect(h["Anthropic-Beta"]).toContain("oauth-2025-04-20")
    expect(anthropicUrl).toContain("?beta=true")
  })

  it("anthropic api key → x-api-key raw (tanpa Bearer)", () => {
    const cred: DiscoveredCredential = {
      provider: "claude",
      displayName: "Claude",
      type: "api_key",
      accessToken: "sk-ant-api03-k",
      sourcePath: "mock",
    }
    const h = buildAnthropicHeaders(cred)
    expect(h["x-api-key"]).toBe("sk-ant-api03-k")
    expect(h.Authorization).toBeUndefined()
  })

  it("chatToResponses: flat tools mapping", () => {
    const payload = {
      model: "gpt-4o",
      messages: [{ role: "user", content: "read file" }],
      tools: [
        {
          type: "function",
          function: {
            name: "read_file",
            description: "Read workspace file",
            parameters: { type: "object", properties: { path: { type: "string" } } },
          },
        },
      ],
    }
    const res = chatToResponses(payload)
    expect(res.tools).toHaveLength(1)
    expect(res.tools[0].name).toBe("read_file")
    expect(res.tools[0].type).toBe("function")
  })

  it("mapCodexEventToOpenAI: maps text delta and completion", () => {
    const ctx = { id: "chatcmpl-test", created: 12345, model: "codex" }
    const deltaEv = { type: "response.output_text.delta", delta: "hello world" }
    const deltaChunk = mapCodexEventToOpenAI(deltaEv, ctx)
    expect(deltaChunk).toContain("hello world")

    const completeEv = {
      type: "response.completed",
      response: {
        output: [],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      },
    }
    const completeChunk = mapCodexEventToOpenAI(completeEv, ctx)
    expect(completeChunk).toContain("[DONE]")
  })

  it("chatToResponses selalu stream:true (klien non-stream diterjemahkan balik)", () => {
    const res = chatToResponses({
      model: "gpt-5.1-codex",
      messages: [{ role: "user", content: "hi" }],
      stream: false,
    })
    expect(res.stream).toBe(true)
  })

  it("tool id diumumkan dari output_item.added SEBELUM argumen delta", () => {
    const ctx = { id: "c1", created: 1, model: "gpt-5.1-codex" }
    const added = JSON.parse(
      mapCodexEventToOpenAI(
        {
          type: "response.output_item.added",
          output_index: 1,
          item: { type: "function_call", id: "fc_1", call_id: "call_abc", name: "calc" },
        },
        ctx,
      )!.slice(6),
    )
    expect(added.choices[0].delta.tool_calls[0]).toMatchObject({
      index: 1,
      id: "call_abc",
      function: { name: "calc", arguments: "" },
    })

    const delta = JSON.parse(
      mapCodexEventToOpenAI(
        { type: "response.function_call_arguments.delta", output_index: 1, delta: "{\"x\":" },
        ctx,
      )!.slice(6),
    )
    expect(delta.choices[0].delta.tool_calls[0].index).toBe(1)
    expect(delta.choices[0].delta.tool_calls[0].id).toBeUndefined()
  })

  it("chunksToCompletion menggabungkan stream jadi satu chat.completion", () => {
    const ctx = { id: "c1", created: 1, model: "gpt-5.1-codex" }
    const chunks = [
      mapCodexEventToOpenAI({ type: "response.output_text.delta", delta: "halo " }, ctx)!,
      mapCodexEventToOpenAI({ type: "response.output_text.delta", delta: "dunia" }, ctx)!,
      mapCodexEventToOpenAI(
        {
          type: "response.output_item.added",
          output_index: 0,
          item: { type: "function_call", call_id: "call_1", name: "calc" },
        },
        ctx,
      )!,
      mapCodexEventToOpenAI(
        { type: "response.function_call_arguments.delta", output_index: 0, delta: "{\"x\":2}" },
        ctx,
      )!,
      mapCodexEventToOpenAI(
        {
          type: "response.completed",
          response: {
            output: [{ type: "function_call" }],
            usage: { input_tokens: 3, output_tokens: 4, total_tokens: 7 },
          },
        },
        ctx,
      )!,
    ]
    const body = chunksToCompletion(chunks, "gpt-5.1-codex")
    expect(body.choices[0].message.content).toBe("halo dunia")
    expect(body.choices[0].message.tool_calls[0]).toMatchObject({
      id: "call_1",
      function: { name: "calc", arguments: '{"x":2}' },
    })
    expect(body.choices[0].finish_reason).toBe("tool_calls")
    expect(body.usage.total_tokens).toBe(7)
    expect(chunksToCompletion([], "m")).toBeNull()
  })
})
