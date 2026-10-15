# Dev Log — Knowledge Menu Clean Decomposition

**Date & Time:** 2026-10-15 09:27:00 WIB
**Author:** AI Agent (Antigravity)

## What
Mendekomposisi menu Knowledge (`KnowledgePage.tsx` yang sebelumnya berukuran 528 baris dan mencampuradukkan graph state, fetching edges/nodes, anti-collision math, connection validation, dan toolbar/panel) menjadi arsitektur modular:
1. `apps/web/src/components/knowledge/collision.ts`: Ekstraksi algoritma anti-collision murni `resolveNodeCollision` untuk mencegah node saling bertumpukan saat di-drag.
2. `apps/web/src/components/knowledge/collision.test.ts`: Test suite baru untuk verifikasi resolusi anti-collision pada sumbu penetrasi terkecil (3 tests passing 100%).
3. `apps/web/src/components/knowledge/hooks/useKnowledgeGraph.ts`: Custom hook terpusat untuk seluruh state ReactFlow (nodes, edges, auto-centering camera ke `main-ai-node`, validasi koneksi ketat hanya ke core node, penambahan/penghapusan/drag stop node, serta sinkronisasi folder aktif).
4. `apps/web/src/pages/KnowledgePage.tsx`: Direduksi menjadi orchestrator murni ~150 baris yang ramping dan deklaratif.
5. Pemenuhan Strict Monochrome & No-Emerald Rule: Memperbaiki indikator titik sync status di `KnowledgeNodePanel.tsx` dari `bg-emerald-500` menjadi `bg-white animate-pulse`, serta warna node SOP menjadi warna netral slate.

## Files Changed
- `apps/web/src/components/knowledge/collision.ts` (baru)
- `apps/web/src/components/knowledge/collision.test.ts` (baru)
- `apps/web/src/components/knowledge/hooks/useKnowledgeGraph.ts` (baru)
- `apps/web/src/pages/KnowledgePage.tsx` (refactor)
- `apps/web/src/components/knowledge/KnowledgeNodePanel.tsx` (monochrome fix)
- `WORKFLOW.md` (update Phase 117 ke ✅ DONE)

## Tests
- `npm run build -w apps/web` — ✅ passed (0 errors, Vite production build 11.31s)
- `npx vitest run` — ✅ passed (36/36 tests passed across 6 test suites)

## Notes
- Fungsionalitas graph knowledge (upload data, tambah node, koneksi edge, drag dengan anti-collision, edit detail di panel) berjalan 100% tanpa regresi.
