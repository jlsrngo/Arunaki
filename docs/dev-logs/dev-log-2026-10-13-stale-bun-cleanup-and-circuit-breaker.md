# Dev Log — Stale Bun Process Cleanup & Launcher Circuit Breaker

**Date & Time:** 2026-10-13 16:45:00 WIB  
**Author:** AI Software Engineer

## What
Mendiagnosis dan memperbaiki akar masalah kegagalan startup berulang pada `scripts/dev-app.cjs` dan `scripts/start-prod.cjs`:
1. **Targeted Stale Engine Process Cleanup**: Menambahkan fungsi `cleanStaleEngineProcesses(repoDir)` yang mendeteksi dan menghentikan proses `bun.exe` basi yang command line-nya secara spesifik menunjuk ke direktori workspace/engine Arunaki ini (berdasarkan query WQL `Win32_Process`), tanpa membunuh proses Bun milik proyek lain di komputer pengguna. Pembersihan ini melepaskan file lock SQLite (`arunaki.db`) sebelum port binding dan engine initialization dimulai.
2. **Auto-Restart Circuit Breaker**: Mengganti loop restart tanpa batas (`restartOnCrash`) dengan batas kegagalan beruntun (`MAX_CONSECUTIVE_CRASHES = 3`). Jika suatu proses (Engine, Web, Desktop) crash 3 kali berturut-turut dalam jendela startup, script secara otomatis menyerah, menampilkan pesan error fatal yang jelas, membersihkan seluruh proses anak, dan keluar dengan aman tanpa memicu badai pembunuhan port / cascading crash.
3. **Eliminasi Race Condition Startup**: Menghilangkan persaingan dua timer restart (`waitForPort` manual restart vs `child.on('exit')` auto-restart) yang sebelumnya memicu spawning ganda engine process secara bersamaan.
4. **Perbaikan Lingkup `ENGINE_PORT` di `start-prod.cjs`**: Mendefinisikan konstanta `ENGINE_PORT` pada lingkup teratas dan menyertakan `cleanStaleEngineProcesses` saat startup dan shutdown (`SIGINT`/`SIGTERM`/`exit`).

## Files Changed
- `scripts/dev-app.cjs` — Penambahan `cleanStaleEngineProcesses`, circuit breaker (max 3 restarts), reset counter saat stabil (>15s), dan eliminasi race condition restart. (File berstatus `skip-worktree` untuk konfigurasi mesin lokal).
- `scripts/start-prod.cjs` — Penambahan `cleanStaleEngineProcesses`, lingkup `ENGINE_PORT`, dan cleanup pada `stop()`.

## Tests
- `node -c scripts/dev-app.cjs` — ✅ passed (0 syntax errors).
- `node -c scripts/start-prod.cjs` — ✅ passed (0 syntax errors).
- `bun test test/fastpath.test.ts` — ✅ passed.
- `bun test test/registry.test.ts --timeout 15000` — ✅ passed (11/11 tests pass).
- `git status --porcelain` — ✅ clean.

## Notes
Akar masalah terkonfirmasi: proses bun yang crash/basi memegang handle SQLite tanpa memegang port 4096. Akibatnya `freePort(4096)` tidak menyentuh proses tersebut, memicu "database is locked" pada engine baru dan memicu cascading crash loop ke Electron dan Vite.
