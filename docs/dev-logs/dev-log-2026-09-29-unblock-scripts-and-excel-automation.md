# Dev Log — Unblock Python & Shell Automation for Excel & Document Editing

**Date & Time:** 2026-09-29 19:14:00 WIB  
**Author:** Arunaki AI Software Engineer  

## What
Pengguna melaporkan kendala kritis di mana agen AI tidak mampu mengedit file Excel (`REKAP 9-2026.xlsx`) karena tool teks (`edit` / `apply_patch`) gagal pada file biner `.xlsx`, namun saat agen ingin menjalankan skrip Python untuk memperbarui file, eksekusi skrip diblokir oleh guardrail di `bash.ts` dan `shell.ts`. Akibatnya, agen menyerah dan meminta pengguna melakukan edit Excel secara manual, yang melanggar aturan utama *Minimal Typing, Maximum Automation*.

Langkah perbaikan yang dilakukan:
1. **Unblock Python & Shell Scripting**:
   - Menghapus pembatasan artifisial `isPythonOrScript` dari `packages/engine/core/src/tool/bash.ts` dan `packages/engine/engine/src/tool/shell.ts`.
   - Skrip Python, Node, atau Shell kini diizinkan berjalan bebas untuk mengotomasi tugas-tugas dokumen, modifikasi spreadsheet, dan perhitungan data.
2. **Empower Python Openpyxl for Excel Automation**:
   - Menyelaraskan prompt sistem pada `default.txt`, `system.ts`, dan `shell/prompt.ts` agar agen mengetahui bahwa untuk mengubah/memodifikasi file Excel `.xlsx`, cara utama adalah menulis dan mengeksekusi skrip Python menggunakan library `openpyxl` (yang sudah terpasang di sistem pengguna).
   - Melarang keras agen menyuruh pengguna mengedit Excel secara manual (*Zero Manual Burdens*).
3. **Pembaruan Test Suite**:
   - Memperbarui pengujian pada `packages/engine/core/test/tool-bash.test.ts` untuk memastikan perintah Python dan skrip dieksekusi tanpa pencegatan/pemblokiran.

## Files Changed
- `packages/engine/core/src/tool/bash.ts` — Menghapus blokir pemanggilan script Python.
- `packages/engine/engine/src/tool/shell.ts` — Menghapus blokir pemanggilan script Python pada shell tool.
- `packages/engine/core/test/tool-bash.test.ts` — Menyesuaikan pengujian unit eksekusi skrip Python bebas.
- `packages/engine/engine/src/session/prompt/default.txt` — Memperbarui pedoman automasi Excel via Python dan larangan meminta user mengedit manual.
- `packages/engine/engine/src/session/system.ts` — Menegaskan aturan modifikasi dokumen dan automasi Excel via `openpyxl`.
- `packages/engine/engine/src/tool/shell/prompt.ts` — Memperbarui instruksi edit Excel via Python openpyxl.
- `WORKFLOW.md` — Mencatat penyelesaian Phase 80.

## Tests
- `bun test packages/engine/core/test/tool-bash.test.ts` — ✅ 12 passed (0 fail)
- `bun test packages/engine/core/test/doc-read.test.ts` — ✅ 5 passed (0 fail)
- `npm run build -w apps/web` — ✅ passed (0 errors)

## Notes
- Agen sekarang bebas menggunakan `openpyxl` untuk memperbarui sel Excel, menambahkan baris baru, dan menghitung total tanpa halangan.
- Tidak akan ada lagi saran "update manual" ke pengguna untuk file Excel/dokumen.
