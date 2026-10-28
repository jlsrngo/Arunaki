# Dev Log — 2026-10-28 — Smart Context-Aware Desktop Notifications

## Summary
Upgraded desktop notifications to be fully dynamic, smart, and context-aware instead of generic "Executed X tasks". Notifications now directly announce the specific action performed:
- Thermal receipt print: **"Receipt Printed"** — `"Printed receipt: R43-281026001"`
- In-place sales order revision: **"Sales Order Revised"** — `"Edited sales order: R43-281026001"`
- Sales order creation: **"Sales Order Created"** — `"Created sales order (4 items)"`
- Sales order void: **"Sales Order Voided"** — `"Voided sales order: R43-281026001"`
- Cash drawer kick: **"Cash Drawer Kick"** — `"Physical cash drawer opened."`
- Document edit: **"Document Updated"** — `"Edited LAPORAN-HARIAN.txt"`
- Document create: **"Document Created"** — `"Created REKAP 10-2026.xlsx"`
- Multi-step task: Primary action label + `(+N other tasks)` suffix
- Background chat response: Smart clean 1-line excerpt (when window is blurred/unfocused); suppressed when already focused in the active window.

## Files Changed
- `apps/src/components/workstation/LiveExecutionBadge.tsx`: Added `t.includes("edit")` check for ArunakiZen sales order revisions to format `"Edited sales order: [invoice]"`.
- `apps/src/components/workstation/chat/chatDiagnostics.ts`: Added `CompletionNotificationOptions` and `buildSmartNotification` to parse executed tool steps and select context-aware titles and descriptive action bodies.
- `apps/src/components/workstation/chat/useWorkstationChat.ts`: Updated `notifyOnce` to pass `{ toolsCount, steps: accumulatedSteps, responseText: accumulatedResponseText }`.
- `apps/src/components/workstation/chat/useExternalChatEvents.ts`: Updated to pass `{ toolsCount, steps: extSteps, responseText: extText }`.
- `apps/src/lib/notifications.ts`: Tuned `NOTIFICATION_COOLDOWN_MS` to 2500ms so rapid distinct actions pop up promptly without delay while loop protection remains active.
- `core/arunaki-engine/src/desktop.rs`: Set WinRT `$toast.Tag = 'arunaki-status'` and `$toast.Group = 'arunaki'` so Windows replaces toasts smoothly without stacking a long queue.

## Tests
- `npm run build -w apps` — Passed (Vite + TypeScript 0 errors).
- `cargo test -p arunaki-engine --lib` — Passed (24 tests pass).
- Release binary built and deployed to `dist-portable/`.
