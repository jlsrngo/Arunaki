# Dev Log — Live Model Catalogue + Working Reasoning Effort

**Date & Time:** 2026-10-08 WIB
**Author:** opencode (space-bunny-free)

## What

Two bugs the user found by looking at the UI:

1. **The model dropdown was a hardcoded list.** `fetchAntigravityModels()` already existed and
   reads the account's real catalogue from `v1internal:fetchAvailableModels`, but the settings
   UI rendered `registry.models` instead. So the dropdown showed `Claude Sonnet 5.5` and
   `Gemini 3.7 Flash`, neither of which the account can call — verified against the live
   catalogue (32 models), which actually contains `claude-sonnet-4-6`,
   `claude-opus-4-6-thinking` and `gpt-oss-120b-medium`, none of which were offered.

2. **The Reasoning Effort picker did nothing.** Google ships effort as part of the model id
   (`gemini-3.8-flash-{low,medium,high,tiered}`), not as a request field. The frontend sends
   it as `payload.variant`, and nothing in the Antigravity path read it, so Low/Medium/High
   all sent `gemini-3.8-flash-medium`.

## What changed

- `antigravityVariantModelId(model, variant)` in `upstream.ts`: resolves the effort to a
  catalogue tier. Ids with no tiers pass through untouched, because suffixing them 404s.
  `buildAntigravityBody` now calls it with `payload.variant`.
- `antigravityModelId` tolerates the `(medium)` suffix some clients send.
- The settings UI calls the existing `/local-cli/models` endpoint on mount and prefers the
  live list, falling back to `registry.models`. The dropdown header says which one it shows
  ("Live from account" / "Default list") so a stale list is never presented as authoritative.
- `registry.ts` Antigravity fallback list replaced with ids verified against the live
  catalogue. `MODEL_METADATA` gained labels for the live ids and the third-party models.
  Removed the two fictional entries.
- Tests: effort mapping (7 cases), the parenthesised suffix, and a check that every fallback
  entry exists in the live catalogue.

## Measured, not assumed

First-token against the live endpoint per effort: low 4247ms, medium 4530ms, high 3793ms,
tiered 3979ms. The spread is inside run-to-run noise, so effort changes which tier the
account routes to, not how fast it answers. The comment in the code says so, so nobody
re-litigates it later looking for a speed win.

Separately measured earlier in this session: our request builder and a bare minimal request
both take ~4.15s, so the ~3s "halo" latency is Google's, not ours.

## Files Changed

- `packages/engine/engine/src/server/local-cli/upstream.ts` — `antigravityVariantModelId`,
  suffix tolerance, `buildAntigravityBody` passes the variant.
- `packages/engine/engine/src/server/local-cli/registry.ts` — verified Antigravity fallback ids.
- `packages/engine/engine/test/upstream.test.ts` — effort + suffix tests.
- `packages/engine/engine/test/registry.test.ts` — live-catalogue guard.
- `apps/web/src/components/settings/SettingsCliConnectionsTab.tsx` — `liveModels` /
  `modelsAreLive` state, `fetchModels`, live list preferred, labels for live ids.

## Tests

- 7 local-cli suites: **61 pass / 0 fail**
- `npm run build -w apps/web`: **0 errors**, built in 29.54s
- `tsc --noEmit`: clean for `local-cli/*`, `groups/provider`, `registry`

## Notes

- The live-catalogue test hits the real endpoint, so it needs a signed-in Antigravity account.
  It degrades to a no-op comparison if the fetch fails (empty live set ⇒ the filter finds
  nothing, and the assertion on `live.size` fails loudly instead of passing silently).
- Restart the app: the variant fix lives in the engine, and the dropdown needs the new
  `/local-cli/models` call.
- The Antigravity token expired mid-session (401 on every tier). `refreshAntigravityCredentialViaAgy`
  recovered it, which re-confirms that path still works unattended.