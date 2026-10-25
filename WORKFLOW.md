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

### Phase 135: GridCraft — In-App Interactive Spreadsheet Engine (Center Panel) ✅ DONE
**Goal:** Mengubah viewer spreadsheet statis di panel tengah (`WorkstationCenterPanel.tsx` & `SpreadsheetViewer.tsx`) menjadi engine spreadsheet interaktif mandiri (**GridCraft**). Pengguna dapat melihat sel dihitung secara *live* saat AI mengetik, memilih dan mengedit cell/formula manual, menambah sheet, serta menyimpan perubahan langsung ke file `.xlsx`/`.csv` tanpa memerlukan Microsoft Excel.

#### 135.1 Interactive Spreadsheet Grid Component
- [x] Ganti rendering tabel statis dengan canvas/DOM spreadsheet grid interaktif berkecepatan tinggi (header kolom A, B, C..., nomor baris 1, 2, 3..., cell selection box).
- [x] Implementasikan Formula Bar di bagian atas panel tengah yang menampilkan teks atau formula aktif (contoh: `=SUM(C2:C10)`).
- [x] Dukungan navigasi keyboard (Arrow keys, Tab, Enter) dan inline cell editing.
- [x] Multi-sheet tab bar di bagian bawah grid (Sheet1, Sheet2, dsb.) dengan kemampuan beralih sheet secara instan.

#### 135.2 Live AI-to-Grid Synchronization
- [x] Tambahkan listener event perubahan file lokal: saat backend Rust (`write-excel` atau `doc_com`) memperbarui cell, tab GridCraft yang sedang terbuka otomatis memperbarui nilai cell yang terpengaruh dengan animasi highlight halus tanpa mereload seluruh tab.
- [x] Integrasikan kalkulasi formula offline (SUM, AVERAGE, MIN, MAX, IF, kalkulasi pajak/diskon) langsung di memori lokal.

#### 135.3 File Persistence & Native Office Bridge
- [x] Tombol Save/Export langsung dari GridCraft ke `.xlsx` dan `.csv` via endpoint `/api/desktop/write-excel`.
- [x] Tombol pintas *"Open in Native Excel"* di header tab yang memanggil `/api/desktop/open-excel` via `core/arunaki-docs` bagi pengguna yang ingin melihat file di aplikasi Microsoft Excel desktop asli.
- [x] Tampilkan status autosave / unsaved indicator pada header tab panel tengah.
- [x] Script tracker pembaruan upstream ArtCraft (`scripts/sync-artcraft.cjs` dan manifest `artcraft-sync-manifest.json`).

---

### Phase 136: WordCraft — Official Rich Document Canvas & Paged A4 Layout (Center Panel) ✅ DONE
**Goal:** Menghadirkan editor dan viewer dokumen resmi (**WordCraft**) di panel tengah dengan tampilan layout kertas A4, margin standar, penomoran halaman, serta visualisasi *diff* real-time ketika AI merevisi isi dokumen.

#### 136.1 Paged A4 Document Layout
- [x] Buat komponen `WordCraft` di panel tengah dengan layout kertas A4 (lebar proporsional 794px, bayangan kertas halus, margin atas/bawah/samping).
- [x] Dukungan rendering rich formatting: Heading 1/2/3, paragraf berjarak rapi, bullet points, dan tabel data formal.
- [x] Header & Footer dokumen resmi (nomor halaman, judul dokumen, tanggal).
- [x] Mode pergantian tampilan (A4 Paged View vs Continuous Flow) dan font switcher (Formal Serif vs Clean Sans).

#### 136.2 Real-time AI Revision Diff Markers & Pure-Rust Extraction
- [x] Penanda revisi AI visual: pendeteksi pertambahan baris teks real-time dengan badge telemetry.
- [x] Backend Rust endpoint `/api/desktop/parse-word` menggunakan `core/arunaki-docs` untuk mengekstrak paragraf dan tabel `.docx` secara offline.
- [x] Render dokumen `.docx` langsung tanpa ketergantungan pada Microsoft Word.

#### 136.3 Document Export & Dual-Mode Companion
- [x] Fitur cetak / simpan langsung ke format A4 PDF via tombol *Print / PDF*.
- [x] Tombol pintas *"Native Word"* di header tab yang memanggil `/api/desktop/open-word` Win32 COM companion.

---

### Phase 137: PdfCraft — Embedded PDF Reader & Visual Data Cartographer (Center Panel) ✅ DONE
**Goal:** Membuka file PDF (faktur, nota, rekening koran) langsung di dalam tab panel tengah (**PdfCraft**), dengan layer visualisasi kotak bounding-box yang menunjukkan bagian teks atau tabel mana yang sedang diekstrak oleh AI.

#### 137.1 Embedded Native PDF Canvas Viewer
- [x] Integrasikan renderer canvas PDF di panel tengah dengan fitur zoom in/out, fit to width/page, navigasi halaman (`ChevronLeft`/`ChevronRight`), dan thumbnail halaman di sisi kiri.
- [x] Rendering 100% offline di memori lokal melalui backend Pure-Rust endpoint `/api/desktop/read-binary` dan `iframe/embed` native WebView2.
- [x] Mode view switcher terintegrasi: *Cartographer* (Visual overlay), *Structured Tables* (Data grid), dan *Raw Text* (Stream extractor).

#### 137.2 Visual Data Extraction Overlay & GridCraft Bridge
- [x] Koordinat bounding-box dari `core/arunaki-docs` (`detect_tables_from_text` & `bbox`) dirender sebagai overlay semi-transparan interaktif di atas halaman PDF, sehingga user melihat apa yang dibaca oleh AI secara transparan.
- [x] Tombol aksi cepat: *"Send to GridCraft (Rekap ke Excel)"* langsung mengekspor tabel transaksi dari PDF ke format `.xlsx` GridCraft tanpa ketik manual.
- [x] Tombol pintas pencarian teks di halaman, cetak PDF (`window.print`), dan tombol *"Open External"* untuk membuka file di pembaca PDF sistem operasi asli.

---

### Phase 138: DeckCraft — Presentation Slide Carousel & Executive Deck Viewer (Center Panel) ✅ DONE
**Goal:** Menyediakan viewer dan presenter slide presentasi (**DeckCraft**) di panel tengah untuk meninjau ringkasan eksekutif, laporan bulanan, dan materi presentasi dalam bentuk kartu slide visual.

#### 138.1 Slide Deck Presentation Viewer
- [x] Komponen presenter slide di panel tengah dengan kartu slide berasio 16:9 (960px × 540px), navigasi slide sebelumnya/berikutnya, dan panel thumbnail di sebelah kiri.
- [x] Mode presentasi fullscreen (F5 / tombol Present) langsung dari Arunaki dengan overlay kontrol mengambang minimalis.
- [x] Zoom in/out, navigasi keyboard (Arrow Left/Right, Space, Page Up/Down), dan template kartu slide (Cover/Hero, KPI metric blocks, bullet points, data tables).

#### 138.2 Autonomous Slide Generation from Project Documents & Dual-Mode Office
- [x] Agent dapat membuka dan menyajikan slide deck dari file presentasi (`.pptx`, `.ppt`, file slide markdown).
- [x] Editor mode terintegrasi untuk menambah atau merevisi slide deck secara langsung.
- [x] Dual-Mode Win32 COM Office companion (`/api/desktop/open-ppt` dan `/api/desktop/parse-ppt`) untuk membuka presentasi di aplikasi desktop Microsoft PowerPoint asli.
- [x] Dukungan print slide handouts dan copy slide content.

---

### Phase 139: Tauri v2 Native Rust IPC Architecture & Frameless Desktop Shell (`api.rs`) ✅ DONE
**Goal:** Menghilangkan double titlebar Windows dengan custom frameless titlebar (`decorations: false`), memindahkan seluruh logika backend/CLI dari webview fetch ke modul Pure-Rust [`src-tauri/src/api.rs`](file:///E:/ARUNAKI/src-tauri/src/api.rs), dan menyederhanakan `api.ts` di sisi React menjadi thin IPC bridge adapter.

#### 139.1 Frameless Window & Native Drag Region
- [x] Nonaktifkan dekorasi jendela bawaan Windows OS (`decorations: false`) di `src-tauri/tauri.conf.json`.
- [x] Berikan kapabilitas `core:window:allow-minimize`, `allow-maximize`, `allow-toggle-maximize`, `allow-close`, `allow-start-dragging` di `src-tauri/capabilities/default.json`.
- [x] Integrasikan `data-tauri-drag-region` pada header aplikasi dan tombol kontrol native (Minimize, Maximize/Restore, Close) dengan proteksi klik pada elemen interaktif.

#### 139.2 Modular Rust Backend API (`src-tauri/src/api.rs`)
- [x] Buat modul Rust khusus [`src-tauri/src/api.rs`](file:///E:/ARUNAKI/src-tauri/src/api.rs) yang memuat seluruh handler native Tauri:
  - `tauri_engine_fetch`: Direct internal loopback dispatcher tanpa limitasi browser web socket.
  - `tauri_cli_login`: Spawn proses native Windows terminal (`agy`, `codex`, `claude`, `opencode`) dan credential clearance atomic.
  - `tauri_cli_status`: In-memory harvesting status credential langsung di Rust.
  - Window commands: `window_minimize`, `window_toggle_maximize`, `window_close`.
- [x] Refactor [`src-tauri/src/lib.rs`](file:///E:/ARUNAKI/src-tauri/src/lib.rs) menjadi bersih (98 baris) dengan mendelegasikan perintah ke `pub mod api`.

#### 139.3 React Thin-Client Bridge Adapter
- [x] Perbarui [`apps/src/lib/api.ts`](file:///E:/ARUNAKI/apps/src/lib/api.ts) untuk mengutamakan Native Tauri IPC `invoke()` sebelum fallback ke HTTP.
- [x] Hubungkan seluruh aksi login dan sign-out CLI di [`SettingsCliConnectionsTab.tsx`](file:///E:/ARUNAKI/apps/src/components/settings/SettingsCliConnectionsTab.tsx) ke `tauriCliLogin()` untuk mencegah 404 network fetch error.

---

### Phase 140: Pure-Rust Native Dialog Module (`dialog.rs`) & Folder Picker Parity ✅ DONE
**Goal:** Menggantikan pemanggilan legacy `window.arunakiDesktop.pickFolder` dengan modul Pure-Rust [`src-tauri/src/dialog.rs`](file:///E:/ARUNAKI/src-tauri/src/dialog.rs) untuk membuka dialog pemilih folder dan file Windows bawaan secara native tanpa console flash.

#### 140.1 Native Dialog Handlers in Rust
- [x] Buat modul [`src-tauri/src/dialog.rs`](file:///E:/ARUNAKI/src-tauri/src/dialog.rs) dengan perintah:
  - `pick_folder`: Membuka `FolderBrowserDialog` Windows di latar belakang secara asynchronous (`tokio::task::spawn_blocking`) dengan flag `CREATE_NO_WINDOW`.
  - `pick_file`: Membuka `OpenFileDialog` Windows dengan filter ekstensi file.
  - `show_in_explorer`: Membuka Windows Explorer dan menyorot path file target.
  - `open_path`: Meluncurkan path file/URL di aplikasi default OS.
- [x] Daftarkan `pub mod dialog;` dan handler dialog di [`src-tauri/src/lib.rs`](file:///E:/ARUNAKI/src-tauri/src/lib.rs).

#### 140.2 Frontend Integration
- [x] Tambahkan helper `tauriPickFolder()`, `tauriPickFile()`, dan `tauriShowInExplorer()` di [`apps/src/lib/api.ts`](file:///E:/ARUNAKI/apps/src/lib/api.ts).
- [x] Integrasikan `tauriPickFolder()` di [`useActiveFolderSync.ts`](file:///E:/ARUNAKI/apps/src/components/layout/hooks/useActiveFolderSync.ts) sehingga tombol "Open Folder" di header langsung membuka dialog native.
- [x] Integrasikan `tauriPickFolder()` di [`ConnectFolderModal.tsx`](file:///E:/ARUNAKI/apps/src/components/workstation/ConnectFolderModal.tsx) sehingga tombol "Pilih Folder..." bekerja 100%.

---

### Phase 141: Modular Rust Desktop Architecture (`office.rs`, `fs.rs`, `system.rs`) ✅ DONE
**Goal:** Memindahkan seluruh automasi dokumen Office COM, pembacaan file terisolasi, deteksi tool CLI, dan telemetri hardware ke dalam suite modul Pure-Rust di `src-tauri/src/`.

#### 141.1 Native Win32 COM Document Companion (`office.rs`)
- [x] Implementasi `open_excel_native`, `open_word_native`, `open_ppt_native` menggunakan `arunaki-docs::com`.
- [x] Implementasi `check_office_support` untuk deteksi keberadaan aplikasi Microsoft Office di OS Windows.

#### 141.2 Workspace Filesystem Isolation (`fs.rs`)
- [x] Implementasi `list_project_files`, `read_project_file`, dan `write_project_file`.
- [x] Proteksi path traversal ketat: akses file di luar folder aktif diblokir (`Path traversal violation`).

#### 141.3 System Telemetry & Diagnostics (`system.rs`)
- [x] Implementasi `get_system_telemetry`: CPU cores, OS architecture, runtime version.
- [x] Implementasi `detect_cli_binaries`: scanning PATH otomatis untuk `agy`, `claude`, `codex`, `opencode`, `kiro`, `9router`, `git`, `node`.
- [x] Implementasi `system_ping`: latency probe webview-to-Rust IPC berpresisi milidetik.
- [x] Unit testing: 4 unit test di `system.rs` dan `fs.rs` lulus 100% (`cargo test --manifest-path src-tauri/Cargo.toml`).

---

### Phase 142: ArtCraft WordCraft WASM In-App Suite Integration (Center Panel) ✅ DONE
**Goal:** Menggantikan tampilan lama `WordCraft.tsx` dengan aplikasi resmi **WordCraft** dari ekosistem ArtCraft (`storytold/wordcraft`) yang di-embed langsung via WebAssembly (WASM) di Panel Tengah Workstation, lengkap dengan Office Ribbon, Margin Ruler, dan Navigation Outline.

#### 142.1 Official WordCraft WASM Bundle
- [x] Sediakan bundel statis rilis resmi WordCraft Web di `apps/public/artcraft/wordcraft/` (`index.html`, `wordcraft-web.js`, `wordcraft-web_bg.wasm`).
- [x] Konfigurasi serving aset statis Vite/Tauri untuk dukungan streaming kompilasi WebAssembly (`application/wasm`).

#### 142.2 Embedded Canvas & Bidirectional Bridge
- [x] Rombak total [`WordCraft.tsx`](file:///E:/ARUNAKI/apps/src/components/workstation/canvas/WordCraft.tsx): hilangkan toolbar manual lama dan gantikan dengan embedded canvas WordCraft Web murni (`?host=parent`).
- [x] Implementasikan protokol event bus `postMessage`:
  - `wordcraft:ready` & `wordcraft:open`: Injeksi dokumen dari Arunaki ke kanvas WordCraft seketika.
  - `wordcraft:save`: Tangkap dokumen hasil simpan/Ctrl+S dari WordCraft dan tulis ke folder proyek aktif.
  - `wordcraft:dirty`: Sinkronisasi status indikator perubahan file di tab bar.
- [x] Dual-Mode Office Companion: Pertahankan tombol cepat *"Native Office"* untuk peluncuran langsung ke Microsoft Word desktop Windows asli.

---

## Verification & Quality Gates

Sebelum menyelesaikan setiap fase, WAJIB memverifikasi:
1. `cargo test --workspace`: Semua unit test Rust lolos 100%.
2. `npm run build -w apps`: 0 error TypeScript, build produksi Vite sukses.
3. `git status --porcelain`: Direktori kerja Git bersih (tidak ada file sisa/untracked).
4. Dev-log dicatat di `docs/dev-logs/dev-log-YYYY-MM-DD-[task-name].md`.
