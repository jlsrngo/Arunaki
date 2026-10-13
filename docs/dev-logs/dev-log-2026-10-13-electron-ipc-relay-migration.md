# Dev Log — Electron IPC Relay Migration

**Date & Time:** 2026-10-13 09:22:00 WIB  
**Author:** Antigravity (AI Software Engineer)

## What
Memigrasikan komunikasi renderer ke backend engine dari direct HTTP menjadi **Electron IPC Relay (Fase 1 IPC Bridge)** untuk memastikan arsitektur Arunaki setara dengan VS Code / Cursor IDE (desktop-only isolation, zero port exposure di sandbox). Semua operasi dokumen dan komunikasi AI tetap berfungsi 100% utuh tanpa breaking changes.

### Arsitektur yang Diimplementasikan:
1. **Main Process IPC Handlers (`apps/desktop/main.cjs`)**:
   - `engine:fetch`: Relay generic HTTP fetch ke engine `:4096`. Menginjeksi Basic Auth langsung dari proses main (`process.env.ARUNAKI_SERVER_PASSWORD`), menyatukan header, dan mengembalikan `{ status, statusText, headers, body, ok }`.
   - `bridge:fetch`: Relay untuk model bridge `:20188` (OpenCode/Antigravity CLI ping dan validasi).
   - `engine:sse:start` & `engine:sse:stop`: Persistent streaming relay untuk EventSource/SSE. Main process membuka stream dan mem-push event terurai (`data:`, `event:`) langsung ke `sender.send('engine:sse:event:${channel}', parsed)`. Mendukung auto-cleanup saat `sender` dihancurkan (misalnya reload window).
   - `engine:info`: Informasi display URL tanpa membocorkan kredensial.

2. **Preload Script Bridge (`apps/desktop/preload.cjs`)**:
   - Mengekspos method aman ke window: `engineFetch`, `bridgeFetch`, `startEngineSSE`, `stopEngineSSE`, `onEngineSSE`, `getEngineInfo`.

3. **Client API Adapters (`apps/web/src/lib/api.ts` & `engine.ts`)**:
   - `apiFetch()`: Mendeteksi keberadaan `window.arunakiDesktop.engineFetch`. Jika aktif (Electron), semua request diarahkan via IPC invoke dan di-wrap ke object standar `Response` (lengkap dengan `.json()`, `.text()`, `status`, `ok`, dan `AbortSignal` handling). Jika di browser dev mode, fallback ke HTTP fetch transparan.
   - `engineFetch()`: Didelegasikan langsung ke `apiFetch()`.
   - `subscribeEvents()`: Mendukung listener via `d.startEngineSSE` dan `onEngineSSE` dengan fallback loop HTTP stream untuk dev mode.
   - `SettingsCliConnectionsTab.tsx`: Pengecekan bridge models diarahkan lewat `bridgeFetch()` bukan direct HTTP.

## Files Changed
- `apps/desktop/main.cjs` — Penambahan IPC handlers `engine:fetch`, `bridge:fetch`, `engine:sse:start`, `engine:sse:stop`, `engine:info` dengan auto-abort guard pada lifecycle WebContents.
- `apps/desktop/preload.cjs` — Pengeksposan relay methods dan SSE subscription ke context bridge.
- `apps/web/src/lib/api.ts` — Routing IPC pada `apiFetch` dan `bridgeFetch`, response wrapper, dan signal cancellation.
- `apps/web/src/lib/engine.ts` — Integrasi `engineFetch` ke `apiFetch` dan `subscribeEvents` ke Electron IPC SSE.
- `apps/web/src/components/settings/SettingsCliConnectionsTab.tsx` — Migrasi CLI ping ke `bridgeFetch`.

## Tests & Verification
- `npm run build -w apps/web`: ✅ PASSED (0 error kompilasi TypeScript, Vite bundling selesai dalam 19.70s).
- `npm run typecheck`: ✅ PASSED (`tsc -b apps/web/tsconfig.json` exit code 0).
- `npm run test:smoke`: ✅ PASSED (8/8 provider checks passed: Kiro text/tool/chat, OpenCode text/tool, Antigravity text/tool, Codex free).

## Notes
- Tidak ada breaking change pada ~60 call sites backend/frontend karena `apiFetch` dan `engineFetch` mempertahankan signature kontrak Response standar.
- Browser dev mode tetap didukung secara otomatis via fallback.
