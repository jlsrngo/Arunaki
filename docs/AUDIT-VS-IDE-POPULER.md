# Audit: Arunaki vs Cara Kerja IDE Populer

**Date:** 2026-10-09
**Author:** session audit
**Status:** Laporan — bukan implementasi. Setiap item punya bukti, bukan dugaan.

Dokumen ini membandingkan cara kerja Arunaki sekarang dengan cara kerja yang sudah terbukti di
VSCode, Cursor, dan tool IDE sejenis. Tujuannya bukan "kebanyakan fitur", tapi **menyamakan
mekanisme** dengan yang sudah dipakai luas, supaya tidak ada lagi perilaku yang hanya kelihatan
benar di UI tetapi salah di belakang layar.

Semua temuan di bawah diverifikasi hari ini terhadap engine yang sedang berjalan, bukan dibaca dari
kode saja.

---

## Ringkasan

| | Status |
|---|---|
| Total temuan | 9 |
| Sudah diperbaiki hari ini | 4 |
| Terbukti dan siap dikerjakan | 3 |
| Belum bisa didiagnosa | 2 |

Yang paling penting: **mekanisme auth sudah ada lengkap di engine, tapi tidak pernah diaktifkan,
dan web app mengirim header yang salah.** Mengaktifkannya terbukti cukup satu environment variable.

---

## Bagian 1 — Sudah diperbaiki

### F1. Token kedaluwarsa tidak pernah di-refresh — SELESAI

**Bukti (sebelum perbaikan):** Kiro menampilkan "Connected" di settings, tapi setiap request
mengembalikan `HTTP 403`. Token access-nya sudah kedaluwarsa 2,5 jam.

**Penyebab:** dua, terpisah.

1. Background loop computing `horizon` dan melewati apa pun yang sudah `<= 0`. Refresh token OAuth
   tetap valid berminggu-minggu setelah access token-nya mati, jadi satu tick yang terlewat membuat
   credential **permanen tak terlihat**. Satu-satunya jalan keluar adalah login ulang.
2. Bridge tidak pernah meminta refresh sama sekali, hanya mengandalkan timer 5 menit yang bisa
   terlambat jauh lewat expiry.

**Perbaikan:** `horizon <= 0` dihapus dari kondisi skip; Kiro, Codex, dan Claude sekarang memanggil
`checkBeforeRequest` sebelum memakai credential.

**Referensi industri:** sama denganVSCode — credential di-refresh saat mendekati kedaluwarsa, dan
refresh yang gagal menandai token mati, bukan diam-diam abandonment.

**Verifikasi:** test `expired-token-recovery.test.ts`; smoke 7/7 hijau.

---

### F2. `Schema.Struct` memakan field registry tanpa suara — SELESAI

**Bukti:** field `note` ada di registry, dirender di card, tapi **tidak ada di respons HTTP**.

**Penyebab:** `LocalCliProviderDescriptor` adalah `Schema.Struct`, dan `Struct` hanya meng-encode key
yang dideklarasikan. Field baru di registry yang tidak diulang di schema hilang tanpa error di kedua
sisi.

**Perbaikan:** test `registry-schema-roundtrip.test.ts` meng-encode setiap descriptor nyata dan gagal
kalau ada key hilang. Sudah diverifikasi bergigi: menghapus field dari schema membuat test gagal.

---

### F3. Tipe `quota` di web tertinggal dari engine — SELESAI

Tiga salinan dari daftar yang sama (`CliQuotaKind`, registry engine, tipe web) dan hanya dua yang
disinkronkan. Tidak merusak secara runtime, tapi bom waktu.

---

### F4. Smoke test belum jadi bagian workflow — SELESAI

Tiga commit masuk melawan engine yang tidak berjalan, dan token expired selama berjam-jam sementara
setiap card tetap membaca "Connected".

Ditambahkan: `npm run test:unit`, `npm run test:smoke`, `npm run verify`, plus aturan wajib di
`AGENTS.md`.

---

## Bagian 2 — Terbukti, siap dikerjakan

### F5. Auth: mekanisme ada, tidak aktif, dan web kirim header yang salah ⭐

**Ini temuan terpenting.**

```
engine/src/server/auth.ts:24   required()  → aktif hanya kalau Arunaki_SERVER_PASSWORD di-set
engine/src/server/auth.ts:41   Basic base64(username:password)

api.ts:18                       header "x-api-key"   ← SALAH, engine tidak pernah membacanya
```

Engine mencetak peringatan saat start:

```
Warning: Arunaki_SERVER_PASSWORD is not set; server is unsecured.
```

**Bukti langsung** (engine kedua di port 4097, dengan password di-set):

```
tanpa Authorization  →  401 DITOLAK
Basic auth benar     →  200 LOLOS
```

Artinya hole-nya nyata: tanpa password, **API lokal terbuka penuh** — siapa pun di mesin itu bisa
membaca data provider dan memicu request.

**Cara kerja populer:** VSCode Remote, code-server, dan Cursor semuanya menjalankan server lokal
dengan password yang dibangkitkan saat start. Halaman web acak di internet tidak bisa membaca data
lokal karena 401.

**Pekerjaan (3 file, tanpa menyentuh engine):**

1. `scripts/dev-app.cjs` — bangkitkan password random per start, teruskan ke engine sebagai
   `Arunaki_SERVER_PASSWORD` dan ke Vite sebagai env untuk renderer.
2. `apps/web/src/lib/api.ts` — ganti `x-api-key` menjadi `Authorization: Basic`.
3. Vite/Vite config — suntikkan password ke bundle (batas kepercayaan sama dengan file lokal).

**Risiko:** all-or-nothing. Password di engine tanpa password di web = seluruh app 401.

---

### F6. Tidak ada launcher produksi — belum ada sama sekali

```
package.json scripts: dev, dev:web, dev:desktop, build, typecheck, test:unit, test:smoke, verify
start / dist / package : TIDAK ADA
```

**Bukti:** `scripts/dev-app.cjs:161` menyalakan Vite dev server, Electron memuat dari
`http://127.0.0.1:5173`. Setiap sesi kerja selalu lewat dev server.

**Konsekuensi:** jalur `loadFile` (`main.cjs:159`) — produksi Electron — **tidak pernah dijalankan
sama sekali**. Dan itu jalur yang rusak:

```
loadFile(dist/index.html)     →  origin file://
fetch("/api/...")             →  file:///api/...   gagal
Origin: null                  →  ditolak CORS
```

Dua lapis rusak. Tidak terdeteksi selama ini karena tidak pernah dieksekusi.

**Cara kerja populer:** Electron produksi memuat UI dari bundle, bukan dari dev server. Tidak ada
laluan HTTP yang melayani UI, sehingga tidak bisa dibuka dari browser.

**Pekerjaan:**

1. Jadikan engine menyajikan `dist/` (satu origin, tanpa CORS, `api.ts` tidak berubah).
   **atau** biarkan Electron `loadFile` + perbaiki `api.ts` + izinkan `Origin: null` khusus Electron.
2. Tambahkan `npm start` yang menjalankan jalur produksi itu.
3. Jalankan sekali, benar.during ini belum pernah terjadi.

**Catatan penting:** begitu ada launcher produksi, jalur browser **tertutup dengan sendirinya** —
UI tidak lagi disajikan lewat HTTP. F5 dan F6 adalah dua sisi dari satu perbaikan.

---

### F7. Tidak ada lazy import sama sekali

```
"TIDAK ADA lazy import sama sekali"
```

**Bukti ukuran bundel:**

```
total 9,16 MB
  index.js 9,16 MB      ← satu file
    └─ city.json 7,70 MB  (country-state-city, 1 file, 1 dropdown)

vendor (sudah dipisah): react 50 KB · lucide 45 KB · react-query 34 KB · css 89 KB
```

`KnowledgeNodePanel.tsx:11` menghitung daftar kota **saat modul dimuat**, bukan saat panel dibuka.
Jadi 7,7 MB JSON diunduh dan di-parse setiap kali app start, walaupun Knowledge tidak pernah
disentuh.

**Cara kerja populer:** VSCode memuat modul on-demand (AMD). Tidak ada payload JSON raksasa di
initial load.

**Pekerjaan:** `import()` dinamis untuk `country-state-city`, dan `React.lazy` untuk halaman berat.
Perkiraan: 9,16 MB → ~1,5 MB tanpa mengubah satu baris pun cara kerja app.

---

## Bagian 3 — Belum bisa didiagnosa

### F8. `/api/file` selalu 500, dan errors-nya ditelan

**Bukti:**

```
GET /api/file?directory=E:\REKAPAN&path=.   →  500, body kosong, tanpa header error
```

 dippingakai `UnifiedWorkstationPage.tsx:237` untuk query daftar file workspace, dibungkus `try/catch`
jadi **diam-diam menjadi daftar kosong**.

Route-nya **ada dan terimplementasi** (`handlers/file.ts:62`), bukan route hantu. Dicoba dengan path
relatif, path absolut, folder git, dan folder non-git — semuanya 500.

Engine kedua dengan `--print-logs` sudah disiapkan, tapi log tidak pernah menunjukkan stack trace,
dan engine utama tidak boleh direstart karena sedang dipakai.

**Yang diketahui:** UI tetap berfungsi karena `FileTree.tsx:65` memakai IPC Electron
(`arunakiDesktop.readFile`) lebih dulu, dan baru jatuh ke API. Jadi endpoint ini **rusak tapi
tertutup** oleh jalur lain.

**Yang belum diketahui:** akar penyebabnya.

---

### F9. `contextUsage` ditulis lalu dibuang

```
kiro.ts:612  ctx.contextUsage = ...   ditulis
            (tidak ada pembaca)        dibuang
kiro.ts:617  ctx.creditsUsed  = ...   hanya dikirim di jalur JSON, bukan SSE
```

Belum ada UI usage di chat — **untuk provider mana pun**. Jadi ini bukan bug yang terlihat, tapi data
yang dibayar mahal lalu dibuang.

---

## Urutan pengerjaan yang disarankan

1. **F5 + F6** — auth dan launcher produksi. Satu perbaikan menutup dua masalah, dan membuat jalur
   browser tertutup dengan sendirinya.
2. **F8** — `/api/file`. Butuh engine yang bisa di-restart dengan log.
3. **F7** — lazy load. Terpisah, tidak menyentuh logika.
4. **F9** — usage per pesan..build tampilan usage di chat untuk pertama kalinya; ada di luar scope.

Setiap item: kerjakan satu, `npm run verify`, commit terpisah.

---

## Yang sudah diverifikasi berfungsi

Tidak semuanya rusak. Ini yang sudah terbukti jalan:

```
npm run test:smoke → 7/7 provider checks passed
  Kiro · OpenCode · Antigravity · Codex (free)
  text + native tool call, arguments ter-parse JSON
```

Dan UI: Electron membuka folder, Explorer menampilkan file, editor membaca dokumen, chat berjalan,
document task dieksekusi. Semua terlihat di screenshot.

---

## Cara memperbarui dokumen ini

Setiap item F1–F9 yang selesai: pindahkan ke Bagian 1 dengan bukti verifikasinya, tambahkan rujukan
`file:line`, dan tambahkan commit-nya. Jangan hapus item yang belum selesai — daftar ini adalah
satu-satunya catatan akurat tentang kondisi sebenarnya.