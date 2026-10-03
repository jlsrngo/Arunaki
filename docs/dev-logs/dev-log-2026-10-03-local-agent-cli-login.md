# Dev Log — Local Code Agent & Subscription CLI Bridge (Claude Code & 9Router)

**Date & Time:** 2026-10-03 09:47:00 WIB  
**Author:** AI Software Engineer (Pair Programming)

## What
Implemented zero-API-key local code agent and subscription CLI bridge in Arunaki. Users can now harness their flat subscriptions (such as Claude Pro via Claude Code CLI and 9Router local gateway) without entering API keys or paying per-token API fees.

Key features added:
1. **Local CLI Detector (`packages/engine/engine/src/server/local-cli/detector.ts`)**:
   - Detects presence and version of Claude Code CLI (`claude --version`).
   - Parses real-time login and subscription status via `claude auth status`.
   - Checks local 9Router gateway at `http://localhost:20128`.
   - Supports launching browser/terminal login flow (`claude auth login --claudeai`) with 1-click.
2. **Local CLI OpenAI-Compatible Bridge (`packages/engine/engine/src/server/local-cli/bridge.ts`)**:
   - Spawns in-process local HTTP bridge on `127.0.0.1:20188`.
   - Exposes standard `/v1/models` and `/v1/chat/completions`.
   - Routes requests through `claude -p` headless execution while enforcing workspace isolation.
3. **Engine HttpApi Endpoints (`packages/engine/engine/src/server/routes/instance/httpapi/`)**:
   - `GET /api/providers/local-cli/status`: returns live status for Claude Code and 9Router.
   - `POST /api/providers/local-cli/login`: launches interactive terminal login window.
   - `POST /api/providers/local-cli/connect`: auto-configures and selects Claude Code or 9Router as active provider.
4. **Settings UI (`apps/web/src/components/settings/`)**:
   - Created `LocalCliSection.tsx` with Antigravity-grade dark tech aesthetic.
   - Live status badges (`Claude Pro Ready`, `Login Required`, `Not Detected`).
   - One-click "Launch Terminal Login" and copyable CLI command snippets.
   - One-click "Use Claude Pro as Active Agent".

## Files Changed
- `packages/engine/engine/src/server/local-cli/detector.ts` — binary detection, auth parsing, and login launcher.
- `packages/engine/engine/src/server/local-cli/bridge.ts` — local OpenAI-compatible bridge daemon on port 20188.
- `packages/engine/engine/src/server/server.ts` — lifecycle integration for localCliBridge start/stop.
- `packages/engine/engine/src/server/routes/instance/httpapi/groups/provider.ts` — added Local CLI schemas and endpoints.
- `packages/engine/engine/src/server/routes/instance/httpapi/handlers/provider.ts` — implemented local CLI handlers.
- `apps/web/src/components/settings/constants.ts` — added `claude-code` provider type and models.
- `apps/web/src/components/settings/LocalCliSection.tsx` — new dedicated settings section component.
- `apps/web/src/components/settings/ModelProviderSettings.tsx` — integrated `LocalCliSection`.
- `docs/superpowers/plans/2026-10-03-local-agent-cli-bridge.md` — implementation plan.

## Tests
- `npm run build -w apps/web`: ✅ Passed in 36.99s (0 TypeScript errors).
- Local detector check: ✅ Verified `claude` (v2.1.202) detection and auth status parsing.
