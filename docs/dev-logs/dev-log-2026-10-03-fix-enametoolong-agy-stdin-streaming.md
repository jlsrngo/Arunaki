# Dev Log — Fix ENAMETOOLONG CLI Spawn Limit via Stream-JSON Stdin

**Date & Time:** 2026-10-03 18:20:00 WIB
**Author:** AI Software Engineer

## What
Resolved the `⚠️ Provider request failed with HTTP 400: {"error":{"message":"ENAMETOOLONG: name too long, uv_spawn"}}` error when dispatching chat messages through the Google Antigravity CLI (`agy`) bridge.

## Root Cause
On Windows, `uv_spawn` (Node.js `child_process.spawn`) relies on the Win32 `CreateProcessW` API, which enforces a strict maximum command-line argument length of **32,767 characters**.
In Arunaki, when an AI session starts, the engine injects extensive system context (guidelines, tool definitions for documents/spreadsheets/terminal, workspace boundaries, and conversation history). When `packages/engine/engine/src/server/local-cli/bridge.ts` passed `["-p", fullPrompt]` on the command line, `fullPrompt` routinely exceeded 35,000 to 70,000 characters, causing `uv_spawn` to immediately abort with `ENAMETOOLONG`.

## Solution Applied
1. **Piped Input via Stdin**:
   - Replaced CLI argument prompt passing (`-p <fullPrompt>`) with native streaming JSON flags:
     `agy --input-format stream-json --output-format stream-json --dangerously-skip-permissions`
   - Streamed the conversation payload directly to `child.stdin`:
     ```json
     {
       "event": "user",
       "message": {
         "content": fullPrompt
       }
     }
     ```
   - This completely bypasses the Windows 32KB command-line length limitation, allowing arbitrarily large contexts (tested up to 66,000+ characters with 0 issues).

2. **Real-time NDJSON Stream Parsing**:
   - Parsed streaming `step_update` events from `agy` to extract `text_delta` chunks for real-time SSE streaming.
   - Handled `result` events to capture full completion response strings and detailed token usage (`input_tokens`, `output_tokens`).

3. **Multimodal & Block Content Extraction**:
   - Added content extraction helper handling string, array-of-parts, and structured tool messages.

## Files Changed
- `packages/engine/engine/src/server/local-cli/bridge.ts`
- `WORKFLOW.md`

## Tests & Verification
- **Load Test with 45,000 & 66,000 characters**:
  - `POST http://127.0.0.1:20188/v1/chat/completions`: ✅ Returned HTTP 200 with model `"gemini-3.8-flash"`, valid token metrics, and expected response.
- **End-to-End Engine Session**:
  - Created session `ses_efe835cd9ffeFBvSSF58u8zDLz` with `providerID: "antigravity"`, `id: "gemini-3.8-flash"`.
  - Dispatched prompt via `POST /api/session/:id/prompt`.
  - Assistant turn completed cleanly with `finish: "stop"` and returned `"Antigravity Sukses Terhubung."`.
- **TypeScript Web Build**:
  - `npm run build -w apps/web`: ✅ Passed in 33.56s (0 errors).
