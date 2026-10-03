# Dev Log — Google Antigravity CLI (agy) Registration & Bridge Routing

**Date & Time:** 2026-10-03 17:15:00 WIB
**Author:** AI Software Engineer

## What
Google discontinued the Gemini Code Assist individual OAuth flow used by `@google/gemini-cli`
(`IneligibleTierError: ... migrate to the Antigravity suite`). Arunaki now routes Google models
through the official **Antigravity CLI (`agy`)** headless print mode (`agy -p <prompt>`).

## Root cause of "HTTP transport failed" & "ERR_HTTP_HEADERS_SENT"
- When `crossSpawn` encountered an error finding the executable, Node fired both the `error` event
  and the `close` event. Previously, both handlers called `res.writeHead(503, ...)`, triggering an
  unhandled `ERR_HTTP_HEADERS_SENT` exception that killed the engine server process and broke the
  HTTP transport in the frontend chat.
- Added `responded` boolean flag and `res.headersSent` check in `bridge.ts` to ensure only a single
  HTTP response is ever emitted per request.
- Implemented `resolveAgyCommand()` in `detector.ts` and `bridge.ts` to resolve `%LOCALAPPDATA%\agy\bin\agy.exe`
  directly by absolute path, ensuring the engine finds `agy` even if the parent terminal shell's
  PATH had not yet refreshed after installation.
- Updated `scripts/dev-app.cjs` to free port 20188 on startup and automatically inject `agy\bin` into `process.env.PATH`.

## Files Changed
- `packages/engine/engine/src/server/local-cli/bridge.ts` — Handled double-response race condition (`ERR_HTTP_HEADERS_SENT`), use `resolveAgyCommand()`, and route Google models to `agy -p`.
- `packages/engine/engine/src/server/local-cli/detector.ts` — Added `resolveAgyCommand()` fallback and `agy` version detection.
- `packages/engine/engine/src/server/routes/instance/httpapi/groups/provider.ts` / `handlers/provider.ts` — Registered `antigravity` / `agy` targets.
- `apps/web/src/components/settings/SettingsCliConnectionsTab.tsx`, `apps/web/src/components/workstation/chat/useWorkstationChat.ts` — UI branding and provider resolution.
- `scripts/dev-app.cjs` — Added port 20188 cleanup and PATH injection for `agy`.

## Tests
- `agy --version` → 1.2.16; `agy -p "balas satu kata: halo"` → `halo` (exit 0).
- `npm run build -w apps/web` → Passed (0 TypeScript errors).
