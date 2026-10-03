# Dev Log — Connection CLI Dedicated Tab & Monochrome Layout Refinement

**Date & Time:** 2026-10-03 10:40:00 WIB  
**Author:** AI Software Engineer (Antigravity)

## What
1. **Dedicated "Connection CLI" Tab in Settings Navigation**:
   - Extracted CLI/agent connection management out of the Model Routing & Providers tab into a standalone top-level Settings tab: `Connection CLI`.
   - Updated tab bar styling with `whitespace-nowrap h-10` and balanced labels (`Model Providers`, `Connection CLI`, `Office Automation`, `Messaging Apps`, `Account & License`) to eliminate uneven multi-line title wrapping.
2. **Pure CLI & IDE Focus (Excluding Cloud APIs)**:
   - Excluded Groq Cloud from the CLI Connections menu (clarified that Groq is a cloud API provider managed in Model Providers, not a local terminal CLI or local desktop IDE).
   - Focused the Connection CLI Hub strictly on genuine local binaries and connected IDE runtime environments:
     - **Claude Code CLI** (`claude` official Anthropic CLI agent, uses flat $20/mo Claude Pro subscription with zero per-token API cost)
     - **OpenCode CLI Agent** (`opencode` terminal coding agent CLI)
     - **Google Antigravity IDE** (Connected Google Antigravity environment)
     - **9Router Local Gateway** (`9router` local proxy CLI daemon on port 20128)
3. **Monochrome Aesthetic & Micro-interactions ("mocrom")**:
   - Replaced multi-column box cards with full-width horizontal rows stacked vertically (`space-y-3`), matching the clean `ProviderCard` style.
   - Clean dark monochrome palette (`var(--bg-card)`, `var(--bg-panel)`, `var(--bg-hover)`, `var(--border-color)`).
   - Minimalist active toggle buttons (`bg-[var(--text-primary)] text-[var(--bg-app)]`).
   - Live Test Ping button with real-time ms latency and expandable execution inspection drawer.

## Files Changed
- `apps/web/src/pages/SettingsPage.tsx` — Added `Connection CLI` tab, updated tab bar to `whitespace-nowrap h-10`, rendered `SettingsCliConnectionsTab`.
- `apps/web/src/components/settings/SettingsCliConnectionsTab.tsx` — Created dedicated component with vertical row cards, monochrome styling, and pure CLI/IDE focus.
- `apps/web/src/components/settings/ModelProviderSettings.tsx` — Removed embedded `LocalCliSection`.
- `apps/web/src/components/settings/LocalCliSection.tsx` — Removed old prototype component.
- `apps/web/src/lib/i18n.ts` — Added `cliConnections` translation and fixed duplicate property definitions.
- `packages/engine/engine/src/server/local-cli/detector.ts` — Detects `claude`, `opencode`, `antigravity`, and `9router`.
- `packages/engine/engine/src/server/routes/instance/httpapi/groups/provider.ts` — Updated LocalCliConnectInput schema.
- `packages/engine/engine/src/server/routes/instance/httpapi/handlers/provider.ts` — Handled local CLI connection upserts.

## Tests
- `npm run build -w apps/web` — ✅ Built in 29.05s with 0 TypeScript/compilation errors.

## Notes
- All React Rules of Hooks respected (zero conditional hooks, all hooks declared at top of components).
- UI telemetry labels follow clean English Antigravity standard.
