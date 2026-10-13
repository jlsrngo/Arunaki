# Dev Log — Audit & Fix: Settings Messaging Apps & User Account Tabs

**Date & Time:** 2026-10-13 19:40:00 WIB
**Author:** Antigravity (AI Software Engineer)

## What
Melakukan audit menyeluruh, verifikasi fungsional, dan perbaikan bug/best practice pada 2 menu pengaturan:
1. **Messaging Apps (Telegram BYOB Gateway)**:
   - **Root Cause Bug**: UI Web (`SettingsMessagingTab`) mengirim request ke `/api/messaging/config`, `/api/messaging/status`, dan `/api/messaging/test`. Di Electron desktop (IPC relay) dan engine, endpoint ini hanya didaftarkan di root `/messaging/*` (bukan `/api/messaging/*`), sehingga request dari desktop IPC relay jatuh ke UI catch-all router dan mengembalikan HTTP 500. Akibatnya, status bot yang sebenarnya aktif (`connected: true`, bot `@arunakibot`) dan konfigurasi tersimpan (`E:/REKAPAN`) gagal dimuat di UI dan selalu tampak kosong/inactive.
   - **Fix**:
     - Mendaftarkan group `messagingUi` pada Effect HttpApi (`/api/messaging/*`) di `packages/engine/engine/src/server/routes/instance/httpapi/groups/messaging.ts` dan handler-nya di `handlers/messaging.ts` serta `server.ts`.
     - Menambahkan rewrite defensive path di IPC relay Electron `apps/desktop/main.cjs`.
     - Menambahkan fallback otomatis di `apps/web/src/components/settings/SettingsMessagingTab.tsx` yang mencoba `/api/messaging/*` dan jika gagal fallback ke `/messaging/*`.
     - Menambahkan tombol native OS folder picker `Browse...` menggunakan `window.arunakiDesktop.pickFolder()` di samping "Use Active Workspace Folder".
2. **User Account & License**:
   - Memperbaiki ikon tombol Google dari generic `<Key>` menjadi logo SVG Google authentic monochrome yang selaras dengan GitHub SVG.
   - Memperbaiki leak state pada `handleLogout`: kini secara bersih menghapus `arunaki_user_name` dan `arunaki_user_avatar` di samping `arunaki_user_email` agar tidak bocor ke user berikutnya.
   - Menambahkan field "Full Name / Business Identity" saat mode Registrasi (`isRegisterMode`) dan validasi minimal panjang password (6 karakter).
   - Menghubungkan telemetry platform client secara dinamis (`isDesktop() ? Windows/macOS/Linux Desktop Workstation : Web Workstation Client`) bukan string hardcoded.
   - Mengubah klaim fiktif "Cloud Workspace Sync: Active" menjadi "Local Workspace Vault: AES-256 / Offline Isolated — Documents stay on this PC" (Active Offline) sesuai kepatuhan `BOUNDARIES.md`.

## Files Changed
- `packages/engine/engine/src/server/routes/instance/httpapi/groups/messaging.ts` — Menambahkan group `messagingUi` (`/api/messaging/*`).
- `packages/engine/engine/src/server/routes/instance/httpapi/handlers/messaging.ts` — Menambahkan `messagingUiHandlers`.
- `packages/engine/engine/src/server/routes/instance/httpapi/server.ts` — Mendaftarkan `messagingUiHandlers` ke `instanceApiRoutes`.
- `apps/desktop/main.cjs` — Menambahkan normalisasi `/api/messaging/` ke `/messaging/` pada IPC relay `engine:fetch`.
- `apps/web/src/components/settings/SettingsMessagingTab.tsx` — Menambahkan resilience endpoint fallback & tombol native browse folder.
- `apps/web/src/components/settings/SettingsAccountTab.tsx` — Clean logout, SVG authentic Google, register name, dynamic platform, and truthful offline vault status.

## Tests
- `bun test packages/engine/engine/test/messaging/telegram.test.ts` — ✅ 26 passed, 0 failed.
- `bunx tsgo --noEmit` (engine) — ✅ 0 error.
- `npm run build -w apps/web` — ✅ Built in 16.29s (0 error kompilasi).
- `npm run test:smoke` — ✅ All 8 provider checks passed (engine healthy).
