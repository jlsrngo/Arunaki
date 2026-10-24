# WORKFLOW.md — Arunaki Development Roadmap

**Product:** Arunaki — Autonomous Document Operating System & Desktop Computer Use Agent  
**Architecture:** Tauri v2 Native Desktop Shell + Axum Tokio Pure-Rust Engine + Native Win32 COM Sidecar  
**Last Updated:** 2026-10-24  

---

## Overview

Dokumen ini mendefinisikan urutan pengembangan resmi untuk **Arunaki — Autonomous Document Operating System**.
Arunaki mengusung arsitektur **Dual-Mode Document**:
1. **In-App Suite (ArtCraft)**: Suite 4 aplikasi dokumen mandiri (**GridCraft**, **WordCraft**, **PdfCraft**, dan **DeckCraft**) yang dibuka, diedit, dan dikendalikan langsung di **Panel Tengah (Center Panel Workstation)** secara otonom tanpa bergantung pada software eksternal berbayar.
2. **Native Microsoft Office COM Companion (`core/arunaki-docs`)**: Integrasi native Win32 COM (`open-excel`, `open-word`) **tetap dipertahankan 100%**. Pengguna yang memiliki Microsoft Office di komputernya tetap bisa membuka dan mengendalikan dokumen langsung di aplikasi Excel/Word desktop asli Windows kapan pun diinginkan.

---

## 🏛️ Summary of Foundational Milestones (Phases 1 – 130) ✅ COMPLETED & ARCHIVED

Semua fase fondasi lama (Phase 1 s/d Phase 130) telah selesai 100% dan diarsipkan:
- **Phase 1 – 50:** Fondasi awal arsitektur, database session SQLite, prompt harness, boundary sandbox, dan model router.
- **Phase 51 – 100:** Eliminasi ketergantungan legacy, transisi ke agent-per-folder isolation (`cwd`), dan stabilisasi streaming chat deduplication.
- **Phase 101 – 125:** Pembangunan Win32 COM Document Sidecar (`arunaki-docs`), parser XML Office Open XML, dan sistem verifikasi smoke test.
- **Phase 126 – 130:** Migrasi penuh dari Electron ke native Rust engine, Local-CLI Bridge (port 20188), SQLite IPC parity, dan frameless desktop shell.

---

## Recent Milestones

### Phase 131: LLM Context Compaction (`/compact`) & Dynamic Session History Pruning ✅ DONE
- [x] Implementasi endpoint `/api/session/:id/summarize` di `core/arunaki-engine/src/session/summary.rs`.
- [x] Handler slash command `/compact` di chat input box yang merangkum konteks dan memangkas token riwayat percakapan.
- [x] Live testing dengan model LLM menghasilkan pengurangan ukuran context window secara signifikan.

### Phase 132: ArunakiZen POS Void / Cancellation Tool & English Prompt Standardization ✅ DONE
- [x] Penambahan tool resmi `arunakizen_void_sale_order` di `core/arunaki-engine/src/tool/zen.rs` untuk membatalkan nota duplikat secara atomic.
- [x] Proteksi anti-duplikasi: jika user meminta revisi pesanan, LLM otomatis membatalkan nota lama sebelum menerbitkan nota baru.
- [x] Standardisasi seluruh prompt tool kasir dan system prompt ke dalam bahasa Inggris profesional bersih (100% English prompt).

### Phase 133: ArunakiZen Clean Brand Alignment & macOS Squircle App Icons ✅ DONE
- [x] Penghapusan kata "POS" menjadi nama resmi brand "ArunakiZen".
- [x] Refactoring file dari `pos.rs` / `pos_*.txt` menjadi `zen.rs` / `zen_*.txt`.
- [x] Pembuatan 3 ikon unik berstandar macOS dark squircle dengan aksen oranye `#cf6613`:
  - `arunaki.exe`: Logo brand delta loop Arunaki.
  - `arunaki-engine.exe`: Precision mechanical gear backend.
  - `arunaki-docs.exe`: Document sheet dengan kunci Win32.
- [x] Script injector PE `scripts/inject-icon.ps1` untuk menyuntikkan icon resource langsung ke binary `.exe`.

### Phase 134: Tauri v2 Hybrid Desktop, SVG Vector Migration & Context Menu Suppression ✅ DONE
- [x] Integrasi desktop shell **Tauri v2** (`src-tauri`) membungkus frontend web dan engine Axum di port `4096`.
- [x] Smart Port Allocation & Origin Guard pada Local-CLI Bridge (`20188 -> 20189 -> 0`).
- [x] Notifikasi native Windows Action Center Toast melalui `tauri-plugin-notification`.
- [x] Deteksi dinamis spesifikasi sistem dan framework di modal About tanpa hardcode.
- [x] Migrasi 100% dari emoji ke ikon vektor SVG murni (Lucide) serta aturan ketat no-emoji regex di seluruh kanvas dan judul sesi.
- [x] Penonaktifan total menu klik kanan bawaan web browser (*Back*, *Forward*, *Reload*, *Inspect*) di React dan WebView2.
- [x] Dokumentasi lengkap integrasi 4 aplikasi dokumen ArtCraft di `ARTCRAFT_DOCUMENTS_INTEGRATION.txt`.

---

## 🚀 Active Roadmap: Autonomous Document Operating System (ArtCraft Suite)

---

### Phase 135: GridCraft — In-App Interactive Spreadsheet Engine (Center Panel) 🔄 IN PROGRESS
**Goal:** Mengubah viewer spreadsheet statis di panel tengah (`WorkstationCenterPanel.tsx` & `SpreadsheetViewer.tsx`) menjadi engine spreadsheet interaktif mandiri (**GridCraft**). Pengguna dapat melihat sel dihitung secara *live* saat AI mengetik, memilih dan mengedit cell/formula manual, menambah sheet, serta menyimpan perubahan langsung ke file `.xlsx`/`.csv` tanpa memerlukan Microsoft Excel.

#### 135.1 Interactive Spreadsheet Grid Component
- [ ] Ganti rendering tabel statis dengan canvas/DOM spreadsheet grid interaktif berkecepatan tinggi (header kolom A, B, C..., nomor baris 1, 2, 3..., cell selection box).
- [ ] Implementasikan Formula Bar di bagian atas panel tengah yang menampilkan teks atau formula aktif (contoh: `=SUM(C2:C10)`).
- [ ] Dukungan navigasi keyboard (Arrow keys, Tab, Enter) dan inline cell editing.
- [ ] Multi-sheet tab bar di bagian bawah grid (Sheet1, Sheet2, dsb.) dengan kemampuan beralih sheet secara instan.

#### 135.2 Live AI-to-Grid Synchronization
- [ ] Tambahkan listener event perubahan file lokal: saat backend Rust (`write-excel` atau `doc_com`) memperbarui cell, tab GridCraft yang sedang terbuka otomatis memperbarui nilai cell yang terpengaruh dengan animasi highlight halus tanpa mereload seluruh tab.
- [ ] Integrasikan kalkulasi formula offline (SUM, AVERAGE, MIN, MAX, IF, kalkulasi pajak/diskon) langsung di memori lokal.

#### 135.3 File Persistence & Native Office Bridge
- [ ] Tombol Save/Export langsung dari GridCraft ke `.xlsx` dan `.csv` via endpoint `/api/desktop/write-excel`.
- [ ] Tombol pintas *"Open in Native Excel"* di header tab yang memanggil `/api/desktop/open-excel` via `core/arunaki-docs` bagi pengguna yang ingin melihat file di aplikasi Microsoft Excel desktop asli.
- [ ] Tampilkan status autosave / unsaved indicator pada header tab panel tengah.

---

### Phase 136: WordCraft — Official Rich Document Canvas & Paged A4 Layout (Center Panel) ⏳ QUEUED
**Goal:** Menghadirkan editor dan viewer dokumen resmi (**WordCraft**) di panel tengah dengan tampilan layout kertas A4, margin standar, penomoran halaman, serta visualisasi *diff* real-time ketika AI merevisi isi dokumen.

#### 136.1 Paged A4 Document Layout
- [ ] Buat komponen `WordCraftDocumentView` di panel tengah dengan layout kertas A4 (lebar proporsional, bayangan kertas halus, margin atas/bawah/samping).
- [ ] Dukungan rendering rich formatting: Heading 1/2/3, paragraf berjarak rapi, bullet points, dan tabel data formal.
- [ ] Header & Footer dokumen resmi (nomor halaman, judul dokumen, tanggal).

#### 136.2 Real-time AI Revision Diff Markers
- [ ] Hubungkan sistem `computeLineDiff`: teks yang baru ditambahkan AI diberi highlight hijau lembut, dan teks yang dihapus diberi penanda merah tercoret dengan opsi "Accept / Reject All Changes".
- [ ] Render dokumen `.docx` langsung tanpa ketergantungan pada Microsoft Word.

#### 136.3 Document Export
- [ ] Fitur ekspor 1-klik ke format `.docx` (Office Open XML murni) dan `.pdf` siap cetak.

---

### Phase 137: PdfCraft — Embedded PDF Reader & Visual Data Cartographer (Center Panel) ⏳ QUEUED
**Goal:** Membuka file PDF (faktur, nota, rekening koran) langsung di dalam tab panel tengah (**PdfCraft**), dengan layer visualisasi kotak bounding-box yang menunjukkan bagian teks atau tabel mana yang sedang diekstrak oleh AI.

#### 137.1 Embedded Native PDF Canvas Viewer
- [ ] Integrasikan renderer canvas PDF di panel tengah dengan fitur zoom in/out, fit to width, dan thumbnail halaman di sisi kiri.
- [ ] Rendering 100% offline di memori lokal tanpa upload file ke server eksternal.

#### 137.2 Visual Data Extraction Overlay
- [ ] Saat user meminta "ekstrak tabel dari PDF ini", koordinat bounding-box dari `core/arunaki-docs` dirender sebagai overlay semi-transparan di atas halaman PDF, sehingga user melihat apa yang dibaca oleh AI secara transparan.
- [ ] Tombol aksi cepat: *"Kirim ke GridCraft (Rekap ke Excel)"* langsung dari tabel PDF yang terdeteksi.

---

### Phase 138: DeckCraft — Presentation Slide Carousel & Executive Deck Viewer (Center Panel) ⏳ QUEUED
**Goal:** Menyediakan viewer dan presenter slide presentasi (**DeckCraft**) di panel tengah untuk meninjau ringkasan eksekutif, laporan bulanan, dan materi presentasi dalam bentuk kartu slide visual.

#### 138.1 Slide Deck Presentation Viewer
- [ ] Komponen presenter slide di panel tengah dengan kartu slide berasio 16:9, navigasi slide sebelumnya/berikutnya, dan panel thumbnail di sebelah kiri.
- [ ] Mode presentasi fullscreen langsung dari Arunaki.

#### 138.2 Autonomous Slide Generation from Project Documents
- [ ] Agent dapat merangkum data dari file GridCraft (.xlsx) atau WordCraft (.docx) yang ada di folder proyek menjadi slide presentasi ringkas (Judul, Metrik Utama, Grafik Ringkasan).
- [ ] Ekspor slide deck langsung ke format `.pptx`.

---

## Verification & Quality Gates

Sebelum menyelesaikan setiap fase, WAJIB memverifikasi:
1. `cargo test --workspace`: Semua unit test Rust lolos 100%.
2. `npm run build -w apps`: 0 error TypeScript, build produksi Vite sukses.
3. `git status --porcelain`: Direktori kerja Git bersih (tidak ada file sisa/untracked).
4. Dev-log dicatat di `docs/dev-logs/dev-log-YYYY-MM-DD-[task-name].md`.
