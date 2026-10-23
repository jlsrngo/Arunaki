# Dev Log — Clean Up Pre-Rust Legacy Files & Tidy Project Structure

**Date & Time:** 2026-10-23 11:58:00 WIB  
**Author:** Antigravity

## What
Cleaned up legacy, abandoned, and dead-weight files that were unused even before the migration to Rust, and tidied up the root repository structure:
1. Removed `packages/engine/engine/.arunaki-backups/` — 601 obsolete internal backup snapshot files.
2. Removed abandoned experimental plugin packages `packages/arunaki-gitlab-auth` and `packages/arunaki-poe-auth` (never imported or used).
3. Removed unused stubs `packages/engine/scratch` (4 scratch scripts) and `packages/engine/opencode` (`build-node.ts`).
4. Removed root directory clutter: `test-llm.ts`, 13 debug `*.log` files (`tsc_out*.log`, `dbg-*.log`, etc.), and 0-byte `Arunaki-local.db`.
5. Updated root `package.json` workspaces list to exclude the removed packages.
6. Verified frontend build (`apps/web`) and ran live smoke checks (`test:smoke`).

## Files Changed
- `package.json` — cleaned up workspaces entries
- `packages/arunaki-gitlab-auth/` — deleted
- `packages/arunaki-poe-auth/` — deleted
- `packages/engine/opencode/script/build-node.ts` — deleted
- `packages/engine/scratch/` — deleted
- `packages/engine/engine/.arunaki-backups/` — deleted (601 files)
- `test-llm.ts` — deleted

## Tests
- `npm run build -w apps/web` — ✅ passed (TypeScript + Vite build clean)
- `npm run test:smoke` — ✅ passed (8/8 provider checks healthy)
