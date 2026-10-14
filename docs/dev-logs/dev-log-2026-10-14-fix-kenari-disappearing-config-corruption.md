# Dev Log — Fix Kenari Disappearing & Atomic Config Corruption

**Date & Time:** 2026-10-14 12:59:30 WIB  
**Author:** AI Software Engineer

## What
Diagnosed and fixed the root cause of why Kenari suddenly disappeared ("tiba-tiba hilang"), failed to toggle ON, and caused the engine/UI to freeze ("macet ini dan berat banget lagi").

### Root Cause
1. **Windows Truncation / Aborted Write Leaving Null Bytes:**
   When toggling Kenari in the Settings UI, `PUT /api/providers/kenari/state?directory=E:/REKAPAN` invoked `Config.update`.
   The in-place non-atomic write via Node/Effect `fs.writeFileString` was subject to fiber interruption by `markInstanceForDisposal`. On Windows NTFS, this caused trailing unwritten sectors to be filled with null bytes (`\u0000\u0000...`) in `E:/REKAPAN/.arunaki/arunaki.json`.
2. **Cascading HTTP 400 & Provider Wipeout:**
   Every subsequent call to `GET /api/providers?directory=E:/REKAPAN` failed with HTTP 400 (`ConfigJsonError: InvalidSymbol at line 4`).
   In `SettingsPage.tsx`, non-200 responses caused the UI to fall back to `setProviders([])`, completely wiping the provider list and showing "No model providers configured yet".
3. **Sluggishness / Hang Loop:**
   Continuous polling and chat synchronization retried loading the corrupted config, throwing unhandled JSON exceptions in a loop and causing heavy CPU load and freezing.
4. **Active State Toggle Desync:**
   In `ModelProviderSettings.tsx`, `handleToggleActive` checked `provider.active || localStorage.getItem("arunaki_active_provider") === provider.id`, causing desync when switching between CLI and cloud providers.

### Solutions Applied
1. **Cleaned corrupted file:** Repaired `E:/REKAPAN/.arunaki/arunaki.json` with valid schema and empty disabled array.
2. **Resilient JSONC parsing (`parse.ts`):** Added null-byte stripping (`text.replace(/\0/g, "")`) before invoking `jsonc-parser`.
3. **Resilient Config Loading (`config.ts`):** Wrapped `loadConfig` in `loadFile` with `.pipe(Effect.tapError(...), Effect.orElseSucceed(() => ({})))` so invalid or corrupted workspace configs log a warning instead of killing `loadInstanceState` or returning HTTP 400.
4. **Atomic & Uninterruptible File Writing (`config.ts`):** Implemented `safeWriteFile` using `Effect.uninterruptible`, writing to a unique `.tmp` file and renaming atomically. Applied to `Config.update`, `Config.updateGlobal`, `Config.deleteProvider`, and `Config.replaceProviderModels`.
5. **Global State Persistence (`provider.ts`):** In `setState`, synchronized active/disabled state to `cfg.updateGlobal` as well as safe local update.
6. **Frontend Resilience (`SettingsPage.tsx` & `ModelProviderSettings.tsx`):**
   - Added automatic fallback to global `/api/providers` and `/api/model` if directory-scoped fetch fails, ensuring provider cards never vanish.
   - Fixed `handleToggleActive` to use `Boolean(provider.active)` directly matching the switch's visual state.

## Files Changed
- `packages/engine/engine/src/config/parse.ts` — Sanitize null bytes before parsing JSONC.
- `packages/engine/engine/src/config/config.ts` — Resilient `loadFile` error handling, null-byte stripping on read, and uninterruptible atomic `safeWriteFile`.
- `packages/engine/engine/src/server/routes/instance/httpapi/handlers/provider.ts` — Dual global and local state update in `setState`.
- `apps/web/src/pages/SettingsPage.tsx` — Fallback to global catalogue when directory query fails.
- `apps/web/src/components/settings/ModelProviderSettings.tsx` — Reliable `handleToggleActive` condition based on `provider.active`.

## Tests
- `npm run build -w apps/web` — ✅ PASSED (0 TypeScript compilation errors, production bundle built cleanly).
- `test_dir_providers.mjs` — ✅ PASSED (HTTP 200 on Global, E:/REKAPAN, e:/JS/Arunika, C:/Users/AMD/.arunaki/scratch).
- `test_toggle_kenari.mjs` — ✅ PASSED (Toggled OFF -> 200, file clean; Toggled ON -> 200, file clean; 0 null bytes; 0 corruption).
- `npm run test:smoke` — ✅ PASSED (All 8 provider checks passed: Kiro text/tool/chat, OpenCode text/tool, Antigravity text/tool, Codex text).

## Notes
The engine and web UI are now completely immunized against file write race conditions, aborted file writes, and null-byte crashes on Windows.
