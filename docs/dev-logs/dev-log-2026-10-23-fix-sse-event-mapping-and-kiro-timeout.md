# Dev Log — Fix SSE Event Mapping and Kiro 90s Timeout

**Date & Time:** 2026-10-23 12:30:00 WIB  
**Author:** Antigravity AI Engine Specialist  

## What
Resolved the false 90-second "Upstream Provider Timeout (Kiro)" issue in workstation chat.

### Root Cause
1. **SSE Schema Shape Mismatch**: In `crates/arunaki-engine/src/sessions.rs`, `emit_event()` enveloped streaming events inside `{ directory, payload: { id, type, properties } }`.
2. In `apps/web/src/lib/engine.ts`, `mapEngineEvent(event)` looked for `event.type` and `event.properties` directly at the root. Because `event.type` was `undefined` at the root, `mapEngineEvent` discarded all SSE events (`session.next.prompt.admitted`, `session.next.text.delta`, `session.next.text.ended`, `session.next.step.ended`).
3. As a result, the web UI never received any delta tokens even though Kiro responded within 2 seconds. The 90-second watchdog timer in `useWorkstationChat.ts` subsequently triggered the timeout error dialog.
4. Cleaned up UTF-8 mojibake (`âš ï¸` and `File â†’ Preferences â†’ Settings`) in `useWorkstationChat.ts`.

## Files Changed
- `crates/arunaki-engine/src/sessions.rs`: Updated `emit_event` to spread `properties` at root and provide top-level `type`, `id`, `properties`, and `data` alongside backwards-compatible `payload: { ... }`.
- `apps/web/src/lib/engine.ts`: Updated `mapEngineEvent` to defensively inspect both `event.type` and `innerPayload?.type`, and extract properties from both levels.
- `apps/web/src/components/workstation/chat/useWorkstationChat.ts`: Fixed mojibake characters in diagnostic warning text.

## Tests
- `cargo build -p arunaki-engine --release` — ✅ passed (binaries deployed to `target/release/arunaki.exe` and `apps/desktop/resources/engine.exe`)
- `npm run test:smoke` — ✅ all 8 provider checks passed (Kiro text: 1745ms, Kiro tool: 1462ms, Kiro chat: 2929ms)
- `npm run build -w apps/web` — ✅ passed (TypeScript compile 0 errors, Vite build in 21.46s)
- Direct SSE Session streaming verification (`/session/:id/prompt` -> `/event`) — ✅ confirmed real-time reception of `session.next.text.delta` ("Halo, apa kabar!") in <2s.

## Notes
Everything is now fully synchronous across Rust engine SSE emission and Web client event absorption.
