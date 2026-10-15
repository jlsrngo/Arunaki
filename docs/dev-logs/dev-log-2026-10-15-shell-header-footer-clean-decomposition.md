# Dev Log — Shell Header, Footer & Active Folder Clean Decomposition

**Date & Time:** 2026-10-15 09:17:00 WIB
**Author:** AI Agent (Antigravity)

## What
Mendekomposisi shell utama aplikasi `AppLayout.tsx` (yang sebelumnya berukuran 334 baris dan mencampuradukkan DOM header, quick theme switch, avatar modal, bilah footer status, dialog picker folder, dan network status) menjadi Clean Shell Orchestrator ramping (65 baris), dengan mengekstrak modul-modul berikut:
1. `apps/web/src/components/layout/hooks/useAppNetworkStatus.ts`: Hook status konektivitas online/offline dengan event listener window dan integrasi sonner toast.
2. `apps/web/src/components/layout/hooks/useActiveFolderSync.ts`: Hook isolasi folder aktif proyek, event bus `arunaki-folder-change`, Electron `pickFolder()` dialog, dan auto-sync background knowledge periodic & stale interval.
3. `apps/web/src/components/layout/AppHeader.tsx`: Komponen header aplikasi yang merangkum logo Arunaki, `TopMenuBar`, tombol quick theme toggle, dan avatar modal launcher.
4. `apps/web/src/components/layout/AppFooter.tsx`: Komponen footer shell yang merangkum badge folder aktif (dapat diklik untuk dialog ganti folder atau tombol close sandbox), bilah navigasi tab (Workstation, Knowledge, History, Settings), dan badge indikator konektivitas monokrom (Strict Monochrome & No-Emerald Rule).
5. `apps/web/src/components/layout/AppLayout.tsx`: Direduksi menjadi orchestrator murni 65 baris yang hanya menyusun `<AppHeader>`, `<main>`, `<AppFooter>`, dan `<GlobalShortcutsModal>`.

## Files Changed
- `apps/web/src/components/layout/hooks/useAppNetworkStatus.ts` (baru)
- `apps/web/src/components/layout/hooks/useActiveFolderSync.ts` (baru)
- `apps/web/src/components/layout/AppHeader.tsx` (baru)
- `apps/web/src/components/layout/AppFooter.tsx` (baru)
- `apps/web/src/components/layout/AppLayout.tsx` (refactor ramping)
- `WORKFLOW.md` (update status Phase 115 ke ✅ DONE)

## Tests
- `npm run build -w apps/web` — ✅ passed (0 compilation errors, Vite production build sukses 10.16s)
- `npx vitest run` — ✅ passed (27/27 tests passed across 4 test suites)

## Notes
- Semua aturan ketat arsitektur terpenuhi:
  - React Rules of Hooks: Semua hooks diletakkan di top level hooks masing-masing.
  - Strict Monochrome & No-Emerald Rule: Indikator WiFi dan status konektivitas menggunakan warna putih monokrom (`text-white`, `border-[var(--border-strong)]`).
  - Folder isolation guard dan session URL syncing tetap terjaga 100%.
