# Dev Log — Real CLI Detection & Native Terminal Launching

**Date & Time:** 2026-10-03 11:21:00 WIB
**Author:** AI Software Engineer (Pair Programming with User)

## What
1. **Audit Instalasi Komputer Nyata**:
   - Memeriksa langsung binary komputer pengguna via PowerShell (`Get-Command`, `npm list -g --depth=0`, `where.exe`).
   - Hasil audit:
     - `opencode-ai@1.18.30` : **Terinstall** di `C:\Users\AMD\AppData\Roaming\npm\opencode.ps1`.
     - `@anthropic-ai/claude-code@2.1.202` : **Terinstall** di `C:\Users\AMD\AppData\Roaming\npm\claude.ps1`.
     - `9router@0.5.35` : **Terinstall** di `C:\Users\AMD\AppData\Roaming\npm\9router.ps1`.
     - `Google Antigravity IDE` : **Terdeteksi** di `C:\Users\AMD\.gemini`.
     - `OpenAI Codex` : **Tidak terinstall sebagai binary CLI** karena OpenAI Codex / reasoning model (o3-mini, o1, gpt-4o) adalah keluarga model Cloud API, bukan program CLI lokal yang diinstall di Windows.
2. **Pendeteksian Otomatis Jujur & Cerdas (Smart Production Detection)**:
   - Menghapus semua hardcoded `installed: true` di frontend.
   - Menambahkan deteksi binary real-time untuk 9Router (`checkNineRouterStatus`), Codex (`checkCodexStatus`), Claude Code (`checkClaudeStatus`), dan OpenCode (`checkOpenCodeStatus`).
   - Setiap kartu kini menampilkan status deteksi yang akurat:
     - Jika terinstall: badge hijau/biru dengan versi (`● Installed (v1.18.30)` / `● Port Active`).
     - Jika belum terinstall: badge `○ Not Installed` disertai box perintah instalasi 1-klik copy (`npm i -g <package>`).
     - Untuk OpenAI Codex: badge `○ Cloud Model • Not a Local CLI` dengan penjelasan bahwa model o3-mini/gpt-4o menggunakan OpenAI API Key di tab AI Providers.
3. **One-Click Native Terminal Launching**:
   - Menambahkan tombol **"Start in Terminal"** pada kartu 9Router yang langsung mengeksekusi `cmd.exe /c start "9Router Local Gateway" cmd.exe /k "9router start"`.
   - Menambahkan tombol **"Open Terminal"** pada OpenCode yang membuka jendela terminal interaktif `opencode`.

## Files Changed
- `packages/engine/engine/src/server/local-cli/detector.ts` — Menambahkan deteksi binary 9router, implementasi `checkCodexStatus`, dan helper spawn terminal.
- `packages/engine/engine/src/server/routes/instance/httpapi/groups/provider.ts` — Skema `LocalCliStatus` & `LocalCliLoginInput` diperluas untuk 9router dan codex.
- `packages/engine/engine/src/server/routes/instance/httpapi/handlers/provider.ts` — Handler status & login mengeksekusi pendeteksian dan terminal launch target baru.
- `apps/web/src/components/settings/SettingsCliConnectionsTab.tsx` — UI kartu CLI dengan deteksi otomatis, instruksi install jika tidak terdeteksi, badge status cerdas, dan aksi terminal.

## Tests
- `npm run build -w apps/web` — ✅ Passed (Built in 19.37s with 0 errors).
- `9router --version` — ✅ 0.5.35
- `opencode --version` — ✅ 1.18.30
- `codex --version` — ❌ Not found (Sesuai kenyataan bahwa Codex bukan CLI lokal).
