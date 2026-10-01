# Dev Log — Fix Chat Input Textarea Scrollability on Multi-Line Prompts

**Date & Time:** 2026-10-01 17:38:00 WIB
**Author:** AI Software Engineer

## What
Fixed an issue where the chat input `<textarea>` could not be scrolled using the mouse wheel, trackpad, or scrollbar when containing long/multi-line text (forcing users to navigate via Up/Down arrow keys to view earlier lines).

### Root Cause
1. In `ChatInputBox.tsx`, the parent grid container had `max-h-[160px] overflow-hidden`, but the `<textarea>` had `style={{ fieldSizing: "content" }}` with NO `max-height` set on the textarea element itself.
2. Under Chromium's `field-sizing: content`, the `<textarea>` element's intrinsic block size expanded to fit all text (e.g. 500px+), so `textarea.clientHeight === textarea.scrollHeight`. The browser perceived 0 vertical scrollable overflow on the textarea, preventing wheel scroll events from changing `textarea.scrollTop`.
3. Meanwhile, the outer parent container had `overflow: hidden`, which also discarded wheel events, leaving caret arrow-key navigation as the only mechanism that forced the clipped parent to pan.
4. Additionally, `no-scrollbar` completely suppressed the scrollbar thumb.

### Fix
- Set `min-h-[24px] max-h-[160px]` and `style={{ fieldSizing: "content", maxHeight: "160px" }}` directly on the `<textarea>` element so it is bounded at 160px.
- Removed `overflow-hidden` on the grid parent to avoid internal scroll clipping desync.
- Replaced `no-scrollbar` with `custom-scrollbar` to surface Arunaki's modern 6px thin scrollbar when text overflows.

## Files Changed
- `apps/web/src/components/workstation/chat/ChatInputBox.tsx` — Applied direct max-height and custom-scrollbar to textarea.

## Tests
- Headless Playwright test verifying:
  - 1-line auto-expansion: height = 24px
  - 30-line text: clientHeight capped at 160px, scrollHeight = 604px
  - Mouse wheel up / down smoothly scrolling `scrollTop` (verified: 440 -> 140 -> 340)
- `npm run build -w apps/web` — ✅ Built successfully in 38.58s (0 errors).

## Status
Resolved & Verified.
