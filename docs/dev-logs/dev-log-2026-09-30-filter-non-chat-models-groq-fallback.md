# Dev Log — Filter Non-Chat Models from Provider Catalogs & Groq Tool Precision

**Date & Time:** 2026-09-30 12:07:30 WIB  
**Author:** AI Software Engineer  

## What
1. **Investigasi Mengapa Groq Fallback ke DeepSeek**:
   - Pengguna mengonfirmasi bahwa di pengaturan sistem, Groq diset sebagai `✓ Primary Active`.
   - Pemeriksaan log & database menemukan bahwa Groq memang dipilih sebagai primary model dengan ID: `meta-llama/llama-prompt-guard-2-22m`.
   - Namun, model tersebut adalah **keamanan prompt guard (classifier)**, BUKAN model percakapan/chat, dan Groq API menolak pemanggilan tools dengan error: `tool calling is not supported with this model`.
   - Karena error tersebut, fitur **Automatic Fallback Routing** Arunaki secara otomatis mengalihkan tugas ke provider berikutnya yaitu **Kenari (`deepseek-v4-1-flash`)** agar sistem tidak crash.
2. **Filter Model Non-Chat pada Endpoint `fetchModels`**:
   - Menambahkan filter ketat pada `packages/engine/engine/src/server/routes/instance/httpapi/handlers/provider.ts` untuk membuang model-model audio (`whisper`), safety classifier (`prompt-guard`, `safeguard`), audio speech (`orpheus`), embedding, dan moderasi.
   - Hasil validasi langsung dengan Groq API: Katalog yang ditampilkan kini hanya model chat berkualitas tinggi yang terverifikasi mendukung tool-calling (`openai/gpt-oss-120b`, `qwen/qwen3.8-27b`, `openai/gpt-oss-20b`).
3. **Pembersihan Konfigurasi Katalog Groq di Workspace**:
   - Memperbarui `E:/REKAPAN/.arunaki/arunaki.json` agar model pool Groq langsung memuat model yang mendukung chat dan tool.

## Files Changed
- `packages/engine/engine/src/server/routes/instance/httpapi/handlers/provider.ts` — Filter model audio, safety, dan embedding dari respons fetchModels.
- `E:/REKAPAN/.arunaki/arunaki.json` — Sanitasi daftar model Groq ke model yang mendukung chat & tools.
- `WORKFLOW.md` — Menambahkan dokumentasi Phase 84.

## Tests
- Direct API Groq tool call test:
  - `openai/gpt-oss-120b` — ✅ Supports tools
  - `qwen/qwen3.8-27b` — ✅ Supports tools
  - `openai/gpt-oss-20b` — ✅ Supports tools
- `npm run build -w apps/web` — ✅ Passed in 20.26s (0 compilation errors)

## Notes
- Dengan perubahan ini, saat pengguna memilih Groq, sistem tidak akan pernah lagi memasukkan model prompt guard yang menyebabkan penolakan tool-calling.
