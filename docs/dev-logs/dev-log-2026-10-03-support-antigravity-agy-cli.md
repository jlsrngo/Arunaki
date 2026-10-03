# Dev Log — Support Antigravity CLI (agy) & Terminal Launcher

**Date & Time:** 2026-10-03 14:34:00 WIB  
**Author:** Antigravity AI Engineer  

## What
- Added first-class support for **Antigravity CLI (`agy`)** in Arunaki:
  1. `packages/engine/engine/src/server/local-cli/detector.ts`:
     - Added `cliInstalled` check for `agy` CLI binary (`agy --version`).
  2. `packages/engine/engine/src/server/routes/instance/httpapi/groups/provider.ts` & `handlers/provider.ts`:
     - Updated `AntigravityStatusItem` schema with `cliInstalled`.
     - Added terminal launcher handler for `target === "antigravity"` running `agy` command (`Google Antigravity CLI (agy)`).
  3. `apps/web/src/components/settings/SettingsCliConnectionsTab.tsx`:
     - Added **`[ CLI ]`** button to the Google Antigravity card row, matching Claude Code CLI and OpenCode CLI.
     - Clicking `[ CLI ]` now launches `agy` in a new interactive terminal window.

## Files Changed
- `packages/engine/engine/src/server/local-cli/detector.ts`
- `packages/engine/engine/src/server/routes/instance/httpapi/groups/provider.ts`
- `packages/engine/engine/src/server/routes/instance/httpapi/handlers/provider.ts`
- `apps/web/src/components/settings/SettingsCliConnectionsTab.tsx`

## Tests
- `npm run build -w apps/web` — ✅ Built in 37.92s with 0 TypeScript compilation errors.
