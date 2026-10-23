# Dev Log — Phase 122: Rust Backend Hybrid Migration Foundation (Phase 0 & Phase 1 Sidecar)

**Date & Time:** 2026-10-23 08:21:00 WIB
**Author:** Antigravity

## What
Membangun fondasi migrasi backend ke Rust secara bertahap dan zero-downtime (Hybrid Sidecar + Strangler Fig):
1. Menambahkan ADR-008 pada `docs/ARCHITECTURE.md` serta menginisialisasi Cargo workspace (`Cargo.toml` root & `crates/arunaki-docs`).
2. Mengimplementasikan crate Rust native `crates/arunaki-docs` untuk parsing dokumen `.xlsx` (`build_excel_map`), `.docx` (`build_word_map`), dan `.pptx` (`build_ppt_map`) dengan output JSON `DocMap` yang 100% identik dengan parser TypeScript.
3. Membuat bridge feature-flagged `packages/arunaki-tools/src/rust-bridge.ts` (`ARUNAKI_RUST_TOOLS=1`, default OFF) dengan automatic fallback ke parser TypeScript bila flag tidak aktif, binary belum di-build, atau terjadi error.

## Files Changed
- `Cargo.toml` & `Cargo.lock` — Workspace Cargo utama.
- `crates/arunaki-docs/Cargo.toml` & `crates/arunaki-docs/src/main.rs` — Native Rust document parser sidecar (`excel`, `word`, `ppt`).
- `packages/arunaki-tools/src/rust-bridge.ts` — Feature-flagged Rust sidecar runner (`isRustToolsEnabled`, `findRustDocsBinary`, `tryRunRustDocMap`) dengan fallback aman ke TS.
- `packages/arunaki-tools/src/excel-read.ts`, `word-read.ts`, `ppt-read.ts`, `index.ts` — Integrasi `tryRunRustDocMap`.
- `packages/arunaki-tools/test/rust-bridge.test.ts` — Unit & parity tests antara output Rust dan TypeScript serta fallback test.
- `.gitignore`, `docs/ARCHITECTURE.md`, `WORKFLOW.md` — Ignore `target/`, dokumentasi ADR-008, dan update checklist Phase 122.

## Tests
- `cargo test` — ✅ passed (2/2 tests)
- `cargo build --release` — ✅ passed (`target/release/arunaki-docs.exe` built cleanly)
- `bun test packages/arunaki-tools/test/doc-read.test.ts packages/arunaki-tools/test/rust-bridge.test.ts` — ✅ passed (7/7 tests)
- `npm run build -w apps/web` — ✅ passed (0 errors)

## Notes
- Secara default (`ARUNAKI_RUST_TOOLS` tidak di-set), seluruh script (`npm run dev:app`, `npm start`, dll.) menjalankan 100% jalur TypeScript seperti biasa tanpa risiko downtime.
- Untuk mengaktifkan sidecar Rust, cukup set environment variable `ARUNAKI_RUST_TOOLS=1`.
