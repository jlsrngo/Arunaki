# Dev Log — Remove Quota Tracker

**Date & Time:** 2026-10-05 18:31:00 WIB
**Author:** AI Software Engineer

## What
Atas permintaan user, seluruh fitur quota tracker (UI + kode) dihapus. Alasan: angka tidak bisa dijamin berasal dari akun yang terhubung ke Arunaki, bergantung pada Language Server Antigravity IDE yang sedang berjalan, dan sebagian masih memakai fallback hardcode.

- Dihapus tombol "..." (Models & Quota Details) pada kartu Claude, Codex, OpenCode, Antigravity, 9Router.
- Dihapus modal "Models & Usage", `CircularQuotaRing`, state/handler kuota & overages.
- Dihapus `CliQuotaInfo`, `getCliQuota`, `fetchLiveAntigravityQuota`, `queryQuotaRpc`, `formatLiveQuota` di engine.
- Dihapus endpoint bridge `GET /v1/quota` dan `/quota`.
- Handler HTTP bridge dikembalikan ke non-async (tidak lagi perlu `await`).

## Files Changed
- `apps/web/src/components/settings/SettingsCliConnectionsTab.tsx` — hapus UI & logika kuota, import `MoreHorizontal`/`Info`.
- `packages/engine/engine/src/server/local-cli/detector.ts` — hapus kode kuota.
- `packages/engine/engine/src/server/local-cli/bridge.ts` — hapus endpoint kuota & import `getCliQuota`.

## Tests
- `npm run build -w apps/web` — ✅ passed
- `npx tsc --noEmit -p packages/engine/engine` — error di `routes/instance/httpapi/handlers/provider.ts(624)` (bukan file yang diubah; tidak ada error di `local-cli/`).

## Notes
- Dev-log lama `dev-log-2026-10-05-bilingual-auth-and-quota-telemetry.md` dan `...monochrome-quota-modal.md` dibiarkan sebagai riwayat.
- Terjemahan bilingual modal auth tetap dipertahankan.
