# Dev Log — Isolate CLI Providers from Model Providers & Standardize English Localization

**Date & Time:** 2026-10-03 14:16:00 WIB  
**Author:** Antigravity AI Engineer  

## What
1. **Isolated CLI Providers from Model Providers Tab**:
   - Fixed issue where connecting local tools in `Connection CLI` (`OpenCode CLI Agent`, `Google Antigravity (Gemini)`, `Claude Code CLI`, `9Router Gateway`) caused them to be inserted into the model list and displayed inside `Model Providers` (`ModelProviderSettings.tsx`), confusing users who only added manual cloud APIs (Kenari, Groq).
   - Created `isCliProvider(p)` helper filter: CLI and local IDE tools are now strictly rendered in the `Connection CLI` tab and completely excluded from `Model Providers`.
   - Cleaned up orphaned CLI registrations from the SQLite active provider store (`opencode`, `claude-code`, `gemini`).
2. **Fixed Language Inconsistency (English UI Standard)**:
   - Fixed the hardcoded Indonesian CLI Diversion banner (`Rute Obrolan Dialihkan ke CLI:`, `Nyalakan (ON) salah satu provider di bawah untuk kembali ke API Cloud.`) appearing even when the UI language is set to `EN English`.
   - Added full bilingual keys to `i18n.ts` (`chatRoutingDivertedToCli`, `turnOnCloudProviderNotice`, `providerTurnedOff`, `chatRoutingDivertedDesc`, `providerTurnedOnPrimary`, `chatRoutingNowUsing`, `failedToChangeProviderStatus`, `clickToTurnOffDivertCli`, `clickToTurnOnPrimary`).
   - Localized `ProviderCard.tsx` ON/OFF switch tooltips and `ModelProviderSettings.tsx` toast notifications according to `AGENTS.md` Rule 3 (clean standard English telemetry).

## Files Changed
- `apps/web/src/components/settings/ModelProviderSettings.tsx` — Filtered `cloudProviders`, localized banner and toast messages.
- `apps/web/src/components/settings/ProviderCard.tsx` — Localized ON/OFF toggle switch tooltip with `t()`.
- `apps/web/src/lib/i18n.ts` — Added bilingual localization keys for CLI diversion banner, toasts, and switch tooltips.

## Tests
- `Invoke-RestMethod -Uri "http://127.0.0.1:4096/api/providers"` — ✅ Verified only legitimate cloud providers remain.
- `npm run build -w apps/web` — ✅ Built in 20.69s with 0 TypeScript compilation errors.

## Notes
- `Model Providers` tab now only renders user-added Cloud API providers (Kenari, Groq).
- If all cloud providers are toggled OFF, the banner dynamically shows `Chat Routing Diverted to CLI: <Active CLI Name>` in English when language is set to English.
