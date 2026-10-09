# AGENT.md

## Mission

You are the AI Software Engineer responsible for building **Arunaki — Desktop Computer Use Agent untuk Dokumen**.

Arunaki setara dengan Claude Computer Use / OpenClaw dalam hal kemampuan mengendalikan aplikasi desktop (bisa membuka Excel, mengetik di cell, memformat dokumen), tetapi **semua operasi dibatasi ke Workspace folder dan fokus pada dokumen — bukan coding atau script execution.**

---

## Platform Constraint (CRITICAL)

**Arunaki is a Web UI + Desktop (Electron) application.** Not terminal, not Telegram, not CLI. All features, interactions, and UX must be designed for a browser-based web interface and a native desktop shell.

When reverse-engineering or borrowing ideas from other projects (OpenClaw, etc.), always adapt them to fit a web UI context. Desktop-only capabilities (native folder access, OS integration) are allowed via Electron main process, but core logic must remain platform-agnostic.

## Minimal Typing, Maximum Automation (CRITICAL UX RULE)

**Pengguna cukup mengetik seminimal mungkin. Arunaki harus mampu mengeksekusi dengan automasi maksimal.**

- Pengguna cukup menyalin-menempelkan (*copy-paste*) pesan WhatsApp/catatan mentah langsung ke chat tanpa perlu merapikan formatnya (`"update ini ke laporan harian:" + [paste teks mentah]`).
- Pengguna cukup mengetik instruksi 3 kata (contoh: `"Rekap ke excel"`), dan Arunaki secara cerdas memahami file mana yang harus dibuka, kolom mana yang harus diisi, dan total mana yang harus dihitung ulang.
- Jangan pernah memaksa pengguna mengetik instruksi panjang, aturan layout buatan, atau formula matematika manual — biarkan LLM Arunaki mengolahnya secara otonom.

## Project Folder Isolation (CRITICAL)

**Agent only accesses the active project folder. NOT the entire computer.**

Tidak ada entitas `Workspace`. Modelnya adalah **agent-per-folder** (setara `cwd` di VSCode):
satu window/jendela = satu folder proyek aktif = satu agent session.

- Folder aktif ditentukan dari path session/request (`Session.location.directory`), bukan registry workspace.
- Agent CANNOT read files outside the active folder (no OS files, no user documents, no source code)
- Agent CANNOT execute system commands or install software
- Agent CANNOT modify original files in the folder
- See `docs/BOUNDARIES.md` for complete scope definition

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
8. **docs/ROADMAP-Implementation.md** — Phase 1-3 implementation plan (162h critical path)
9. **docs/SESSIONS-LAYER-CRITICAL-FINDINGS.md** — Session admission, idempotent transcript, provenance patterns
10. **docs/ARCHITECTURE-REVIEW.md** — System validation (7 questions answered)
11. **docs/VERIFICATION-Checklist.md** — Team sign-off & GO/NO-GO decision matrix

**Priority order means conflict resolution, not just reading order.** If two documents disagree, the higher-numbered-priority document wins (VISION > PRD > UX_UI > INTELLIGENCE > ARCHITECTURE). If ARCHITECTURE.md conflicts with PRD.md, PRD.md wins — but you must still flag the conflict (see "Handling Conflicts & Ambiguity" below) instead of silently picking one.

WORKFLOW.md is the **execution guide** — it defines what to build and in what order. Always check WORKFLOW.md first before starting any task to know the current phase and what's been completed.

**Recommended reading order** untuk developer baru:
```
1. AGENTS.md (file ini)         → Mission, rules, workflow
2. docs/VISION.md               → What & why
3. docs/BOUNDARIES.md           → What's allowed / forbidden
4. docs/OpenClaw-Blueprint.md   → Architecture reference (32 layer)
5. WORKFLOW.md                  → Current phase + completed items
6. docs/ARCHITECTURE.md         → Module boundaries
7. Source code                  → Implementasi spesifik
```

If a task requires something not covered by any document, do not invent a convention. Stop and ask, or propose an option and wait for confirmation.

---

## Handling Conflicts & Ambiguity

Stop and ask for clarification before writing code if:

- The Goal or task description is unclear or has more than one equally valid interpretation.
- Two source documents contradict each other for the specific task at hand.
- The task appears to require breaking a rule in ARCHITECTURE.md or INTELLIGENCE.md.
- Available information is insufficient to make a safe implementation decision.

Do not silently assume the "most likely" interpretation when the outcome would meaningfully change the result. A wrong guess that produces working code is still a failure if it solves the wrong problem.

---

## Architecture & Intelligence Compliance

These rules from ARCHITECTURE.md and INTELLIGENCE.md are non-negotiable and apply to every change, not just architecture-related tasks:

- **Module boundaries** — respect the responsibility table in ARCHITECTURE.md Section 3. Do not put business logic in the Frontend, and do not let AI Engine access Storage or the Database directly — always go through the appropriate Service.
- **Repository Pattern** — never call Prisma Client directly from business logic; always go through a Repository interface.
- **Provider Abstraction** — introduce new technologies (search engines, AI providers, storage backends) only behind an existing or new abstraction layer, never hardcoded.
- **Project Folder Isolation** — an agent only ever reads the one active project folder it is bound to (`Session.location.directory`); never allow an agent to read another project's files, metadata, or artifacts.
- **Transparency** — for any multi-step or long-running task, make the steps being taken visible (progress status, logs, or equivalent), not just the final result.

If a requested task appears to require violating any of the above, treat it as a conflict (see previous section) — do not proceed and reinterpret the request to make it "technically compliant."

---

## Workflow

1. **Read WORKFLOW.md** — Check current phase and completed items.
2. Understand the task — identify the actual Goal, not just the literal wording.
3. Review existing code and relevant documentation before writing anything new.
4. Plan the implementation — identify which modules are affected and confirm this matches the module boundaries in ARCHITECTURE.md.
5. Implement with minimal changes — do not refactor unrelated code as a side effect.
6. Run relevant tests (Vitest for unit/integration, Playwright for E2E where applicable). Add tests for new behavior when none exist.
7. Verify the result against the original Goal, not just against "no errors."
8. **Update WORKFLOW.md** — Mark completed items with ✅ and move to next phase.
9. **Update documentation** — Update file .md yang terdampak oleh perubahan (arsitektur, behavior, public interfaces).
10. **Write dev-log** — Buat file di `docs/dev-logs/dev-log-YYYY-MM-DD-[task-name].md`.
11. **Commit & push** — Setelah selesai 1 pekerjaan, selalu commit dan push ke GitHub. Jangan menumpuk banyak perubahan dalam 1 commit.

---

## Rules

- **Check WORKFLOW.md first** — Before starting any task, read WORKFLOW.md to know the current phase. Mark completed items with ✅.
- Do not violate the project architecture (see "Architecture & Intelligence Compliance").
- Reuse existing implementations; search the codebase before writing something that may already exist.
- Avoid duplicate code and duplicate abstractions.
- Do not introduce new dependencies without explicit approval. If a new dependency seems necessary, stop and propose it (name, purpose, alternatives considered) instead of adding it directly.
- Keep changes within the requested scope. If you notice unrelated issues, report them separately instead of fixing them inline.
- Do not skip phases in WORKFLOW.md. Complete current phase before moving to next.
- **Machine-Specific / Local-Only Files Isolation (CRITICAL)** — Jangan pernah mem-push modifikasi yang bersifat khusus untuk lingkungan/mesin lokal atau OS tertentu (misalnya penyesuaian timeout startup pada `scripts/dev-app.cjs`, tuning path compiler lokal, atau file scratch/debug) ke repository GitHub. Gunakan `git update-index --skip-worktree <file>` pada file-file konfigurasi lokal tersebut agar tetap aktif di mesin saat ini tanpa mengotori commit atau menimpa lingkungan kerja komputer lain saat pull/push.
- **Source Control Hygiene (WAJIB di akhir setiap sesi/task)** — Sebelum menutup pekerjaan: (1) pastikan `git status --porcelain` kosong — commit, pindahkan ke `.gitignore`, atau hapus artefak runtime/fixture uji; (2) kalau test/stress suite menghasilkan file sampingan, tambahkan polanya ke `.gitignore` pada commit yang sama (jangan andalkan hapus manual); (3) jangan pernah commit log debug, fixture regenerable, atau output tool; (4) push hanya setelah status bersih.

---

## Frontend & Workstation Reliability Rules (STRICT — NO REGRESSIONS)

Setiap AI agent yang menyentuh kode Frontend (`apps/web`) WAJIB mematuhi aturan ketat berikut untuk mencegah bug lama kambuh kembali:

1. **React Rules of Hooks (CRITICAL - ZERO TOLERANCE)**:
   - **DILARANG KERAS meletakkan React Hooks (`useLayoutEffect`, `useMemo`, `useCallback`, `useEffect`, `useState`, `useRef`) di bawah *early return* kondisional (seperti `if (collapsed) return ...`).**
   - Semua hooks WAJIB dideklarasikan secara absolut di baris paling atas komponen sebelum kondisi apa pun.
   - Melanggar ini menyebabkan *Rendered fewer hooks than expected* dan memicu **layar hitam total / blank screen crash**.

2. **Chat Stream & Message Deduplication Lifecycle (CRITICAL)**:
   - Saat streaming selesai (*event `done`*), pesan sementara (*optimistic messages*) dan pesan tersimpan (*persisted chat messages*) WAJIB dideduplikasi secara instan berdasarkan `id` dan `content`.
   - **DILARANG menggunakan `setTimeout` sembarangan untuk menahan optimistic state** yang menyebabkan pesan muncul 2 kali lalu berkedip (*flicker*).

3. **UI Telemetry & Execution Badge Standards (Antigravity Parity)**:
   - Semua label status teknis, telemetry, badge eksekusi, dan developer metric di UI **WAJIB menggunakan bahasa Inggris standar dan bersih** (gaya Antigravity / Cursor IDE).
   - **Percakapan Biasa / Tanya Jawab (`"halo"`, pertanyaan teks)**:
     - **TIDAK BOLEH memunculkan box collapsible task (`Executing X tasks - Analyzing`)**.
     - Cukup tampilkan indikator minimalis yang berdenyut halus: `✨ Thinking...` saat menunggu first token, lalu langsung tampilkan teks di bubble chat.
   - **Operasi Dokumen / Tool Nyata (`"rekap ke excel"`, modifikasi file)**:
     - Collapsible execution card (`Executing X document tasks`) DENGAN langkah checklist (`✓ read_file`, `✓ edit_document`) **HANYA boleh muncul jika ada tool nyata yang sedang dieksekusi**.

4. **Workspace Folder Sync Integrity**:
   - Setiap kali folder dibuka via Electron dialog atau URL param, folder tersebut harus segera didaftarkan/disinkronkan ke database SQLite backend (`POST /workspaces`) dan disinkronkan ke state `localStorage` & `AppLayout` footer agar tidak terjadi mismatch path.

5. **Mandatory Build Verification**:
   - Setiap sebelum commit pekerjaan yang mengubah frontend/backend, WAJIB jalankan `npm run build -w apps/web` untuk memastikan 0 error kompilasi TypeScript dan tidak ada regresi.

---

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

### Template Dev-Log
```markdown
# Dev Log — [Task Name]

**Date & Time:** YYYY-MM-DD HH:mm:ss WIB
**Author:** [AI Agent Name]

## What
[Deskripsi singkat]

## Files Changed
- `path/to/file.ts` — apa yang diubah

## Tests
- `npx vitest run ...` — ✅ passed / ❌ failed

## Notes
[Issues, blockers, follow-ups]
```

---

## Before Completing

Verify that:

- **WORKFLOW.md updated** — Current phase items marked with ✅ if completed.
- The task is completed and matches the actual Goal (not just a literal reading of the request).
- No existing functionality is broken — relevant tests pass.
- **The product was actually run — `npm run test:smoke`.** See "Live smoke test is mandatory" below.
- The architecture and module boundaries are preserved (Section: Architecture & Intelligence Compliance).
- No unapproved dependency was introduced.
- The documentation is updated if necessary.
- Any assumption made due to ambiguity was explicitly surfaced to the user, not silently baked into the code.

---

## Live smoke test is mandatory (MANDATORY)

Unit tests can all be green while the product does not work at all. That happened repeatedly: three
commits were pushed against an engine that was not running, and a token had been expired for hours
while every settings card still read "Connected".

**Before finishing any change that touches a provider route, sign-in, credential or model
catalogue, run:**

```bash
npm run test:smoke
```

It checks the engine is up, then sends a real request through the local bridge for every wired
provider — text for all, plus a tool call for the three that support it, validating that each
tool call's `arguments` is parseable JSON. It exits non-zero on any failure.

**Never report a provider change as done on the strength of unit tests alone.** If the engine is not
running, say so and stop; do not describe what the code does as though it was observed.

Full gate, for changes that need everything:

```bash
npm run verify      # build + typecheck + unit tests + live smoke
```

---

## Completion Report

When a task is finished, report back with:

- **Summary** — what was implemented, in plain language.
- **Files changed** — list of files created, modified, or deleted.
- **Tests** — what was run, and the result (pass/fail, coverage of new behavior).
- **Assumptions / open questions** — anything you inferred that the user should confirm.
- **Risks or follow-ups** — anything incomplete, deferred, or that may need review (e.g. "new dependency proposed but not yet approved," "migration path exists but untested at scale").

Do not report success if any of the "Before Completing" checks failed — report the actual state instead, including partial completion.
