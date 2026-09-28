# Dev Log — I18n Spreadsheet & Canvas Viewer Localized Labels

**Date & Time:** 2026-09-28 15:30:00 WIB  
**Author:** AI Software Engineer  

## What
Memperbaiki bug lokalisasi/i18n di mana tampilan viewer dokumen Excel & tabel Canvas masih menampilkan teks bahasa Indonesia (seperti *"Buka di Excel"*, *"Salin CSV"*, *"Cari di sheet..."*, *"baris × kolom"*, *"Kosong"*, dan *"Buka di Canvas"*) meskipun preferensi bahasa di antarmuka aplikasi sedang diatur ke English (`EN English`):

1. **`apps/web/src/lib/i18n.ts`**:
   - Menambahkan kunci terjemahan lengkap untuk mode English (`translations.en`) dan Indonesian (`translations.id`):
     - `openInExcel`: "Open in Excel" / "Buka di Excel"
     - `openInExcelNative`: "Open in Microsoft Excel" / "Buka di Microsoft Excel"
     - `openInExcelTooltip`: Tooltip eksplisit pembukaan Excel desktop native.
     - `copyCsv` & `copiedCsv`: "Copy CSV" / "Copied" vs "Salin CSV" / "Disalin"
     - `copyCsvTooltip`: Tooltip penyalinan CSV.
     - `searchInSheet`: "Search in sheet..." / "Cari di sheet..."
     - `rowsLabel` & `colsLabel`: "rows" / "cols" vs "baris" / "kolom"
     - `emptyCell`: "Empty" / "Kosong"
     - `nonDestructiveEmbedTooltip`: Tooltip keamanan read-only in-memory format OOXML.
     - `spreadsheetBinaryNotice`: Pesan pemberitahuan berkas biner spreadsheet.
     - `sheetsLabel`: "Sheets:"
     - `openInCanvas`, `openInCanvasTooltip`, `tableOpenedInCanvas`, `dataTableLabel`.

2. **`apps/web/src/components/workstation/canvas/SpreadsheetViewer.tsx`**:
   - Menghubungkan hook `useI18n()` di root komponen (sebelum early returns, sesuai React Rules of Hooks).
   - Mengganti seluruh string hardcoded dengan `t(...)` dinamis: tombol Open in Excel, placeholder input pencarian sheet, tombol Copy CSV / Copied, label dimensi baris & kolom, formula bar cell empty state, dan multi-sheet tab labels.

3. **`apps/web/src/components/workstation/chat/ChatMessageContent.tsx`**:
   - Menghubungkan `useI18n()` untuk melokalisasi header card tabel interaktif di bubble chat (`t("dataTableLabel", ...)`, `t("openInCanvas", ...)`, toast sukses).

4. **`apps/web/src/components/workstation/canvas/canvas.ts`**:
   - Menyelaraskan judul fallback default tabel markdown ke bahasa Inggris standar ("Data Table" & "Table: ...").

## Files Changed
- `apps/web/src/lib/i18n.ts` — Menambahkan dictionary kunci translasi viewer spreadsheet & canvas.
- `apps/web/src/components/workstation/canvas/SpreadsheetViewer.tsx` — Migrasi seluruh teks statis UI viewer ke `t(...)`.
- `apps/web/src/components/workstation/chat/ChatMessageContent.tsx` — Migrasi teks tabel chat dan tombol canvas ke `t(...)`.
- `apps/web/src/components/workstation/canvas/canvas.ts` — Penyesuaian judul fallback tabel ke standar Inggris.

## Tests
- `npm run build -w apps/web` — ✅ passed (0 TypeScript compilation errors, Vite build succeeded in 25.23s)

## Notes
- Semua komponen mematuhi React Rules of Hooks tanpa deklarasi hook kondisional di bawah early returns.
