import { describe, it, expect } from "bun:test"
import { openaiToAnthropic, anthropicSseToOpenAI } from "../src/server/local-cli/translator"

describe("OpenAI ⇄ Anthropic translator", () => {
  it("preserves tools + tool_choice", () => {
    const body = openaiToAnthropic({
      model: "claude-sonnet-4-5",
      messages: [{ role: "user", content: "calculate" }],
      tools: [
        {
          type: "function",
          function: {
            name: "calc",
            description: "d",
            parameters: {
              type: "object",
              properties: { x: { type: "number" } },
              required: ["x"],
            },
          },
        },
      ],
      tool_choice: "auto",
      temperature: 0.2,
      max_tokens: 1024,
    })
    expect(body).not.toBeNull()
    expect(body.tools).toHaveLength(1)
    expect(body.tools[0].name).toBe("calc")
    expect(body.tool_choice).toEqual({ type: "auto" })
    expect(body.temperature).toBe(0.2)
    expect(body.max_tokens).toBe(1024)
  })

  it("assistant.tool_calls → content tool_use; role tool → tool_result + tool_use_id", () => {
    const body = openaiToAnthropic({
      model: "m",
      messages: [
        { role: "user", content: "area" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "calc", arguments: "{\"x\":2}" },
            },
          ],
        },
        { role: "tool", tool_call_id: "call_1", content: "4" },
      ],
      tools: [
        {
          type: "function",
          function: { name: "calc", parameters: { type: "object", properties: {} } },
        },
      ],
    })
    expect(body).not.toBeNull()
    expect(body.messages[1].content[0]).toMatchObject({
      type: "tool_use",
      id: "call_1",
      name: "calc",
    })
    expect(body.messages[2].role).toBe("user")
    expect(body.messages[2].content[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "call_1",
      content: "4",
    })
  })

  it("parallel tool results are merged into ONE user message with tool_result in front", () => {
    const body = openaiToAnthropic({
      model: "m",
      messages: [
        { role: "user", content: "two files" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            { id: "call_1", type: "function", function: { name: "a", arguments: "{}" } },
            { id: "call_2", type: "function", function: { name: "b", arguments: "{}" } },
          ],
        },
        { role: "tool", tool_call_id: "call_1", content: "one" },
        { role: "tool", tool_call_id: "call_2", content: "two" },
        { role: "user", content: "continue" },
      ],
    })
    expect(body).not.toBeNull()
    expect(body.messages.map((m: any) => m.role)).toEqual(["user", "assistant", "user"])
    const last = body.messages[2]
    expect(last.content.filter((c: any) => c.type === "tool_result")).toHaveLength(2)
    expect(last.content[0].type).toBe("tool_result")
    expect(last.content[0].tool_use_id).toBe("call_1")
    expect(last.content[1].tool_use_id).toBe("call_2")
    expect(last.content[2]).toEqual({ type: "text", text: "continue" })
  })

  it("messages without valid content are discarded, avoiding empty content: []", () => {
    const body = openaiToAnthropic({
      model: "m",
      messages: [
        { role: "user", content: [{ type: "unknown_part" }] },
        { role: "assistant", content: "" },
        { role: "user", content: "ok" },
      ],
    })
    expect(body).not.toBeNull()
    for (const m of body.messages) {
      expect(m.content.length).toBeGreaterThan(0)
    }
  })

  it("stream Anthropic → OpenAI: tool_use delta + finish_reason + usage", async () => {
    const events = [
      { type: "message_start", message: { id: "msg_1", usage: { input_tokens: 10 } } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hello" } },
      {
        type: "content_block_start",
        index: 1,
        content_block: { type: "tool_use", id: "call_9", name: "calc", input: {} },
      },
      {
        type: "content_block_delta",
        index: 1,
        delta: { type: "input_json_delta", partial_json: "{\"x\":1}" },
      },
      { type: "content_block_stop", index: 0 },
      { type: "content_block_stop", index: 1 },
      { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 7 } },
      { type: "message_stop" },
    ]
    const out = await anthropicSseToOpenAI(events, { id: "chatcmpl-1", created: 1, model: "m" })
    const chunks = out.filter((s) => s.startsWith("data: ") && !s.includes("[DONE]")).map((s) => JSON.parse(s.slice(6)))
    const text = chunks.map((c) => c.choices?.[0]?.delta?.content ?? "").join("")
    expect(text).toBe("hello")
    const toolHead = chunks.find((c) => c.choices?.[0]?.delta?.tool_calls?.[0]?.id === "call_9")
    expect(toolHead.choices[0].delta.tool_calls[0].function.name).toBe("calc")
    const last = out[out.length - 1]
    expect(last).toBe("data: [DONE]\n\n")
    const finishChunk = chunks.find((c) => c.choices?.[0]?.finish_reason === "tool_calls")
    expect(finishChunk).toBeDefined()
    expect(["tool_calls", "stop"]).toContain(finishChunk.choices[0].finish_reason)
    expect(finishChunk.usage.prompt_tokens).toBe(10)
    expect(finishChunk.usage.completion_tokens).toBe(7)
  })
})
