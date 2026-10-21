# Dev Log — Application Performance & Bundle Size Optimization (Phase 121)

**Date & Time:** 2026-10-21 09:07:30 WIB
**Author:** Antigravity (AG)

## What
Mengoptimalkan ukuran bundle dan performa runtime aplikasi Arunaki di branch bersih `perf/app-lightweight` (dibuat langsung dari `main`):
1. **Hapus `country-state-city` (8,7 MB) -> Hybrid Location Autocomplete (~4 KB):** Membuat `locations.ts` berisi daftar 38 Provinsi Indonesia, Kota/Kabupaten utama Indonesia, dan Kota utama dunia (~4 KB) ditambah fallback pencarian *on-demand* ke Open-Meteo Geocoding API tanpa API key.
2. **Code-Splitting Halaman & Komponen Berat:** Menggunakan `React.lazy()` + `<Suspense>` di `AppLayout.tsx` (`KnowledgePage`, `HistoryPage`, `SettingsPage`) dan `WorkstationCenterPanel.tsx` (`SpreadsheetViewer`), serta memisahkan `vendor-xlsx`, `vendor-xyflow`, dan `vendor-markdown` di `vite.config.ts`. Menurunkan main entry bundle dari **1.349 KB** menjadi **505 KB** (148 KB gzip) dan menghapus chunk **8.716 KB**.
3. **Hentikan Polling Buta 2,5 Detik Saat Idle:** Mengganti `refetchInterval: 2500` di `useWorkstationChat.ts` dengan `refetchOnWindowFocus: true` karena event SSE (`subscribeEvents`) sudah aktif secara real-time.
4. **Optimasi Query History:** Mengurangi parameter query pesan per sesi di `useHistorySessions.ts` dari `limit=200` menjadi `limit=10`.
5. **Paralelisasi Pembacaan Pohon Folder & Background Throttling Electron:** Mengubah loop sekuensial `await fs.stat()` di `fs:getFolderTree` (`apps/desktop/main.cjs`) menjadi `Promise.all()` paralel per direktori serta mengaktifkan `backgroundThrottling: true`.
6. **Optimasi Timer Re-render Streaming & Kepatuhan Monokrom:** Menggabungkan timer `liveElapsedSec` antara `ChatMessageBubble.tsx` dan `MessageThoughtBadge`, mengganti `setInterval` 400ms di `LiveActionIndicator` dengan animasi CSS `animate-pulse`, serta membersihkan sisa kelas `text-emerald-400` di `LiveExecutionBadge.tsx`.

## Files Changed
- `apps/web/package.json` — menghapus dependency `country-state-city`
- `apps/web/src/components/knowledge/locations.ts` — katalog lokasi lokal (38 provinsi & kota Indonesia + dunia) dan fungsi pencarian hybrid Open-Meteo Geocoding
- `apps/web/src/components/knowledge/locations.test.ts` — unit test untuk katalog lokasi dan prioritas filter
- `apps/web/src/components/knowledge/KnowledgeNodePanel.tsx` — menggunakan `filterLocalLocations` & `searchRemoteLocations`
- `apps/web/src/components/layout/AppLayout.tsx` — lazy-loading untuk `KnowledgePage`, `HistoryPage`, dan `SettingsPage`
- `apps/web/src/App.tsx` — menunda `refreshModelCatalog()` 3 detik setelah startup dan menghapus duplikasi import/sync awal
- `apps/web/src/components/workstation/WorkstationCenterPanel.tsx` — lazy-loading `SpreadsheetViewer`
- `apps/web/vite.config.ts` — memisahkan manualChunks `vendor-xlsx`, `vendor-xyflow`, dan `vendor-markdown`
- `apps/web/src/components/workstation/chat/useWorkstationChat.ts` — menghentikan polling 2,5 detik saat idle
- `apps/web/src/components/history/hooks/useHistorySessions.ts` — menurunkan `limit=200` menjadi `limit=10`
- `apps/web/src/components/workstation/LiveExecutionBadge.tsx` — menghapus interval 400ms, berbagi `liveElapsedSec`, dan mematuhi aturan monokrom
- `apps/web/src/components/workstation/chat/ChatMessageBubble.tsx` — meneruskan `liveElapsedSec` ke `MessageThoughtBadge`
- `apps/desktop/main.cjs` — paralelisasi `buildTree` dengan `Promise.all` dan `backgroundThrottling: true`
- `WORKFLOW.md` — menambahkan dan menandai Phase 121 selesai (`✅ DONE`)

## Tests
- `npm run build -w apps/web` — ✅ passed (0 TypeScript errors, built in 9.76s)
- `npx vitest run` (in `apps/web`) — ✅ passed (10/10 test suites, 47/47 tests)

## Notes
- Ukuran aset di `apps/web/dist` dan `apps/desktop/web` telah berkurang lebih dari 9 MB secara total.
