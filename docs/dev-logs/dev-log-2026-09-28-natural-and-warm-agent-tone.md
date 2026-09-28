# Dev Log — Natural, Warm & Communicative Agent Tone & Identity Protection

**Date & Time:** 2026-09-28 15:58:00 WIB  
**Author:** AI Software Engineer  

## What
1. Memperbaiki aturan nada bicara (*Tone and Style*) agent Arunaki agar berkomunikasi secara natural, hangat, ramah, dan komunikatif layaknya rekan kerja desktop office assistant, bukan robot terminal CLI yang kaku dan menjawab dingin satu kata ("Sudah. ✅"):
   - Menghapus aturan CLI ekstrem yang memaksa *"One word answers are best"*, *"You should NOT answer with unnecessary preamble or postamble (such as explaining your document or summarizing your action)"*, dan *"After working on a file, just stop, rather than providing an explanation of what you did"*.
   - Menggantinya dengan pedoman **Natural, Warm & Communicative**:
     - Berkomunikasi secara natural dan ramah dalam bahasa yang digunakan pengguna (Indonesia / Inggris).
     - Saat melakukan operasi file (menulis file, merekap pesanan, memformat dokumen), memberikan konfirmasi yang jelas dan bersahabat: menjelaskan apa yang telah dilakukan, menyebutkan nama file target, serta menyorot angka total/ringkasan penting.
     - Melarang jawaban satu kata yang dingin dan kaku tanpa konteks (seperti sekadar *"Done"* atau *"Yes"*).
     - Memperbarui contoh percakapan (*examples*) di prompt agar tetap bersih dalam bahasa Inggris universal, sederhana, tanpa menyebutkan file/data spesifik pengguna (seperti ORDER.txt atau yayasan), namun mencerminkan respons natural yang ramah dan solutif.

2. **Perlindungan Identitas Tunggal (*Strict Identity Guardrail*)**:
   - Memasang section `# Identity` di puncak prompt sistem (`default.txt`, `kimi.txt`, dan `agent.ts`) agar model selalu mengidentifikasi dirinya secara tegas sebagai **Arunaki** (Desktop Document & Data Agent).
   - Melarang keras membocorkan nama model dasar (*foundation model*) atau nama vendor upstream (seperti Agnes, Sapiens AI, Qwen, DeepSeek, OpenAI, dll.) ketika ditanya *"kamu siapa?"* atau *"who are you?"*.

## Files Changed
- `packages/engine/engine/src/session/prompt/default.txt` — Pembaruan aturan nada bicara, penambahan Identity protection, dan contoh percakapan natural berbahasa Inggris.
- `packages/engine/core/src/plugin/agent.ts` — Penambahan section Identity dan Communication & Tone pada BUILD_SYSTEM.
- `packages/engine/engine/src/session/prompt/kimi.txt` — Penyelarasan pedoman Identity & nada bicara asisten.
- `packages/engine/engine/src/session/system.ts` — Standarisasi contoh canvas ke bahasa Inggris.

## Tests
- `npm run build -w apps/web` — ✅ passed (0 TypeScript compilation errors, Vite build succeeded in 16.48s)

## Notes
- Dengan perubahan ini, seluruh system prompt tetap 100% berbahasa Inggris standar tanpa mencemari prompt dengan file spesifik lokal, sembari menjamin agent merespons secara natural, bersahabat, dan konsisten memegang identitas tunggal sebagai Arunaki.
