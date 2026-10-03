# Dev Log — Fix HTTP Transport Failed & Antigravity Model Resolution Pipeline

**Date & Time:** 2026-10-03 17:55:00 WIB
**Author:** AI Software Engineer

## What
Diagnosed and resolved the persistent `⚠️ HTTP transport failed` error when chatting in Arunaki workstation.

### Root Cause
1. **Catalog Model Filter**: In `packages/engine/core/src/catalog.ts` and `session/runner/model.ts`, the model resolver filtered out any provider without a cloud API key (`m.request.body.apiKey`). It only had hardcoded exceptions for `kenari`, `ollama`, and `lmstudio`.
2. **Silent Fallback to Offline Engine**: Because `antigravity` had no cloud API key, the catalog marked all its models as unavailable. The engine fell back to the first available model in `models.opencode.ai` feed, which was `opencode/fledge-alpha-free` pointing to offline port `20128`. This triggered an `ECONNREFUSED` error logged as `LLM.Error: RequestExecutor.execute: HTTP transport failed`.
3. **Effect Schema Bug in LocalCliConnectInput**: `Schema.Literal("claude", "9router", "antigravity", ...)` only took the first argument, causing all connect calls for `antigravity` to be rejected with `Expected { readonly "target": "claude", ... }`.
4. **Missing Configuration**: `arunaki.json` and `~/.config/arunaki/arunaki.json` did not define the `antigravity` provider block with port 20188.

### Solutions Applied
1. **Catalog & Model Whitelist**:
   - `packages/engine/core/src/catalog.ts`: Added `antigravity` and `gemini-cli` to `available()` provider check.
   - `packages/engine/core/src/session/runner/model.ts`: Added default `Auth.value("antigravity-local-session")` and included `antigravity` in `withKey` candidates.
2. **Effect Schema Fix**:
   - `packages/engine/engine/src/server/routes/instance/httpapi/groups/provider.ts`: Changed `Schema.Literal(...)` to `Schema.Literals([...])` so all CLI targets are accepted.
3. **Connection Timeout Tuning**:
   - `packages/engine/engine/src/server/routes/instance/httpapi/handlers/provider.ts`: Increased `testConnection` timeout from 8s to 25s for local CLI cold-starts and set default model to `gemini-3.8-flash`.
4. **Provider Registration**:
   - Registered `antigravity` provider in `arunaki.json`, `~/.config/arunaki/arunaki.json`, `E:\REKAPAN\arunaki.json`, and via `POST /api/providers`.
5. **Frontend Fallback**:
   - `apps/web/src/components/workstation/chat/useWorkstationChat.ts`: Ensured `resolveActiveSingleModel()` defaults to `gemini-3.8-flash` when `p === "antigravity"`.

## Files Changed
- `apps/web/src/components/workstation/chat/useWorkstationChat.ts`
- `packages/engine/core/src/catalog.ts`
- `packages/engine/core/src/session/runner/model.ts`
- `packages/engine/engine/src/server/routes/instance/httpapi/groups/provider.ts`
- `packages/engine/engine/src/server/routes/instance/httpapi/handlers/provider.ts`
- `arunaki.json`
- `WORKFLOW.md`

## Tests
- Direct bridge execution (`POST http://127.0.0.1:20188/v1/chat/completions`): ✅ Passed (returns valid Gemini completions).
- Provider registration (`POST http://127.0.0.1:4096/api/providers`): ✅ Passed.
- TypeScript build (`npm run build -w apps/web`): ✅ Passed in 40.84s (0 errors).
