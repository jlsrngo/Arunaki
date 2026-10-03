# Dev Log — Google Antigravity CLI (agy) Registration & Bridge Routing

**Date & Time:** 2026-10-03 15:55:00 WIB
**Author:** AI Software Engineer

## What
Google discontinued the Gemini Code Assist individual OAuth flow used by `@google/gemini-cli`
(`IneligibleTierError: ... migrate to the Antigravity suite`). Arunaki now routes Google models
through the official **Antigravity CLI (`agy`)** headless print mode (`agy -p <prompt>`).

## Root cause of "HTTP transport failed"
- `bridge.ts` still spawned `gemini -p` for any `gemini*` model, which fails with `IneligibleTierError`.
- An earlier `agy.cmd` shim pointing to `antigravity-ide.cmd chat` was **wrong**: that only opens the
  IDE chat panel, it is not a headless CLI. The shim was removed.
- The real `agy` is a separate product, installed with
  `irm https://antigravity.google/cli/install.ps1 | iex` (to `%LOCALAPPDATA%\agy\bin\agy.exe`,
  added to User PATH). It needs its own one-time Google sign-in (separate from the IDE).

## Files Changed
- `packages/engine/engine/src/server/local-cli/bridge.ts` — Google models now run `agy -p`; non-zero exit/empty output returns a clear 503 error instead of passing stderr as the reply.
- `packages/engine/engine/src/server/local-cli/detector.ts` — `agy` version detection; legacy Gemini CLI no longer counts as "Ready".
- `packages/engine/engine/src/server/routes/instance/httpapi/groups/provider.ts` / `handlers/provider.ts` — `antigravity` / `agy` targets, provider id `antigravity`.
- `apps/web/src/components/settings/SettingsCliConnectionsTab.tsx`, `apps/web/src/components/workstation/chat/useWorkstationChat.ts` — Antigravity CLI branding and provider resolution.

## Tests
- `agy --version` → 1.2.16; `agy -p "balas satu kata: halo"` → `halo` (exit 0).
- `npm run build -w apps/web` — see Phase 99 in WORKFLOW.md.

## Notes
- After installing `agy`, `npm run dev:app` must be restarted from a terminal whose PATH includes `%LOCALAPPDATA%\agy\bin`.
- Model selection is not forwarded to `agy` yet (uses the model configured in the CLI).
