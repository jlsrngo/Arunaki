# Dev Log — Registry-Driven Connection CLI Cards

**Date & Time:** 2026-10-07 WIB
**Author:** opencode (space-bunny-free)

## What

The Connection CLI tab rendered one hand-written card per provider — about 860 lines of
near-duplicate JSX for Claude, Codex, OpenCode, Antigravity and 9Router. Adding a provider
meant copying a card and editing every button, status string and quota lookup by hand.

Replaced that with a provider registry in the engine plus one generic card in the web layer.
Adding a provider is now a single entry in `CLI_PROVIDER_REGISTRY`; the card, status dot,
setup steps, model picker and quota panel all follow from it.

Also folded the user's UI feedback into the same pass:

- Rate limits moved out of the shared "Rate Limit Windows" panel into each provider's own
  card, shown when that card is expanded.
- Cards are collapsible. Collapsed rows show only model picker, Test Ping, Docs, the
  connect/disconnect button and a chevron.
- Expanded rows show setup steps, that provider's rate-limit bars, and the secondary actions
  (Refresh token, Auto-Configure CLI, sign-in terminal, Sign out, Auth Method).
- Antigravity's card reports three states (Not installed / Sign-in needed / Connected) from
  `agySignedIn`, which reads Windows Credential Manager.

Removed the browser-OAuth sign-in path. We verified against live endpoints that Anthropic and
Google both reject this client's authorize request, so the code was a button that could never
succeed. The auth modal now offers terminal sign-in only, and the registry records
`supportsBrowserLogin: false` for every provider so the UI cannot offer it again.

## Why the registry is code, not a database table

A provider catalog is an application capability, not user data. A table would mean a
migration per provider, no compile-time checking of ids, and a failure mode where the
installed binary predates the row. 9Router, the Vercel AI SDK and LiteLLM all keep provider
catalogs in typed code for this reason. The registry rides along on the existing
`localCliStatus` response, so there is no extra fetch and no new endpoint.

Localized copy stays in the web layer, keyed off the descriptor fields, because that is where
`isEn` already lives.

## Files Changed

- `packages/engine/engine/src/server/local-cli/registry.ts` — new. `CliProviderDescriptor`
  plus entries for all seven providers, and `getCliProviderDescriptor`.
- `packages/engine/engine/src/server/routes/instance/httpapi/groups/provider.ts` —
  `LocalCliProviderDescriptor` schema; `LocalCliStatusEnvelope` carries `registry`.
- `packages/engine/engine/src/server/routes/instance/httpapi/handlers/provider.ts` — returns
  `CLI_PROVIDER_REGISTRY` with the status payload.
- `packages/engine/engine/test/registry.test.ts` — new. Guards unique ids and docs urls,
  known quota kinds, no browser login, and install urls for providers that require a CLI.
- `apps/web/src/components/settings/SettingsCliConnectionsTab.tsx` — 2617 → 1897 lines.
  `renderProviderCard` + `renderSetupSteps` + `renderQuota` replace the hardcoded cards;
  `CliProviderId` alias replaces five repeated inline unions; dead OAuth code removed.

## Tests

- `bun test --timeout 30000` on the seven local-cli suites — **57 pass / 0 fail**
  (51 before, plus 6 new registry assertions).
- `npm run build -w apps/web` — **0 errors**, built in 14.80s.
- `tsc --noEmit` on the engine: no errors in `local-cli/*` or `groups/provider.ts`.
  Pre-existing errors elsewhere (`core`, `arunaki-tools`, `handlers/provider.ts` namespace
  `ProviderV2`) confirmed unchanged by re-running against a stash of my changes.

## Notes

- kiro, cursor and 9router have no `installUrl`/`docsUrl` because no such URL exists anywhere
  in the repo or in the 9Router reference. The card hides Docs/Install rather than guessing a
  link. Add the URL to the registry when we have a verified one.
- `cardState` is still a per-provider object keyed by id. It is derived from status responses,
  not layout, so it stays in the web layer; a new provider needs one entry there or it renders
  as not-installed.
- The desktop app must be restarted for `agySignedIn` and the new `registry` field to reach the
  running backend.
- Did not touch routing, credentials or quota fetching — only how the UI renders them.
