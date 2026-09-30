# Dev Log — Remove Unsupported reasoningEffort from HTTP Body Payload (Groq HTTP 400 Fix)

**Date & Time:** 2026-09-30 12:45:00 WIB  
**Author:** AI Software Engineer  

## What
1. **Analisis Error HTTP 400 pada Groq Cloud**:
   - Setelah perbaikan Phase 85, permintaan ke Groq sekarang **sukses dikirim langsung ke server Groq** (membuktikan setting provider Groq sudah aktif 100%).
   - Namun, server Groq mengembalikan status `HTTP 400: {"error":{"message":"property 'reasoningEffort' is unsupported","type":"invalid_request_error"}}`.
   - Pemeriksaan kode mengungkap bahwa di `packages/engine/core/src/session/runner/llm.ts` (baris 268) dan `model.ts` (baris 117), sistem menyuntikkan properti ganda:
     `reasoning_effort: reasoningEffort, reasoningEffort: reasoningEffort`.
   - Server Groq mengikuti skema OpenAI OpenAPI yang ketat dan secara eksplisit menolak field camelCase `reasoningEffort` yang tidak dikenal, sementara field snake_case resmi `reasoning_effort` diterima secara sukses.
2. **Solusi & Perbaikan**:
   - Menghapus `reasoningEffort` dari payload `http.body` di `packages/engine/core/src/session/runner/llm.ts` dan `packages/engine/core/src/session/runner/model.ts`.
   - Mempertahankan `reasoning_effort` sesuai standar OpenAI Chat Completions.
   - Menguji langsung ke API Groq dengan `qwen/qwen3.8-27b` dan `openai/gpt-oss-120b`: respons berstatus HTTP 200 SUCCESS.

## Files Changed
- `packages/engine/core/src/session/runner/llm.ts` — Menghapus camelCase `reasoningEffort` dari HTTP body.
- `packages/engine/core/src/session/runner/model.ts` — Menghapus camelCase `reasoningEffort` dari model draft.
- `WORKFLOW.md` — Menambahkan dokumentasi Phase 86.

## Tests
- Direct API Groq test:
  - `qwen/qwen3.8-27b` with `reasoning_effort: "high"` — ✅ SUCCESS!
  - `openai/gpt-oss-120b` with `reasoning_effort: "high"` — ✅ SUCCESS!
- `bun test packages/arunaki-tools/test/image-ocr.test.ts` — ✅ 3 passed
- `bun test packages/engine/core/test/doc-read.test.ts` — ✅ 5 passed
- `npm run build -w apps/web` — ✅ Passed in 43.19s (0 compilation errors)

## Notes
- Dengan perbaikan ini, pengguna dapat mengobrol dan menjalankan tugas dokumen dengan model Groq pilihan tanpa kendala HTTP 400.
