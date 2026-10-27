# WORKFLOW.md — Arunaki Development Roadmap

**Product:** Arunaki — Autonomous Document Operating System & Desktop Computer Use Agent  
**Architecture:** Tauri v2 Native Desktop Shell + Axum Tokio Pure-Rust Engine + Native Win32 COM Sidecar  
**Last Updated:** 2026-10-27  

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

### Phase 143: ArtCraft Autonomous Agent Integration & Center Workspace Expansion ✅ DONE
**Goal:** Menghubungkan 4 suite aplikasi dokumen ArtCraft (WordCraft, GridCraft, PdfCraft, DeckCraft) ke AI Agent via tool resmi `open_document_app`, memperbarui system prompt `default.txt`, menambahkan toggle Maximize Center Workspace (Full width), dan memisahkan CLI connection provider dari menu API key.

#### 143.1 ArtCraft Document Application Tool (`open_document_app`)
- [x] Implementasi modul Rust `open_app.rs` di `core/arunaki-engine/src/tool/` dengan tool definition dan eksekutor yang memancarkan SSE event `open_document_app`.
- [x] Registrasi `open_document_app` pada dispatcher `build_tool_definitions()` dan `execute_tool_call()` di `core/arunaki-engine/src/tool/mod.rs`.
- [x] Penambahan dokumentasi prompt tool `core/arunaki-engine/src/tool/prompt/open_document_app.txt`.
- [x] Pembaruan system prompt `core/arunaki-engine/src/session/prompt/default.txt` memberi pemahaman bahwa Arunaki memiliki ArtCraft in-app suite dan menginstruksikan agent untuk selalu memanggil `open_document_app` (bukan menyuruh user membuka Start Menu).

#### 143.2 Frontend Event Wiring & Tab Experience
- [x] Pemetaan event SSE `open_document_app` di `apps/src/lib/engine.ts`.
- [x] Integrasi listener event `arunaki:open-app` di `useWorkstationChat.ts` dan `useExternalChatEvents.ts` untuk membuka tab dokumen di Panel Tengah saat agent memanggil tool.
- [x] Telemetri badge eksekusi bersih di `LiveExecutionBadge.tsx` ("Opened WordCraft", "Opening WordCraft") dengan icon representatif SVG.
- [x] Perbaikan label dan icon tab aplikasi: tipe `"app"` dengan fileType `"wordcraft-app"`, menghapus path palsu `WordCraft.docx` saat meluncurkan aplikasi mandiri.
- [x] Tombol Maximize Center Workspace (`Maximize2`/`Minimize2`) di `CenterTabHeader.tsx` untuk membentangkan ruang kerja panel tengah hingga 100% selebar layar (dengan menyembunyikan explorer dan chat).

#### 143.3 CLI vs Cloud API Key Provider Isolation
- [x] Pemisahan ketat penyedia CLI (`codex-cli`, `kiro-cli`, `claude-cli`, dsb.) dan port local-bridge (`20188`/`20189`) dari tab Model Providers di Settings. Tab Providers kini eksklusif untuk API Key cloud.

---

### Phase 144: Modern Windows Explorer Folder Picker & Custom Modal System ✅ DONE
**Goal:** Menggantikan dialog folder lama WinForms dengan dialog modern Windows 10/11 Explorer (`IFileOpenDialog`), menghapus overlay floating di WordCraft yang menimpa toolbar, menyembunyikan tombol copy pada tab aplikasi, dan mengganti seluruh `window.confirm()` dengan modal custom monokrom gelap.

#### 144.1 Modern Windows Explorer Common Item Dialog (`IFileOpenDialog`)
- [x] Implementasi skrip `scripts/pick-folder.ps1` yang memanggil COM Interface `IFileOpenDialog` (Vista/Win10/Win11) dengan opsi `FOS_PICKFOLDERS`.
- [x] Sematkan skrip langsung ke dalam binary `dialog.rs` via `include_str!` dengan transmisi stdin pipeline aman tanpa batasan panjang command line.
- [x] Tombol "Open Folder" kini membuka jendela Windows Explorer modern yang lengkap dengan panel navigasi, breadcrumb address bar, dan tombol "Select Folder" seperti pada VS Code.

#### 144.2 WordCraft Canvas Overlay Elimination & Tab Hygiene
- [x] Hapus floating overlay badge `Unsaved Changes` yang sebelumnya menimpa tombol bawaan WordCraft WASM di pojok kanan atas.
- [x] Salurkan event `wordcraft:dirty` langsung ke tab header bar Arunaki sehingga tanda belum disimpan muncul sebagai titik putih bersih pada tab.
- [x] Sembunyikan tombol copy konten di header tab jika tab yang aktif adalah tab aplikasi (`type === "app"`), menjaga tab header tetap ringkas dan tidak ambigu.

#### 144.3 Custom Dark Monochrome Confirmation Modals
- [x] Hilangkan seluruh popup bawaan browser `window.confirm()` bertuliskan `tauri.localhost says` di `ModelProviderSettings.tsx`, `WorkstationLeftExplorer.tsx`, dan `KnowledgeNodePanel.tsx`.
- [x] Ganti dengan modal konfirmasi custom Arunaki bertema monokrom gelap dengan aksen rose, backdrop blur, dan tombol konfirmasi yang terintegrasi rapi dengan antarmuka desktop.

---

### Phase 145: WordCraft Document Persistence, Breadcrumb Hierarchy & Redundant File Prevention ✅ DONE
**Goal:** Memastikan setiap dokumen yang dibuat AI di WordCraft langsung ditulis sebagai file fisik `.docx` di folder proyek aktif, memperjelas hirarki Tab & Breadcrumbs (`[Folder] > WordCraft > [Dokumen.docx]`), mengaktifkan auto-save & Ctrl+S ke harddisk, mencegah AI membuat file duplikat berulang, serta mendukung pembukaan folder langsung dari kartu riwayat percakapan.

#### 145.1 WordCraft Physical File Persistence & Open App Tool Extension
- [x] Perluas tool Rust `open_document_app` (`open_app.rs`) dengan parameter `path`.
- [x] Jika AI membuat dokumen (misal *"kata kata hari ini"*), sistem otomatis menormalisasi nama file (`kata kata hari ini.docx`), menulis isi awal ke disk aktif di `workspace_dir`, dan memancarkan event `file.edited` agar file seketika muncul di File Explorer sebelah kiri.
- [x] Pembaruan system prompt `core/arunaki-engine/src/session/prompt/default.txt`: instruksi wajib mengecek file yang sudah ada (`read`, `glob`) dan memperbarui file eksisting dengan `edit` / `write` tanpa membuat file duplikat baru (misal `laporan_1.xlsx` atau `kata_kata_baru.docx`).

#### 145.2 Clear Breadcrumb Hierarchy & Tab Hygiene
- [x] Perbarui [`CenterBreadcrumbs.tsx`](file:///E:/ARUNAKI/apps/src/components/workstation/tabs/CenterBreadcrumbs.tsx) untuk menampilkan alur hirarkis: `[Nama Folder] > [Nama App] > [Nama Dokumen]` (contoh: `workspace > WordCraft > kata kata hari ini.docx`).
- [x] Tab Header menampilkan nama dokumen nyata dengan icon WordCraft, dan deduplikasi tab mencegah tab ganda untuk file dokumen yang sama.
- [x] Dukungan penyimpanan file app di [`useTabs.ts`](file:///E:/ARUNAKI/apps/src/components/workstation/tabs/useTabs.ts) dan [`UnifiedWorkstationPage.tsx`](file:///E:/ARUNAKI/apps/src/pages/UnifiedWorkstationPage.tsx) untuk menyimpan perubahan WordCraft (`wordcraft-app`) langsung ke file disk fisik via `desktop.writeFile`.
- [x] Frame WordCraft `apps/public/artcraft/wordcraft/index.html` memancarkan `wordcraft:ready` saat WebAssembly boot, dan iframe `onLoad` membersihkan spinner seketika.

#### 145.3 History Session Folder Navigation
- [x] Badge folder pada kartu riwayat di [`HistorySessionItem.tsx`](file:///E:/ARUNAKI/apps/src/components/history/HistorySessionItem.tsx) kini interaktif (hover efek dan klik langsung) untuk membuka folder proyek dan melanjutkan percakapan terkait.

---

### Phase 146: Active Folder Opening Reliability, Bidirectional URL Sync & VS Code Parity Explorer Actions ✅ DONE
**Goal:** Memperbaiki bug pembukaan folder aktif yang menyebabkan status tetap "No folder opened" akibat race condition dua arah antara URL searchParams dan React state, sinkronisasi event rekursif, serta menyediakan tombol "Open Folder" langsung di Explorer, Center Panel, dan Footer pill.

#### 146.1 URL vs State Bidirectional Synchronization Guard
- [x] Perbaiki race condition di [`useWorkstationSession.ts`](file:///E:/JS/Arunika/apps/src/components/workstation/hooks/useWorkstationSession.ts): Effect 2 (State -> URL) tidak lagi menghapus parameter query `folder` yang baru dimasukkan melalui navigasi/history sebelum Effect 3 (URL -> State) sempat membacanya.
- [x] Tambahkan sinkronisasi ref (`activeFolderRef`, `activeChatIdRef`) untuk mencegah badai rekursi sinkron pada listener event `arunaki-folder-change`.
- [x] Perbarui IPC folder picker di [`api.ts`](file:///E:/JS/Arunika/apps/src/lib/api.ts) untuk memanggil `@tauri-apps/api/core` invoke dengan argumen objek `{}` yang benar.

#### 146.2 VS Code Parity Explorer & Center Empty State Actions
- [x] Tambahkan tombol interaktif "Open Folder..." (`FolderOpen`) langsung di empty state [`WorkstationLeftExplorer.tsx`](file:///E:/JS/Arunika/apps/src/components/workstation/WorkstationLeftExplorer.tsx) lengkap dengan deskripsi dan tombol header saat belum ada folder terbuka.
- [x] Tambahkan tombol "Open Folder..." pada [`CenterEmptyState.tsx`](file:///E:/JS/Arunika/apps/src/components/workstation/tabs/CenterEmptyState.tsx) di panel tengah saat ruang kerja kosong.
- [x] Jadikan pill folder di [`AppFooter.tsx`](file:///E:/JS/Arunika/apps/src/components/layout/AppFooter.tsx) interaktif (dapat diklik langsung untuk membuka folder atau mengganti folder aktif).
- [x] Daftarkan string `openFolderDescription` pada kamus multibahasa di [`i18n.ts`](file:///E:/JS/Arunika/apps/src/lib/i18n.ts).

---

### Phase 147: Native Modern File Explorer Dialog (`rfd`), Desktop Bridge IPC & Engine Console Subsystem ✅ DONE
**Goal:** Mengganti dialog pemilih folder pohon WinForms dengan Modern Windows File Explorer asli (`rfd`), menghubungkan `desktopBridge.ts` via Native Tauri IPC Direct Memory (`apiFetch`), serta mengaktifkan konsol terminal pada executable daemon `arunaki-engine.exe`.

#### 147.1 Modern Windows File Explorer Picker via `rfd`
- [x] Integrasikan crate `rfd` ("Rust File Dialog") pada [`src-tauri`](file:///E:/JS/Arunika/src-tauri/Cargo.toml) dan perbarui [`src-tauri/src/dialog.rs`](file:///E:/JS/Arunika/src-tauri/src/dialog.rs).
- [x] Menghilangkan subprocess PowerShell pembuat dialog pohon lama; memanggil Win32 COM `IFileOpenDialog` modern secara langsung di level native Rust (0 latency, tampilan full File Explorer dengan Quick Access, address bar, dan tombol *Select Folder*).

#### 147.2 Desktop Bridge Native Tauri IPC
- [x] Buat [`desktopBridge.ts`](file:///E:/JS/Arunika/apps/src/lib/desktopBridge.ts) dan inisialisasi pada [`main.tsx`](file:///E:/JS/Arunika/apps/src/main.tsx) saat aplikasi boot.
- [x] Seluruh pemanggilan `window.arunakiDesktop` (folder-tree, read-file, write-file, native Office) dialihkan melalui `apiFetch` yang secara otomatis menggunakan `tauri_engine_fetch` (Zero Network / Direct Memory IPC).

#### 147.3 Console Subsystem for Engine Daemon
- [x] Hapus atribut `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` dari [`core/arunaki-engine/src/main.rs`](file:///E:/JS/Arunika/core/arunaki-engine/src/main.rs).
- [x] `arunaki-engine.exe` kini membuka jendela konsol terminal interaktif lengkap dengan banner ASCII dan live logs saat dijalankan secara mandiri.

---

### Phase 148: Pure ArtCraft 4-Core Document Suite (Zero Custom UI Clutter & Pure-WASM In-App Integration) ✅ DONE
**Goal:** Menghilangkan seluruh toolbar buatan, custom formula bar, dan kontrol tiruan di Panel Tengah; menggantikannya 100% dengan aplikasi WebAssembly murni dari suite resmi ArtCraft (**GridCraft**, **WordCraft**, **PdfCraft**, dan **DeckCraft**).

#### 148.1 Zero Custom UI Clutter Across 4 Core Document Canvases
- [x] Rombak `GridCraft.tsx`: hapus 1000 baris custom spreadsheet grid & formula bar tiruan; embed kanvas WebAssembly resmi ArtCraft GridCraft murni (`/artcraft/gridcraft/index.html?host=parent`).
- [x] Rombak `PdfCraft.tsx`: hapus 750 baris custom table extraction view & manual pagination; embed kanvas WebAssembly resmi ArtCraft PdfCraft murni (`/artcraft/pdfcraft/index.html?host=parent`).
- [x] Rombak `DeckCraft.tsx`: hapus 670 baris custom slide preview & thumbnail viewer; embed kanvas WebAssembly resmi ArtCraft DeckCraft murni (`/artcraft/deckcraft/index.html?host=parent`).
- [x] Standarisasi `WordCraft.tsx`: kanvas WebAssembly murni ArtCraft WordCraft (`/artcraft/wordcraft/index.html?host=parent`).

#### 148.2 Document Byte Transport & Canvas Drop Dispatcher
- [x] Tambahkan message handler di `index.html` masing-masing aplikasi (`apps/public/artcraft/*/index.html`) yang menyintesiskan `DragEvent("drop")` berstandar W3C DataTransfer ke elemen `<canvas>` egui-winit saat dokumen dikirim dari host.
- [x] Pembacaan binary dokumen fisik (`.xlsx`, `.pdf`, `.pptx`, `.docx`) melalui endpoint `/api/desktop/read-file` disalurkan secara aman ke kanvas ArtCraft dengan decoding base64 ke `ArrayBuffer` murni.
- [x] Pertahankan Dual-Mode Office Companion (*"Open in Native Excel"*, *"Open in Native Word"*, *"Open in Native PowerPoint"*, *"Open in Native Reader"*) saat file fisik tersedia.

#### 148.3 Official Storytold ArtCraft Icons & Base64 Binary Auto-Decoding Guard
- [x] Unduh dan sematkan 4 ikon resmi aplikasi dari repositori GitHub Storytold (`gridcraft.png`, `wordcraft.png`, `pdfcraft.png`, `deckcraft.png`).
- [x] Hubungkan ikon resmi ArtCraft ke menu dropdown `AppsMenu.tsx`, tab header `CenterTabHeader.tsx`, dan penanda ekstensi file di `tree-utils.tsx`.
- [x] Implementasikan auto-decoding Base64 pada `handle_write_file` di backend Rust (`desktop.rs`) untuk mencegah kebocoran string ASCII Base64 (`UEsDB...`) ke dalam sel Excel atau dokumen Word.

---

### Phase 149: Native Canvas Workspace & Direct Local Disk .docx Synchronization ✅ DONE
**Goal:** Memisahkan kanvas AI/catatan dari grid spreadsheet GridCraft dan membangun antarmuka mandiri `CanvasView.tsx`; menyinkronkan pembacaan & penyimpanan dokumen `.docx` langsung ke harddisk lokal (`E:\REKAPAN\Document 1.docx`) dengan dukungan Dual-Mode "Open in Word (Desktop)".

#### 149.1 Native Canvas Workspace UI (`CanvasView.tsx`)
- [x] Bangun komponen `CanvasView.tsx` murni React dengan antarmuka modern khas Cursor/Antigravity tanpa ketergantungan iframe WASM.
- [x] Render tabel data markdown dengan sticky header, penomoran urut baris `#`, perataan angka otomatis (tabular font-mono), dan filter pencarian baris instan.
- [x] Sediakan tombol cepat "Copy Canvas / Table", "Export as CSV", dan "Export as Markdown (.md)".
- [x] Pisahkan routing `tab.type === "canvas"` di `WorkstationCenterPanel.tsx` agar tidak lagi dipaksa masuk ke GridCraft atau WordCraft.

#### 149.2 Direct Local Disk .docx Sync & Relative Path Resolution
- [x] Perbaiki fungsi keamanan `check_allowed_path` di `core/arunaki-engine/src/desktop.rs` agar otomatis menggabungkan path relatif dengan folder aktif workspace (`E:\REKAPAN`).
- [x] Perbaiki pembacaan binary `/api/desktop/read-file` dan penulisan binary `/api/desktop/write-file` untuk seluruh format dokumen (.docx, .xlsx, .pptx, .pdf).
- [x] Perbarui `WordCraft.tsx`: tangkap event `wordcraft:save` dan simpan byte biner asli `.docx` secara langsung ke file fisik di disk komputer pengguna.
- [x] Sediakan toolbar Dual-Mode di `WordCraft.tsx` dengan tombol cepat "Open in Word" (Microsoft Word Desktop Companion) dan "Save to Disk".

---

### Phase 150: WordCraft Direct Document Ingestion & Backstage Bypass ✅ DONE
**Goal:** Memperbaiki kanvas WordCraft WASM agar langsung membuka dokumen ke editor kanvas aktif (beserta ribbon, ruler, dan font Aptos) tanpa terjebak pada layar Backstage / Recent files atau memunculkan pesan error `files are opened through the browser on the web`.

#### 150.1 Automated RFD File Input Interception
- [x] Hook `HTMLInputElement.prototype.click` di `apps/public/artcraft/wordcraft/index.html` untuk mencegat dialog file bawaan Rust (`rfd`) dan langsung menginjeksi dokumen `pendingFile` via W3C DataTransfer.
- [x] Jalankan urutan klik otomatis yang bersih (`File` -> `Open` -> `Browse...`) untuk memicu `rfd` tanpa popup native browser.
- [x] Bersihkan timer sequence saat dokumen berhasil diinjeksi untuk menghindari loop klik ganda.

#### 150.2 Host-Side Immediate Document Dispatch & Blank Sequence
- [x] Perbarui `WordCraft.tsx` agar selalu memancarkan payload dokumen begitu frame WebAssembly siap (`wordcraft:ready`).
- [x] Tangani pembuatan dokumen baru / dokumen kosong secara mulus dengan pemilihan kartu template blank secara otomatis.

---

## Verification & Quality Gates

Sebelum menyelesaikan setiap fase, WAJIB memverifikasi:
1. `cargo test --workspace`: Semua unit test Rust lolos 100%.
2. `npm run build -w apps`: 0 error TypeScript, build produksi Vite sukses.
3. `git status --porcelain`: Direktori kerja Git bersih (tidak ada file sisa/untracked).
4. Dev-log dicatat di `docs/dev-logs/dev-log-YYYY-MM-DD-[task-name].md`.


