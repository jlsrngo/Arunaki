# Dev Log — Provider ON/OFF Switch & CLI Route Diversion

**Date & Time:** 2026-10-03 13:38:00 WIB
**Author:** AI Software Engineer

## What
Menambahkan tombol sakelar ON / OFF pada kartu provider di tab "Language Model Routing & Provider Catalogs" agar pengguna dapat mematikan API provider cloud dan mengalihkan seluruh rute pemrosesan AI dokumen ke CLI / Local Agent:
1. **Sakelar ON / OFF pada ProviderCard**:
   - Mengganti tombol statis `Primary Active / Set Primary` dengan sakelar toggle ON/OFF interaktif modern (lengkap dengan track dan thumb toggle).
   - Saat status **ON**: Menampilkan switch aktif `ON | Primary`.
   - Saat status **OFF**: Menampilkan switch tidak aktif `OFF`.
2. **Logika Pengalihan Otomatis ke CLI**:
   - Jika pengguna mematikan (`OFF`) provider yang sedang aktif, provider dinonaktifkan di backend (`active: false`), dan `arunaki_active_provider` secara otomatis dialihkan ke CLI target yang tersedia (misal `claude-code`, `codex`, `gemini`, `opencode`, atau `9router`).
   - Notifikasi toast memberikan konfirmasi jelas bahwa rute dialihkan ke CLI.
3. **Banner Indikator Rute CLI**:
   - Menampilkan banner status di atas daftar provider saat rute obrolan sedang dialihkan ke CLI, memberitahukan pengguna bahwa mereka sedang menggunakan CLI dan cukup menyalakan (ON) salah satu provider untuk kembali ke cloud API.
4. **Sinkronisasi Status Chat & Settings**:
   - Memperbaiki `SettingsPage.tsx` dan `useWorkstationChat.ts` agar status provider aktif di obrolan mencerminkan nama CLI yang sedang aktif tanpa dipaksa kembali ke Kenari saat API provider dimatikan.

## Files Changed
- `apps/web/src/components/settings/ProviderCard.tsx` — Menambahkan tombol sakelar toggle ON/OFF.
- `apps/web/src/components/settings/ModelProviderSettings.tsx` — Menangani logika toggle ON/OFF, pengalihan rute ke CLI, dan banner informasi rute CLI aktif.
- `apps/web/src/pages/SettingsPage.tsx` — Menyesuaikan penentuan `activeId` saat rute berada pada provider CLI.
- `apps/web/src/components/workstation/chat/useWorkstationChat.ts` — Menampilkan nama provider CLI pada status bar obrolan ketika dialihkan ke CLI.
- `apps/web/src/components/settings/SettingsCliConnectionsTab.tsx` — Menyimpan riwayat CLI terakhir yang aktif (`arunaki_last_active_cli`).

## Tests
- `npm run build -w apps/web` — ✅ PASSED (built in 30.53s, 0 TypeScript errors).

## Notes
- Pengguna kini memiliki kendali penuh untuk menyalakan/mematikan API provider kapan saja dengan 1 klik untuk beralih antara Cloud API dan Local CLI.
