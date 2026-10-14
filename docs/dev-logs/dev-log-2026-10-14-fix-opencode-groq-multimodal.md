# Dev Log — Fix OpenCode Fallback to Groq and Vision Multimodal

**Date & Time:** 2026-10-14 13:28:00 WIB  
**Author:** Antigravity AI

## What
Fixed provider error when using OpenCode models (`opencode/space-bunny-free`, etc.):
1. **OpenCode Free Tier Upstream 403:**
   OpenCode hosted free tier (`space-bunny`, `big-pickle`, etc.) started returning HTTP 403 `FreeTierError` when invoked outside OpenCode IDE.
2. **Groq Lane `messages[1].content must be a string` (HTTP 400):**
   When OpenCode falls back to Groq, Groq's chat completion text models (`openai/gpt-oss-120b`, `qwen/qwen3.8-27b`) require `content` in each message to be a string. Messages formatted with structured parts or attachment blocks caused Groq to reject the request with HTTP 400.
3. **Multimodal / Vision Detection & Fallback:**
   Added auto-detection for image/media parts in chat completion messages (`hasImage`). If images are present, requests are routed directly to Antigravity (Google Cloud Code / Gemini) which natively processes multimodal image parts. Text-only messages for Groq are normalized via `toGroqTextContent`.
4. **Resilient Provider Fallback:**
   If Groq encounters upstream errors, rate limits, or non-200 responses, it now falls back gracefully to Antigravity (`gemini-3.8-flash`) or Kiro (`auto`) instead of surfacing a 400/500 error banner to the user.

## Files Changed
- `packages/engine/engine/src/server/local-cli/bridge.ts`
  - Added `toGroqTextContent(content: any): string` to normalize array/object message content.
  - Added multimodal image inspection to route vision requests to Antigravity.
  - Sanitized message content before forwarding to Groq API.
  - Added seamless fallback to Antigravity / Kiro on Groq error.
- `packages/engine/engine/src/server/local-cli/upstream.ts`
  - Hardened `antigravityModelId(model: string)` so foreign model names automatically map to `gemini-3.8-flash-medium` instead of causing 404s.

## Tests
- Direct mock test with `opencode/space-bunny-free` + array message content: ✅ 200 OK (`openai/gpt-oss-120b`).
- Direct mock test with `opencode/space-bunny-free` + image attachment: ✅ 200 OK (`gemini-3.8-flash`).
- `npm run test:smoke`: ✅ All 8 provider checks passed.
- `npx tsc --noEmit -p packages/engine/engine/tsconfig.json`: ✅ 0 errors.
- `npm run build -w apps/web`: ✅ Build passed (0 errors).

## Notes
- Engine process reloaded cleanly and verified live.
