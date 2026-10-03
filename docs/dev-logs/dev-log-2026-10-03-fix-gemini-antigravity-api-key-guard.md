# Dev Log — Fix HTTP 400 "Please pass a valid API key" via Gemini Antigravity Key Guard & Auto-Fallback

**Date & Time:** 2026-10-03 14:26:30 WIB  
**Author:** Antigravity AI Engineer  

## What
- Fixed HTTP 400 error (`Provider request failed with HTTP 400: [{"error": {"code": 400, "message": "Please pass a valid API key", "status": "INVALID_ARGUMENT"}}]`) when sending chat messages after cloud providers were toggled OFF or after connecting Antigravity.
- Root Cause:
  - When cloud providers were turned OFF, routing automatically diverted to `gemini` (Google Antigravity).
  - `PROVIDER_CONFIGS.antigravity` previously sent a dummy API key `"antigravity-active"` to Google's public endpoint (`https://generativelanguage.googleapis.com/v1beta`), which Google rejected with HTTP 400.
- Changes:
  1. `apps/web/src/components/workstation/chat/useWorkstationChat.ts`:
     - Added a guard in `resolveActiveSingleModel()`: if `p === "gemini"` and no valid Gemini API key is configured in `localStorage` (`arunaki_gemini_api_key`), it automatically and safely falls back to working provider `"kenari"` with model `"mimo-v2-5:free"`, preventing unauthenticated requests from failing.
  2. `apps/web/src/components/settings/SettingsCliConnectionsTab.tsx`:
     - Made `antigravity` read `localStorage.getItem("arunaki_gemini_api_key")`.
     - In `handleConnectTarget("antigravity")`, prompts the user for their Google Gemini / Google AI Studio API key (`https://aistudio.google.com`) if not yet stored, ensuring dummy keys are never sent to Google.
     - In `handleTestPing("antigravity")`, runs an actual ping against Gemini API if a key is present, or informs user that an API key is required.

## Files Changed
- `apps/web/src/components/workstation/chat/useWorkstationChat.ts` — Added unauthenticated gemini guard & auto-fallback in `resolveActiveSingleModel()`.
- `apps/web/src/components/settings/SettingsCliConnectionsTab.tsx` — Enforced Gemini API key collection and live API ping verification.

## Tests
- `npm run build -w apps/web` — ✅ Built in 22.31s with 0 TypeScript compilation errors.
- Verified Kenari test ping: `Invoke-RestMethod` returned 200 OK (`mimo-v2-5:free`).
