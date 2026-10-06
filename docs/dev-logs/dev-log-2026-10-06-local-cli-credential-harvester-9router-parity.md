# Dev Log — Local CLI Credential Harvester & 9Router Parity

**Date & Time:** 2026-10-06 16:55:00 WIB  
**Author:** Antigravity AI Pair Programmer  
**Phase:** Phase 105 (Local CLI Credential Harvester & 9Router Parity)

## What
Menerapkan arsitektur 9Router secara 1:1 pada layer koneksi CLI lokal Arunaki untuk memanen akun subscription dan kredensial aktif dari disk, menerapkan 3-tier token refreshing, streaming upstream langsung ke API resmi vendor tanpa latensi subprocess `claude -p`, mendukung translasi `tools` / `tool_calls` secara penuh, dan menyediakan tombol 1-klik untuk menginjeksi konfigurasi CLI lokal.

1. **Credential Harvester & Store (`credential-store.ts`, `harvester.ts`)**:
   - Membaca disk caches: OpenAI Codex (`~/.codex/auth.json`), Claude Code (`~/.claude/.credentials.json` dan `settings.json`), AWS Kiro AI (`~/.aws/sso/cache/*.json`), Cursor IDE (`state.vscdb` dibaca menggunakan `bun:sqlite` readonly ItemTable).
   - Menyimpan status dan token rotasi pada state internal Arunaki `~/.arunaki/local-cli-credentials.json` tanpa pernah memodifikasi file konfigurasi user.
2. **Token Refresh Module (`refresh.ts`)**:
   - Single-flight lock per akun provider untuk mencegah burst concurrent request.
   - 3 Lapis Refresh: Proaktif (lead time check sebelum request), Background (interval 5 menit dengan jitter), dan Reaktif (auto-refresh saat 401/403 dengan token rotasi).
3. **Upstream Direct Executors (`upstream.ts`)**:
   - ChatGPT Responses API di `https://chatgpt.com/backend-api/codex/responses` dengan `ChatGPT-Account-ID`, `originator: codex_cli_rs`, dan session isolation.
   - Anthropic Messages API di `https://api.anthropic.com/v1/messages?beta=true` dengan header `Anthropic-Beta` lengkap dan `Authorization: Bearer <token>` atau `x-api-key`.
4. **Full Two-Way Translator (`translator.ts`)**:
   - Pemetaan utuh OpenAI Chat ⇄ Anthropic Messages dengan preserve `tools`, `tool_choice`, `assistant.tool_calls` → `tool_use`, dan pesan respon `role: "tool"` → user turn dengan `tool_result` + `tool_use_id`.
   - Streaming parser Anthropic SSE ke OpenAI completion chunk beserta `finish_reason: "tool_calls"` dan token usage.
5. **Fast-Path Routing & Pre-Flight Fallback (`bridge.ts`)**:
   - Menyisipkan fast-path untuk OpenAI-family (`gpt-*`, `o1/o3`, `codex`) dan Claude CLI sebelum spawning subprocess.
   - Mematuhi aturan pre-flight fallback: fallback ke rantai lama (`claude -p` / daemon / 9Router port 20128) HANYA terjadi sebelum `res.writeHead` dipanggil.
6. **Safe 1-Click CLI Config Auto-Injector (`injector.ts`)**:
   - Injeksi aman `~/.claude/settings.json` (JSONC-tolerant parser dengan fallback abort bila parse rusak, dan auto-backup `.bak-9router`).
   - Injeksi aman `~/.codex/config.toml` (menambahkan root `model_provider = "arunaki"` dan section `[model_providers.arunaki]`).
   - Reset handler untuk mengembalikan konfigurasi ke kondisi semula.
7. **HTTP API Handlers & UI Badges (`groups/provider.ts`, `handlers/provider.ts`, `SettingsCliConnectionsTab.tsx`)**:
   - Endpoint `localCliDiscovered`: mengembalikan metadata credential non-sensitif (token rahasia tidak pernah diekspos ke browser).
   - Endpoint `localCliRefresh`: manual trigger refresh.
   - Endpoint `localCliInject`: 1-klik injeksi / reset konfigurasi CLI.
   - UI: Badge `"Auto-Imported · Ready"` disertai sisa masa berlaku token (`Expires in Xh/Xm`), tombol `"Refresh now"` dan `"Auto-Configure CLI"`, serta banner status ringkasan cache.

## Files Changed
- `packages/engine/engine/src/server/local-cli/credential-store.ts` (created) — isolasi penyimpanan kredensial lokal
- `packages/engine/engine/src/server/local-cli/harvester.ts` (created) — scanner kredensial disk Codex, Claude, Kiro, Cursor
- `packages/engine/engine/src/server/local-cli/refresh.ts` (created) — 3-tier single-flight token refresh
- `packages/engine/engine/src/server/local-cli/upstream.ts` (created) — per-provider direct HTTP streaming executor
- `packages/engine/engine/src/server/local-cli/translator.ts` (created) — dua arah format & tool-calling translator
- `packages/engine/engine/src/server/local-cli/bridge.ts` (modified) — fast-path routing dengan pre-flight fallback
- `packages/engine/engine/src/server/local-cli/injector.ts` (created) — safe 1-click config injection dengan backup
- `packages/engine/engine/src/server/routes/instance/httpapi/groups/provider.ts` (modified) — schema & route definition
- `packages/engine/engine/src/server/routes/instance/httpapi/handlers/provider.ts` (modified) — Effect API handlers
- `apps/web/src/components/settings/SettingsCliConnectionsTab.tsx` (modified) — UI badges, countdown, refresh & injector buttons
- `packages/engine/engine/test/harvester.test.ts` (created) — 6 unit tests
- `packages/engine/engine/test/refresh.test.ts` (created) — 3 unit tests
- `packages/engine/engine/test/upstream.test.ts` (created) — 5 unit tests
- `packages/engine/engine/test/translator.test.ts` (created) — 3 unit tests
- `packages/engine/engine/test/fastpath.test.ts` (created) — 2 unit tests
- `packages/engine/engine/test/injector.test.ts` (created) — 4 unit tests
- `WORKFLOW.md` (modified) — Phase 105 marked DONE

## Tests
- `bun test test/harvester.test.ts test/refresh.test.ts test/upstream.test.ts test/translator.test.ts test/fastpath.test.ts test/injector.test.ts`: ✅ 23 passed, 0 failed (4.53s)
- `bun -e "import('./packages/engine/engine/src/server/local-cli/harvester.ts').then(m => m.scanLocalCredentials())..."`: ✅ Discovered live Codex & Claude OAuth credentials from host machine
- `npm run build -w apps/web`: ✅ Passed (29.96s) with 0 TypeScript compilation errors

## Notes
- Kredensial rahasia (access token, refresh token) disimpan hanya di server lokal (`~/.arunaki/local-cli-credentials.json`) dan tidak pernah dikirim ke web frontend.
- Provider binary (Kiro EventStream, Cursor protobuf) tidak dimasukkan ke fast-path direct melainkan diteruskan ke rantai 9Router port 20128 sesuai arsitektur acuan.
