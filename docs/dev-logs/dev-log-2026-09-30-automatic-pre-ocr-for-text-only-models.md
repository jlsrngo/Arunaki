# Dev Log — Automatic Pre-OCR Injection for Text-Only Models & Attachment Glob Discovery

**Date & Time:** 2026-09-30 11:41:00 WIB  
**Author:** Arunaki AI Assistant  

## What
Resolved the issue where text-only models (like DeepSeek) got stuck searching for uploaded images on disk using `dir /b` and `glob` instead of reading the image data:
1. **Automatic Pre-OCR Injection for Non-Vision Models (`packages/engine/core/src/session/runner/llm.ts`)**:
   - When a user sends a message with an attached image and the active model is text-only (`!isVisionModel(model)`), the runner now automatically runs `buildImageOcrMap` (<1.2s) in the background before sending the LLM request.
   - The extracted text and table structure is saved to `file.description` and immediately rendered into the prompt as `OCR Extracted Text from Image (${name}): """..."""`.
   - The model directly receives the table rows, sizes, and quantities in turn 1 without needing to call `image_ocr`, run `dir /b`, or search the filesystem.
2. **Attachment Discovery in Glob Tool (`packages/engine/core/src/tool/glob.ts`)**:
   - Adjusted the dot-directory filter in `glob.ts` to allow `.arunaki/attachments` so that any search targeting images (e.g. `**/image_*.png`) correctly finds the saved attachment instead of returning `"No files found"`.
3. **Explicit Attachment Location Notice in Lowerer (`to-llm-message.ts`)**:
   - Added `Location: .arunaki/attachments/${name}` and the OCR snippet directly into the fallback message, explicitly instructing the model not to search with `dir` or shell commands.

## Files Changed
- `packages/engine/core/src/session/runner/llm.ts` — Added automated pre-OCR extraction for text-only models before prompt dispatch.
- `packages/engine/core/src/session/runner/to-llm-message.ts` — Formatted pre-extracted OCR text and attachment location in prompt.
- `packages/engine/core/src/tool/glob.ts` — Permitted `.arunaki/attachments` in glob search results.
- `WORKFLOW.md` — Marked Phase 82 complete.

## Tests
- `bun test packages/engine/core/test/attachment-hints.test.ts` — ✅ 3 pass, 0 fail.
- `bun test packages/engine/core/test/doc-read.test.ts` — ✅ 5 pass, 0 fail.
- `npm run build -w apps/web` — ✅ Built in 34.36s, 0 compilation errors.

## Notes
Text-only models now experience near-parity with multimodal vision models: image tables and data are pre-extracted and available in the prompt immediately.
