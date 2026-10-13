# Dev Log — Dynamic Ephemeral Port & IPC Relay Resilience

**Date & Time:** 2026-10-13 10:27:00 WIB  
**Author:** Antigravity (AI Software Engineer)

## What
Mengimplementasikan arsitektur **Dynamic Ephemeral Port Discovery & Fallback** pada Engine Arunaki yang berpadu dengan **Electron IPC Relay Bridge**. Menyelesaikan masalah hardcoded port `:4096` dan potensi port collision ("port already in use"), sekaligus mempertahankan 100% isolasi keamanan Electron IPC di sisi renderer tanpa risiko runtime crash pada Bun Windows.

### Arsitektur yang Diterapkan:
1. **Dynamic Engine Port Persistence (`packages/engine/engine/src/cli/cmd/serve.ts`)**:
   - Setelah `Server.listen(opts)` berhasil, engine secara otomatis menuliskan detail server runtime (`port`, `hostname`, `url`, `pid`) ke `~/.arunaki/engine-info.json`.
   - Jika port default `:4096` sedang dipakai oleh proses lain, engine secara otomatis menangkap error dan mengalihkan listen ke port bebas dinamis dari OS (misal `:56200`).
2. **Dynamic Engine Discovery di Electron Main (`apps/desktop/main.cjs`)**:
   - Fungsi `getEngineUrl()` secara otomatis membaca `~/.arunaki/engine-info.json` untuk menemukan port engine yang sedang aktif.
   - Semua IPC relay handler (`engine:fetch`, `engine:sse:start`, `engine:info`) meneruskan request ke URL dinamis tersebut.
3. **Dynamic Discovery pada Tooling & Smoke Tests (`scripts/smoke-local-cli.ts` & `scripts/start-prod.cjs`)**:
   - Fungsi `resolveHealthUrl()` dan `resolveApiUrl()` membaca `~/.arunaki/engine-info.json` secara dinamis, sehingga pengujian smoke dan production launcher selalu menemukan engine di port mana pun ia berjalan.
4. **Export Konstanta `ENGINE_INFO_FILE` (`scripts/server-auth.cjs`)**:
   - Menambahkan metadata path `ENGINE_INFO_FILE` di alongside `PASSWORD_FILE`.

## Files Changed
- `packages/engine/engine/src/cli/cmd/serve.ts` — Menyimpan metadata runtime server ke `~/.arunaki/engine-info.json`.
- `apps/desktop/main.cjs` — Menambahkan `getEngineUrl()` yang membaca port aktif engine dari `engine-info.json`.
- `scripts/smoke-local-cli.ts` — Resolusi dinamis untuk `HEALTH` dan `API` URL.
- `scripts/start-prod.cjs` — Resolusi dinamis untuk health check URL pada launcher produksi.
- `scripts/server-auth.cjs` — Mengekspos konstanta path `ENGINE_INFO_FILE`.

## Tests & Verification
- **Port Collision Simulation Test**: ✅ PASSED. Port `:4096` sengaja diblokir dengan dummy TCP server; engine secara otomatis fallback ke port bebas (`:56200`) dan mencatatnya ke `engine-info.json`.
- **Live Smoke Test (8/8 Providers)**: ✅ PASSED. Saat port 4096 terblokir, smoke test berhasil mendeteksi port dinamis dan seluruh 8 pengujian provider lolos (Kiro text/tool/chat, OpenCode text/tool, Antigravity text/tool, Codex free).
- **TypeScript Typecheck**: ✅ PASSED (`npm run typecheck` exit code 0).
- **Web Build Verification**: ✅ PASSED (`npm run build -w apps/web` exit code 0 dalam 12.41s).
- **Plugin Unit Tests**: ✅ PASSED (`bun test packages/engine/core/test/plugin/models-dev-variants.test.ts` 8 pass, 0 fail).
