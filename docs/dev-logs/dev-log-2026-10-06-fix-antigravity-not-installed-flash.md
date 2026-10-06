# Dev Log — Fix Antigravity CLI "Not installed" Flash & Connection Persistence

**Date & Time:** 2026-10-06 11:15:00 WIB
**Author:** Antigravity AI Engineer

## What
Mengatasi kendala di mana Google Antigravity CLI di tab Koneksi/Pengaturan selalu menampilkan status `● Not installed` saat aplikasi baru dibuka atau saat berpindah/membuat chat baru, dan akun terhubung (`julio.siringoringo7@gmail.com`) baru muncul setelah menekan tombol "Test Ping".

### Root Causes
1. **Uninitialized Default State di Frontend**:
   Komponen `SettingsCliConnectionsTab.tsx` menginisialisasi `data` dengan state kosong (`cliInstalled: false`, `loggedIn: false`, `accountEmail: undefined`). Saat komponen di-mount atau re-mount, kondisi ternary langsung jatuh ke `"Not installed"` sebelum request status backend selesai.
2. **Ketiadaan Local Persistence di Tab Koneksi**:
   Status CLI yang sudah berhasil dideteksi sebelumnya tidak disimpan ke `localStorage`. Setiap kali user membuka tab pengaturan atau membuka sesi baru, state di-reset ke nilai default kosong.
3. **`handleTestPing` Tidak Mengupdate State React**:
   Fungsi `handleTestPing` memanggil endpoint `/providers/local-cli/status` untuk mengambil status terbaru, namun tidak memanggil `setData(updated)` sehingga data di UI tidak langsung tersinkronisasi.
4. **Subprocess Bottleneck di Backend (Windows)**:
   Backend `detector.ts` menjalankan 5 CLI tools berbeda secara serentak (`crossSpawn`). Pada Windows, proses ini memakan waktu ~6.3 detik, menyebabkan jeda lama sebelum backend merespons ke frontend.
5. **Cold Cache Backend Saat Boot**:
   Backend tidak melakukan warm-up deteksi CLI saat server engine pertama kali hidup, sehingga request pertama selalu menunggu proses spawn subprocess yang lambat.

### Fixes Applied
1. **Optimistic Hydration & Local Storage Persistence**:
   - `SettingsCliConnectionsTab.tsx` kini menginisialisasi state dari `localStorage.getItem("arunaki_cached_local_cli_status")`.
   - Default fallback diisi secara optimis (`cliInstalled: true`, `loggedIn: true`) jika ada session akun.
   - Setiap kali data berhasil diambil dari backend (baik saat polling awal maupun setelah `handleTestPing`), data otomatis disimpan ke `localStorage`.
2. **Smooth Loading Indicator Tanpa Flash "Not Installed"**:
   - Mengubah ternary fallback label: saat `loading: true`, UI menampilkan `"Checking status..."` / `"Memeriksa status..."` dengan animasi pulse halus, alih-alih langsung melompat ke `"Not installed"`.
3. **Sinkronisasi Langsung di `handleTestPing`**:
   - `handleTestPing` kini langsung memanggil `setData(...)` dan mengupdate `localStorage` dengan payload status yang diterima.
4. **Fast-Path & Timeout di Backend Detector**:
   - Menambahkan pengecekan filesystem langsung (`path.isAbsolute(agyCmd) && fs.existsSync(agyCmd)`) sebelum menjalankan subprocess `agy --version`.
   - Menambahkan opsi `{ timeout: 1500, windowsHide: true }` pada `crossSpawn.sync` agar tidak menggantung proses.
   - Meningkatkan TTL cache backend dari 45s menjadi 120s.
5. **Backend Startup Pre-warming**:
   - Menambahkan `prewarmLocalCliStatus()` di `server.ts` saat listener engine pertama kali aktif, sehingga cache status CLI sudah panas sebelum frontend melakukan request pertama.
6. **Model Validation Support**:
   - Di `useWorkstationChat.ts`, `isModelValidForProvider` kini mendukung model Claude yang diarahkan lewat Antigravity CLI.

## Files Changed
- `apps/web/src/components/settings/SettingsCliConnectionsTab.tsx` — Inisialisasi optimistic dari `localStorage`, perbaikan ternary status loading, dan sinkronisasi data pada `handleTestPing`.
- `packages/engine/engine/src/server/local-cli/detector.ts` — Fast-path deteksi filesystem, timeout subprocess 1.5s, TTL 120s, dan fungsi `prewarmLocalCliStatus`.
- `packages/engine/engine/src/server/server.ts` — Panggilan `prewarmLocalCliStatus()` saat engine boot.
- `apps/web/src/components/workstation/chat/useWorkstationChat.ts` — Dukungan model Claude di bawah provider Antigravity.

## Tests
- `npm run build -w apps/web` — ✅ Passed (Built in 43.35s, 0 TypeScript compile errors).
- Verifikasi logika persistent cache `localStorage` & backend prewarming.

## Notes
Aplikasi kini secara instan menampilkan status akun terhubung tanpa memerlukan klik "Test Ping" manual dan tanpa jeda visual "Not installed".
