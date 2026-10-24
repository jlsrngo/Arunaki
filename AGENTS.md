# AGENT.md

## Mission

You are the AI Software Engineer responsible for building **Arunaki — Autonomous Document Operating System & Desktop Computer Use Agent**.

Arunaki adalah **Autonomous Document Operating System** yang mengintegrasikan suite 4 aplikasi dokumen mandiri (ArtCraft: GridCraft [.xlsx/.csv], WordCraft [.docx/laporan], PdfCraft [.pdf], DeckCraft [.pptx/slide]) yang dapat dibuka, diedit, dan dikendalikan secara otonom langsung di **Panel Tengah (Center Panel Workstation)** tanpa bergantung pada software eksternal berbayar seperti Microsoft Office atau Adobe Acrobat.

Arunaki setara dengan Claude Computer Use / OpenClaw dalam hal kemampuan mengendalikan aplikasi dokumen desktop (membuka spreadsheet, mengetik di cell, memformat dokumen, mengekstrak PDF), tetapi **semua operasi dibatasi ke Folder Proyek Aktif dan fokus pada dokumen — bukan coding, shell execution, atau script tampering.**

---

## Platform & Architecture (Tauri v2 + Pure-Rust Engine)

**Arunaki is a Web UI + Native Desktop Shell (Tauri v2 + Axum Tokio Pure-Rust Engine).** Bukan terminal, bukan Telegram, bukan CLI, dan bukan lagi Electron.

- Shell desktop menggunakan **Tauri v2** (`src-tauri`) dengan Microsoft Edge WebView2.
- Backend engine menggunakan **Rust Axum + Tokio** yang berjalan lokal pada `127.0.0.1:4096`.
- Local-CLI Bridge berjalan pada port `20188` (dengan proteksi *Smart Port Collision Fallback* dan *Origin Guard*).
- Sidecar dokumen menggunakan native Win32 COM & Office XML parser (`core/arunaki-docs`).
- Seluruh fitur, interaksi, dan UX dirancang untuk antarmuka web modern berkecepatan tinggi di dalam desktop shell native.

---

## Autonomous Document Operating System & Center Panel Integration (CRITICAL)

**Tujuan akhir Arunaki adalah menjadi Autonomous Document Operating System terpadu.**

Panel Tengah ([`WorkstationCenterPanel.tsx`](file:///E:/JS/Arunika/apps/src/components/workstation/WorkstationCenterPanel.tsx)) adalah pusat ruang kerja di mana 4 aplikasi dokumen inti dibuka langsung di dalam Arunaki:

1. **GridCraft (`.xlsx`, `.csv`)**: Spreadsheet interaktif lengkap dengan formula bar, navigasi cell baris/kolom, dan sinkronisasi *real-time* saat AI menulis formula atau data rekap.
2. **WordCraft (`.docx`, Markdown, Canvas)**: Rich document canvas dengan layout halaman resmi (A4), tipografi tajam, tabel rapi, dan penanda *diff* visual langsung saat AI mengedit dokumen.
3. **PdfCraft (`.pdf`)**: Embedded PDF reader dan visual data cartographer yang menampilkan dokumen asli (invoice/rekening koran) beserta layer kotak bounding-box tabel yang diekstrak AI.
4. **DeckCraft (`.pptx`, Slide Decks)**: Slide presenter & card carousel untuk meninjau materi presentasi dan ringkasan eksekutif secara visual.

Ketika pengguna mengetik perintah singkat di chat, AI secara otomatis memproses file dan **langsung membuka tab aplikasi dokumen yang bersangkutan di Panel Tengah**.

---

## Dual-Mode Document Architecture: In-App Suite + Native Office Companion (CRITICAL)

**Arunaki mengusung arsitektur Dual-Mode. Integrasi dokumen in-app (ArtCraft) TIDAK MENGGANTIKAN kemampuan native Microsoft Office yang sudah ada.**

1. **Mode 1 — Built-In In-App Suite (ArtCraft / Panel Tengah)**:
   - Berjalan langsung di dalam Panel Tengah (GridCraft, WordCraft, PdfCraft, DeckCraft).
   - Menjamin pengguna yang *tidak memiliki* Microsoft Office atau Adobe Acrobat di komputernya tetap bisa membuka, melihat, mengedit formula/cell, dan mengekspor dokumen secara 100% mandiri, offline, dan bebas biaya lisensi.

2. **Mode 2 — Native Microsoft Office COM Companion (`core/arunaki-docs`)**:
   - Kemampuan automasi native Win32 COM (`openExcelNative`, `openWordNative`, `/api/desktop/open-excel`, `/api/desktop/open-word`) **TETAP DIPERTAHANKAN 100%**.
   - Jika pengguna memiliki Microsoft Office (Excel / Word) terinstal di komputernya dan ingin membukanya di jendela OS Windows asli, Arunaki menyediakan tombol cepat (*"Open in Native Excel"* / *"Open in Native Word"*) dan perintah AI untuk membuka/mengendalikannya secara native.
   - Pengguna memiliki fleksibilitas penuh: bekerja ringkas langsung di panel tengah Arunaki ATAU meluncurkan jendela Microsoft Office asli di taskbar Windows.

---

## Minimal Typing, Maximum Automation (CRITICAL UX RULE)

**Pengguna cukup mengetik seminimal mungkin. Arunaki harus mampu mengeksekusi dengan automasi maksimal.**

- Pengguna cukup menyalin-menempelkan (*copy-paste*) pesan WhatsApp/catatan mentah langsung ke chat tanpa perlu merapikan formatnya (`"update ini ke laporan harian:" + [paste teks mentah]`).
- Pengguna cukup mengetik instruksi 3 kata (contoh: `"Rekap ke excel"`), dan Arunaki secara cerdas memahami file mana yang harus dibuka, kolom mana yang harus diisi, dan total mana yang harus dihitung ulang.
- Jangan pernah memaksa pengguna mengetik instruksi panjang, aturan layout buatan, atau formula matematika manual — biarkan LLM Arunaki mengolahnya secara otonom.

---

## Project Folder Isolation & Safe File Modifications (CRITICAL)

**Agent only accesses the active project folder. NOT the entire computer.**

Tidak ada entitas `Workspace` database terpisah. Modelnya adalah **agent-per-folder** (setara `cwd` di VSCode):
satu window/jendela = satu folder proyek aktif = satu agent session.

- Folder aktif ditentukan dari path session/request (`Session.location.directory`).
- Agent CANNOT read files outside the active folder (no OS files, no user documents outside the project, no source code).
- Agent CANNOT execute arbitrary system commands or install third-party software.
- Modifikasi file dokumen oleh Agent dilakukan secara aman di dalam folder aktif dengan pencatatan riwayat (history), backup otomatis, dan visualisasi *diff* langsung di Panel Tengah.
- Lihat `docs/BOUNDARIES.md` untuk rincian boundary lengkap.

---

## Source of Truth

Always follow these documents, in this priority order:

1. docs/VISION.md
2. docs/PRD.md
3. docs/UX_UI.md
4. docs/INTELLIGENCE.md
5. docs/ARCHITECTURE.md
6. **WORKFLOW.md** — Development roadmap & checklist
7. **docs/OpenClaw-Blueprint.md** — OpenClaw architecture reference (32+ layers from source)
8. **ARTCRAFT_DOCUMENTS_INTEGRATION.txt** — ArtCraft 4 Core Document Suite architecture & testing
9. **docs/ROADMAP-Implementation.md** — Implementation roadmap
10. **docs/VERIFICATION-Checklist.md** — Verification matrix

**Priority order means conflict resolution, not just reading order.** If two documents disagree, the higher-numbered-priority document wins (VISION > PRD > UX_UI > INTELLIGENCE > ARCHITECTURE).

WORKFLOW.md is the **execution guide** — it defines what to build and in what order. Always check WORKFLOW.md first before starting any task to know the current phase and what's been completed.

---

## Handling Conflicts & Ambiguity

Stop and ask for clarification before writing code if:

- The Goal or task description is unclear or has more than one equally valid interpretation.
- Two source documents contradict each other for the specific task at hand.
- The task appears to require breaking a rule in ARCHITECTURE.md or INTELLIGENCE.md.
- Available information is insufficient to make a safe implementation decision.

---

## Architecture & Intelligence Compliance

These rules from ARCHITECTURE.md and INTELLIGENCE.md are non-negotiable and apply to every change, not just architecture-related tasks:

- **Module boundaries** — respect the responsibility table in ARCHITECTURE.md Section 3. Do not put backend logic in the Frontend, and do not let AI Engine access low-level OS APIs directly — always go through the appropriate Engine Service or Sidecar.
- **Provider Abstraction** — introduce new technologies (AI providers, storage backends, document parsers) only behind an existing or new abstraction layer, never hardcoded.
- **Project Folder Isolation** — an agent only ever reads the one active project folder it is bound to (`Session.location.directory`).
- **Transparency** — for any multi-step or long-running task, make the steps being taken visible (progress status, logs, or equivalent), not just the final result.

---

## Workflow

1. **Read WORKFLOW.md** — Check current phase and completed items.
2. Understand the task — identify the actual Goal, not just the literal wording.
3. Review existing code and relevant documentation before writing anything new.
4. Plan the implementation — identify which modules are affected and confirm this matches the module boundaries.
5. Implement with minimal changes — do not refactor unrelated code as a side effect.
6. Run relevant tests (`cargo test --workspace`, `npm run build -w apps`). Add tests for new behavior when none exist.
7. Verify the result against the original Goal, not just against "no errors."
8. **Update WORKFLOW.md** — Mark completed items with ✅ and move to next phase.
9. **Update documentation** — Update file .md yang terdampak oleh perubahan.
10. **Write dev-log** — Buat file di `docs/dev-logs/dev-log-YYYY-MM-DD-[task-name].md`.
11. **Commit & push** — Setelah selesai 1 pekerjaan, selalu commit dan push ke GitHub. Jangan menumpuk banyak perubahan dalam 1 commit.

---

## Rules

- **Check WORKFLOW.md first** — Before starting any task, read WORKFLOW.md to know the current phase.
- Do not violate the project architecture.
- Reuse existing implementations; search the codebase before writing something that may already exist.
- Avoid duplicate code and duplicate abstractions.
- Do not introduce new dependencies without explicit approval.
- Keep changes within the requested scope.
- Do not skip phases in WORKFLOW.md. Complete current phase before moving to next.
- **Machine-Specific / Local-Only Files Isolation (CRITICAL)** — Jangan pernah mem-push modifikasi yang bersifat khusus untuk mesin lokal atau OS tertentu ke repository GitHub.
- **Source Control Hygiene (WAJIB di akhir setiap sesi/task)** — Sebelum menutup pekerjaan: (1) pastikan `git status --porcelain` kosong — commit, pindahkan ke `.gitignore`, atau hapus artefak runtime; (2) jangan pernah commit log debug atau output tool; (3) push hanya setelah status bersih.

---

## Frontend & Workstation Reliability Rules (STRICT — NO REGRESSIONS)

Setiap AI agent yang menyentuh kode Frontend (`apps`) WAJIB mematuhi aturan ketat berikut:

1. **React Rules of Hooks (CRITICAL - ZERO TOLERANCE)**:
   - **DILARANG KERAS meletakkan React Hooks (`useLayoutEffect`, `useMemo`, `useCallback`, `useEffect`, `useState`, `useRef`) di bawah *early return* kondisional (seperti `if (collapsed) return ...`).**
   - Semua hooks WAJIB dideklarasikan secara absolut di baris paling atas komponen sebelum kondisi apa pun.
   - Melanggar ini menyebabkan *Rendered fewer hooks than expected* dan memicu **layar hitam total / blank screen crash**.

2. **Chat Stream & Message Deduplication Lifecycle (CRITICAL)**:
   - Saat streaming selesai (*event `done`*), pesan sementara (*optimistic messages*) dan pesan tersimpan (*persisted chat messages*) WAJIB dideduplikasi secara instan berdasarkan `id` dan `content`.
   - **DILARANG menggunakan `setTimeout` sembarangan untuk menahan optimistic state** yang menyebabkan pesan berkedip (*flicker*).

3. **UI Telemetry & Execution Badge Standards (Antigravity Parity)**:
   - Semua label status teknis, telemetry, badge eksekusi, dan developer metric di UI **WAJIB menggunakan bahasa Inggris standar dan bersih** (gaya Antigravity / Cursor IDE).
   - **Percakapan Biasa / Tanya Jawab (`"halo"`, pertanyaan teks)**:
     - **TIDAK BOLEH memunculkan box collapsible task (`Executing X tasks - Analyzing`)**.
     - Cukup tampilkan indikator minimalis: `✨ Thinking...` saat menunggu first token, lalu langsung tampilkan teks di bubble chat.
   - **Operasi Dokumen / Tool Nyata (`"rekap ke excel"`, modifikasi file)**:
     - Collapsible execution card (`Executing X document tasks`) DENGAN langkah checklist (`✓ read_file`, `✓ edit_document`) **HANYA boleh muncul jika ada tool nyata yang sedang dieksekusi**.

4. **Active Folder Sync Integrity**:
   - Setiap kali folder dibuka via dialog desktop Tauri atau URL param, folder tersebut harus segera didaftarkan/disinkronkan ke state backend dan `AppLayout` footer agar tidak terjadi mismatch path.

5. **Mandatory Build Verification**:
   - Setiap sebelum commit pekerjaan yang mengubah frontend/backend, WAJIB jalankan `npm run build -w apps` untuk memastikan 0 error kompilasi TypeScript dan tidak ada regresi.

6. **Strict Monochrome & No-Emerald Rule (CRITICAL DESIGN RULE)**:
   - **DILARANG KERAS menggunakan warna hijau terang / emerald (`text-emerald-*`, `bg-emerald-*`, titik hijau `bg-emerald-500/400`) untuk status telemetry, badge status koneksi, dan pill indikator.**
   - Semua badge status teknis, koneksi (Online/Connected), dan kontrol status WAJIB menggunakan palet **monokrom bersih / putih (`text-white`, `border-[var(--border-strong)]`, `bg-[var(--bg-hover)]`, atau titik putih `bg-white`)**.
   - Indikator jaringan online pada footer WAJIB menggunakan icon WiFi putih (`<Wifi className="w-3.5 h-3.5 text-white" />`), BUKAN titik hijau.
   - Aksen warna hangat hanya diperbolehkan untuk status thinking/progress LLM (`#cf6613` / dark orange Arunaki) atau status error (`rose-500` / merah).

7. **Strict No-Emoji & Clean SVG Vector Standard (CRITICAL)**:
   - **DILARANG KERAS menggunakan emoji di seluruh UI, judul kanvas, breadcrumbs, badge status, maupun nama sesi chat.**
   - Semua representasi visual WAJIB menggunakan **vektor SVG Lucide murni** yang tajam dan monokrom.
   - Semua input judul atau ringkasan dari LLM wajib disaring melalui regex pembersih emoji (`EMOJI_REGEX`) sebelum disimpan atau dirender.

8. **No Native Browser Context Menu (CRITICAL)**:
   - Klik kanan bawaan browser (Back, Forward, Reload, Print, Save as, Inspect) dinonaktifkan secara global di seluruh aplikasi agar Arunaki terasa 100% seperti native desktop software, bukan browser web.

---

## Multi-Agent Coordination

Proyek ini dikerjakan oleh beberapa AI agent. Untuk menghindari double pengerjaan:

### Checklist System
- Setiap agent **WAJIB cek** `WORKFLOW.md` sebelum mulai.
- Item yang sudah di ✅ dianggap **selesai**. Jangan dikerjakan ulang.
- Item yang belum di-✅ boleh dikerjakan. Tapi segera update checklist setelah mulai:

### Protocol
1. **Before start**: Baca `WORKFLOW.md` — pastikan item belum di-✅
2. **When starting**: Update checklist ke `🔄 [your_initials]` (tanda sedang dikerjakan)
3. **When done**: Update ke `✅` dan tambah dev-log di `docs/dev-logs/`
4. **Dev-log wajib**: Buat file `docs/dev-logs/dev-log-YYYY-MM-DD-[task-name].md` berisi:
   - Apa yang dikerjakan
   - File apa yang diubah
   - Test yang dijalankan
   - Status (pass/fail)

---

## Before Completing

Verify that:
- **WORKFLOW.md updated** — Current phase items marked with ✅ if completed.
- The task is completed and matches the actual Goal.
- No existing functionality is broken — `cargo test --workspace` and `npm run build -w apps` pass.
- The architecture and module boundaries are preserved.
- No unapproved dependency was introduced.
- The documentation is updated if necessary.
- Git working directory is clean (`git status --porcelain` empty).

---

## Completion Report

When a task is finished, report back with:
- **Summary** — what was implemented, in plain language.
- **Files changed** — list of files created, modified, or deleted.
- **Tests** — what was run, and the result (pass/fail, coverage of new behavior).
- **Assumptions / open questions** — anything you inferred that the user should confirm.
- **Risks or follow-ups** — anything incomplete, deferred, or that may need review.
