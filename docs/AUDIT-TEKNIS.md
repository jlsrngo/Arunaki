# Audit Teknis Arunaki

**Date:** 2026-10-09
**Scope:** lapisan local-CLI, auth, produksi · lapisan Electron · lapisan UI
**Status:** Laporan. Semua temuan diverifikasi terhadap engine yang berjalan, bukan dari bacaan kode.

Satu dokumen, satu daftar prioritas. Sebelumnya dua dokumen terpisah dengan dua daftar yang
bertumpang tindih — persis bentuk masalah yang berulang di codebase ini, jadi digabung.

**Cara kerja IDE populer** merujuk pada VSCode dan Cursor: mekanismenya sudah dipakai luas, jadi
menyalinnya lebih murah daripada menemukan sendiri.

---

## Ringkasan

| | |
|---|---|
| Total temuan | 20 |
| Sudah diperbaiki | 5 |
| Terbukti, siap dikerjakan | 12 |
| Belum bisa didiagnosa | 2 |
| Tertunda | 1 |

| Severitas | Temuan |
|---|---|
| **Tinggi** | E1/E2 guard workspace gagal-terbuka · F5 auth tidak aktif |
| **Sedang** | E3 openExternal · E5 kehilangan pekerjaan · F6 tidak ada launcher produksi · U1 3 jalur HTTP |
| **Rendah** | F7 bundel · E4 sandbox · E6 retry · U3 usage dibuang |

---

# BAGIAN 1 — SUDAH DIPERBAIKI

### F1. Token kedaluwarsa tidak pernah di-refresh

Kiro menampilkan "Connected" di settings, tapi setiap request `HTTP 403`. Token access sudah
kedaluwarsa 2,5 jam.

Dua sebab terpisah: background loop melewati `horizon <= 0` sehingga credential yang sudah basi
tidak pernah terlihat lagi (padahal refresh token masih valid berminggu-minggu), dan bridge tidak
pernah meminta refresh — hanya mengandalkan timer 5 menit yang bisa terlambat jauh lewat expiry.

*Perbaikan:* kondisi skip diubah; Kiro/Codex/Claude memanggil `checkBeforeRequest` sebelum memakai
credential. Test `expired-token-recovery.test.ts`. Smoke 7/7.

### F2. `Schema.Struct` memakan field registry tanpa suara

Field `note` ada di registry dan dirender di card, tapi tidak ada di respons HTTP. `Schema.Struct`
hanya meng-encode key yang dideklarasikan, jadi field baru yang tidak diulang di schema hilang tanpa
error di kedua sisi.

*Perbaikan:* `registry-schema-roundtrip.test.ts` meng-encode setiap descriptor nyata dan gagal kalau
ada key hilang. Diverifikasi bergigi — menghapus field dari schema membuat test gagal.

### F3. Tipe `quota` di web tertinggal dari engine

Tiga salinan dari daftar yang sama, hanya dua yang disinkronkan. Tidak merusak runtime, bom waktu.

### F4. Smoke test belum jadi bagian workflow

Tiga commit masuk melawan engine yang tidak berjalan. Ditambahkan `npm run test:unit`,
`test:smoke`, `verify`, dan aturan wajib di `AGENTS.md`.

### F5a. `verify` memakai typecheck yang selalu OOM

Script `verify` memanggil `tsgo` yang mati dengan "out of memory" sebelum melaporkan apa pun — jadi
gerbang penuh tidak pernah bisa lulus sejak dibuat. Diganti `tsc` atas project yang sama.

### F5b. Auth API lokal tidak pernah aktif - commit `bd027c0c`

Engine punya Basic auth sejak lama (`server/auth.ts`) dan mencetak warning setiap start, tapi tidak
pernah ada yang menyetel `Arunaki_SERVER_PASSWORD`. Web app mengirim `x-api-key` yang tidak pernah
dibaca siapa pun.

```
sebelum:  GET /api/session tanpa kredensial  →  200, 19482 byte
sesudah:  setiap endpoint tanpa kredensial   →  401
          setiap endpoint dengan kredensial  →  200
          smoke 7/7                          →  pass
```

Launcher membangkitkan password per start (`scripts/server-auth.cjs`), meneruskannya ke engine dan
ke Vite. `engineFetch` juga sudah diperbaiki — 19 call site tanpa kredensial akan mati seluruhnya.

**Yang BELUM tertutup:** UI masih disajikan Vite di `:5173`, dan Vite men-inline password ke JS-nya
dalam teks polos. Browser di `localhost:5173` masih berfungsi penuh. Yang tertutup adalah akses dari
origin lain. Menutup UI sepenuhnya adalah **F6**.

### E1+E2. Guard workspace gagal-terbuka — commit `bd027c0c`

`resolveInsideWorkspace` mengembalikan path apa pun tanpa validasi selama `workspaceRoot` masih
`null`, dan `workspaceRoot` hanya di-set oleh `fs:getFolderTree`. Jadi sejak app start sampai folder
pertama di-scan, `readFile`/`writeFile`/`deletePath`/`renamePath` bisa menyentuh seluruh disk.

*Perbaikan:* fail-closed — tanpa workspace, operasi ditolak. Caller yang ada (`FileTree.tsx:65`)
hanya memicu `readFile` setelah tree tersedia, jadi tidak ada yang bergantung pada fail-open.

### E3. `shell.openExternal` tanpa validasi URL — commit `bd027c0c`

`window.open` dari renderer diteruskan ke OS apa pun skemanya. Sekarang hanya `http`/`https`.

### F6. Launcher produksi — commit `29de138c`

`npm start` menjalankan engine ber-password, menunggu health, lalu Electron **tanpa dev server**.
`main.cjs` jatuh ke `loadFile()` dan UI diambil dari disk. Jalur ini belum pernah dijalankan
sebelumnya dan rusak dua lapis; sekarang diverifikasi:

```
127.0.0.1:5173                     tidak melayani
engine tanpa kredensial            401
engine dengan kredensial           200
smoke                              7/7
```

Kredensial dikirim ke renderer lewat `additionalArguments`, bukan dibake ke bundle.

### E4/E5/E6. Sandbox, crash, retry — commit `b6fe1574`

`renderer-gone` dulu memicu `win.reload()` buta dalam 1 detik — di editor itu menghapus chat dan
dokumen tanpa disimpan tanpa prompt, dan tanpa batas. Sekarang: tidak reload pada `clean-exit`, backoff
kalau crash lagi dalam 10 detik. `did-fail-load` yang retry tiap 1,5 detik selamanya kini backoff
eksponensial, enam kali, lalu menyerah. `sandbox: true` ditutup setelah kredensial pindah ke argv.

### F7. Bundel 9,16 MB — commit `0e5a8dfd`

`country-state-city` memuat 148.038 nama kota dalam JSON 7,69 MB, diimpor di module scope dan
diratakan jadi konstanta — seluruhnya diunduh dan di-parse tiap start, untuk saran di satu field yang
nilainya disimpan apa adanya dan tidak pernah divalidasi. Sekarang dimuat lewat dynamic import.

```
initial load   9161 KB  ->  1504 KB   (84% lebih kecil)
```

### U1/U2. Jalur komunikasi — commit `41cf399a`, `2d87d5ba`

Base URL, kredensial, dan resolusi direktori sebelumnya diduplikasi di dua file, dan yang di
`engine.ts` tidak pernah dapat kredensial — itu sebabnya 19 call site akan mati begitu auth aktif.
Sekarang satu sumber.

`FileTree` punya fallback ke `apiFetch('/files/:id/content')` — route yang **tidak pernah ada** di
engine. 500, tertelan `catch {}`, hasilnya dokumen kosong yang tampak sama dengan file kosong. Fallback
itu juga-millioneguarded berbeda dengan IPC, jadi dua sumber kebenaran. Dihapus.

### F8. `/api/file` selalu 500 — commit `c6553c1a`

Route-nya ter-mount di `/file`. UI meminta `/api/file`. `/api` adalah alias legacy yang hanya
mencakup sebagian API; route file tidak termasuk, sehingga jatuh ke catch-all UI dan kembali **500
dengan body kosong** — tanpa stack trace bahkan di `--log-level DEBUG`.

Cara menemukan: route yang sengaja dikarang (`/api/totally-bogus-route-xyz`) mengembalikan 500 yang
sama, artinya 500 adalah cara server ini mengatakan "tidak ditemukan". `/file` membalas **400** — itu
route asli yang kurang parameter wajib. Itu langsung menunjuk ke prefix-nya.

```
/file?path=.                -> 200, daftar file sungguhan
/api/file?path=.            -> 500
/file/content?path=...      -> 200
/api/file/content?path=...  -> 500
```

Ketiga call site diperbaiki, dan `catch` yang senyap dihapus supaya kegagalan terlihat, tidak
disembunyikan sebagai daftar kosong. `path` relatif terhadap direktori instance, jadi root adalah `.`.

---

# BAGIAN 2 — TEMUAN AKTIF

## 2A — Auth dan produksi (lapisan backend)

### F5. ~~Auth~~ (selesai, lihat Bagian 1)

```
server/auth.ts:24   required() → aktif hanya kalau Arunaki_SERVER_PASSWORD di-set
server/auth.ts:41   Basic base64(username:password)

api.ts:18           header "x-api-key"   ← SALAH, engine tidak pernah membacanya
```

Engine mencetak `Warning: Arunaki_SERVER_PASSWORD is not set; server is unsecured.` saat start.
API lokal tanpa password terbuka penuh — siapa pun di mesin bisa membaca data provider dan memicu
request.

**Terbukti live** (engine kedua di port 4097):

```
tanpa Authorization  →  401  DITOLAK
Basic auth benar     →  200  LOLOS
```

**Cara kerja populer:** VSCode Remote dan code-server membangkitkan password saat start; halaman web
acak di internet tidak bisa membaca data lokal karena 401.

**Pekerjaan (3 file, engine tidak disentuh):**
1. `scripts/dev-app.cjs` — password random per start → engine sebagai `Arunaki_SERVER_PASSWORD`,
   dan ke Vite untuk renderer.
2. `apps/web/src/lib/api.ts` — `x-api-key` → `Authorization: Basic`.
3. Vite config — suntikkan password ke bundle.

**Risiko:** all-or-nothing. Password di engine tanpa password di web = seluruh app 401.
**Batas kepercayaan:** password ada di bundle, jadi siapa pun yang bisa membaca file lokal bisa
mendapatkannya. Yang tertutup adalah halaman web acak.

### F6. Tidak ada launcher produksi

```
package.json: dev, dev:web, dev:desktop, build, typecheck, test:unit, test:smoke, verify
start / dist / package : TIDAK ADA
```

`dev-app.cjs:161` menyalakan Vite, Electron memuat dari `127.0.0.1:5173`. Setiap sesi selalu lewat dev
server. Jalur `loadFile` (`main.cjs:159`) **tidak pernah dijalankan** dan rusak dua lapis:

```
loadFile(dist/index.html)  →  origin file://
fetch("/api/...")          →  file:///api/...  gagal
Origin: null               →  ditolak CORS
```

Tidak terdeteksi karena tidak pernah dieksekusi.

**Koreksi penting:** F6 sendiri **tidak menutup jalur HTTP**. Yang menutup adalah **F5**. F6 hanya
membuat UI tidak lagi disajikan lewat HTTP; API di `:4096` tetap terbuka tanpa password.

**Cara kerja populer:** produksi memuat UI dari bundle, bukan dari dev server.

### F8 ~~/api/file selalu 500~~ (selesai, lihat Bagian 1)

```
GET /api/file?directory=E:\REKAPAN&path=.  →  500, body kosong
```

Dipakai `UnifiedWorkstationPage.tsx:237` untuk daftar file workspace, dibungkus `catch { return [] }`
jadi **diam-diam menjadi daftar kosong**. Gejalanya tidak terlihat — "tidak ada file" dengan
sama dengan folder yang memang kosong.

Route **ada dan terimplementasi** (`handlers/file.ts:62`). Dicoba dengan path relatif, absolut,
folder git, dan non-git — semuanya 500. Engine kedua dengan `--print-logs` tidak menghasilkan stack
trace.

UI tetap berfungsi karena `FileTree.tsx:65` memakai IPC lebih dulu. Endpoint ini **rusak tapi tertutup**.

### F9. `contextUsage` ditulis lalu dibuang

Ditulis di `kiro.ts:612`, tidak ada pembaca di engine maupun UI (`apps/web/src` nol hasil).
`creditsUsed` hanya dikirim di jalur JSON, bukan SSE.

---

## 2B — Lapisan Electron

Audit terhadap 545 baris `main.cjs` dan 27 baris `preload.cjs`.

### E1+E2. ~~Guard workspace~~ (selesai, lihat Bagian 1)

```js
let workspaceRoot = null;                                    // L58
function resolveInsideWorkspace(p) {
  const resolved = workspaceRoot && !path.isAbsolute(p)
    ? path.resolve(workspaceRoot, p) : path.resolve(p);
  if (!workspaceRoot) return resolved;   // ← L62  TANPA CEK
  ...
}
```

`workspaceRoot` hanya di-set di **satu tempat**, `L302`, dari handler `fs:getFolderTree`. Jadi:

```
app start → workspaceRoot = null → semua fs IPC terbuka penuh
          (readFile, writeFile, deletePath, renamePath, createFolder)
```

Guard **fail-open**: kondisi yang paling tidak aman justru yang paling longgar. Melanggar
`docs/BOUNDARIES.md` — aturan "tidak bisa baca file di luar folder aktif" ada di engine, belum di
Electron.

**Cara kerja populer:** VSCode membuat daftar folder kosong = tidak ada operasi yang boleh jalan.
Guard selalu fail-closed.

*Perbaikan:* `if (!workspaceRoot) throw new Error('No workspace selected')`. Satu baris, dampak besar.

### E3/E7. ~~openExternal~~ (sebagian selesai)

`main.cjs:130` meneruskan semua `window.open` ke OS tanpa cek skema. `contextIsolation: true` ada,
jadi exploit harus lewat injeksi konten — tapi ini tetap anti-pattern Electron yang dikenal.

*Perbaikan:* `const ok = /^https?:\/\//i.test(url); if (ok) shell.openExternal(url);`

### E4. `sandbox: false`

`main.cjs:122`. `contextIsolation` dan `nodeIntegration` sudah benar, tapi `sandbox: true` adalah
pertahanan lapis kedua yang gratis.

### E5. Auto-reload renderer bisa menghilangkan pekerjaan

`main.cjs:136` — `render-process-gone` memicu `win.reload()` tanpa dialog dan tanpa pemulihan state.
Chat yang sedang diketik atau dokumen yang belum disimpan hilang tanpa jejak. VSCode menampilkan
"Relaunch Window" dan memulihkan state.

### E6. Retry `did-fail-load` tanpa batas

`main.cjs:143` — retry tiap 1,5 detik selamanya, tanpa backoff maupun batas atas.

---

## 2C — Lapisan UI

81 file, 18.800 baris.

### Struktur komunikasi yang terpetakan

```
Renderer ─┬─ HTTP :4096   apiFetch 62 · engineFetch 19 · fetch 4  ← tiga cara berbeda
          └─ IPC preload  arunakiDesktop 21  (file/office/dialog/app)
```

### U1. Tiga jalur HTTP berbeda dalam satu aplikasi

```
apiFetch()     /api  + header x-api-key + ?directory=
engineFetch()  base sendiri, manajemen error sendiri
fetch()        tanpa pembungkus
```

Perilaku berbeda diam-diam di antara ketiganya — header, query, penanganan error.

### U2. Campuran IPC dan HTTP untuk operasi yang sama

`FileTree.tsx:65` baca lewat IPC lebih dulu, `FileTree.tsx:72` jatuh ke HTTP. Dua jalur dengan dua
mekanisme keamanan berbeda (`resolveInsideWorkspace` vs `FSUtil.contains`). Keduanya benar, tapi tidak
ada satu sumber kebenaran.

### U3. `contextUsage` dibuang sebelum sampai UI — lihat F9.

### U4. Error ditelan tanpa jejak — lihat F8.

---

## Yang sudah benar (jangan dirombak)

- Semua handler destruktif **memang** lewat `resolveInsideWorkspace` (`main.cjs:324, 342, 380, 390`)
- `renamePath` memvalidasi **kedua** sisi path (`L391-392`) — detail yang sering terlewat
- `getFolderTree` cek `isDirectory` sebelum memindai (`L237-240`)
- Single instance lock (`L8`), `contextIsolation: true`, `nodeIntegration: false`
- `setWindowOpenHandler` sudah memakai pola `deny` yang benar (hanya URL-nya yang belum divalidasi)
- Credential store engine: atomic, tahan parse error, ada test
- Registry → schema → UI: ada regression test yang bergigi

Struktur sudah benar. Yang kurang adalah **ketegasan default**, bukan bentuknya.

---

## URUTAN PENGERJAAN

Satu daftar. Kerjakan satu per satu, `npm run verify`, commit terpisah.

| # | Item | Kenapa pertama |
|---|---|---|
| 1 | **F5** auth | Satu-satunya yang benar-benar menutup jalur HTTP |
| 2 | **E1+E2** guard fail-closed | Satu baris, menutup jalur file di luar folder |
| 3 | **F6** launcher produksi | Membuat UI tidak disajikan lewat HTTP |
| 4 | **E3** validasi skema | 3 baris |
| 5 | **F8** `/api/file` | Butuh engine bisa di-restart dengan log |
| 6 | **E5** auto-reload | Cegah kehilangan pekerjaan |
| 7 | **U1+U2** satukan jalur | Refactor lebih besar |
| 8 | **F7** lazy load | Terpisah, tidak menyentuh logika |
| 9 | **E4, E6** defense in depth | |
| 10 | **F9** usage per pesan | Build tampilan usage pertama kali |

Nomor 1 dan 3 sering dianggap satu paket, tapi tidak: **F3 tanpa F1 tidak menutup apa pun.**

---

## Cara memperbarui

Pindahkan item ke Bagian 1 dengan referensi `file:line` dan nomor commit. Jangan hapus yang belum
selesai — daftar ini satu-satunya catatan akurat tentang kondisi sebenarnya.

---

# BAGIAN 3 — DITEMUKAN SETELAH AUDIT DITUTUP

Tiga temuan ini muncul setelah daftar di atas selesai, saat memeriksa apakah Kiro bisa dipakai dari
chat. Semuanya terverifikasi terhadap engine yang berjalan.

### N1. Kiro tidak bisa dipakai dari chat sama sekali ⭐

Kiro sudah lengkap: device flow, credential, model live, katalog, card di Settings, dan lolos smoke 7/7.
Semua itu benar dan tidak satu pun bisa menjangkau chat.

`
engine config provider : kenari, antigravity
kiro                   : tidak terdaftar
model kiro di /api/model : 0
`

Bridge menangani Kiro lebih dulu (ridge.ts:221), jadi jalurnya ada — tapi chat tidak pernah
menyampeainya. BRIDGE_ROUTED_PROVIDERS (handlers/provider.ts:240) hanya berisi
["opencode", "antigravity", "claude-code"], dan Kiro tidak termasuk. Tanpa entri provider di config
engine, tidak ada model Kiro yang muncul untuk dipilih.

Ini kelas bug yang sama seperti F6: sesuatu bekerja terisolasi, terverifikasi, dan tidak terjangkau
dari produk. Smoke test tidak menangkapnya karena smoke menguji bridge secara langsung, bukan lewat
chat.

**Belum diperbaiki** — menambahkan Kiro ke routing menyentuh provider config dan butuh pengujian ulang
alur chat.

### N2. Chat menawarkan model Codex yang ditolak

/api/model mengembalikan 183 model, 25 di antaranya.model Codex. Yang terverifikasi hidup hanya 5.

`
gpt-5.6-terra  -> 200
gpt-6.1-sol    -> 502
gpt-5.6-sol    -> 502
gpt-5-6-luna   -> 502
`

Katalog local-CLI sudah disaring ke 5 model terverifikasi (CODEX_VERIFIED_FALLBACK), tetapi chat
membaca katalog engine yang terpisah dan tidak disaring. Ini regresi dari kelas bug yang sama seperti
yang sudah diperbaiki di lapisan local-CLI — hanya di tempat lain.

### N3. Kredensial tidak pernah sampai ke chat, dan itu belum selesai

Usage Kiro sudah dikirim di SSE bridge (8a638181), tapi karena Kiro tidak melewati bridge, angka itu
tidak masuk ke event stream engine. Menutupnya bergantung pada keputusan routing di N1.