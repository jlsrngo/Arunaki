# Dev Log — File Tree Explorer & Action Menus Clean Decomposition

**Date & Time:** 2026-10-15 09:22:00 WIB
**Author:** AI Agent (Antigravity)

## What
Mendekomposisi komponen pohon berkas `TreeNodeItem.tsx` yang sebelumnya berukuran 391 baris dan mengandung duplikasi menu aksi (dropdown yang persis sama antara file dan direktori) serta input inline rename ganda.
Dekomposisi dilakukan dengan mengekstrak:
1. `apps/web/src/components/workspace/TreeNodeActionMenu.tsx`: Komponen menu aksi terpusat untuk berkas maupun folder dengan opsi Rename / Edit, Ask AI to Analyze (khusus file), Copy Path (dengan notifikasi toast sonner), dan Delete Folder / Delete File.
2. `apps/web/src/components/workspace/TreeNodeRenameInput.tsx`: Komponen input rename inline dengan auto-focus, pre-selection nama berkas (tanpa ekstensi), serta penanganan tombol keyboard Enter (commit) dan Escape (cancel).
3. `apps/web/src/components/workspace/TreeNodeItem.tsx`: Direduksi dari 391 baris menjadi ~190 baris kode deklaratif murni tanpa duplikasi markup.
4. `apps/web/src/components/workspace/tree-utils.test.ts`: Test suite baru untuk pengujian unit `formatSize`, `buildTree`, dan `nativeToTreeNodes` dengan 6 pengujian passing 100%.

## Files Changed
- `apps/web/src/components/workspace/TreeNodeActionMenu.tsx` (baru)
- `apps/web/src/components/workspace/TreeNodeRenameInput.tsx` (baru)
- `apps/web/src/components/workspace/tree-utils.test.ts` (baru)
- `apps/web/src/components/workspace/TreeNodeItem.tsx` (refactor)
- `WORKFLOW.md` (update Phase 116 ke ✅ DONE)

## Tests
- `npm run build -w apps/web` — ✅ passed (0 errors, Vite production build 20.91s)
- `npx vitest run` — ✅ passed (33/33 tests passed across 5 test suites)

## Notes
- Fungsionalitas Explorer (klik file, expand folder, rename inline, copy path, delete, filter arunaki.json) 100% utuh tanpa regresi.
