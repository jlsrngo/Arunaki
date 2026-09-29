# Dev Log — Chat Attachment Handling & Resolution Fix

**Date & Time:** 2026-09-29 19:55:00 WIB  
**Author:** Arunaki AI Assistant  

## What
Diagnosed and resolved the root cause of uploaded chat images being missed by the agent (`"upload file nya kemana pergi dia ga dapat gambarnya"`):
1. **Desktop IPC fs:writeFile Missing Recursive Directory Creation**:
   - `apps/desktop/main.cjs` called `fs.writeFile(safePath, ...)` without creating parent folders (`await fs.mkdir(path.dirname(safePath), { recursive: true })`). When caching chat attachments to `.arunaki/attachments/${name}`, it silently threw `ENOENT` because `.arunaki/attachments` did not exist yet.
2. **Generic Image Name Collisions in Chat History**:
   - Every clipboard paste generated the name `image.png`. When a previous turn mentioned that `image.png` was deleted or missing, models assumed all newly pasted images were that same deleted file. Updated `normalizeAttachmentName` in `attachmentUtils.ts` to append a unique timestamp suffix (`image_4812.png`).
3. **image_ocr In-Memory Database Fallback**:
   - In `packages/engine/core/src/tool/image-ocr.ts`, added direct retrieval from the SQLite `session_message` user attachment cache if the file is not on disk. Decodes base64 into a `Buffer`, runs OCR directly, and automatically caches it to `.arunaki/attachments/`.
4. **Vision Model Context Guidance & Strict Zero-Disk-Search Policy**:
   - In `packages/engine/core/src/session/runner/to-llm-message.ts`, added inline instructions for vision models: `[Attached Image: <name> — View this attached image directly in the message below. Do NOT search for this file on disk.]`.
   - Updated system prompts in `system.ts` and `default.txt` specifying that chat attachments are ephemeral chat inputs, never workspace files, and that models must never run `dir /b` or shell search commands looking for user-uploaded chat attachments.

## Files Changed
- `apps/desktop/main.cjs` — Added `fs.mkdir(path.dirname(safePath), { recursive: true })` before writing.
- `apps/web/src/components/workstation/chat/attachmentUtils.ts` — Made generic pasted image names unique with a timestamp suffix to prevent collision with deleted files.
- `packages/engine/core/src/tool/image-ocr.ts` — Added database fallback to retrieve image buffers from `session_message` if not found on disk.
- `packages/engine/core/src/session/runner/to-llm-message.ts` — Added inline attachment notice for vision models.
- `packages/engine/core/test/attachment-hints.test.ts` — Updated tests for inline attachment guidance.
- `packages/engine/engine/src/session/system.ts` — Clarified IMAGE ATTACHMENTS policy (ephemeral chat context, zero filesystem search).
- `packages/engine/engine/src/session/prompt/default.txt` — Added strict image attachment guidance.

## Tests
- `bun test packages/engine/core/test/attachment-hints.test.ts` — ✅ 3 pass, 0 fail.
- `bun test packages/engine/core/test/doc-read.test.ts` — ✅ 5 pass, 0 fail (excel_read, word_read, ppt_read, pdf_read, image_ocr).
- `npm run build -w apps/web` — ✅ Built in 34.48s, 0 compilation errors.

## Notes
Attachments are now completely reliable across both vision models and text-only OCR fallback models without ever polluting the workspace root.
