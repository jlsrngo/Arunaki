# Dev Log — Generic Variant Discovery (OpenCode low→max)

**Date & Time:** 2026-10-13 08:42 WIB
**Author:** opencode (space-bunny-free)

## What

The user showed that OpenCode's own UI offers a variant picker for `space-bunny-free` —
Default, low, medium, high, xhigh, max — while Arunaki showed none. The goal was to make that
work through one generic mechanism instead of adding an OpenCode-specific setting next to the
existing Antigravity-specific one.

The answer came from `https://models.dev/api.json`, which describes the model as:

```json
"reasoning_options": [{ "type": "effort", "values": ["low","medium","high","xhigh","max"] }]
```

That metadata was already reaching the code and being thrown away.

## Three blockades, not one

1. **Discovery.** `plugin/models-dev.ts` wrote `draft.variants = []` on every model. The only
   thing that produced variants was suffix folding in `config/plugin/provider.ts`
   (`gemini-3.8-flash-high`, an Antigravity convention) plus a hardcoded GLM allowlist in
   `plugin/variant.ts`. `space-bunny-free` has no suffix, so it had none.

2. **Enrichment never reached bridge models.** `ModelsDevPlugin` skipped any provider whose
   models were listed in config (`listingModels.has(id) → continue`). Config for the local-CLI
   providers is synthesised at runtime, so OpenCode was skipped and models.dev contributed
   nothing. Separately, the same model is spelled two ways — models.dev writes
   `space-bunny-free`, the bridge writes `opencode/space-bunny-free` — so nothing matched even
   when both sides ran.

3. **Local validation rejected `max` before sending.** `llm/protocols/openai-chat.ts:336`
   checked the effort against `OpenAIReasoningEfforts`, which was `ReasoningEfforts` minus
   `max`, and failed with `OpenAI Chat does not support reasoning effort max`. This is why a
   direct request to OpenCode Zen with `reasoning_effort: "max"` returned 200 while the same
   request through the engine never left the machine.

## What changed

- `core/src/plugin/models-dev.ts` — `reasoningVariants()` turns `reasoning_options` into
  variants, gated on the transport the provider speaks (`provider.npm`), not its name. Models
  that config lists are now still *described* by models.dev while config keeps owning *which*
  models exist; both the bare and the prefixed id are accepted.
- `core/src/config/plugin/provider.ts` — the bridge block inherits `variants` across the two id
  spellings.
- `core/src/session/runner/model.ts` — `xhigh` added to the `reasoning_effort` fallback.
- `llm/src/protocols/utils/openai-options.ts` — `OpenAIReasoningEfforts` no longer drops `max`.
  Which levels a model offers is models.dev's call, made per model; the local check only ever
  rejected something legitimate.
- `core/src/plugin/variant.ts` and its test — deleted. GLM 5.2 is on models.dev with
  `values: ["high","max"]`, so the generic rule reproduces the hardcoded one exactly.

Net: **one mechanism**. A provider that speaks one of the known transports and advertises
effort levels gets variants with no configuration added.

## Measured, not assumed

Through the engine's session path against `opencode/space-bunny-free`:

```
variant=(none) -> '391' | dipakai=default
variant=low    -> '391' | dipakai=low
variant=high   -> '391' | dipakai=high
variant=xhigh  -> '391' | dipakai=xhigh
variant=max    -> '391' | dipakai=max
```

Before the `openai-options.ts` fix, `max` produced
`OpenAI Chat does not support reasoning effort max` and `xhigh`/`max` never reached the wire.

Catalogue: 62 of 101 OpenCode models now carry variants. Antigravity unchanged at 16 models /
3 with variants; Kiro 9, Codex 5, claude-code 3 — no regression.

The wire field was confirmed from strings inside `opencode.exe` itself: the openai-compatible
provider serialises `reasoningEffort → reasoning_effort`. Raw HTTP from this machine cannot be
used to verify it — OpenCode's free tier answers `403 FreeTierError: "OpenCode's free tier can
only be used from within OpenCode"` to anything that does not come from the real client.

## Tests

- `bun run typecheck` (core): 2 errors, both pre-existing in `test/plugin/models-dev.test.ts`,
  reproduced on a clean tree.
- `bun test test/config ...`: 56 pass, 1 fail (`toLLMMessages`), proven baseline.
- `bun test` (core, full): 1079 pass / 24 fail — all 24 reproduced on a clean tree.
- `bun test test/provider/openai-chat.test.ts test/provider/openai-responses.test.ts` (llm):
  78 pass / 3 fail, identical with the change stashed.
- `bun run typecheck` (llm): `src/` clean; 6 errors are all in `test/` from a missing
  `@Arunaki-ai/http-recorder` module, untouched by this work.
- `npm run build -w apps/web`: success.
- `npm run test:smoke`: **all 8 provider checks passed**, against an engine running this code.

## Notes and traps

- **Do not strip the `opencode/` prefix at the bridge.** `handleChatCompletion` receives only
  the payload and has no idea which provider it is serving; lane selection is substring
  matching on the model id (`bridge.ts:481-490`). The prefix is the only provider tag. Measured:
  removing it sends **92 of 101** OpenCode models to the wrong upstream.
- Antigravity genuinely keeps suffix ids — for that provider a tier *is* a different model, so
  it stays a separate path. Forcing it into the body-patch shape would have been wrong.
- The UI still labels the picker "Reasoning Effort". For every provider that reaches it
  today those values are effort levels, so the label is accurate; a provider with a non-effort
  knob would need it widened.
- `packages/engine/engine/src/plugin/modal/models.ts` also derives variants from
  `reasoning_options`, and an earlier note here called that duplicated logic. It is not: that
  file builds `Record<id, { reasoningEffort }>` for Modal in the engine package, while the rule
  above builds `Array<{ id, headers, body }>` for the catalogue in core. Different shapes, and
  core cannot import engine. Its schema also only admits `effort` options, so `option.values` is
  always present. Left alone.

## Two things that looked like bugs and were not

Checked before changing, because "fixing" intended behaviour is worse than leaving it:

- **Selecting a model on an inactive Settings card does not change the composer's model.** That
  is deliberate, and it says so: the card writes `arunaki_cli_model_<key>`, and only writes
  `arunaki_active_model` when the card is the active provider, with the toast *"Will be used
  when you connect …"*. There is a separate action for switching providers.
- **The Modal plugin repeats the `reasoning_options` derivation.** See above — different shape,
  different package, and the dependency direction forbids sharing it.

## Settings card now reads the catalogue (follow-up)

`modelsFor()` in `SettingsCliConnectionsTab.tsx` built its list from the bridge, which returns
raw ids, so Antigravity's card listed 22 tier models — `gemini-3.8-flash-high` and its siblings
as separate entries — while the composer had folded those into one model with the tier as a
variant. Picking one from the card therefore chose something the chat could not use. It now
prefers the engine catalogue, falling back to the bridge list and then the registry. One source
of truth means the two cannot drift again.

Measured on the live catalogue at the time of writing: Antigravity served as 12 entries with
`gemini-3.8-flash -> low, medium, high`, down from 22 flat. The count moves with the account —
Google ships and retires tiers — and earlier the same command returned 16.

## Follow-ups

- The composer picker has not been confirmed visually in the app; the backend contract and the
  request were verified directly, and the user confirmed the dropdown lists Low, Medium, High,
  Xhigh and Max.
- The Settings card change is verified by build and by the catalogue response it reads, not by
  looking at the rendered card.