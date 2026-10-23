# Dev Log — Native Rust Backend Engine & Document Sidecar Migration (Phases 122–125)

**Date & Time:** 2026-10-23 10:11:00 WIB
**Author:** Antigravity

## What
Completed the end-to-end migration of the Arunaki backend engine to standalone native Rust (`crates/arunaki-docs` and `crates/arunaki-engine`) so that the production/desktop engine binary (`apps/desktop/resources/engine.exe`) runs as a 5.89 MB native executable with **zero Node.js or Bun runtime dependency**, while preserving 100% zero-downtime fallback (`ARUNAKI_USE_BUN_ENGINE=1` / `ARUNAKI_RUST_TOOLS=1`) across development and production scripts.

### Key Deliverables
1. **Dual Library + CLI Document Crate (`crates/arunaki-docs`)**:
   - Native `.xlsx` & `.csv` parser (`build_excel_map`, `build_csv_excel_map`), `.docx` parser (`build_word_map`), `.pptx` parser (`build_ppt_map`), and `.pdf` text + `/FlateDecode` stream parser (`build_pdf_map`).
   - Native Office COM PowerShell script builders and runner (`build_excel_com_script`, `build_word_com_script`, `build_ppt_com_script`, `run_powershell_script`).
   - Wired into `@arunaki/tools` (`packages/arunaki-tools/src/rust-bridge.ts`, `pdf-read.ts`) with automatic fallback to TypeScript.
2. **Standalone Native Rust Engine (`crates/arunaki-engine`)**:
   - `paths.rs`: Strict Project Folder Isolation (`contains_path` lexical + canonical path verification, Windows `\\?\` prefix stripping).
   - `cred_store.rs`: Native Windows Credential Manager (`CredReadW` via `advapi32`), flat JSON credential store (`~/.arunaki/local-cli-credentials.json`) compatible with `credential-store.ts`, auto-harvester, and OIDC/OAuth token auto-refresh (`ensure_fresh_credential`).
   - `bridge.rs`: Native Local-CLI Bridge on `127.0.0.1:20188` (`/health`, `/v1/models`, `/v1/chat/completions`) supporting Kiro (AWS CodeWhisperer Binary EventStream), OpenCode Zen (SSE streaming + tool fingerprint), Google Antigravity (`v1internal`), OpenAI Codex (`backend-api/codex/responses`), and Anthropic Claude (`v1/messages`).
   - `sessions.rs`, `files.rs`, `knowledge.rs`, `providers.rs`, `messaging.rs`, `main.rs`: Full `:4096` HTTP + SSE Event Bus (`/api/event`) server and agentic document tool loop.
3. **Zero-Node.js Packaging & Launcher Integration**:
   - Updated `scripts/prepare-bundle.cjs`, `scripts/start-prod.cjs`, and `apps/desktop/main.cjs` to build and spawn the native Rust `engine.exe` (5.89 MB vs 98 MB previous Bun bundle) by default, with `ARUNAKI_USE_BUN_ENGINE=1` fallback.

## Files Changed
- `Cargo.toml` — Workspace manifest for `crates/arunaki-docs` and `crates/arunaki-engine`
- `crates/arunaki-docs/Cargo.toml`, `crates/arunaki-docs/src/lib.rs`, `crates/arunaki-docs/src/main.rs` — Native Rust document parser & Office COM automation library/CLI
- `crates/arunaki-engine/Cargo.toml`, `crates/arunaki-engine/src/{main,paths,cred_store,bridge,sessions,files,knowledge,providers,messaging}.rs` — Standalone native Rust engine & Local-CLI bridge
- `packages/arunaki-tools/src/rust-bridge.ts`, `packages/arunaki-tools/src/pdf-read.ts` — Added `pdf` support to the feature-flagged Rust sidecar bridge
- `scripts/prepare-bundle.cjs`, `scripts/start-prod.cjs`, `apps/desktop/main.cjs` — Integrated native Rust engine build and default spawn with Bun fallback
- `WORKFLOW.md` — Marked Phases 123, 124, and 125 ✅ DONE

## Tests
- `cargo test` — ✅ passed (6/6 unit tests across `arunaki-docs` and `arunaki-engine`)
- `bun test packages/arunaki-tools/test/rust-bridge.test.ts` — ✅ passed (4/4 tests)
- `npm run test:smoke` — ✅ passed (8/8 live provider & session checks against standalone native Rust `engine.exe`: `Kiro text`, `Kiro tool`, `OpenCode text`, `OpenCode tool`, `Antigravity text`, `Antigravity tool`, `Codex text (free)`, `Kiro chat`)
- `npm run build -w apps/web` — ✅ passed (0 TypeScript errors)

## Notes
- The standalone Rust `engine.exe` is 5.89 MB and requires zero Node.js or Bun runtime on the target machine.
- To fall back to the legacy TypeScript/Bun engine at any time, set `ARUNAKI_USE_BUN_ENGINE=1`.
