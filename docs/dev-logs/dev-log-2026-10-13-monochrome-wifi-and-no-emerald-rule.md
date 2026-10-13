# Dev Log — Strict Monochrome: Wifi Icon & No-Emerald Design Rule

**Date & Time:** 2026-10-13 19:45:00 WIB
**Author:** Antigravity (AI Software Engineer)

## What
1. Mengganti indikator status jaringan footer di `AppLayout.tsx`:
   - Titik hijau (`bg-emerald-500 animate-pulse`) diganti dengan logo WiFi putih (`<Wifi className="w-3.5 h-3.5 text-white shrink-0" />`).
   - Warna teks "Online" dan container badge diubah menjadi putih bersih (`text-white`, `border-[var(--border-strong)]`).
   - Mode offline menggunakan `<WifiOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />` dengan teks `text-rose-400`.
2. Mengubah badge status "Connected" pada *Electron Native Desktop Shell* di `SettingsAutomationTab.tsx`:
   - Warna hijau emerald (`bg-emerald-500/10 text-emerald-400 border-emerald-500/20` & `bg-emerald-400`) diubah menjadi monokrom putih bersih (`bg-[var(--bg-hover)] text-white border-[var(--border-strong)]` dan titik `bg-white`).
3. Menambahkan **Rule 6 (Strict Monochrome & No-Emerald Rule)** ke dalam `AGENTS.md`:
   - Dilarang keras menggunakan warna hijau terang / emerald (`text-emerald-*`, `bg-emerald-*`, titik hijau) untuk status telemetry, badge status koneksi (Online/Connected), dan pill indikator.
   - Semua status badge koneksi/teknis wajib menggunakan palet monokrom bersih / putih (`text-white`, `border-[var(--border-strong)]`, `bg-white`).
   - Indikator jaringan online footer wajib memakai icon WiFi putih (`<Wifi className="w-3.5 h-3.5 text-white" />`).
   - Aksen warna hangat hanya diperbolehkan untuk status thinking/progress LLM (`#e59344` / orange Arunaki) atau status error (`rose-500` / merah).

## Files Changed
- `apps/web/src/components/layout/AppLayout.tsx` — Mengganti titik hijau online dengan icon WiFi putih dan teks putih.
- `apps/web/src/components/settings/SettingsAutomationTab.tsx` — Mengubah badge Connected dari hijau emerald ke putih monokrom.
- `AGENTS.md` — Menambahkan Rule 6 Strict Monochrome & No-Emerald Rule.

## Tests
- `npm run build -w apps/web` — ✅ Built in 22.02s (0 error kompilasi).
