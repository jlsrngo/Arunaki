# Dev Log — Pre-Merge Local CLI Audit & Robustness Fixes

**Date & Time:** 2026-10-13 13:48:00 WIB
**Author:** AI Software Engineer

## What
Dilakukan perbaikan menyeluruh berdasarkan hasil pre-merge audit pada subsistem Local CLI Provider sebelum integrasi branch `feature/tier-grouping` ke `main`:
1. **Model Routing Collision Fix**: Menghapus matcher substring `.includes("pro")` yang terlalu longgar di `bridge.ts` yang sebelumnya berpotensi membajak (*hijack*) model open source/pihak ketiga (misal `llama-3.3-70b-pro`, `mistral-pro`) ke rute Google Cloud Code.
2. **Double `res.end()` & Misleading Warning Fix**: Memperbaiki flow completion error di `bridge.ts` dengan menambahkan guard `handled || res.writableEnded`, sehingga saat respons error vendor telah dikirim oleh `upstream.ts`, `bridge.ts` tidak lagi memanggil `res.end()` untuk kedua kalinya ataupun mencetak console warning palsu.
3. **Non-blocking Token Refresh Spawn**: Mengubah `crossSpawn.sync` pada `refreshAntigravityCredentialViaAgy` di `detector.ts` menjadi pemanggilan asynchronous `crossSpawn` yang dibungkus `Promise` + timeout 45s. Ini mencegah pembekuan (*freeze*) event loop Node.js selama 1.5 - 4 detik saat re-authentikasi token reaktif/proaktif.
4. **Catalogue Registry Alignment**: Memperbarui daftar fallback `ANTIGRAVITY_MODELS` di `registry.ts` untuk membuang model yang sudah dipensiunkan oleh Google (`gemini-3.7-flash-medium`, `gemini-3.6-flash-medium`, `gemini-pro-agent`) dan memastikan dropdown hanya menawarkan model aktif sesuai katalog live.
5. **Universal Sleep in Smoke Suite**: Menjadikan sleep di `scripts/smoke-local-cli.ts` kompatibel dengan runtime Node/npx maupun Bun (`globalThis.Bun?.sleep ? Bun.sleep(1000) : new Promise(...)`).

## Files Changed
- `packages/engine/engine/src/server/local-cli/bridge.ts` — Menghapus `.includes("pro")` dan menambahkan guard `res.writableEnded`.
- `packages/engine/engine/src/server/local-cli/detector.ts` — Async `crossSpawn` Promise pada `refreshAntigravityCredentialViaAgy`.
- `packages/engine/engine/src/server/local-cli/registry.ts` — Sinkronisasi model fallback Antigravity dengan katalog live Google.
- `packages/engine/engine/test/fastpath.test.ts` — Menambahkan unit test regresi rute model Antigravity vs model pihak ketiga 'pro'.
- `scripts/smoke-local-cli.ts` — Runtime-agnostic sleep helper.

## Tests
- `bun test test/fastpath.test.ts` — ✅ 4 passed (15 expect calls)
- `bun test test/registry.test.ts` — ✅ 11 passed (38 expect calls)
- `bun test test/upstream.test.ts` — ✅ 37 passed (154 expect calls)
- `npm run build -w apps/web` — ✅ Built in 24.27s (0 compile errors)
- `bun run scripts/smoke-local-cli.ts` — ✅ All 8 provider checks passed
- `npx tsx scripts/smoke-local-cli.ts` — ✅ All 8 provider checks passed
