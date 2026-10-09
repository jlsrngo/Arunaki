# Full Audit: Lapisan Electron + UI Arunaki

**Date:** 2026-10-09
**Scope:** `apps/desktop/` (main.cjs 545 baris, preload.cjs 27 baris) dan `apps/web/src/` (81 file, 18.800 baris)
**Status:** Laporan. Semua temuan diverifikasi terhadap kode dan engine yang berjalan.

Dokumen ini melengkapi `AUDIT-VS-IDE-POPULER.md` yang fokus pada lapisan local-CLI. Disini yang
dipetakan adalah **permukaan aplikasi**: bagaimana Electron grosir, bagaimana renderer bicara
dengan main process, dan bagaimana UI bicara dengan backend.

---

## Ringkasan

| Temuan | Severity | Status |
|---|---|---|
| E1 — Guard workspace gagal-terbuka | **Tinggi** | Belum diperbaiki |
| E2 — Tidak ada batas folder sebelum folder dipilih | **Tinggi** | Belum diperbaiki |
| E3 — `shell.openExternal` tanpa validasi URL | Sedang | Belum diperbaiki |
| E4 — `sandbox: false` | Sedang | Belum diperbaiki |
| E5 — Auto-reload renderer bisa kehilangan pekerjaan | Sedang | Belum diperbaiki |
| E6 — Retry `did-fail-load` tanpa batas | Rendah | Belum diperbaiki |
| E7 — `setWindowOpenHandler` trusts everything | Sedang | Belum diperbaiki |
| U1 — 3 jalur HTTP berbeda di satu app | Sedang | Belum diperbaiki |
| U2 — 62 `apiFetch` + 19 `engineFetch` + 4 `fetch` | Sedang | Belum diperbaiki |
| U3 — `contextUsage` dibuang sebelum sampai UI | Rendah | Belum diperbaiki |
| U4 — File jadi kosong tanpa jejak | Sedang | Terhubung ke F8 |

**Yang sudah benar:** IPC handler destruktif **memang** memakai `resolveInsideWorkspace` dengan
validasikedua sisi pada `renamePath`. Ini yang tepat dan harus dipertahankan.

---

## BAGIAN 1 — LAPISAN ELECTRON

### E1 + E2. Guard workspace gagal-terbuka ⭐ TEMUAN TERBERAT

**Lokasi:** `apps/desktop/main.cjs:60-68`, `main.cjs:58`, `main.cjs:302`

```js
let workspaceRoot = null;                                    // L58

function resolveInsideWorkspace(p) {
  const resolved = workspaceRoot && !path.isAbsolute(p)
    ? path.resolve(workspaceRoot, p) : path.resolve(p);      // L61
  if (!workspaceRoot) return resolved;   // ← L62  TANPA CEK
  const rel = path.relative(workspaceRoot, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Path outside workspace is not allowed');
  }
  return resolved;
}
```

**Masalah:** `workspaceRoot` dimulai `null` (L58). Pada kondisi itu **L62 mengembalikan path apa
pun tanpa validasi** — termasuk `C:\Windows`, file lain di disk, apa pun.

`workspaceRoot` hanya di-set di **satu tempat**, L302, di dalam handler `fs:getFolderTree`. Artinya:

```
app start
  → workspaceRoot = null
  → semua fs IPC (readFile, writeFile, deletePath, renamePath, createFolder)
    TERBUKA PENUH sampai pengguna memilih folder
```

Guard-nya **fail-open**: kondisi yang paling tidak aman (belum tahu workspace) justru kondisi yang
paling longgar.

**Dampak:** Ini melanggar aturan produk di `docs/BOUNDARIES.md` — "Agent CANNOT read files outside
the active folder". Aturan itu berlaku untuk lapisan engine, tapi **belum berlaku untuk lapisan
Electron** pada jendela sebelum folder dipilih.

**Cara kerja populer:** VSCode ini dengan state `workspaceFolders` yang kosong = tidak ada
operation yang boleh jalan. Guard selalu fail-closed: tidak ada konteks = tolak.

**Perbaikan yang disarankan:**

```js
if (!workspaceRoot) throw new Error('No workspace selected');
```

Artinya `dialog:pickFolder` → `getFolderTree` harus jadi satu-satunya jalan masuk, dan semua operasi
file sebelum itu **ditolak**, bukan diizinkan.

---

### E3 + E7. `shell.openExternal` tanpa validasi URL

**Lokasi:** `main.cjs:130-133`

```js
win.webContents.setWindowOpenHandler(({ url }) => {
  shell.openExternal(url);
  return { action: 'deny' };
});
```

Semua `window.open` dari renderer diteruskan ke OS **tanpa memeriksa skema**. Renderer (atau apa pun
yang bisa mengeksploitasi XSS di konten yang ditampilkan) bisa memicu `file://`, protokol kustom,
atau handler lain yang terdaftar di sistem.

**Cara kerja populer:** validasi allowlist skema sebelum `openExternal` — hanya `http:` dan `https:`.
`contextIsolation: true` ada di L121, jadi exploit harus lewat injeksi konten, bukan langsung. Tetap
saja, ini anti-pattern Electron yang dikenal.

**Perbaikan:**

```js
const ok = /^https?:\/\//i.test(url);
if (ok) shell.openExternal(url);
return { action: 'deny' };
```

---

### E4. `sandbox: false`

**Lokasi:** `main.cjs:118-125`

```js
webPreferences: {
  backgroundThrottling: false,
  spellcheck: false,
  contextIsolation: true,     // ✓
  sandbox: false,             // ← tidak sesuai standar
  nodeIntegration: false,     // ✓
  preload: path.join(__dirname, 'preload.cjs'),
}
```

`contextIsolation` dan `nodeIntegration` sudah benar. `sandbox: false` berarti preload berjalan dengan
akses Node penuh. Preload saat ini hanya memakai `contextBridge` + `ipcRenderer` (aman), tapi
`sandbox: true` adalah pertahanan lapis kedua yang gratis.

---

### E5. Auto-reload renderer bisa menghilangkan pekerjaan

**Lokasi:** `main.cjs:136-141`

```js
win.webContents.on('render-process-gone', (_event, details) => {
  console.warn('[main] Render process gone, reloading...', details);
  setTimeout(() => { try { win.reload(); } catch {} }, 1000);
});
```

Kalau renderer crash, app langsung reload diam-diam. **Belum ada dialog, tidak ada pemulihan state.**
Kalau ada chat yang sedang diketik atau dokumen yang belum disimpan, isinya hilang tanpaJejak.

**Cara kerja populer:** VSCode menampilkan "Relaunch Window" dan mencoba memulihkan state editor
dari backup, bukan reload buta.

---

### E6. Retry `did-fail-load` tanpa batas

**Lokasi:** `main.cjs:143-148`

```js
win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
  setTimeout(() => { try { void win.loadURL(WEB_URL); } catch {} }, 1500);
});
```

Setiap kegagalan memicu retry 1,5 detik lagi, **tanpa batas dan tanpa backoff**. Kalau dev server
mati permanen, ini loop tanpa akhir.

---

## BAGIAN 2 — KOMUNIKASI UI

### Struktur yang terpetakan

```
Renderer (apps/web)
   │
   ├── HTTP ke engine :4096
   │     apiFetch()      62 pemakaian   →  /api/...  (dengan header x-api-key)
   │     engineFetch()   19 pemakaian   →  /api/...
   │     fetch()          4 pemakaian   →  langsung
   │
   └── IPC ke main process (preload)
         arunakiDesktop  21 pemakaian
           ├── file      : readFile, writeFile, createFolder, deletePath, renamePath, backupFolder
           ├── office    : openExcelNative, openWordNative, parseExcel, writeExcel, readBinaryFile
           ├── dialog    : pickFolder, openPath
           └── app       : ping, notify, setTheme, getSystemInfo
```

### U1. Tiga jalur HTTP berbeda dalam satu aplikasi

```
apiFetch()     → API_BASE = "/api"        + header x-api-key
engineFetch()  → base sendiri
fetch()        → tanpa pembungkus
```

Tiga cara berbeda untuk hal yang sama. `engineFetch` punya manajemen error sendiri, `apiFetch`
menambah `?directory=`, dan `fetch` biasa tidak menambah apa pun.

**Risiko:** perilaku berbeda diam-diam di antara tiga jalur tersebut — header, query directory,
penanganan error. Sulit dipelihara, dan error di satu jalur tidak terlihat di jalur lain.

**Perbaikan:** satu wrapper, dipakai semua. Jika memang perlu perbedaan, bedakan secara eksplisit
dan beri nama, bukan `engineFetch` yang hanya "yang lain".

---

### U2. Campuran IPC dan HTTP untuk operasi yang sama

```
FileTree.tsx:65   window.arunakiDesktop.readFile(...)    ← IPC, dipakai lebih dulu
FileTree.tsx:72   apiFetch(`${API_BASE}/files/...`)       ← HTTP, fallback
```

File yang sama bisa dibaca lewat dua jalur dengan **dua mekanisme keamanan berbeda**:
- IPC melewati `resolveInsideWorkspace`
- HTTP melewati `FSUtil.contains` milik engine

Keduanya benar, tapi tidak ada satu sumber kebenaran. Kalau satu diperketat dan yang lain tidak,
ada celah.

---

### U3. `contextUsage` dibuang sebelum sampai UI

```
kiro.ts:612   ctx.contextUsage = ...      ditulis
              (tidak ada pembaca di UI)    dibuang

Pencarian di apps/web/src  →  TIDAK ADA
```

Data ini dibayar mahal (Kiro mengirimnya) lalu hilang di antara engine dan renderer. Terhubung ke
F9 di audit sebelumnya.

---

### U4. Error ditelan tanpa jejak

**Lokasi:** `UnifiedWorkstationPage.tsx:249-250`

```js
} catch {
  return [];
}
```

Query daftar file workspace gagal **500**, dan hasilnya jadi daftar kosong tanpa satu pesan pun.
 dipanggil UI tidak pernah menampilkan "gagal memuat", hanya "tidak ada file" — yang indistinguishable
dari folder yang memang kosong.

Ini yang membuat F8 (/api/file) bertahan lama: gejalanya tidak terlihat.

---

### Catatan positif

Tidak semuanya negatif:

- IPC handler destruktif **semua** memakai `resolveInsideWorkspace` (L324, L342, L380, L390)
- `renamePath` memvalidasi **kedua** path (L391-392) — detail yang sering terlewat
- `getFolderTree` mengecek `stat` dan `isDirectory` sebelum memindai (L237-240)
- Single instance lock (L8) mencegah bentrok cache
- `setWindowOpenHandler` sudah memakai pola `deny` yang benar

Yang kurang hanya ketegasan default-nya (E1), bukan strukturnya.

---

## Urutan pengerjaan

1. **E1 + E2** — guard jadi fail-closed. Perubahan kecil, dampak keamanan besar.
2. **E3** — allowlist skema di `openExternal`. 3 baris.
3. **E5** — jangan reload buta saat renderer crash.
4. **U1 + U2** — satukan jalur komunikasi. refactor lebih besar.
5. **E4, E6** — defense in depth.

Dikombinasikan dengan `AUDIT-VS-IDE-POPULER.md`, urutan lengkap tomorrow:

```
F5 + F6  auth + launcher produksi   → menutup jalur browser
E1 + E2  guard workspace            → menutup jalur file di luar folder
E3        openExternal              → 3 baris
F8       /api/file 500              → butuh log engine utama
```

---

## Cara memperbarui

Pindahkan item ke "sudah diperbaiki" dengan referensi `file:line` dan nomor commit. Jangan hapus yang
belum selesai — daftar ini satu-satunya catatan akurat tentang kondisi sebenarnya.