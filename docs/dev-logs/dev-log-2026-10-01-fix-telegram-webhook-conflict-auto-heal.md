# Dev Log — Fix Telegram Webhook Conflict Auto-Heal

**Date & Time:** 2026-10-01 10:37:00 WIB
**Author:** AI Software Engineer

## What
Fixed Telegram BYOB Gateway error `HTTP 409 Conflict: can't use getUpdates method while webhook is active; use deletewebhook to delete the webhook first`.
When a user provides a bot token that previously had a webhook configured elsewhere (e.g. n8n, Cloudflare Workers, Make, other bot runners), Telegram rejects `getUpdates` (long-polling) calls.

Added automatic webhook removal and self-healing:
1. `deleteWebhook(botToken: string)` helper in `TelegramService`.
2. Automatic call to `deleteWebhook` during `start()`.
3. Auto-recovery inside `pollLoop` when `HTTP 409` webhook conflict is encountered, immediately calling `deleteWebhook` and resuming polling without manual intervention.

## Files Changed
- `packages/engine/engine/src/messaging/telegram.ts` — Added `deleteWebhook` method, automated webhook clearance on `start()`, and auto-healing in `pollLoop`.
- `packages/engine/engine/test/messaging/telegram.test.ts` — Added unit test verifying `deleteWebhook` handling.

## Tests
- `bun test packages/engine/engine/test/messaging/telegram.test.ts` — ✅ 26 passed
- `npm run build -w apps/web` — ✅ passed (0 errors)

## Status
Resolved & Verified. Bot webhook cleared, long-polling gateway is active and connected.
