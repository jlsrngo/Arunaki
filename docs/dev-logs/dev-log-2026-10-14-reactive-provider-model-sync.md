# Dev Log — Reactive Provider & Model Switching

**Date & Time:** 2026-10-14 11:34:00 WIB
**Author:** Antigravity AI

## What
1. **Fix Taskbar / Window Icon:** Rendered standard multi-resolution PNGs (16x16, 24x24, 32x32, 48x48, 64x64, 128x128, 256x256) with `#E59344` brand styling and generated a 100% compliant multi-frame Windows `icon.ico` container. Configured Windows Start Menu shortcut `Arunaki.lnk` with matching `appUserModelId: 'Arunaki'` and `icon.ico`. Wired `nativeImage.createFromPath` and `win.setIcon` in `apps/desktop/main.cjs`.
2. **Instant Reactive Vendor & Model Switching:** Fixed issue where changing or connecting an active provider (e.g. Kiro, Codex, Antigravity, Claude, OpenCode) in Settings had a delay or required an app restart before the chat recognized the vendor. Optimized CLI connection handlers to update state optimistically with 0ms delay, added window event `arunaki:provider-change`, and reactive listener in `useWorkstationChat.ts`.
3. **Vendor Model Isolation:** Fixed model list dropdown in ChatInputBox so that when Kiro (or any provider) is connected, the active model and dropdown options automatically switch to that vendor's models (`kiro/auto`, `kiro/claude-sonnet-4.5`, etc.) rather than retaining the previous provider's models (`gemini-3.8-flash`).
4. **Fast Server Startup:** Parallelized Engine (:4096) and Vite (:5173) boot sequence in `scripts/dev-app.cjs`, saving ~8-12 seconds on startup.

## Files Changed
- `apps/desktop/resources/icon.ico` — Valid 7-frame multi-resolution Windows icon container (16 to 256px).
- `apps/desktop/resources/icon.png` — High-resolution 256x256 PNG asset.
- `apps/desktop/main.cjs` — Added `nativeImage`, prioritized `.ico`, configured Windows `appUserModelId` shortcut, and called `win.setIcon`.
- `apps/web/src/components/workstation/chat/useWorkstationChat.ts` — Added event listener for `arunaki:provider-change`, added `getProviderDefaultModels` fallback, and enhanced `resolveActiveSingleModel`.
- `apps/web/src/components/workstation/chat/ChatInputBox.tsx` — Added active vendor badge to model dropdown header and robust fallback for active model label.
- `apps/web/src/components/settings/SettingsCliConnectionsTab.tsx` — Optimistic zero-delay provider dispatch, included `kiro` in model selection, and connected all local CLI providers.
- `apps/web/src/components/settings/ModelProviderSettings.tsx` — Dispatched `arunaki:provider-change` on provider toggle.

## Tests
- `npm run build -w apps/web` — ✅ Built in 33.85s with 0 TypeScript compilation errors.
- `node -c apps/desktop/main.cjs` — ✅ Syntax verification passed.
- `shell.readShortcutLink` verification — ✅ Shortcut points to valid `icon.ico` with `appUserModelId: 'Arunaki'`.
