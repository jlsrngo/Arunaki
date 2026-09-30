# Dev Log — Fix Hunyuan XML Tool Call Leakage

**Date & Time:** 2026-09-30 16:19:00 WIB  
**Author:** Antigravity AI  

## What
- Identified and fixed root cause of raw XML tags (`<arg_key:6124c78e>`, `<arg_value:6124c78e>`, `</tool_call:6124c78e>`, `</tool_calls:6124c78e>`) leaking into chat bubbles.
- Root cause: Model `hy3:free` (Tencent Hunyuan 3) natively generates tool calls in XML format (`<tool_call:id>tool<tool_sep:id><arg_key:id>key</arg_key:id>...`). When the provider endpoint emits or streams these tokens into `content` instead of parsing them into native `tool_calls` JSON, the XML tags leaked into the assistant text stream.
- Added XML tool call tag sanitization in `packages/engine/core/src/session/runner/publish-llm-event.ts` (`cleanAssistantText`) so `SessionEvent.Text.Ended` never saves raw tool call XML syntax to the database.
- Added regex tag stripping in `apps/web/src/components/workstation/chat/ChatMessageContent.tsx` (`parseContentBlocks`) so neither streaming deltas nor persisted messages ever display `<arg_key:.*>`, `<arg_value:.*>`, `<tool_call:.*>`, or `<tool_sep:.*>` tags in the chat bubble.
- Cleaned the affected message rows (SEQ 143 and SEQ 153) in `session_message` database.
- Updated `E:\REKAPAN\LAPORAN-HARIAN.txt` directly to ensure the pengeluaran `BUS = 30RB` and `GALON = 6RB` are correctly saved under `PENGELUARAN :`.

## Files Changed
- `apps/web/src/components/workstation/chat/ChatMessageContent.tsx` — Added XML tool call tag cleaner in `parseContentBlocks`.
- `packages/engine/core/src/session/runner/publish-llm-event.ts` — Added `cleanAssistantText` before publishing `SessionEvent.Text.Ended`.

## Tests & Verification
- `npm run build -w apps/web` — ✅ Built in 2.68s / 11.08s, 0 TypeScript errors.
- `bun test packages/engine/core/test/doc-read.test.ts` — ✅ 5 passed, 0 failed.
- Inspected `E:\REKAPAN\LAPORAN-HARIAN.txt` — verified `BUS = 30RB` & `GALON = 6RB` present.
