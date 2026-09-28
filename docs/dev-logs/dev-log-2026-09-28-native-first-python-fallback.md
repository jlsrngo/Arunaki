# Dev Log — Native First with Python Resilient Fallback

**Date & Time:** 2026-09-28 14:41:00 WIB  
**Author:** AI Software Engineer  

## What
Mengimplementasikan strategi "Native First, Python Resilient Fallback":
1. Arunaki memprioritaskan tool native dokumen (`excel_read`, `word_read`, `ppt_read`) pada percobaan awal karena eksekusinya instan (<50ms in-memory) tanpa dependensi eksternal.
2. Jika tool native mengalami kegagalan, error, file tidak ditemukan, atau jika tool native sudah pernah dijalankan pada sesi tersebut, eksekusi skrip Python **TIDAK DIBLOKIR** dan diizinkan berjalan secara bebas ("anti gagal") melalui shell/bash.
3. Modul pelacak `doc-fallback.ts` dibuat dengan `globalThis` singleton (`Symbol.for`) agar state sesi dapat dibagi secara sinkron dan konsisten di seluruh package monorepo (`@arunaki/tools`, `@arunaki/core`, `@arunaki/engine`).
4. Prompts sistem diharmonisasikan di seluruh lapisan engine (Core V2 dan Engine V1) agar model memahami alur kerja ini secara cerdas.

## Files Changed
- `packages/arunaki-tools/src/doc-fallback.ts` — Modul tracker attempt & failure sesi dengan singleton `Symbol.for`.
- `packages/arunaki-tools/package.json` — Ekspor `./doc-fallback`.
- `packages/arunaki-tools/src/index.ts` — Re-export `doc-fallback`.
- `packages/arunaki-tools/src/excel-read.ts` — Instrumentasi `recordNativeAttempt` dan `recordNativeFailure`.
- `packages/arunaki-tools/src/word-read.ts` — Instrumentasi `recordNativeAttempt` dan `recordNativeFailure`.
- `packages/arunaki-tools/src/ppt-read.ts` — Instrumentasi `recordNativeAttempt` dan `recordNativeFailure`.
- `packages/engine/core/src/tool/doc-fallback.ts` — Modul tracker di Core V2.
- `packages/engine/core/src/tool/excel-read.ts` — Instrumentasi tracking di Core V2.
- `packages/engine/core/src/tool/word-read.ts` — Instrumentasi tracking di Core V2.
- `packages/engine/core/src/tool/ppt-read.ts` — Instrumentasi tracking di Core V2.
- `packages/engine/core/src/tool/bash.ts` — Guardrail pintar: redirect ke native jika belum dicoba, izinkan Python bebas jika native sudah dicoba/gagal.
- `packages/engine/core/src/plugin/agent.ts` — Update system prompt: native first, Python as resilient fallback.
- `packages/engine/core/test/tool-bash.test.ts` — Unit test verifikasi perilaku redirect ke native & fallback Python.
- `packages/engine/engine/src/tool/doc-fallback.ts` — Modul tracker di Engine V1.
- `packages/engine/engine/src/tool/shell.ts` — Guardrail pintar di Engine V1 shell runner.
- `packages/engine/engine/src/session/system.ts` — Update system prompt di session V1.
- `packages/engine/engine/src/session/prompt/default.txt` — Update system prompt di session default prompt.
- `packages/engine/engine/src/tool/shell/prompt.ts` — Update prompt deskripsi shell tool.
- `WORKFLOW.md` — Checklist roadmap update.

## Tests
- `bun test packages/engine/core/test/tool-bash.test.ts` — ✅ passed (12 passed, 0 failed)
- `bun test packages/engine/core/test/doc-read.test.ts` — ✅ passed (3 passed, 0 failed)
- `npm run build -w apps/web` — ✅ passed (0 TypeScript compilation errors)

## Notes
- Dengan skema ini, pengguna mendapatkan yang terbaik dari kedua dunia: responsivitas instan (<50ms) dari tool native dokumen, serta fleksibilitas tinggi dan ketahanan mutlak ("anti-gagal") dari Python saat dokumen membutuhkan penanganan khusus atau saat parser native mengalami kendala.
