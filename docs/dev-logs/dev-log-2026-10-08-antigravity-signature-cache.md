# Dev Log — Keep Antigravity Thought Signatures Between Turns

**Date & Time:** 2026-10-08 WIB
**Author:** opencode (space-bunny-free)

## What

Follow-up to `36c973e7`. That commit stopped the 400 by dropping unsigned tool calls, which
unblocked the request but cost multi-turn tool use: the model could no longer see what a
previous tool call returned. This restores it without touching the engine or the AI SDK.

## Scope: Antigravity only, deliberately

Checked before implementing. Only our hand-rolled Cloud Code translator is affected:

- `@ai-sdk/google` and `@ai-sdk/google-vertex` are official SDK providers that handle
  `thoughtSignature` internally.
- OpenAI, Anthropic and Codex have no equivalent concept at all.
- OpenCode's hosted Zen route never emits Gemini function calls.

So the fix belongs in `local-cli/upstream.ts` alone. Doing it in `session/processor.ts` would
have meant plumbing an Antigravity-specific field through the generic tool-part model.

## How

The bridge sits on both sides of the call, so it can hold the signature itself:

- `rememberAntigravitySignature` is called while parsing the SSE response, keyed by the
  `functionCall.id` Google returned.
- `chatToAntigravityContents` looks that id up when rebuilding the history.

Keying by the call id is what makes this work: the id Google returns is the id the session
stores and replays, so it survives the round trip even though the OpenAI-compatible layer
drops the extra key. A small FIFO trim caps the map at 2000 entries.

The cache is in-memory on purpose. After a restart it is cold, and unsigned history degrades
to the `36c973e7` behaviour (dropped, not rejected) instead of failing.

## Verified

Two real turns through the running bridge on `:20188`:

```
turn 1: 200  tool_calls: [{"id":"call_120975","function":{"name":"read", ...}}]
turn 2: 200  10122ms  "Based on that file, what is this project?" -> answered from the result
```

Turn 2 is the one that used to answer 400. The reply quotes the injected file contents, so
the tool result really was in context. The same request also confirms `variant: high` now
reaches the model id through the session flow.

## Files Changed

- `packages/engine/engine/src/server/local-cli/upstream.ts` — signature cache, capture on
  read, replay on write.
- `packages/engine/engine/test/upstream.test.ts` — cached-replay test, including the cold-cache
  degradation.

## Tests

- 7 local-cli suites: **66 pass / 0 fail**
- `tsc --noEmit`: clean for `local-cli/*`

## Notes

- The `reasoning_effort` default is still `low` in code; the High in the UI comes from a
  saved `arunaki_reasoning_effort` in localStorage. Verified in the session DB that the
  variant reaches `/api/session/:id/prompt`, and end to end above.
- Still no per-session scoping on the signature map. Two concurrent sessions could collide on
  a reused call id, which would mean replaying a stale signature and getting a 400 that the
  drop policy then cleans up. Not observed; worth scoping by session if it ever shows up.
- Restart the app to pick this up.