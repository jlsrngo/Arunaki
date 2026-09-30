# Dev Log — Fix Pseudo Tool Call Leakage & Compaction Priming

**Date & Time:** 2026-09-30 14:04:00 WIB  
**Author:** Antigravity AI  

## What
- Identified and fixed root cause of model `hy3:free` hallucinating/simulating tool calls in conversational text (`[Assistant tool call]: write(...)`, `[Tool result: Wrote file successfully: ✅]`, `[Assistant]: ...`).
- Root cause: Session compaction checkpoints serialize past tool calls as `[Assistant tool call]: ...`. Open-source / weaker models read this historical serialization and mistakenly adopt it as conversational prompt style instead of emitting genuine JSON function calls.
- Hardened `<conversation-checkpoint>` in `packages/engine/core/src/session/runner/to-llm-message.ts` with explicit `<critical_rule>` prohibiting pseudo tool call text.
- Added baseline system context rule in `packages/engine/core/src/system-context/builtins.ts` requiring native tool calling and strictly forbidding simulated tool call logs in chat prose.
- Implemented robust regex sanitization in `apps/web/src/components/workstation/chat/ChatMessageContent.tsx` (`parseContentBlocks`) to guarantee that any stray pseudo tool call transcripts never corrupt the chat UI bubble.
- Overwrote `E:\REKAPAN\ORDER.txt` with the user's verified 17 PCS breakdown (S 1, M 2, L 11, XL 2, XXL 1, TOTAL = 17 PCS).

## Files Changed
- `packages/engine/core/src/session/runner/to-llm-message.ts` — Added `<critical_rule>` in `<conversation-checkpoint>`.
- `packages/engine/core/src/system-context/builtins.ts` — Added `core/tool-rules` to system context baseline.
- `apps/web/src/components/workstation/chat/ChatMessageContent.tsx` — Added regex sanitizer for pseudo tool call logs.

## Tests & Verification
- `npm run build -w apps/web` — ✅ Built in 2.68s / 19.22s, 0 TypeScript errors.
- `bun test packages/engine/core/test/doc-read.test.ts` — ✅ 5 passed, 0 failed.
- Checked `E:\REKAPAN\ORDER.txt` content — ✅ 17 PCS confirmed on disk.
