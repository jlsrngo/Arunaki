# Dev Log — Image Guard, Fallback Circuit Breaker & Antigravity Token Refresh Fix

**Date & Time:** 2026-10-16 17:38:00 WIB
**Author:** Antigravity AI Assistant

## What
1. **Vision Guard on Fallback (`hasImage`)**:
   - Mencegah request multimodal/gambar jatuh ke provider non-vision (Kiro/Bedrock) saat Antigravity gagal atau unavailable, yang sebelumnya memicu error `400 IMAGE_FORMAT_UNSUPPORTED`.
   - Mengembalikan response `503 no_vision_provider` yang ramah pengguna apabila tidak ada vision provider yang aktif.
2. **Circuit Breaker on Provider Exhaustion**:
   - Mengatasi masalah looping retry 7x saat Groq atau provider lain gagal.
   - Menghentikan fallback loop ketika seluruh provider habis (`all_providers_exhausted`) dan mengembalikan status 503 dengan pesan diagnosis jelas alih-alih infinite retry atau 500 error mentah.
3. **Antigravity Proactive Token Auto-Refresh & Expired Token Gap**:
   - Memperbaiki bug di `detector.ts` di mana token Google Antigravity yang telah kedaluwarsa di `~/.gemini/oauth_creds.json` dikembalikan secara mentah (`401 Unauthorized`) jika tidak ada OAuth client credential eksplisit.
   - Menambahkan mekanisme fallback otomatis via `refreshAntigravityCredentialViaAgy()` sebelum menyerah.
   - Menambahkan `antigravity: 600_000` (lead time 10 menit sebelum kedaluwarsa) pada `REFRESH_LEAD_MS` di `refresh.ts` agar background token refresher otomatis memperbarui token Google Antigravity sebelum masa berlakunya habis.

## Files Changed
- `packages/engine/engine/src/server/local-cli/bridge.ts` — Added `hasImage` guard for Kiro fallback & circuit breaker with clear error on provider exhaustion.
- `packages/engine/engine/src/server/local-cli/detector.ts` — Fallback to `refreshAntigravityCredentialViaAgy()` when oauth token expired without explicit client configured.
- `packages/engine/engine/src/server/local-cli/refresh.ts` — Added `antigravity` (10m lead) to `REFRESH_LEAD_MS`.

## Tests
- `bun run scripts/smoke-local-cli.ts` — ✅ `Antigravity text` (2965ms) & `Antigravity tool` (2856ms) passed live.
- `npm run build -w apps/web` — ✅ Built in 42.82s, 0 TypeScript / compilation errors.
