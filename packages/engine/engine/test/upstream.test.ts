import { describe, it, expect } from "bun:test"
import {
  buildCodexRequest,
  buildAnthropicHeaders,
  chatToResponses,
  mapCodexEventToOpenAI,
  chunksToCompletion,
  anthropicUrl,
  streamDirectCodexCompletion,
  streamDirectAnthropicCompletion,
  streamDirectOpenCodeCompletion,
  streamDirectAntigravityCompletion,
  antigravityUrl,
  antigravityModelId,
  chatToAntigravityContents,
  chatToAntigravityTools,
  buildAntigravityBody,
  mapAntigravityEvent,
  opencodeUrlFor,
  buildOpenCodeHeaders,
  applyOpenCodeFingerprint,
  opencodeSessionId,
} from "../src/server/local-cli/upstream"
import type { DiscoveredCredential } from "../src/server/local-cli/credential-store"

const cred: DiscoveredCredential = {
  provider: "codex",
  displayName: "Codex",
  type: "oauth",
  accessToken: "mock-token",
  sourcePath: "mock",
  expiresAt: Date.now() + 3_600_000,
}

const claudeCred: DiscoveredCredential = { ...cred, provider: "claude", displayName: "Claude" }

function fakeRes() {
  const state: { head?: Record<string, any>; body: string; ended: boolean } = {
    body: "",
    ended: false,
  }
  const res = {
    get headersSent() {
      return state.head != null
    },
    writeHead: (code: number, headers: Record<string, any>) => {
      state.head = { code, ...headers }
      return res
    },
    write: (chunk: string) => {
      state.body += chunk
      return true
    },
    end: (chunk?: string) => {
      if (chunk) state.body += chunk
      state.ended = true
      return res
    },
  }
  return { res: res as any, state }
}

function sseResponse(lines: string[], status = 200) {
  const body = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(lines.join("")))
      c.close()
    },
  })
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  })
}

const CODEX_STREAM = [
  `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "hi" })}\n\n`,
  `data: ${JSON.stringify({
    type: "response.output_item.added",
    output_index: 0,
    item: { type: "function_call", call_id: "call_1", name: "calc" },
  })}\n\n`,
  `data: ${JSON.stringify({
    type: "response.function_call_arguments.delta",
    output_index: 0,
    delta: '{"x":1}',
  })}\n\n`,
  `data: ${JSON.stringify({
    type: "response.completed",
    response: { output: [{ type: "function_call" }], usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 } },
  })}\n\n`,
]

const CLAUDE_STREAM = [
  `data: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 4 } } })}\n\n`,
  `data: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hi" } })}\n\n`,
  `data: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2 } })}\n\n`,
  `data: ${JSON.stringify({ type: "message_stop" })}\n\n`,
]

describe("Upstream request builders", () => {
  it("codex → chatgpt.com/backend-api/codex/responses (NOT api.openai.com)", () => {
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

  it("anthropic api key → raw x-api-key (without Bearer)", () => {
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

  it("chatToResponses always sets stream:true (non-stream clients translated back)", () => {
    const res = chatToResponses({
      model: "gpt-5.1-codex",
      messages: [{ role: "user", content: "hi" }],
      stream: false,
    })
    expect(res.stream).toBe(true)
  })

  it("chatToResponses: system/developer hoisted to instructions, not message input", () => {
    const res = chatToResponses({
      model: "gpt-5.1-codex",
      messages: [
        { role: "system", content: "rule A" },
        { role: "developer", content: "rule B" },
        { role: "user", content: "hi" },
      ],
    })
    expect(res.instructions).toBe("rule A\n\nrule B")
    expect(res.input).toHaveLength(1)
    expect(res.input[0].role).toBe("user")
  })

  it("tool id announced in output_item.added BEFORE argument deltas", () => {
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

  it("chunksToCompletion aggregates stream into single chat.completion", () => {
    const ctx = { id: "c1", created: 1, model: "gpt-5.1-codex" }
    const chunks = [
      mapCodexEventToOpenAI({ type: "response.output_text.delta", delta: "hello " }, ctx)!,
      mapCodexEventToOpenAI({ type: "response.output_text.delta", delta: "world" }, ctx)!,
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
    expect(body.choices[0].message.content).toBe("hello world")
    expect(body.choices[0].message.tool_calls[0]).toMatchObject({
      id: "call_1",
      function: { name: "calc", arguments: '{"x":2}' },
    })
    expect(body.choices[0].finish_reason).toBe("tool_calls")
    expect(body.usage.total_tokens).toBe(7)
    expect(chunksToCompletion([], "m")).toBeNull()
  })

  it("antigravity: daily URL + project discovery stays on prod host", () => {
    expect(antigravityUrl(true)).toBe(
      "https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse",
    )
    expect(antigravityUrl(false)).toBe(
      "https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent",
    )
  })

  it("antigravity: chat → contents/parts Gemini (role, functionCall, functionResponse)", () => {
    const contents = chatToAntigravityContents({
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "halo" },
        {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "c1", function: { name: "read", arguments: '{"path":"a.txt"}' } }],
        },
        { role: "tool", tool_call_id: "c1", content: "isi" },
        { role: "user", content: "lanjut" },
      ],
    })
    expect(contents[0]).toEqual({ role: "user", parts: [{ text: "halo" }] })
    expect(contents[1].role).toBe("model")
    expect(contents[1].parts[0].functionCall).toMatchObject({ name: "read", args: { path: "a.txt" } })
    // functionResponse must be user role and merged with next turn
    expect(contents[2].role).toBe("user")
    // functionResponse matched by NAME (no name field in OpenAI tool messages)
    expect(contents[2].parts[0].functionResponse.name).toBe("read")
    expect(contents[2].parts[0].functionResponse.response.content).toBe("isi")
    expect(contents[2].parts[1]).toEqual({ text: "lanjut" })
  })

  it("antigravity: merges tools into single group + sanitizes name", () => {
    const tools = chatToAntigravityTools({
      tools: [
        { type: "function", function: { name: "read file", description: "d", parameters: { type: "object" } } },
        { type: "function", function: { name: "read_file", description: "d2" } },
      ],
    })
    expect(tools).toHaveLength(1)
    expect(tools![0].functionDeclarations).toHaveLength(1)
    expect(tools![0].functionDeclarations[0].name).toBe("read_file")
    expect(chatToAntigravityTools({ tools: [] })).toBeUndefined()
  })

  it("antigravity: body without requestType + toolConfig VALIDATED", () => {
    const body = buildAntigravityBody(
      {
        model: "gemini-3.8-flash",
        messages: [{ role: "user", content: "hi" }],
        tools: [{ type: "function", function: { name: "read", parameters: { type: "object", properties: {} } } }],
      },
      "proj-123",
      "ses_abc",
      true,
    )
    expect(body.project).toBe("proj-123")
    expect(body.userAgent).toBe("antigravity")
    expect(body.request.sessionId).toBe("ses_abc")
    expect(body.request.toolConfig).toEqual({ functionCallingConfig: { mode: "VALIDATED" } })
    // requestType "agent" triggers 429 without details — must be omitted
    expect("requestType" in body).toBe(false)
    expect("safetySettings" in body.request).toBe(false)
  })

  it("antigravity: model id dipetakan, suffix (medium) ditolak upstream", () => {
    // The Cloud Code endpoint 404s on bare catalogue ids and also on 9Router's
    // "(medium)" suffix; only the plain tier name is accepted.
    expect(antigravityModelId("gemini-3.8-flash")).toBe("gemini-3.8-flash-medium")
    expect(antigravityModelId("gemini-3.8-flash-low")).toBe("gemini-3.8-flash-low")
    expect(antigravityModelId("gemini-3.1-pro")).toBe("gemini-pro-agent")
    expect(antigravityModelId("tidak-dikenal")).toBe("tidak-dikenal")
  })

  it("antigravity: streamGenerateContent wraps the candidate inside response", () => {
    const ctx = { id: "c1", created: 1, model: "gemini-3.8-flash" }
    const wrapped = mapAntigravityEvent(
      {
        response: {
          candidates: [{ content: { role: "model", parts: [{ text: "PONG" }] } }],
          usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 2, totalTokenCount: 68 },
        },
        modelVersion: "gemini-3.8-flash-n",
      },
      ctx,
    )!
    expect(wrapped).toContain("PONG")
    expect(wrapped).toContain('"total_tokens":68')
  })

  it("antigravity: Gemini event → OpenAI chunk (text + functionCall)", () => {
    const ctx = { id: "c1", created: 1, model: "gemini-3.8-flash" }
    const textChunk = mapAntigravityEvent(
      { candidates: [{ content: { parts: [{ text: "hai" }] } }] },
      ctx,
    )
    expect(textChunk).toContain("hai")

    const callChunk = mapAntigravityEvent(
      { candidates: [{ content: { parts: [{ functionCall: { name: "read", args: { path: "a" }, id: "c9" } }] } }] },
      ctx,
    )!
    const parsed = JSON.parse(callChunk.split("data: ")[1].split("\n")[0])
    expect(parsed.choices[0].delta.tool_calls[0]).toMatchObject({
      id: "c9",
      function: { name: "read", arguments: '{"path":"a"}' },
    })

    const usage = mapAntigravityEvent(
      { usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 6, totalTokenCount: 10 } },
      ctx,
    )!
    expect(usage).toContain('"total_tokens":10')
  })

  it("fast-path antigravity: 403 → returns false without writing", async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (url: any, init: any) => {
      const u = String(url)
      if (u.includes("loadCodeAssist")) {
        expect(init.headers.Authorization).toBe("Bearer ya29.token")
        // Google's backend refuses to provision a project when these leak in
        expect(init.headers["X-Goog-Api-Client"]).toBeUndefined()
        expect(init.headers["Client-Metadata"]).toBeUndefined()
        return new Response(JSON.stringify({ cloudaicompanionProject: "proj-live" }), { status: 200 })
      }
      return new Response(JSON.stringify({ error: { code: 429 } }), { status: 403 })
    }) as any
    const { res, state } = fakeRes()
    try {
      const handled = await streamDirectAntigravityCompletion(
        { model: "gemini-3.8-flash", messages: [{ role: "user", content: "hi" }], stream: true },
        res,
        { accessToken: "ya29.token" },
      )
      expect(handled).toBe(false)
      expect(state.body).toBe("")
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it("fast-path antigravity: forwards SSE stream + uses OAuth token", async () => {
    const realFetch = globalThis.fetch
    let chatUrl = ""
    let authHeader = ""
    globalThis.fetch = (async (url: any, init: any) => {
      const u = String(url)
      if (u.includes("loadCodeAssist")) {
        return new Response(JSON.stringify({ cloudaicompanionProject: "proj-live" }), { status: 200 })
      }
      chatUrl = u
      authHeader = init.headers.Authorization
      return sseResponse([
        `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "PING" }] } }] })}\n\n`,
        `data: ${JSON.stringify({ usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } })}\n\n`,
      ])
    }) as any
    const { res, state } = fakeRes()
    try {
      const handled = await streamDirectAntigravityCompletion(
        { model: "gemini-3.8-flash", messages: [{ role: "user", content: "hi" }], stream: true },
        res,
        { accessToken: "ya29.token" },
      )
      expect(handled).toBe(true)
      expect(chatUrl).toBe(
        "https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse",
      )
      expect(authHeader).toBe("Bearer ya29.token")
      expect(state.body).toContain("PING")
      expect(state.body).toContain("[DONE]")
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it("fast-path antigravity: missing project id → returns false (fallback)", async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (url: any) => {
      if (String(url).includes("loadCodeAssist")) {
        return new Response(JSON.stringify({}), { status: 200 })
      }
      throw new Error("should not reach chat")
    }) as any
    const { res, state } = fakeRes()
    try {
      const handled = await streamDirectAntigravityCompletion(
        { model: "gemini-3.8-flash", messages: [{ role: "user", content: "hi" }], stream: true },
        res,
        { accessToken: "ya29.token" },
      )
      expect(handled).toBe(false)
      expect(state.body).toBe("")
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it("opencode zen: URL, headers, and fingerprint follow 9Router", () => {
    expect(opencodeUrlFor()).toBe("https://opencode.ai/zen/v1/chat/completions")

    const payload = { messages: [{ role: "user", content: "halo" }] }
    const h = buildOpenCodeHeaders(payload)
    expect(h["User-Agent"]).toBe("opencode/1.18.31")
    expect(h["x-opencode-client"]).toBe("desktop")
    expect(h["x-opencode-project"]).toBe("global")
    expect(h.Authorization).toBe("Bearer public")
    expect(h["x-opencode-session"]).toMatch(/^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/)
    expect(h["x-opencode-request"]).toMatch(/^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/)

    // Stable session per conversation (9Router: quota counted per session)
    expect(buildOpenCodeHeaders(payload)["x-opencode-session"]).toBe(
      h["x-opencode-session"],
    )

    // Account token replaces pooled lane
    expect(buildOpenCodeHeaders(payload, "acct-token").Authorization).toBe(
      "Bearer acct-token",
    )

    const body: any = { model: "big-pickle", messages: [] }
    applyOpenCodeFingerprint(body)
    const names = body.tools.map((t: any) => t.function.name)
    expect(names).toEqual(["bash", "glob", "grep", "read"])
    expect(body.tool_choice).toBe("none")

    // Client tools are preserved, not duplicated
    const withTools: any = {
      tools: [{ type: "function", function: { name: "Bash" } }, { type: "function", function: { name: "read" } }],
    }
    applyOpenCodeFingerprint(withTools)
    const got = withTools.tools.map((t: any) => t.function.name.toLowerCase())
    expect(got.filter((n: string) => n === "read")).toHaveLength(1)
    expect(got).toContain("glob")
  })

  it("fast-path opencode: 403 → returns false without writing to client", async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ error: { type: "FreeTierError", message: "only from within OpenCode" } }),
        { status: 403 },
      )) as any
    const { res, state } = fakeRes()
    try {
      const handled = await streamDirectOpenCodeCompletion(
        { model: "opencode/big-pickle", messages: [{ role: "user", content: "hi" }], stream: true },
        res,
      )
      expect(handled).toBe(false)
      expect(state.head).toBeUndefined()
      expect(state.body).toBe("")
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it("fast-path opencode: forwards SSE stream as-is", async () => {
    const realFetch = globalThis.fetch
    const seen: any[] = []
    globalThis.fetch = (async (url: any, init: any) => {
      seen.push({ url: String(url), body: JSON.parse(String(init.body)), headers: init.headers })
      return sseResponse([
        `data: ${JSON.stringify({ id: "c1", choices: [{ index: 0, delta: { content: "hai" } }] })}\n\n`,
        `data: ${JSON.stringify({ id: "c1", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`,
        "data: [DONE]\n\n",
      ])
    }) as any
    const { res, state } = fakeRes()
    try {
      const handled = await streamDirectOpenCodeCompletion(
        { model: "opencode/big-pickle", messages: [{ role: "user", content: "hi" }], stream: true },
        res,
      )
      expect(handled).toBe(true)
      expect(seen[0].url).toBe("https://opencode.ai/zen/v1/chat/completions")
      // stream forced to true, tool fingerprint added
      expect(seen[0].body.stream).toBe(true)
      expect(seen[0].body.model).toBe("big-pickle")
      expect(seen[0].body.tools.map((t: any) => t.function.name)).toContain("bash")
      expect(state.body).toContain("hai")
      expect(state.body).toContain("[DONE]")
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it("fast-path opencode: aggregates non-stream into chat.completion", async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      sseResponse([
        `data: ${JSON.stringify({ id: "c1", choices: [{ index: 0, delta: { content: "hai" } }] })}\n\n`,
        `data: ${JSON.stringify({
          id: "c1",
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
        })}\n\n`,
      ])) as any
    const { res, state } = fakeRes()
    try {
      const handled = await streamDirectOpenCodeCompletion(
        { model: "opencode/big-pickle", messages: [{ role: "user", content: "hi" }], stream: false },
        res,
      )
      expect(handled).toBe(true)
      expect(state.head?.["Content-Type"]).toBe("application/json")
      const body = JSON.parse(state.body)
      expect(body.object).toBe("chat.completion")
      expect(body.choices[0].message.content).toBe("hai")
      expect(body.usage.total_tokens).toBe(3)
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it("fast-path codex: upstream 500 → return false, no bytes to client (safe fallback)", async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response("boom", { status: 500 })) as any
    const { res, state } = fakeRes()
    try {
      const handled = await streamDirectCodexCompletion(
        { model: "gpt-5.1-codex", messages: [{ role: "user", content: "hi" }], stream: true },
        res,
        cred,
      )
      expect(handled).toBe(false)
      expect(state.head).toBeUndefined()
      expect(state.body).toBe("")
      expect(state.ended).toBe(false)
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it("fast-path codex: stream client receives SSE + [DONE]", async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () => sseResponse(CODEX_STREAM)) as any
    const { res, state } = fakeRes()
    try {
      const handled = await streamDirectCodexCompletion(
        { model: "gpt-5.1-codex", messages: [{ role: "user", content: "hi" }], stream: true },
        res,
        cred,
      )
      expect(handled).toBe(true)
      expect(state.head?.["Content-Type"]).toBe("text/event-stream")
      expect(state.body).toContain('"call_1"')
      expect(state.body).toContain("[DONE]")
      expect(state.ended).toBe(true)
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it("fast-path codex: non-stream client receives single JSON chat.completion", async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () => sseResponse(CODEX_STREAM)) as any
    const { res, state } = fakeRes()
    try {
      const handled = await streamDirectCodexCompletion(
        { model: "gpt-5.1-codex", messages: [{ role: "user", content: "hi" }], stream: false },
        res,
        cred,
      )
      expect(handled).toBe(true)
      expect(state.head?.["Content-Type"]).toBe("application/json")
      const body = JSON.parse(state.body)
      expect(body.object).toBe("chat.completion")
      expect(body.choices[0].message.content).toBe("hi")
      expect(body.choices[0].message.tool_calls[0].id).toBe("call_1")
      expect(body.choices[0].finish_reason).toBe("tool_calls")
      expect(body.usage.total_tokens).toBe(5)
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it("fast-path codex: 401 → refresh → retry once and succeed", async () => {
    let call = 0
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (url: any) => {
      call++
      if (String(url).includes("auth.openai.com/oauth/token")) {
        return new Response(
          JSON.stringify({ access_token: "fresh-at", refresh_token: "fresh-rt", expires_in: 3600 }),
          { status: 200 },
        )
      }
      return call === 1 ? new Response("unauth", { status: 401 }) : sseResponse(CODEX_STREAM)
    }) as any
    const { res, state } = fakeRes()
    try {
      const handled = await streamDirectCodexCompletion(
        { model: "gpt-5.1-codex", messages: [{ role: "user", content: "hi" }], stream: true },
        res,
        { ...cred, refreshToken: "rt-1" },
      )
      expect(handled).toBe(true)
      expect(call).toBe(3) // 401 → token refresh → retry
      expect(state.body).toContain('"call_1"')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it("fast-path claude: non-stream aggregates into JSON, stream remains SSE", async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () => sseResponse(CLAUDE_STREAM)) as any
    try {
      const json = fakeRes()
      expect(
        await streamDirectAnthropicCompletion(
          { model: "claude-3-7-sonnet", messages: [{ role: "user", content: "hi" }], stream: false },
          json.res,
          claudeCred,
        ),
      ).toBe(true)
      expect(json.state.head?.["Content-Type"]).toBe("application/json")
      const parsed = JSON.parse(json.state.body)
      expect(parsed.object).toBe("chat.completion")
      expect(parsed.choices[0].message.content).toBe("hi")

      const stream = fakeRes()
      expect(
        await streamDirectAnthropicCompletion(
          { model: "claude-3-7-sonnet", messages: [{ role: "user", content: "hi" }], stream: true },
          stream.res,
          claudeCred,
        ),
      ).toBe(true)
      expect(stream.state.head?.["Content-Type"]).toBe("text/event-stream")
      expect(stream.state.body).toContain("[DONE]")
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it("fast-path claude: upstream 401 without refresh token → return false", async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response("nope", { status: 401 })) as any
    const { res, state } = fakeRes()
    try {
      const handled = await streamDirectAnthropicCompletion(
        { model: "claude-3-7-sonnet", messages: [{ role: "user", content: "hi" }], stream: true },
        res,
        claudeCred,
      )
      expect(handled).toBe(false)
      expect(state.body).toBe("")
    } finally {
      globalThis.fetch = realFetch
    }
  })
})
