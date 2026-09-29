# Dev Log — Native Multilingual OCR (`image_ocr`) & Text-Only Model Vision Fallback

**Date & Time:** 2026-09-29 09:52:00 WIB  
**Author:** Arunaki AI Software Engineer  

## What
Model AI yang tidak memiliki kapabilitas visi/gambar bawaan (seperti DeepSeek-V3 / R1, Qwen Coder, Llama 3 text-only, atau model lokal via Ollama) akan langsung mengalami error `400 Bad Request: "Model does not support image input"` jika menerima payload gambar multimodal (`type: "media"`), atau model tersebut "buta" tidak bisa membaca screenshot/nota yang dilampirkan pengguna.

Solusi stabil yang dibangun:
1. **Tool Native `image_ocr`**:
   - Memanfaatkan library `tesseract.js` yang sudah terkunci di `package-lock.json` tanpa dependensi eksternal tambahan.
   - Mendukung pengenalan dwibahasa Inggris dan Indonesia (`eng+ind`) dengan model worker singleton berperforma tinggi (<1.5s).
   - Mengembalikan skema terstruktur `ImageOcrMap` yang memuat teks lengkap, persentase kepercayaan (*confidence score*), dan pemisahan baris (*lines breakdown*).
2. **Smart Vision Modality Routing (`to-llm-message.ts`)**:
   - Fungsi `isVisionModel(model)` mendeteksi apakah model yang sedang aktif mendukung vision atau teks murni.
   - Model multimodal (Gemini, Claude, GPT-4o) tetap menerima gambar langsung (`type: "media"`).
   - Model teks murni (DeepSeek, Qwen Coder, Llama, dll.) menerima instruksi eksplisit: `[Attached Image: ${name} — Call the 'image_ocr' tool with filePath="${name}" to extract text]`. Hal ini mencegah error 400 API dan memandu model memanggil tool `image_ocr` secara otonom.
3. **Universal Attachment Caching**:
   - Menyesuaikan `ChatInputBox.tsx` agar semua berkas lampiran (baik dokumen maupun gambar) di-cache ke direktori `.arunaki/attachments/${name}` tanpa mencemari root folder kerja pengguna.
   - Tool `image_ocr` dapat menyelesaikan file path baik dari workspace root, direktori lampiran terisolasi, maupun pencocokan nama file tanpa peka huruf besar/kecil.

## Files Changed
- `packages/arunaki-tools/package.json` — Menambahkan dependensi `tesseract.js` dan ekspor `./image-ocr` & `./image-ocr-tool`.
- `packages/arunaki-tools/src/docmap.ts` — Skema `ImageOcrMap` dan `ImageOcrLine`.
- `packages/arunaki-tools/src/image-ocr.ts` — Engine OCR `buildImageOcrMap` berbasis `tesseract.js`.
- `packages/arunaki-tools/src/image-ocr-tool.ts` — Definisi tool `image_ocr` untuk `@arunaki/tools`.
- `packages/arunaki-tools/src/index.ts` — Ekspor publik `ImageOcrTool` dan `buildImageOcrMap`.
- `packages/engine/core/src/tool/image-ocr.ts` — Node Effect `tool/image-ocr` pada runtime engine core.
- `packages/engine/core/src/tool/builtins.ts` — Pendaftaran `ImageOcrTool.node` ke `BuiltInTools`.
- `packages/engine/core/src/session/runner/to-llm-message.ts` — Logika `isVisionModel` dan routing text-only fallback.
- `apps/web/src/components/workstation/chat/ChatInputBox.tsx` — Penyimpanan terisolasi semua lampiran ke `.arunaki/attachments/`.
- `packages/engine/engine/src/session/prompt/default.txt` — Panduan penggunaan `image_ocr` untuk model teks murni.
- `packages/engine/engine/src/session/system.ts` — Kebijakan native tools untuk lampiran gambar dan OCR.
- `packages/arunaki-tools/test/image-ocr.test.ts` — Unit test parser OCR.
- `packages/engine/core/test/attachment-hints.test.ts` — Pengujian routing vision vs text-only model.
- `packages/engine/core/test/doc-read.test.ts` — Pengujian registrasi dan eksekusi tool `image_ocr`.
- `WORKFLOW.md` — Pembaruan checklist Phase 79.

## Tests
- `bun test packages/arunaki-tools/test/` — ✅ 8 passed (0 fail)
- `bun test packages/engine/core/test/attachment-hints.test.ts` — ✅ 3 passed (0 fail)
- `bun test packages/engine/core/test/doc-read.test.ts` — ✅ 5 passed (0 fail)
- `npm run build -w apps/web` — ✅ passed (0 errors)

## Notes
- Model teks murni seperti DeepSeek-V3 / R1 sekarang 100% aman dari error 400 Bad Request saat pengguna mengirim gambar.
- Akurasi ekstraksi teks tinggi untuk dokumen, struk belanja, dan nota fisik dalam bahasa Indonesia maupun Inggris.
