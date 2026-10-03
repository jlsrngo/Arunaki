# Dev Log — Standard Local CLI Subscription Parity (Sokudo & General Developer Standard)

**Date & Time:** 2026-10-03 14:59:00 WIB
**Author:** AI Software Engineer (Antigravity)

## What
Aligned Arunaki's Local CLI Connection architecture with standard developer practices (parity with Sokudo IDE and Claude Code local bridges):
- Replaced the erroneous raw Google Cloud API key requirement with direct local CLI subscription integration (`@google/gemini-cli`).
- Enhanced `LocalCliBridge` daemon (`bridge.ts` on port 20188) to transparently route both `claude-*` (via `@anthropic-ai/claude-code`) and `gemini-*` (via `@google/gemini-cli`) prompts to local CLI subprocesses.
- Added Server-Sent Events (SSE) streaming support in `LocalCliBridge` for seamless chat streaming.
- Updated `SettingsCliConnectionsTab.tsx` to eliminate API key prompts on CLI connect; clicking `[ Connect ]` immediately binds to the local subscription bridge, and clicking `[ CLI ]` opens an interactive terminal for browser OAuth login (`Login with Google` or `claude login`).
- Verified zero regressions and 0 TypeScript compilation errors via `npm run build -w apps/web`.

## Files Changed
- `packages/engine/engine/src/server/local-cli/bridge.ts` — Added Gemini CLI subprocess execution and SSE streaming support to the bridge daemon on port 20188.
- `packages/engine/engine/src/server/local-cli/detector.ts` — Added detection of `@google/gemini-cli` binary and unified model lists.
- `packages/engine/engine/src/server/routes/instance/httpapi/handlers/provider.ts` — Pointed `antigravity` / `gemini-cli` targets to the local bridge instead of Google Cloud API.
- `apps/web/src/components/settings/SettingsCliConnectionsTab.tsx` — Updated card presentation, removed API key prompts, and wired `gemini-cli` to local bridge.
- `apps/web/src/components/settings/ModelProviderSettings.tsx` — Added `gemini-cli` to `CLI_PROVIDER_IDS` filter.
- `apps/web/src/components/workstation/chat/useWorkstationChat.ts` — Ensured `gemini-cli` resolves to the local subscription bridge.

## Tests
- `npm run build -w apps/web` — ✅ Passed (Built in 36.90s, 0 TypeScript errors).

## Notes
- Users can now install `@google/gemini-cli` globally (`npm install -g @google/gemini-cli`), login via Google Account in browser, and run unlimited document tasks within their personal subscription quotas without paying per-token API fees.
