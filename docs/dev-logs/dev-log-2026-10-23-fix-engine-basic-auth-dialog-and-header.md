# Dev Log — Fix Engine Basic Auth Dialog and Header Suppression

**Date & Time:** 2026-10-23 12:43:00 WIB  
**Author:** Antigravity AI Engine Specialist  

## What
Eliminated the native browser popup "Sign in to access this site (Authorisation required by http://127.0.0.1:4096)" in Electron desktop.

### Root Cause
1. **Suppressed Renderer Auth Header**: In `apps/web/src/lib/api.ts`, `authHeader()` included `if (isDesktop()) return {};` based on the incorrect assumption that all renderer requests route through IPC relay. However, `subscribeEvents` in `apps/web/src/lib/engine.ts` connects to `/api/event` via native browser `fetch`. Because `authHeader()` returned `{}` in Electron, direct browser fetch calls had no `Authorization` header.
2. **Explicit `WWW-Authenticate` Challenge**: In `crates/arunaki-engine/src/main.rs`, unauthorized responses returned `header(header::WWW_AUTHENTICATE, "Basic realm=\"Arunaki\"")`. Per RFC specifications, Chromium intercepts this header and surfaces a modal prompt dialog ("Sign in to access this site") to the user.
3. **Missing Electron `app.on('login')`**: Electron had no handler for Chromium's native HTTP Basic Auth challenge event, leaving Chromium to fall back to the modal prompt.
4. **SSE Watchdog Cascade**: Because the modal dialog blocked or rejected the SSE stream, no tokens arrived in the workstation UI, resulting in the 90-second timeout dialog.

## Files Changed
- `crates/arunaki-engine/src/main.rs`: Removed `WWW-Authenticate` header from unauthorized responses so Chromium does not trigger browser login popups on AJAX/fetch calls. Added query parameter auth token decoding (`?auth_token=` or `?token=`).
- `apps/web/src/lib/api.ts`: Removed `if (isDesktop()) return {};` from `authHeader()` so that `subscribeEvents` and direct fetches pass `desktopCredentials()` (user:password) directly.
- `apps/desktop/main.cjs`: Registered `app.on('login')` handler to transparently fulfill any local HTTP Basic Auth challenges using `getEngineCredentials()`.

## Tests
- `cargo build -p arunaki-engine --release` — ✅ passed (recompiled and deployed to `target/release/arunaki.exe` and `apps/desktop/resources/engine.exe`)
- `npm run build -w apps/web` — ✅ passed (0 errors, dist synced to `apps/desktop/web`)
- `npm run test:smoke` — ✅ all 8 provider checks passed (Kiro text: 1608ms, Kiro tool: 1513ms, Kiro chat: 2621ms)
- Direct probe against engine API — ✅ confirmed `WWW-Authenticate` is null, preventing any Chromium prompt.

## Notes
The application now runs seamlessly without asking the user for any credentials while maintaining full authentication boundaries.
