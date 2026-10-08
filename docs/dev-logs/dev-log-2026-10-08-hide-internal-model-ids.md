# Dev Log — Hide Internal Model Ids From The Catalogue

**Date & Time:** 2026-10-08 WIB
**Author:** opencode (space-bunny-free)

## What

Switching the dropdown to the live catalogue worked, but it surfaced every id the endpoint
returns, including entries the Antigravity IDE never shows. The user saw
`tab_jump_flash_lite_preview` and `chat_23310` in the model list and compared against the
IDE, which offers eight entries.

## Why those ids exist

`fetchAvailableModels` returns the IDE's whole model menu, not a UI list. Inspecting the
response for this account:

- `chat_20706` / `chat_23310` — carry `isInternal: true`, `apiProvider:
  API_PROVIDER_INTERNAL`, and appear in `tabModelIds`. They answer **HTTP 400** when called.
- `tab_jump_flash_lite_preview` / `tab_flash_lite_preview` — `MODEL_PLACEHOLDER_M28` /
  `MODEL_PLACEHOLDER_M19`. They answer 200 but have **no `displayName`**, because the editor
  swaps the real model in at runtime. There is no name to render.
- `gemini-3.1-pro-high` — listed in `deprecatedModelIds`, which is an **id -> {newModelId} map,
  not an array**. My first filter assumed an array and silently kept it. `newModelId` points at
  `gemini-pro-agent`, which is the replacement the IDE offers.

Google ships its own grouping (`tabModelIds`, `commandModelIds`, `webSearchModelIds`,
`imageGenerationModelIds`, `audioTranscriptionModelIds`, `mqueryModelIds`,
`deprecatedModelIds`) and a `displayName` per entry, so the filter uses those instead of
guessing with a regex.

Result: 32 raw ids → **21 usable**, with `chat_*` and `tab_*` gone and
`claude-sonnet-4-6`, `claude-opus-4-6-thinking`, `gpt-oss-120b-medium` still present.

## Files Changed

- `packages/engine/engine/src/server/local-cli/upstream.ts` — `fetchAntigravityModels` filter.
- `packages/engine/engine/test/registry.test.ts` — guards that no `chat_`/`tab_` id or
  deprecated model reaches the list, and that the granted models do.
- `apps/web/src/components/settings/SettingsCliConnectionsTab.tsx` — labels for two live ids.

## Tests

- 7 local-cli suites: **62 pass / 0 fail**
- `npm run build -w apps/web`: **0 errors**, built in 23.50s
- `tsc --noEmit`: clean for `local-cli/*` and `registry`

## Notes

- The list is still longer than the IDE's eight. That is a deliberate difference: the IDE
  curates to a handful, while a raw catalogue keeps every tier (`-low`/`-medium`/`-high`/
  `-tiered`) selectable, which is useful when you want to compare effort tiers directly.
- `gemini-3.1-pro-high` was also listed in the hardcoded registry before; it is deprecated and
  no longer reachable through the live path.
- `claude-sonnet-4-6` and `gpt-oss-120b-medium` returned HTTP 429 during testing, i.e. quota
  limited rather than unknown ids. They are valid entries.
- Restart the app to pick up the filter.