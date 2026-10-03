# Dev Log — CLI Connection Interactive Model Selection & Custom Models

**Date & Time:** 2026-10-03 11:00:00 WIB  
**Author:** Antigravity AI Engineer

## What
- Replaced static model badges in `Connection CLI` tab with an interactive model selection bar for each CLI and IDE (`Claude Code CLI`, `OpenCode CLI Agent`, `OpenAI Codex`, `Google Antigravity`, `9Router Local Gateway`).
- Supported popular preset model pills (`claude-3-7-sonnet`, `claude-3-5-sonnet`, `deepseek-r1`, `o3-mini`, `gpt-4o`, `gemini-2.5-flash`, etc.) with 1-click switching and visual checkmarks.
- Added `+ Custom Model` input field allowing users to enter and save any custom or local model configured in their CLI/agent.
- Synchronized selected model dynamically to:
  - Local state & `localStorage` (`arunaki_cli_model_<id>`)
  - Global active model routing (`arunaki_active_model`)
  - SQLite backend provider configuration via `PUT /api/providers/:id` with `{ model }`
  - Dynamic `Test Ping` diagnostics using the exact chosen model.
- Fixed TypeScript compile errors (`noUnusedLocals`) and verified production build with 0 errors.

## Files Changed
- `apps/web/src/components/settings/SettingsCliConnectionsTab.tsx` — Added interactive model picker, custom model input, auto-sync to provider, and cleaned unused imports.
- `packages/engine/engine/src/server/local-cli/detector.ts` — Effect schema compatibility & OpenCode daemon launcher.
- `packages/engine/engine/src/server/routes/instance/httpapi/groups/provider.ts` — Updated CLI login schema.
- `packages/engine/engine/src/server/routes/instance/httpapi/handlers/provider.ts` — Added opencode server launch endpoint.

## Tests
- `npm run build -w apps/web` — ✅ Passed (0 TypeScript errors, Vite bundle built cleanly in 29.99s)
- Local Effect Schema validation — ✅ Passed (Bun test detector status returns 200 with clean objects)

## Notes
- Live HMR updates in the web workstation interface. Users can immediately select or type any model per CLI.
