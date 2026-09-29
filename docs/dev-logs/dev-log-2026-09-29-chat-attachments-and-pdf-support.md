# Dev Log — Chat Attachment Isolation, Multi-Image Routing & Fast Native PDF Reader

**Date & Time:** 2026-09-29 09:17:00 WIB  
**Author:** Arunaki AI Software Engineer  

## What
Investigasi riwayat database SQLite (`Arunaki-local.db`) sesi `ses_f18c81e1fffe32evX1VVgFcHaw` mengungkap dua kendala utama:
1. **Multi-Image Paste Overwrite & Workspace Pollution**: Saat user melakukan *paste* beberapa gambar screenshot sekaligus dari clipboard, semuanya diberi nama `image.png` dan langsung disimpan ke root folder kerja (`desktop.writeFile(file.name, ...)`). Akibatnya gambar saling menimpa secara sekuensial sehingga hanya gambar terakhir yang tersisa, dan folder kerja pengguna menjadi terkotori oleh file lampiran sementara.
2. **PDF Read Failure & Manual Script Loop**: PDF yang diunggah diproses lewat tool `read` biasa yang hanya mendukung teks biasa, dan dokumen PDF tersebut berupa pindaian/gambar (*scanned*), menyebabkan model terjebak dalam perulangan eksekusi skrip Python manual (pip install pypdf/pytesseract dll.) yang lambat dan rentan gagal.

Solusi komprehensif yang diimplementasikan:
1. **Attachment Isolation**: Menghapus `desktop.writeFile` dari `ChatInputBox.tsx`. Gambar dipertahankan di memori (base64 data URL) tanpa disimpan ke disk (setara Antigravity/Cursor). File non-gambar di-cache di direktori terisolasi `.arunaki/attachments/${name}`.
2. **Sequential Multi-Image Naming**: Modul `attachmentUtils.ts` menamai paste clipboard secara sekuensial unik (`image.png`, `image_1.png`, `image_2.png`, dst.) agar seluruh gambar dapat diproses bersamaan.
3. **Multimodal Routing & PDF Hints**: `to-llm-message.ts` meneruskan semua gambar lampiran sebagai `type: "media"` parts ke model LLM dengan kemampuan visi, serta menyisipkan instruksi penggunaan `pdf_read` untuk file PDF lampiran.
4. **Native Fast `pdf_read` Tool**: Menambahkan pembaca PDF berbasis `pdf-parse` pada `@arunaki/tools` dan `packages/engine/core/src/tool/pdf-read.ts` dengan kecepatan <50ms, ekstraksi teks per halaman, deteksi dokumen pindaian (`isScanned: true`), serta integrasi ke tracker guardrail `doc-fallback.ts`.

## Files Changed
- `apps/web/src/components/workstation/chat/attachmentUtils.ts` — Fungsi pembantu penamaan sekuensial unik lampiran dan deteksi tipe gambar.
- `apps/web/src/components/workstation/chat/attachmentUtils.test.ts` — Unit test penamaan gambar dan deteksi tipe file.
- `apps/web/src/components/workstation/chat/ChatInputBox.tsx` — Isolasi penyimpanan lampiran dari root folder kerja user.
- `packages/engine/core/src/session/runner/to-llm-message.ts` — Routing media multimodal dan hint pemanggilan `pdf_read`.
- `packages/engine/core/test/attachment-hints.test.ts` — Unit test multimodal media dan hint PDF.
- `packages/engine/engine/src/session/prompt/default.txt` — Panduan prioritas penglihatan langsung multimodal gambar dan tool `pdf_read`.
- `packages/engine/engine/src/session/system.ts` — Instruksi sistem multimodal dan tool dokumen native.
- `packages/arunaki-tools/src/docmap.ts` — Skema interface `PdfMap` dan `PdfPage`.
- `packages/arunaki-tools/src/pdf-map.ts` — Ekstraktor struktur PDF berbasis `pdf-parse`.
- `packages/arunaki-tools/src/pdf-read.ts` — Definisi tool `pdf_read` untuk `@arunaki/tools`.
- `packages/arunaki-tools/src/index.ts` — Re-ekspor `pdf-map` dan `pdf-read`.
- `packages/arunaki-tools/package.json` — Ekspor submodule `./pdf-map`.
- `packages/arunaki-tools/test/pdf-read.test.ts` — Unit test ekstraksi PDF.
- `packages/arunaki-tools/test/doc-read.test.ts` — E2E test tool pembaca dokumen (Excel, Word, PDF).
- `packages/engine/core/src/tool/pdf-read.ts` — Registrasi Effect node `tool/pdf-read` ke built-in tools engine.
- `packages/engine/core/src/tool/builtins.ts` — Pendaftaran `PdfReadTool.node`.
- `packages/engine/core/src/tool/bash.ts` & `packages/engine/engine/src/tool/shell/prompt.ts` — Prioritas native tool sebelum eksekusi shell.
- `packages/engine/core/test/doc-read.test.ts` — Pengujian registrasi dan eksekusi `pdf_read` pada runtime engine.
- `WORKFLOW.md` — Pembaruan checklist Phase 78.

## Tests
- `bun test apps/web/src/components/workstation/chat/attachmentUtils.test.ts` — ✅ 4 passed (0 fail)
- `bun test packages/engine/core/test/attachment-hints.test.ts` — ✅ 2 passed (0 fail)
- `bun test packages/arunaki-tools/test/` — ✅ 5 passed (0 fail)
- `bun test packages/engine/core/test/doc-read.test.ts` — ✅ 4 passed (0 fail)
- `npm run build -w apps/web` — ✅ passed (0 errors)

## Notes
- Tidak ada file sampah yang masuk ke root workspace saat user mengunggah atau menempelkan gambar di chat.
- Model vision LLM sekarang menerima seluruh gambar secara langsung (`type: "media"`), sehingga mampu membaca rekap stok/tabel dari multi-halaman screenshot tanpa saling menimpa.
- PDF yang bukan pindaian dapat dibaca instan (<50ms). Jika PDF berupa scan gambar tanpa teks, field `isScanned: true` memberitahu model untuk menggunakan vision atau fallback OCR.
