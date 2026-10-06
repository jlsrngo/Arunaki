# Dev Log — OpenCode CLI Daemon & 9Router Bridge Integration

**Date & Time:** 2026-10-06 14:38:00 WIB  
**Author:** AI Software Engineer (Arunaki)

## What
1. **Riset & Konfirmasi Arsitektur 9Router:**
   - Menelaah kode dan dokumentasi resmi GitHub `decolua/9router`.
   - Mengonfirmasi bahwa 9Router bertindak sebagai Smart Proxy lokal (port 20128) yang mengagregasi 40+ provider AI, termasuk menghubungkan tools CLI (Claude Code, Antigravity, OpenCode, Codex, Cline) dan akun pro/free (`oc/` untuk OpenCode Free, `kr/` untuk Kiro, `vx/` untuk Vertex, dan OAuth subscriptions).
2. **Perbaikan Integrasi OpenCode & Big Pickle di Arunaki Bridge:**
   - Menyelesaikan galat `HTTP transport failed` pada sesi obrolan dengan OpenCode model Big Pickle.
   - Mengubah `packages/engine/core/src/catalog.ts` (`projectModel`) agar provider lokal CLI (`opencode`, `antigravity`, `claude-code`, `9router`, dll.) memproyeksikan endpoint modelnya ke bridge lokal (`http://127.0.0.1:20188/v1`) dengan package `@ai-sdk/openai-compatible`, alih-alih mencoba menghubungi cloud URL eksternal `https://opencode.ai/zen/v1` yang membutuhkan token internal.
   - Mengubah `packages/engine/core/src/session/runner/model.ts` (`fromCatalogModel`) untuk menjamin semua request model CLI diarahkan melalui `OpenAICompatibleChat.route` ke bridge lokal.
   - Memperbaiki payload session OpenCode di `packages/engine/engine/src/server/local-cli/bridge.ts` (menghapus payload `tools` yang sempat memicu respons kosong pada daemon internal OpenCode), sehingga reasoning `<think>` dan teks balasan mengalir utuh.
   - Mendaftarkan alias model `opencode/big-pickle` dan `big-pickle`, serta prefix model 9Router (`oc/`, `kr/`, `vx/`, `cx/`, `9router/`, `combomaut`) ke gateway 9Router port 20128 jika aktif.
3. **Penyelarasan 1:1 UI & Pengalaman Pengguna 9Router:**
   - Memperbarui kartu 9Router di Settings dengan tombol pintas langsung ke Web Dashboard (`http://localhost:20128`) dan website dokumentasi (`https://9router.com`).
   - Memperbaiki routing model di `bridge.ts` agar model prefix 9Router (`oc/*`, `kr/*`, `vx/*`, `cx/*`) diprioritaskan sebelum Antigravity daemon, mencegah tabrakan nama model (misal `oc/claude-sonnet-4.5` atau `vx/gemini-2.5-pro`).

## Files Changed
- `packages/engine/core/src/catalog.ts` — Menambahkan deteksi `isLocalOrCli` di `projectModel` agar model CLI otomatis mengarah ke local bridge `20188`.
- `packages/engine/core/src/session/runner/model.ts` — Menambahkan rute eksplisit CLI provider di `fromCatalogModel`.
- `packages/engine/engine/src/server/local-cli/bridge.ts` — Penyesuaian OpenCode payload, registrasi model `big-pickle`, isolasi prefix 9Router dari Antigravity daemon.
- `packages/engine/engine/src/server/routes/instance/httpapi/handlers/provider.ts` — Fungsi self-healing `healLocalCliProviders` untuk menyinkronkan baseUrl provider CLI ke port bridge 20188.
- `apps/web/src/components/settings/SettingsCliConnectionsTab.tsx` — Penambahan tombol Dashboard & 9router.com, model presets 9Router, dan instruksi instalasi `npm i -g 9router && 9router`.

## Tests
- `node scratch/test-engine-style.cjs` — ✅ HTTP 200 SSE streaming chunks untuk `opencode/big-pickle` & `big-pickle`.
- Live test turn prompt ke sesi `ses_ef09e6108ffeLWAcMbJt7fPCIe` — ✅ HTTP 200, output reasoning `<think>` dan teks balasan Bahasa Indonesia lengkap selesai dalam ~14 detik tanpa galat.
- `npm run build -w apps/web` — ✅ Passed (0 error TypeScript & bundling Vite sukses).

## Notes
- Pengguna dapat menggunakan OpenCode (Zen / Big Pickle) secara gratis & mandiri via Local CLI Bridge Arunaki (port 20188), ataupun menghubungkan gateway 9Router eksternal (port 20128) untuk mengakses router multi-akun dengan pengalaman 1:1.
