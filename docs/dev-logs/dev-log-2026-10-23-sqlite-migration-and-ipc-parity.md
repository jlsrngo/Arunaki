# Dev Log — SQLite Database Migration, Knowledge Graph Parity & Desktop WebView2 IPC Alignment

**Date & Time:** 2026-10-23 11:23:45 WIB  
**Author:** AI Agent (Google Antigravity)

## What
Memperbaiki penyebab 4 tampilan kosong pada standalone `arunaki.exe` (Chat History kosong `0`, Knowledge Page canvas kosong, Model Providers kosong, dan Workstation "No folder opened"):
1. **Migrasi Database SQLite (`Arunaki-local.db` -> `sessions-store.json`)**:
   - Membangun `scripts/migrate-sqlite-to-json.cjs` dan menjalankannya dengan Bun/Node SQLite driver.
   - 322 percakapan sesi dan 6.588 pesan riwayat berhasil dimigrasi ke `~/.local/share/arunaki/sessions-store.json`.
   - Menambahkan hook auto-migration pada `crates/arunaki-engine/src/sessions.rs` saat `load_store()`.
2. **Knowledge Graph Parity (`crates/arunaki-engine/src/knowledge.rs`)**:
   - Menyelaraskan lokasi penyimpanan file ke `{directory}/.arunaki/knowledge.json` dengan fallback ke sandbox `~/.arunaki/scratch` ketika belum ada folder yang dipilih.
   - Menyesuaikan envelope respons menjadi `{ data: [...] }` dengan node wajib `"main-ai-node"` (`Agent Core`).
   - Menyediakan rute lengkap: `GET/POST /api/knowledge`, `GET/POST /api/knowledge/edges`, `DELETE /api/knowledge/edges/:id`, `PATCH /api/knowledge/:id/position`, `PATCH /api/knowledge/:id/toggle`, `POST /api/knowledge/upload`, dan `POST /api/knowledge/sync`.
3. **Desktop WebView2 IPC Alignment (`crates/arunaki-engine/src/desktop.rs`)**:
   - Memperbaiki `window.arunakiDesktop.pickFolder()` agar mengembalikan `{ path: string | null }` sesuai kontrak frontend.
   - Menghilangkan shim `engineFetch`/`bridgeFetch` yang argumennya tidak cocok dengan `apiFetch`, sehingga WebView2 menggunakan fetch HTTP langsung ke engine port `4096`.
   - Memfilter provider internal `"local-cli"` dari `/api/providers`.
4. **Kompilasi Ulang Binary**:
   - Mengompilasi `target/release/arunaki.exe`, `target/release/arunaki-engine.exe`, `target/debug/arunaki.exe`, `target/debug/arunaki-engine.exe`, dan `apps/desktop/resources/engine.exe`.
   - Menyinkronkan aset web bundle Vite ke `apps/desktop/web`, `target/release/web`, dan `target/debug/web`.

## Files Changed
- `scripts/migrate-sqlite-to-json.cjs` — Skrip migrasi SQLite ke JSON store.
- `crates/arunaki-engine/src/sessions.rs` — Auto-migration hook SQLite saat store kosong.
- `crates/arunaki-engine/src/knowledge.rs` — 100% parity API Knowledge Graph TypeScript.
- `crates/arunaki-engine/src/desktop.rs` — Perbaikan signature `pickFolder` dan pembersihan shim `engineFetch`.
- `crates/arunaki-engine/src/providers.rs` — Filter provider internal `local-cli`.
- `crates/arunaki-engine/Cargo.toml` — Pembersihan warning duplikasi bin manifest.
- `WORKFLOW.md` — Penambahan Phase 127 (Completed).

## Tests
- `npm run test:smoke` — ✅ passed (8/8 provider checks passed).
- `npm run build -w apps/web` — ✅ passed (0 errors, Vite bundle berhasil).
- `cargo check -p arunaki-engine` — ✅ passed (0 errors).
- `cargo build -p arunaki-engine --release` — ✅ passed (0 errors, binary 7.86 MB).
- API Live Test:
  - `GET /api/session`: ✅ 200 sesi aktif + preview + message count.
  - `GET /api/knowledge`: ✅ 2 nodes (`Agent Core`, `Database Stok Cititex (GSheets)` / `Katalog`).
  - `GET /api/knowledge/edges`: ✅ 1 edge.
  - `GET /api/providers`: ✅ 8 providers terkonfigurasi.

## Notes
Binary `target/release/arunaki.exe` dan `target/debug/arunaki.exe` sekarang sepenuhnya mandiri dan langsung menampilkan seluruh data riwayat pengguna saat dibuka dari File Explorer.
