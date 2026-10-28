# Dev Log — 2026-10-28 — Notification Loop Fix & ArunakiZen Fake-Action Guard

## Problem
1. Windows native notifications fired repeatedly after a response completed.
2. The LLM claimed "struk sudah dicetak" / "invoice berhasil diedit" without calling any
   `arunakizen_*` tool (engine.log: `tools: 0` for "coba edit lagi..." and "cetak lah stuknya").

## Root Cause
1. The engine emits several terminal events per turn (`session.next.step.ended`, `session.idle`)
   that all map to `done`. After the local turn finalized (`isLocalSendingRef=false`), the external
   listener in `useExternalChatEvents.ts` treated each trailing `done` as a new completed turn and
   dispatched another OS notification.
2. History sent to the model contained only assistant text (tool calls stripped), so the model
   imitated earlier "printed / revised" text. The prompt also still told the model to void before
   revising (void requires a supervisor password) and did not list `arunakizen_edit_sale_order`.
   The existing guardrail only covered document mutation tools.

## Changes
- `apps/src/lib/notifications.ts`: 4s global cooldown + dedup for `sendDesktopNotification`.
- `apps/src/components/workstation/chat/useExternalChatEvents.ts`: ignore trailing `done`/`error`
  when no external turn is active; notify only if the external turn produced text/steps.
- `core/arunaki-engine/src/session/prompt.rs`:
  - ArunakiZen prompt lists `arunakizen_edit_sale_order`, revisions use edit (same invoice),
    new rule 8 "STRICT NO-FAKE-ACTION".
  - Assistant history is annotated with `[Tools executed in this past turn: ...]`.
  - New runtime guard: if the model claims a POS action without any `arunakizen_*` tool in
    the current turn, it is re-prompted once to call the real tool.
  - Unit test `test_zen_fake_action_detection`.

## Tests
- `cargo test -p arunaki-engine --lib session::prompt` — PASS (2 tests).
- `npm run build -w apps` — PASS.
