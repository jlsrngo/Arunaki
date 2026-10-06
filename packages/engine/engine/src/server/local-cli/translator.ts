import type http from "http"

const sse = (o: any) => `data: ${JSON.stringify(o)}\n\n`

const textOf = (content: any): string => {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content.map((c: any) => (typeof c === "string" ? c : c?.text || "")).join("")
  }
  return content && typeof content.text === "string" ? content.text : ""
}

export function openaiToAnthropic(payload: any): any | null {
  if (!payload || !Array.isArray(payload.messages)) return null

  let systemPrompt = ""
  const anthropicMessages: any[] = []

  for (const m of payload.messages) {
    if (m.role === "system") {
      const text = textOf(m.content)
      if (text) {
        systemPrompt = systemPrompt ? `${systemPrompt}\n\n${text}` : text
      }
    } else if (m.role === "user") {
      const contentParts: any[] = []
      if (Array.isArray(m.content)) {
        for (const part of m.content) {
          if (part.type === "text") {
            contentParts.push({ type: "text", text: part.text || "" })
          } else if (part.type === "image_url") {
            const url = part.image_url?.url || ""
            if (url.startsWith("data:")) {
              const [header, base64] = url.split(",")
              const mediaType = header.replace("data:", "").replace(";base64", "")
              contentParts.push({
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 },
              })
            }
          }
        }
      } else {
        contentParts.push({ type: "text", text: textOf(m.content) })
      }
      anthropicMessages.push({ role: "user", content: contentParts })
    } else if (m.role === "assistant") {
      const contentParts: any[] = []
      const text = textOf(m.content)
      if (text) {
        contentParts.push({ type: "text", text })
      }
      if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        for (const tc of m.tool_calls) {
          let input = {}
          try {
            input = typeof tc.function?.arguments === "string"
              ? JSON.parse(tc.function.arguments)
              : tc.function?.arguments || {}
          } catch {
            input = {}
          }
          contentParts.push({
            type: "tool_use",
            id: tc.id,
            name: tc.function?.name,
            input,
          })
        }
      }
      anthropicMessages.push({ role: "assistant", content: contentParts })
    } else if (m.role === "tool") {
      if (!m.tool_call_id) {
        // Missing tool_call_id will cause Anthropic 400
        return null
      }
      const toolResultBlock: any = {
        type: "tool_result",
        tool_use_id: m.tool_call_id,
        content: textOf(m.content),
      }
      if (m.is_error) {
        toolResultBlock.is_error = true
      }
      // Anthropic requires tool_result blocks to be sent as user role turns
      anthropicMessages.push({
        role: "user",
        content: [toolResultBlock],
      })
    }
  }

  // Anthropic requires: role alternation, all tool_result of one assistant turn inside
  // a single following user message (leading the content), and non-empty content.
  const normalized: any[] = []
  for (const m of anthropicMessages) {
    if (!m.content.length) continue
    const prev = normalized[normalized.length - 1]
    if (prev && prev.role === m.role) {
      prev.content.push(...m.content)
      continue
    }
    normalized.push({ role: m.role, content: m.content })
  }
  for (const m of normalized) {
    if (m.role !== "user" || m.content[0].type === "tool_result") continue
    const tools = m.content.filter((c: any) => c.type === "tool_result")
    if (tools.length) {
      m.content = [...tools, ...m.content.filter((c: any) => c.type !== "tool_result")]
    }
  }
  if (!normalized.length) return null

  const out: any = {
    model: payload.model || "claude-3-5-sonnet-latest",
    messages: normalized,
    max_tokens: payload.max_tokens ?? payload.max_completion_tokens ?? 4096,
    // Always stream upstream; non-stream clients get an aggregated JSON body.
    stream: true,
  }

  if (systemPrompt) {
    out.system = systemPrompt
  }
  if (payload.temperature != null) {
    out.temperature = payload.temperature
  }
  if (payload.top_p != null) {
    out.top_p = payload.top_p
  }
  if (payload.stop) {
    out.stop_sequences = Array.isArray(payload.stop) ? payload.stop : [payload.stop]
  }

  if (Array.isArray(payload.tools) && payload.tools.length > 0) {
    out.tools = payload.tools.map((t: any) => {
      const fn = t.function || t
      return {
        name: fn.name,
        description: fn.description || "",
        input_schema: fn.parameters || { type: "object", properties: {} },
      }
    })
  }

  if (payload.tool_choice) {
    if (payload.tool_choice === "auto") {
      out.tool_choice = { type: "auto" }
    } else if (payload.tool_choice === "any" || payload.tool_choice === "required") {
      out.tool_choice = { type: "any" }
    } else if (typeof payload.tool_choice === "object" && payload.tool_choice.function?.name) {
      out.tool_choice = { type: "tool", name: payload.tool_choice.function.name }
    }
  }

  return out
}

export async function anthropicSseToOpenAI(
  events: any[],
  ctx: { id: string; created: number; model: string },
): Promise<string[]> {
  const out: string[] = []
  let promptTokens = 0
  let completionTokens = 0

  for (const ev of events) {
    if (ev.type === "message_start") {
      if (ev.message?.usage?.input_tokens) {
        promptTokens = ev.message.usage.input_tokens
      }
    } else if (ev.type === "content_block_start") {
      if (ev.content_block?.type === "tool_use") {
        out.push(
          sse({
            id: ctx.id,
            object: "chat.completion.chunk",
            created: ctx.created,
            model: ctx.model,
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: ev.index,
                      id: ev.content_block.id,
                      type: "function",
                      function: {
                        name: ev.content_block.name,
                        arguments: "",
                      },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          }),
        )
      }
    } else if (ev.type === "content_block_delta") {
      if (ev.delta?.type === "text_delta") {
        out.push(
          sse({
            id: ctx.id,
            object: "chat.completion.chunk",
            created: ctx.created,
            model: ctx.model,
            choices: [
              {
                index: 0,
                delta: { content: ev.delta.text },
                finish_reason: null,
              },
            ],
          }),
        )
      } else if (ev.delta?.type === "input_json_delta") {
        out.push(
          sse({
            id: ctx.id,
            object: "chat.completion.chunk",
            created: ctx.created,
            model: ctx.model,
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: ev.index,
                      function: { arguments: ev.delta.partial_json },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          }),
        )
      }
    } else if (ev.type === "message_delta") {
      if (ev.usage?.output_tokens) {
        completionTokens = ev.usage.output_tokens
      }
      const finishReason =
        ev.delta?.stop_reason === "tool_use"
          ? "tool_calls"
          : ev.delta?.stop_reason === "max_tokens"
          ? "length"
          : "stop"

      out.push(
        sse({
          id: ctx.id,
          object: "chat.completion.chunk",
          created: ctx.created,
          model: ctx.model,
          choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
          },
        }),
      )
    } else if (ev.type === "message_stop") {
      out.push("data: [DONE]\n\n")
    }
  }

  return out
}

export async function streamAnthropicToOpenAI(
  upstreamRes: Response,
  clientRes: http.ServerResponse,
  payload: any,
): Promise<boolean> {
  if (!upstreamRes.body) return false

  if (!clientRes.headersSent) {
    clientRes.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    })
  }

  const ctx = {
    id: `chatcmpl-claude-${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    model: payload.model || "claude-3-5-sonnet",
  }

  const reader = upstreamRes.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let promptTokens = 0
  let completionTokens = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        const raw = line.slice(6).trim()
        if (!raw || raw === "[DONE]") continue

        try {
          const ev = JSON.parse(raw)
          if (ev.type === "message_start") {
            if (ev.message?.usage?.input_tokens) {
              promptTokens = ev.message.usage.input_tokens
            }
          } else if (ev.type === "content_block_start" && ev.content_block?.type === "tool_use") {
            clientRes.write(
              sse({
                id: ctx.id,
                object: "chat.completion.chunk",
                created: ctx.created,
                model: ctx.model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index: ev.index,
                          id: ev.content_block.id,
                          type: "function",
                          function: { name: ev.content_block.name, arguments: "" },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              }),
            )
          } else if (ev.type === "content_block_delta") {
            if (ev.delta?.type === "text_delta") {
              clientRes.write(
                sse({
                  id: ctx.id,
                  object: "chat.completion.chunk",
                  created: ctx.created,
                  model: ctx.model,
                  choices: [{ index: 0, delta: { content: ev.delta.text }, finish_reason: null }],
                }),
              )
            } else if (ev.delta?.type === "input_json_delta") {
              clientRes.write(
                sse({
                  id: ctx.id,
                  object: "chat.completion.chunk",
                  created: ctx.created,
                  model: ctx.model,
                  choices: [
                    {
                      index: 0,
                      delta: {
                        tool_calls: [
                          { index: ev.index, function: { arguments: ev.delta.partial_json } },
                        ],
                      },
                      finish_reason: null,
                    },
                  ],
                }),
              )
            }
          } else if (ev.type === "message_delta") {
            if (ev.usage?.output_tokens) {
              completionTokens = ev.usage.output_tokens
            }
            const finishReason =
              ev.delta?.stop_reason === "tool_use"
                ? "tool_calls"
                : ev.delta?.stop_reason === "max_tokens"
                ? "length"
                : "stop"

            clientRes.write(
              sse({
                id: ctx.id,
                object: "chat.completion.chunk",
                created: ctx.created,
                model: ctx.model,
                choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
                usage: {
                  prompt_tokens: promptTokens,
                  completion_tokens: completionTokens,
                  total_tokens: promptTokens + completionTokens,
                },
              }),
            )
          } else if (ev.type === "message_stop") {
            clientRes.write("data: [DONE]\n\n")
          }
        } catch {}
      }
    }
  } catch (err: any) {
    if (clientRes.headersSent) {
      clientRes.write(
        `data: ${JSON.stringify({ error: { message: err?.message } })}\n\ndata: [DONE]\n\n`,
      )
    }
  } finally {
    clientRes.end()
  }

  return true
}
