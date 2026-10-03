# Dev Log — Unify CLI Cards & Demarcate Desktop Applications

**Date & Time:** 2026-10-03 11:49:00 WIB  
**Author:** Antigravity AI Engineer

## What
1. **Unify Terminal Coding Agents (Claude, OpenCode, Codex, 9Router)**:
   - Harmonized all 4 terminal agent cards with 100% consistent layout, typography, and badges.
   - Symmetrical header badges: `<Terminal />` icon, standardized technical slugs (`anthropic-cli`, `opencode-cli`, `openai-codex`, `9router-cli`), version pills (`vX.Y.Z`), and uniform green ready badges (`● Ready`).
   - Symmetrical action buttons: every single terminal agent has `[Test Ping]` and `[>_ Open Terminal]`. Replaced Claude's divergent `[Login CLI]` button with `[>_ Open Terminal]` which opens native interactive terminal sessions directly.
   - Standardized `npm i -g <pkg>` install snippet boxes with copy button whenever an agent binary is not installed locally.
   - Symmetrical bottom model selector footer with CLI terminal command copy snippet (`claude`, `opencode`, `codex`, `9router start`) and active model tag.

2. **Dedicated Section for Desktop Applications & IDE Workspaces**:
   - Distinctly grouped **Google Antigravity IDE (Gemini Ecosystem)** under its own dedicated section header: "Desktop Applications & IDE Workspaces".
   - Demarcated with `desktop-application` and `[Desktop App]` badge to clearly indicate that it operates as a native desktop IDE application rather than an ad-hoc terminal command.

## Files Changed
- `apps/web/src/components/settings/SettingsCliConnectionsTab.tsx`:
  - Added Section 1 header: "Terminal Coding Agents & Local Gateways".
  - Unified Claude, OpenCode, Codex, and 9Router buttons to `[Test Ping]` and `[>_ Open Terminal]`.
  - Added Section 2 header: "Desktop Applications & IDE Workspaces".
  - Moved Google Antigravity into Section 2 with `[Desktop App]` indicator and `antigravity-ide` pill.
- `packages/engine/engine/src/server/local-cli/detector.ts`:
  - Updated `launchClaudeLoginTerminal` to launch `claude` CLI directly into native terminal window.

## Tests & Verification
- `npm run build -w apps/web`: ✅ Passed with 0 TypeScript/Vite compilation errors (built in 23.72s).
- Git hygiene check: Clean status, zero runtime fixtures or scratch logs committed.
