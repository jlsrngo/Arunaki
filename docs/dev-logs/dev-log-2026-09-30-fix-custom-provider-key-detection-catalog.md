# Dev Log — Fix Custom Provider API Key Detection in Catalog & Model Runner

**Date & Time:** 2026-09-30 12:36:45 WIB  
**Author:** AI Software Engineer  

## What
1. **Analisis Masalah "Setting Provider Groq Tidak Berfungsi"**:
   - Pengguna mendapati bahwa meskipun Groq Cloud telah dipilih sebagai `Primary Active` dengan model `qwen/qwen3.8-27b`, eksekusi dokumen tetap jatuh ke Kenari (`deepseek-v4-1-flash`).
   - Penyelidikan kode mendalam mengungkap bug kritis pada `packages/engine/core/src/catalog.ts`:
     - Fungsi `CatalogV2.provider.available()` sebelumnya hanya memeriksa `provider.request.body.apiKey`.
     - Namun pada provider kustom yang dimigrasi dari UI settings (`ConfigProviderV1` -> V2 via `migrateProvider`), API key disimpan di `provider.api.settings.apiKey`.
     - Akibatnya, `available()` selalu mengembalikan `false` untuk Groq, sehingga Groq disaring keluar dari daftar provider aktif di katalog.
   - Bug kedua ada pada `packages/engine/core/src/session/runner/model.ts`:
     - Filter `withKey` hanya memeriksa `m.request.body.apiKey` atau `m.providerID === 'kenari'`.
     - Model Groq tidak memiliki key di `request.body` (melainkan di `api.settings`), sehingga diabaikan dan langsung jatuh ke fallback Kenari.
2. **Solusi & Perbaikan**:
   - Memperbarui `catalog.ts`: `available()` sekarang mengecek `provider.request.body.apiKey ?? provider.api?.settings?.apiKey`.
   - Memperbarui `model.ts`: `withKey` sekarang mengecek `m.request.body.apiKey ?? m.api.settings?.apiKey`.

## Files Changed
- `packages/engine/core/src/catalog.ts` — Dukungan `settings.apiKey` pada `available()`.
- `packages/engine/core/src/session/runner/model.ts` — Dukungan `settings.apiKey` pada filter `withKey`.
- `WORKFLOW.md` — Menambahkan dokumentasi Phase 85.

## Tests
- `bun test packages/arunaki-tools/test/image-ocr.test.ts` — ✅ 3 passed
- `bun test packages/engine/core/test/doc-read.test.ts` — ✅ 5 passed
- `npm run build -w apps/web` — ✅ Passed in 24.20s (0 compilation errors)

## Notes
- Dengan perbaikan ini, provider apa pun yang dikonfigurasi melalui Workstation System Settings (Groq, OpenAI, Anthropic, Together, Ollama) akan langsung terdaftar sebagai aktif dan dieksekusi secara nyata tanpa fallback paksa ke Kenari.
