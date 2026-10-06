# Dev Log — Fix Subprocess Terminal Flashes & Electron Network Service Crash

**Date & Time:** 2026-10-06 10:37:35 WIB
**Author:** Antigravity

## What
Diagnosed and fixed two root causes reported by the user:
1. **Jendela terminal selalu membuka sebentar lalu tertutup saat dijalankan**:
   - `scripts/dev-app.cjs` sebelumnya menyetel `windowsHide: false` dan `shell: true` pada `spawn()`, sehingga Windows membuat jendela konsol fisik baru setiap kali proses dijalankan atau di-restart.
   - Saat terjadi tabrakan port atau service exit, auto-restart loop (setiap 1.5 detik) terus membuka jendela konsol baru yang langsung mati dan tertutup dalam hitungan milidetik.
   - Diperbaiki dengan menyetel `windowsHide: true` pada `spawn()` dan `execSync()`, serta menambahkan pembersihan port otomatis (`freePort`) sebelum auto-restart service agar tidak terjadi crash loop `EADDRINUSE`.
2. **Error Electron tidak bisa distart (`Network service crashed or was terminated`)**:
   - `apps/desktop/main.cjs` sebelumnya menyetel flag akselerasi grafis eksperimental `enable-gpu-rasterization` dan `enable-zero-copy` yang menyebabkan GPU process crash pada driver Windows dan merambat ke Network Service Chromium hingga Electron exit dengan code 1.
   - Menghapus flag grafis yang tidak stabil tersebut dan menambahkan listener `app.on('child-process-gone')` agar Electron mampu menangani restart helper internal Chromium tanpa mematikan aplikasi utama.
   - Menambahkan `restartOnCrash: true` pada spawn Desktop di `scripts/dev-app.cjs`.

## Files Changed
- [main.cjs](file:///e:/JS/Arunika/apps/desktop/main.cjs) — Menghapus switch GPU zero-copy yang menyebabkan crash network service Chromium dan menambahkan handler `child-process-gone`.
- [dev-app.cjs](file:///e:/JS/Arunika/scripts/dev-app.cjs) — Menyetel `windowsHide: true`, membersihkan port target sebelum restart crash, dan mengaktifkan `restartOnCrash` untuk Desktop.

## Tests
- `npm run build -w apps/web` — ✅ passed (35.75s, 0 TypeScript compilation errors)
- `npx electron .` — ✅ passed (window renders and connects gracefully)
- Port cleanup verification (4096, 5173, 20188) — ✅ cleaned up

## Notes
- `scripts/dev-app.cjs` diisolasi dengan status `skip-worktree` sesuai aturan repositori.
