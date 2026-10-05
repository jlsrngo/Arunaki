# Dev Log — Fix Upstream Provider Timeout with Antigravity agy Daemon

**Date & Time:** 2026-10-05 18:41:00 WIB
**Author:** AI Software Engineer

## What
Diagnosed and fixed the root cause of the 90s chat stall / "Upstream Provider Timeout (Google Antigravity CLI)":
- **Root Cause**: When raw transaction text (e.g. `ck vivi 430rb bca dtf...`) was submitted, `agy.exe` interpreted it as a directive to search or manage files, invoking its internal tools (`run_command`, executing recursive `Get-ChildItem` across the entire directory). Because of massive `node_modules` subdirectories, the recursive scan hung for 90+ seconds, exceeding the frontend watchdog timer.
- **Fix**:
  1. Injected an explicit system directive in `bridge.ts` instructing `agy` to act strictly as a pure LLM completion provider (`DO NOT invoke any internal tools or execute shell commands. Output your direct answer or document processing text immediately.`).
  2. Reduced `AntigravityDaemonWorker` turn watchdog timeout from 120s to 60s so that if any turn ever stalls, the bridge recovers before the frontend's 90s watchdog.
  3. Direct bridge test with the exact user input verified: returns HTTP 200 with formatted output in seconds.

## Files Changed
- `packages/engine/engine/src/server/local-cli/bridge.ts` — Added directive injection and adjusted turn timeout.

## Tests
- Direct invocation test `POST http://127.0.0.1:20188/v1/chat/completions` with user message: ✅ HTTP 200 OK with valid assistant response.
