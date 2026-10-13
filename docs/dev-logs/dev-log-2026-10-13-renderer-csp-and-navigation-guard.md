# Dev Log — Renderer Content-Security-Policy & In-Window Navigation Guard

**Date & Time:** 2026-10-13 16:50:00 WIB  
**Author:** AI Software Engineer

## What
Menerapkan dua lapisan pertahanan keamanan utama pada renderer dan jendela desktop Electron:
1. **Content-Security-Policy (CSP)**:
   - Menambahkan tag `<meta http-equiv="Content-Security-Policy">` pada `apps/web/index.html`.
   - Mengunci `default-src 'self'`, membatasi `connect-src` hanya ke local loopback (`http://127.0.0.1:*`, `http://localhost:*`, `ws://127.0.0.1:*`, `ws://localhost:*`), mematikan plugins (`object-src 'none'`), dan mengunci `base-uri 'self'`.
   - Mencegah eksfiltrasi data/kredensial ke server remote jika terdapat konten HTML yang tidak tersanitasi (preview attachment, rendering tabel/markdown) masuk ke DOM.
2. **In-Window Navigation Guard (`will-navigate`)**:
   - Menambahkan event listener `will-navigate` pada `mainWindow.webContents` di `apps/desktop/main.cjs`.
   - Melengkapi `setWindowOpenHandler`: jika ada tag `<a>` tanpa `target="_blank"` atau eksekusi navigasi in-window ke URL non-lokal, navigasi langsung dibatalkan (`event.preventDefault()`) dan dialihkan ke browser eksternal default (`shell.openExternal`).
   - Mencegah jendela desktop dinavigasi ke domain remote sambil tetap memegang hak istimewa preload script / IPC bridge.

## Files Changed
- `apps/web/index.html` — Penambahan tag CSP meta.
- `apps/desktop/main.cjs` — Penambahan event handler `will-navigate`.

## Tests
- `npm run build -w apps/web` — ✅ Passed (0 TypeScript errors, bundle selesai dalam 50.62s).
- `git diff` — Diverifikasi bersih dan tepat sasaran.
