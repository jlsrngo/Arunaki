# Dev Log — Antigravity & Local CLI Native Tool Bridging

**Date & Time:** 2026-10-05 19:13:00 WIB
**Author:** Antigravity AI Engineer

## What
Fixed Arunaki workspace tools (`read`, `edit`, `write`, etc.) not reaching the underlying LLM when using Antigravity CLI (`agy`) or local CLI bridge.
Previously, the bridge server completely omitted `payload.tools` when creating prompts for `agy`, dropped all `tool` results and assistant `tool_calls` in multi-turn history, and hardcoded `finish_reason: "stop"` without streaming OpenAI-compatible `tool_calls` events. As a result, the LLM hallucinated that files had already been updated in chat without Arunaki ever executing the tools on disk.

Implemented:
1. **Tool Schema Injection**: Extracted `payload.tools` from OpenAI chat requests and appended structured tool schemas and calling specifications (` ```tool_call {"name": "...", "arguments": {...}} ``` `) to the system prompt directive.
2. **Multi-Turn Tool Provenance**: Preserved assistant `tool_calls` and tool execution outputs (`[Tool Result for call_id]: ...`) across chat history turns.
3. **Safe Tool Output Buffering & Parsing**: Filtered raw tool call markdown syntax out of the user-facing text stream (`delta.content`) to prevent raw JSON from leaking into the chat UI.
4. **OpenAI Protocol Parity (`finish_reason: "tool_calls"`)**: Emitted structured `tool_calls` chunks and finish event (`finish_reason: "tool_calls"`) so Arunaki's engine (`openai-chat.ts` and `ToolStream`) automatically executes the tool on the active workspace folder.

## Files Changed
- `packages/engine/engine/src/server/local-cli/bridge.ts` — Added `parseToolCallsFromText`, `stripToolCallsFromText`, delta buffering, tool calls emission, and tool schema injection.

## Tests
- `npm run build -w apps/web` — ✅ Built in 20.71s with 0 errors.
- `node scratch/test-bridge-tools.cjs` — ✅ Successfully returned `tool_calls` delta (`read: LAPORAN-HARIAN.txt`) and `finish_reason: "tool_calls"`.
- `node scratch/test-bridge-tools-turn2.cjs` — ✅ Received read content and produced valid `edit` tool call with updated calculation and `finish_reason: "tool_calls"`.

## Notes
The workspace tools are now fully operational for document editing and file automation via Antigravity CLI.
