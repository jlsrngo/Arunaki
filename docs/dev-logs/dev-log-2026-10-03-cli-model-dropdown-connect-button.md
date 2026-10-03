# Dev Log — CLI Model Selector Dropdown & Single Connect/Disconnect Toggle Button

**Date & Time:** 2026-10-03 13:50:00 WIB  
**Author:** Antigravity AI Engineer  

## What
1. **Single Connect / Disconnect Toggle Button**:
   - Converted connection action into a single 1-click toggle button per CLI row (`Claude`, `Codex`, `OpenCode`, `Google Antigravity`, `9Router`).
   - Disconnected state: Displays `[ ○ Connect ]` (`bg-zinc-900 border-zinc-700`).
   - Connected state: Displays `[ ✓ Connected ]` (`bg-white text-zinc-950 font-semibold border-white`). On hover, seamlessly transitions to `[ ✕ Disconnect ]`.
   - Clicking disconnected connects the CLI immediately and activates routing. Clicking connected deactivates and puts Arunaki into standby.

2. **Manual Model Selector Dropdown**:
   - Added a manual model selector dropdown button per CLI row matching user reference.
   - Popover features:
     - Header: "Model" with "Manual Selector" subtitle.
     - Scrollable list of models with name, checkmark indicator, and badges (`High`, `Fast`, `Medium`, `Low`, `New`, `Notice`).
     - Manual/Custom model text input at the bottom to configure any custom model name (e.g. `gpt-4o`, `claude-3-5`).
     - Instant sync: If the CLI is currently connected and active, picking a model immediately updates the active model and notifies the user.
     - Click-outside backdrop to cleanly dismiss open dropdowns.

3. **100% Monochrome Aesthetic**:
   - Strictly enforced pure black, white, and zinc grayscale styling throughout the CLI connections tab and provider settings (`bg-zinc-950`, `bg-zinc-900`, `bg-zinc-800`, `text-white`, `text-zinc-300`, `text-zinc-400`, `border-zinc-800`). Zero colored highlights or accents.

## Files Changed
- `apps/web/src/components/settings/SettingsCliConnectionsTab.tsx` — Model dropdown selector, single connect/disconnect toggle, pure monochrome badges and styles.
- `apps/web/src/components/settings/ModelProviderSettings.tsx` — CLI diversion banner, ON/OFF toggle switch handler in pure monochrome.
- `apps/web/src/components/settings/ProviderCard.tsx` — Active ON/OFF switch, pure monochrome badges and controls.

## Tests
- `npm run build -w apps/web` — ✅ Built in 22.70s with 0 TypeScript compilation errors.

## Notes
- Fully responsive on desktop and web interfaces.
- Respects React Rules of Hooks (all hooks unconditionally declared at top level).
