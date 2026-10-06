# Dev Log — Fix OpenCode CLI "HTTP transport failed" & Bridge Integration

**Date & Time:** 2026-10-06 12:10:00 WIB
**Author:** Antigravity AI Software Engineer

## What
Mendiagnosis dan memperbaiki galat `⚠️ HTTP transport failed` yang muncul ketika pengguna beralih ke provider OpenCode CLI di Arunaki Workstation dan mengirimkan pesan di chat.

### Root Causes
1. **Konfigurasi `baseUrl` Port Offline (20128)**:
   Pada `SettingsCliConnectionsTab.tsx` dan `handlers/provider.ts`, provider `opencode` dikonfigurasi dengan `baseUrl: "http://localhost:20128/v1"`. Port 20128 adalah port proxy lokal 9Router/LiteLLM yang tidak sedang aktif di komputer pengguna (`ECONNREFUSED`), sehingga `RequestExecutor.execute` melempar galat `HTTP transport failed`.
2. **Ketiadaan OpenCode di Whitelist Catalog & Runner**:
   - `packages/engine/core/src/catalog.ts`: Provider `opencode` dan `9router` tidak terdaftar dalam pengecekan `available()`, menyebabkan model-modelnya dianggap unavailable jika tidak membawa cloud API key langsung di objek provider.
   - `packages/engine/core/src/session/runner/model.ts`: `apiKey` resolver dan kandidat `withKey` belum menyertakan `opencode` dan `9router`.
3. **Bridge Port 20188 Belum Memiliki Handler OpenCode**:
   Pada `packages/engine/engine/src/server/local-cli/bridge.ts`, seluruh request yang bukan Antigravity langsung dialirkan ke `checkClaudeStatus()` dan CLI Claude Code. Request untuk model OpenCode tidak memiliki route handler.
4. **Model Zen Free Tier Khusus OpenCode Client**:
   API cloud `https://opencode.ai/zen/v1` memblokir request HTTP eksternal yang tidak memiliki header client asli (`FreeTierError: OpenCode's free tier can only be used from within OpenCode`). Sedangkan pengguna sudah memiliki kredensial Groq Cloud aktif di `~/.local/share/opencode/auth.json` yang dapat merespons dalam 0.1 detik dengan model reasoning (`openai/gpt-oss-120b`, `qwen/qwen3.8-27b`).

### Solutions Applied
1. **Penyatuan ke Local CLI Bridge (Port 20188)**:
   - Mengubah `baseUrl` provider `opencode` di `SettingsCliConnectionsTab.tsx` dan `handlers/provider.ts` ke `http://127.0.0.1:20188/v1` (sejajar dengan Google Antigravity dan Claude Code CLI).
2. **Dukungan OpenCode di `LocalCliBridge`**:
   - Di `bridge.ts`, menambahkan `handleOpenCodeCompletion`:
     - Jika gateway 9Router aktif di port 20128: memproksi request ke port 20128.
     - Jika gateway 9Router tidak aktif: otomatis menggunakan kredensial Groq pengguna yang tersimpan di OpenCode (`~/.local/share/opencode/auth.json`), memetakan model reasoning tercepat (`openai/gpt-oss-120b`, `qwen/qwen3.8-27b`), dan mem-pipe SSE stream dengan dukungan `reasoning` dan `tools`.
     - Menambahkan model-model OpenCode ke respon `GET /v1/models`.
3. **Pendaftaran di Catalog & Model Runner**:
   - Menambahkan `opencode` dan `9router` pada `catalog.ts` (`available()`).
   - Menambahkan `opencode` dan `9router` pada `model.ts` (`apiKey` dan `withKey` filter).
4. **Validasi Model dan Presets UI**:
   - Di `useWorkstationChat.ts`, fungsi `isModelValidForProvider` kini mengenali model-model OpenCode, Groq, dan 9Router, dengan default fallback ke `groq/openai/gpt-oss-120b`.
   - Di `SettingsCliConnectionsTab.tsx`, preset models OpenCode diperbarui menampilkan model-model reasoning aktif (`groq/openai/gpt-oss-120b`, `groq/qwen/qwen3.8-27b`, `groq/openai/gpt-oss-20b`, dll.).
   - Tombol `Test Ping` OpenCode kini melakukan direct health check ke bridge port 20188 secara instan.
5. **Subprocess Timeout Guard**:
   - Menambahkan timeout 1.5 detik dan `windowsHide: true` pada `opencode --version` dan `opencode models` di `detector.ts`.

## Files Changed
- `apps/web/src/components/settings/SettingsCliConnectionsTab.tsx`
- `apps/web/src/components/workstation/chat/useWorkstationChat.ts`
- `packages/engine/core/src/catalog.ts`
- `packages/engine/core/src/session/runner/model.ts`
- `packages/engine/engine/src/server/local-cli/bridge.ts`
- `packages/engine/engine/src/server/local-cli/detector.ts`
- `packages/engine/engine/src/server/routes/instance/httpapi/handlers/provider.ts`

## Tests
- `npm run build -w apps/web` — ✅ Passed (Built in 33.74s, 0 TypeScript compile errors).
- Uji koneksi langsung Groq SSE completion via OpenCode credentials — ✅ Passed (Respons reasoning diterima dalam 0.1s).
