# Dev Log — Native Electron & Web Screenshot Paste

**Date & Time:** 2026-10-14 18:05:00 WIB
**Author:** Antigravity AI

## What
Added native Electron clipboard bridge and enhanced web clipboard paste handling for screenshot images (e.g. Windows Snipping Tool, Win+Shift+S, PrtScn):
1. Added `clipboard:readImage` IPC handler in `apps/desktop/main.cjs` using Electron's native `clipboard.readImage().toDataURL()` to bypass Chromium sandbox restrictions on Windows DIB bitmaps.
2. Exposed `readClipboardImage` in `apps/desktop/preload.cjs`.
3. In `apps/web/src/components/workstation/chat/ChatInputBox.tsx`:
   - Added `handleAddImageDataUrl` for direct base64 image rendering and caching.
   - Added `processPaste` orchestrator supporting:
     - Priority 1: Native Electron Win32 clipboard image via `desktop.readClipboardImage()`.
     - Priority 2: Standard HTML5 `e.clipboardData.files` / `items` blobs.
     - Priority 3: Async `navigator.clipboard.read()` for image mime types.
   - Added `Ctrl+V` keydown shortcut check in textarea.
   - Kept window-level paste listener for pasting screenshots right after capturing.

## Files Changed
- `apps/desktop/main.cjs` — Added `clipboard` import and `clipboard:readImage` handler.
- `apps/desktop/preload.cjs` — Expose `readClipboardImage`.
- `apps/web/src/components/workstation/chat/ChatInputBox.tsx` — Added native IPC integration and dataUrl image attachment.

## Tests
- `npm run build -w apps/web` — ✅ passed (0 errors)
