# Dev Log — Fix Antigravity CLI Routing, Strict Provider Isolation, and Prompt Loop Crash

**Date & Time:** 2026-10-05 15:35:00 WIB  
**Author:** Antigravity AI Engineer

## What
Investigated and resolved issue where user turns routed to Kenari (`hy3:free`), burning tokens, despite Kenari being turned OFF in UI settings and Google Antigravity CLI being connected.

### Root Causes Identified
1. **Frontend Model Desync**: When user toggled OFF a cloud provider in `ModelProviderSettings.tsx`, `arunaki_active_provider` was set to `antigravity`, but `arunaki_active_model` remained holding the previous model (`agnes-3-0-flash:free`).
2. **Missing Provider Model Validation**: `useWorkstationChat.ts`'s `resolveActiveSingleModel()` paired `providerID: "antigravity"` with invalid model IDs like `agnes-3-0-flash:free` without validating model compatibility for the active provider.
3. **Cross-Provider Fallback Leak**: In `packages/engine/core/src/session/runner/model.ts`, when `antigravity` did not match `agnes-3-0-flash:free`, the global fallback selected the first matching `:free` model available across all providers, which was Kenari's `hy3:free`.
4. **Engine Prompt Loop Runtime Crash**: `packages/engine/engine/src/session/prompt.ts` referenced `isCasualGreetingOrChat` and `isCasual`, which were previously removed in commit `1b8d9a88`, causing a runtime `ReferenceError` on prompt execution.

### Key Changes
1. **`apps/web/src/components/settings/ModelProviderSettings.tsx`**:
   - When switching to a CLI provider upon disabling a cloud provider, reset `arunaki_active_model` to the appropriate CLI default model (`gemini-3.8-flash` for Antigravity).
2. **`apps/web/src/components/workstation/chat/useWorkstationChat.ts`**:
   - Added `isModelValidForProvider` check to strictly ensure CLI providers (like Antigravity) use native model names (`gemini-3.8-flash`) rather than leaking cloud/free models from Kenari.
   - Automatically heals `localStorage` with fallback model when mismatch occurs.
3. **`packages/engine/core/src/session/runner/model.ts`**:
   - Integrated `Config` to filter out `disabled_providers`.
   - Enforced strict provider isolation: when `session.model.providerID` is specified, fallback is strictly confined to models within that specific provider and will **never** leak across to another provider.
   - Identified CLI providers as zero-token cost, preventing unnecessary free-tier filtering rejections.
4. **`packages/engine/engine/src/session/prompt.ts`**:
   - Removed dangling `isCasualGreetingOrChat` and `isCasual` references so `SessionTools.resolve` and prompt execution run smoothly without throwing `ReferenceError`.

## Files Changed
- `apps/web/src/components/settings/ModelProviderSettings.tsx`
- `apps/web/src/components/workstation/chat/useWorkstationChat.ts`
- `packages/engine/core/src/session/runner/model.ts`
- `packages/engine/engine/src/session/prompt.ts`
- `docs/dev-logs/dev-log-2026-10-05-fix-antigravity-routing-and-prompt-loop.md`

## Tests
- `npm run build -w apps/web`: ✅ Passed (0 TypeScript errors)
- `bun test packages/engine/core/test/session-runner-model.test.ts`: ✅ Passed (13/13 tests)
- `E2E Antigravity message execution`: ✅ Passed (Status 200, streamed response from Google Antigravity via local port 20188 with zero token cost)
- `E2E Antigravity tool calling execution`: ✅ Passed (Status 200, successfully executed and read file using Antigravity)
