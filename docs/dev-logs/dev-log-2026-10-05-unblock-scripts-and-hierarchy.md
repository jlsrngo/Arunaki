# Dev Log — Unblock Autonomous Scripting & Codify Tool Execution Hierarchy

**Date & Time:** 2026-10-05 11:50:00 WIB
**Author:** AI Agent (Antigravity)

## What
1. **Audited & Removed Residual Script Blocks**:
   - In `packages/engine/engine/src/tool/shell.ts`: Removed an artificial `isScratchMode` block that was intercepting all `shell` calls in scratch/unopened workspace sessions and returning `SCRATCH_MODE_RESPONSE`. Shell execution (e.g. `python`, `node`) is now 100% unblocked in all sessions.
   - Cleaned up dead/unused `hasAttemptedNative` and `hasFailedNative` imports in `shell.ts` and `bash.ts`.
   - Whitelisted `.arunaki` and `.arunaki/scratch` in `packages/engine/engine/src/agent/agent.ts` and `packages/engine/core/src/plugin/agent.ts` so scripts executing from or accessing `~/.arunaki/scratch` are never rejected by `external_directory: deny`.
2. **Formally Codified the Two-Level Tool Execution Hierarchy**:
   - **Level 1 (Top Priority — Native In-Memory Tools)**: Always try built-in native tools first (`excel_read`, `word_read`, `ppt_read`, `pdf_read`, `image_ocr`, `read`, `edit`, `write`) for instant extraction and reading (<50ms).
   - **Level 2 (Autonomous Scripting Fallback — Python Only)**: Standardized strictly on **Python** (`openpyxl`, `python-docx`, `pandas`) as the sole official scripting environment for document tasks. Node.js references were removed since Python is the universal standard for document automation.
   - **Script Safety & Harmless Operation (Strict Rule)**: Added strict warnings prohibiting destructive, malicious, or system-altering scripts (e.g. deleting system files, accessing outside workspace, touching OS settings, network attacks, downloading binaries, infinite loops). Scripts must strictly focus on document processing, calculations, and data formatting.
   - **Never Get Stuck**: Instructed Arunaki never to give up or ask the user to edit documents manually if Level 1 fails; immediately write and execute a Python script to accomplish the goal.
   - **Windows Quoting Safety**: Added explicit instructions to write scripts to `.arunaki/scratch/*.py` first before running `python .arunaki/scratch/*.py` to avoid Windows `cmd.exe` multiline quote stripping.

## Files Changed
- `packages/engine/engine/src/tool/shell.ts` — Removed `isScratchMode` block and dead fallback imports.
- `packages/engine/engine/src/agent/agent.ts` — Added `.arunaki` and `.arunaki/scratch` to `whitelistedDirs`.
- `packages/engine/core/src/plugin/agent.ts` — Added `.arunaki` and `.arunaki/scratch` to `whitelistedDirs`.
- `packages/engine/core/src/tool/bash.ts` — Removed unused import and updated tool description with hierarchy.
- `packages/engine/engine/src/session/system.ts` — Codified Level 1 -> Level 2 hierarchy and Windows script execution safety.
- `packages/engine/engine/src/session/prompt/default.txt` — Standardized Tool Execution Hierarchy section.

## Tests
- `npm run build -w apps/web` — ✅ passed (TypeScript compile 0 errors, Vite bundle succeeded in 19.46s).

## Notes
- Arunaki will no longer get confused or stuck when native tools cannot edit complex spreadsheets; it seamlessly drops into Level 2 scripting.
