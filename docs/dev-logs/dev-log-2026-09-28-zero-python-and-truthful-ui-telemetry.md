# Dev Log — Enforce Zero Python Scripting & Truthful UI Telemetry

**Date & Time:** 2026-09-28 12:21:00 WIB
**Author:** AI Pair Engineer (Antigravity)

## What
1. **Investigasi Mendalam Log & Kasus "cek stoknya ini"**:
   - Dari tangkapan layar pengguna dan penelusuran log SQLite pada `Arunaki-local.db` (session `ses_f27ccafdaffeDOGKd4MrsV0GSd`, sequence 3636-3710), ditemukan bahwa:
     a. Saat pengguna mengirim lampiran `data PEGAWAI.xlsx` dengan teks `"cek stoknya ini"`, model pada awalnya mencoba membaca file dengan inline Python:
        `python -c "from openpyxl import load_workbook; ..."`
     b. Guardrail backend sebenarnya **berhasil mencegat dan menggagalkan** perintah ini dengan pesan:
        `Execution blocked: Shell/Python commands for reading or inspecting office documents are disabled. You MUST invoke native document tools instead...`
     c. Namun, di UI frontend (`LiveExecutionBadge.tsx` dan `mapper.ts`), status error/failed **dipaksa dianggap completed** dan dirender dengan icon centang hijau:
        `✓ Executed python -c "from ope... done`
        Hal ini menciptakan ilusi visual bahwa perintah Python dieksekusi dengan sukses.
     d. Setelah dicegat, model beralih menggunakan tool native `excel_read`:
        `✓ Explored Excel data PEGAWAI... done`
     e. Namun setelah `excel_read` mengembalikan data, model ingin menghitung jumlah stok per ukuran (M, L, XL, dst). Karena model tidak dilarang menggunakan Python sebagai kalkulator, model memanggil shell berulang kali:
        `python -c "from collections import Counter; s = ['XXL', 'L'...]"`
        Pola ini lolos karena guardrail lama hanya memeriksa string `openpyxl`/`docx`/`.xlsx`, bukan pemanggilan Python itu sendiri.

2. **Perbaikan Menyeluruh Sesuai Boundaries Arunaki**:
   - **Pemblokiran Total Python di Shell (`bash.ts` & `shell.ts`)**:
     Sesuai dokumen `AGENTS.md` dan `docs/BOUNDARIES.md` (Arunaki adalah Document Agent, bukan Script Runner / IDE), semua eksekusi `python`, `python3`, `py`, `pip`, `pip3` kini diblokir total di tingkat shell. Agent diarahkan untuk:
     - Membaca dokumen dengan native tools (`excel_read`, `word_read`, `ppt_read`).
     - Melakukan perhitungan matematika, counting (penghitungan stok), agregasi, dan rekap **langsung di dalam internal reasoning tokens (`<think>...</think>`)** tanpa memanggil script.
   - **Sinkronisasi Prompt Inti**:
     - `packages/engine/core/src/plugin/agent.ts`: Menghapus instruksi lama yang mengizinkan script kalkulasi di scratch. Menggantinya dengan aturan tegas "ZERO SCRIPT & REASONING-FIRST MATH".
     - `packages/engine/engine/src/session/prompt/default.txt`: Menegaskan larangan Python dan perintah agar semua kalkulasi dilakukan di reasoning.
     - `packages/engine/engine/src/session/system.ts`: Menghapus panduan naming Python script dan menetapkan kebijakan zero python.
     - `packages/engine/engine/src/tool/shell/prompt.ts`: Menambahkan larangan script kalkulasi pada semua varian prompt shell.
   - **Truthful UI Telemetry (`LiveExecutionBadge.tsx` & `mapper.ts`)**:
     - Memperbaiki parsing status tool di `mapper.ts`: state error/blocked dipetakan secara akurat ke status `"failed"`.
     - Memperbaiki badge di `LiveExecutionBadge.tsx`: tool yang gagal/diblokir kini menampilkan ikon silang merah `<X />`, teks coret, dan badge `"blocked"`, bukan centang hijau dengan teks `"done"`.

## Files Changed
- `packages/engine/core/src/tool/bash.ts` — Memblokir semua eksekusi python/scripting dan memperbarui deskripsi tool.
- `packages/engine/engine/src/tool/shell.ts` — Memblokir semua eksekusi python/scripting pada V1 engine.
- `packages/engine/core/src/plugin/agent.ts` — Menghapus izin script kalkulasi scratch dan menegaskan zero script policy.
- `packages/engine/engine/src/session/prompt/default.txt` — Menyelaraskan aturan larangan python dan counting di reasoning.
- `packages/engine/engine/src/session/system.ts` — Menghapus petunjuk python scratch script.
- `packages/engine/engine/src/tool/shell/prompt.ts` — Menambahkan larangan script kalkulasi pada shell tool prompt.
- `apps/web/src/components/workstation/LiveExecutionBadge.tsx` — Menampilkan ikon X merah dan status `blocked` secara jujur untuk tool yang gagal.
- `apps/web/src/components/workstation/chat/mapper.ts` — Memetakan tool state error/blocked ke status `failed`.
- `packages/engine/core/test/tool-bash.test.ts` — Memperbarui unit test untuk memverifikasi pemblokiran total python.

## Tests
- `bun test packages/engine/core/test/tool-bash.test.ts` — ✅ 11 pass, 0 fail
- `bun test packages/engine/core/test/doc-read.test.ts` — ✅ 3 pass, 0 fail
- `npm run build -w apps/web` — ✅ 0 errors, build production sukses dalam 33.11s

## Notes
Restart server dev (`Ctrl + C` lalu `npm run dev:app`) agar backend dan frontend memuat proteksi terbaru.
