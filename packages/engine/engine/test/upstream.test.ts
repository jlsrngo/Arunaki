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

  it("opencode zen: URL, header, dan fingerprint mengikuti 9Router", () => {
    expect(opencodeUrlFor()).toBe("https://opencode.ai/zen/v1/chat/completions")

    const payload = { messages: [{ role: "user", content: "halo" }] }
    const h = buildOpenCodeHeaders(payload)
    expect(h["User-Agent"]).toBe("opencode/1.18.31")
    expect(h["x-opencode-client"]).toBe("desktop")
    expect(h["x-opencode-project"]).toBe("global")
    expect(h.Authorization).toBe("Bearer public")
    expect(h["x-opencode-session"]).toMatch(/^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/)
    expect(h["x-opencode-request"]).toMatch(/^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/)

    // Session stabil per percakapan (9Router: quota dihitung per session)
    expect(buildOpenCodeHeaders(payload)["x-opencode-session"]).toBe(
      h["x-opencode-session"],
    )

    // Token akun menggantikan lane pooled
    expect(buildOpenCodeHeaders(payload, "acct-token").Authorization).toBe(
      "Bearer acct-token",
    )

    const body: any = { model: "big-pickle", messages: [] }
    applyOpenCodeFingerprint(body)
    const names = body.tools.map((t: any) => t.function.name)
    expect(names).toEqual(["bash", "glob", "grep", "read"])
    expect(body.tool_choice).toBe("none")

    // Tool klien tetap dipertahankan, tidak diduplikasi
    const withTools: any = {
      tools: [{ type: "function", function: { name: "Bash" } }, { type: "function", function: { name: "read" } }],
    }
    applyOpenCodeFingerprint(withTools)
    const got = withTools.tools.map((t: any) => t.function.name.toLowerCase())
    expect(got.filter((n: string) => n === "read")).toHaveLength(1)
    expect(got).toContain("glob")
  })

  it("fast-path opencode: 403 → return false tanpa menulis ke klien", async () => {
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

  it("fast-path opencode: stream SSE diteruskan apa adanya", async () => {
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
      // stream dipaksa true, fingerprint tools ditambahkan
      expect(seen[0].body.stream).toBe(true)
      expect(seen[0].body.model).toBe("big-pickle")
      expect(seen[0].body.tools.map((t: any) => t.function.name)).toContain("bash")
      expect(state.body).toContain("hai")
      expect(state.body).toContain("[DONE]")
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it("fast-path opencode: non-stream diagregasi jadi chat.completion", async () => {
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
