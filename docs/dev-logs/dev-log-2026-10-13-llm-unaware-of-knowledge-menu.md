# Dev Log — LLM has no knowledge of the Knowledge menu (or of Arunaki's instructions at all)

**Date & Time:** 2026-10-13 17:45 WIB
**Author:** OpenCode agent (investigation requested by user)

## TL;DR for the next agent

**Observed symptom:** the agent does not know that the Knowledge menu exists. It does not know
the menu is there to connect data sources. When asked about catalog data it behaves like a plain
chatbot: it asks the user to provide an Excel or Word file.

That is the actual, user-confirmed symptom. Start from here.

**Why it probably matters more than Knowledge:** every instruction that makes the model behave
like an Arunaki agent lives in one place — `environment()` in
`packages/engine/engine/src/session/system.ts`. That single function returns the `<env>` block,
the project-folder isolation rules, the hidden-files policy, the tool hierarchy, and both the
knowledge-base block and the "Knowledge menu exists" awareness block.

If the model does not know the menu exists, the likeliest explanation is not that it ignored the
knowledge rules — it is that **none of that function's output is reaching the model at all.**
The model is behaving like a raw LLM answering a question with no Arunaki context.

**Start here:** find out whether `input.system` is actually populated when the request reaches
`packages/engine/engine/src/session/llm/request.ts:56-66`. There is a specific, narrow candidate
bug there (see "Most likely cause" below). Do not assume it; check it.

---

## Prior art — this area has been rewritten many times

`docs/dev-logs/` already holds ~20 Knowledge-related dev-logs, including several that touch
exactly the surfaces in this report:

- `dev-log-2026-09-18-knowledge-auto-refresh-cache.md` — the sync/cache path (finding A)
- `dev-log-2026-09-08-natural-knowledge-query-verification.md` — natural queries against Knowledge
- `dev-log-2026-09-17-fix-knowledge-menu-routing-and-folder-isolation.md` — menu routing and isolation
- `dev-log-2026-09-05-arunaki-menus-and-knowledge-prompt.md` — the knowledge prompt itself
- `dev-log-2026-09-05-knowledge-url-sync-and-prompt-enhancement.md` — URL sync and prompt rules
- `dev-log-2026-09-04-fix-knowledge-api.md`, `dev-log-2026-09-05-fix-knowledge-node-master-in-electron.md`

The recurrence is itself a signal: the Knowledge feature has been patched repeatedly at the UI,
prompt, sync and routing layers without the underlying prompt-assembly problem being closed. Worth
reading two or three of these before changing anything, so you do not re-add a fix that was
already tried and reverted.

---

## What is verified

### 1. The session is correctly scoped to the test folder

```
ses_ecb4908b2ffe9eR1AtWCAG10u4
  location.directory = C:\Users\AMD\AppData\Local\Temp\opencode\kktest-clean
  model             = kenari/nemotron-3-super-120b-a12b:free
```

**Careful:** the field is `location.directory`, not `directory`. Reading the wrong one makes
every session look unscoped and sends you down a dead end. `HistoryPage.tsx:25` reads both,
which is why this is easy to get wrong.

So the knowledge folder **is** correctly bound. Folder scoping is not the problem.

### 2. A node with real content would pass the injection filter

Replaying the exact filter from `system.ts:182-191` against the real `knowledge.json`:

```
node lolos filter: 1
  Katalog Uji Arunaki (type=catalog)
    Notes akan disuntik: true
```

### 3. Three different models all fail the same way

| Model | Result |
|---|---|
| `kiro/claude-sonnet-4` | "Saya perlu memeriksa dokumen atau file…" |
| `kenari/nemotron-3-super-120b-a12b:free` | "I don't see any files in the current workspace…" |
| `antigravity/gemini-3.5-flash-low` | model retired, could not test |

None produced `89000` or `MERAH-8842`. All asked for a file. The strong model with an extra
instruction added behaved identically to the weak one, which is why I do not think model quality
is the variable here.

---

## What I claimed but did NOT prove — read this before trusting it

I previously reported that `SystemPrompt.environment()` is *never executed*. **That claim is not
proven.** I am downgrading it because the measurement had a hole I did not close.

What I did: put a `fsSync.appendFileSync` probe on the first executable line of `environment()`,
restart the engine, send real prompts, and observe that the probe file was never created.

Why that is not proof: **I never ran a positive control.** I never demonstrated that the probe
could successfully write a file from inside the engine process. If that write failed for any
reason — permissions, path, an exception swallowed by the surrounding `try/catch` — the result
would look exactly the same as "the function was never called". I had checks on staleness
(engine process newer than the file mtime), on duplicates (`grep` found only one live copy, the
other hit is in `.arunaki-backups/`), and on placement (probe in both branches of the knowledge
block, so one had to fire) — but none of those validate the instrument itself.

Do not build on that claim. If you want to use it, re-run it **with a control probe in a
function you know runs**, in the same process, writing to the same path.

The user's observation stands on its own without this claim: the model does not know the menu
exists.

---

## Most likely cause

`request.ts:56-66` builds the final system prompt:

```ts
const system = [
  [
    ...(input.agent.prompt ? [input.agent.prompt] : SystemPrompt.provider(input.model)),
    ...input.system,
    ...(input.user.system ? [input.user.system] : []),
  ].filter((x) => x).join("\n"),
]
```

If `input.system` is empty or undefined on this path, then **only the agent's own prompt
reaches the model** — and none of `environment()`'s output does. The model would have no `<env>`,
no folder-isolation rules, no tool policies, no knowledge base, and no awareness of the menu.

That single condition explains the entire symptom, including the parts that are not about
Knowledge at all.

**The narrow check:** trace where `prepare()` gets called and whether `system` is passed through.
`prompt.ts:1244-1256` does build `system` and spreads `...env`, where `env` is
`sys.environment(model)`. Either that route is not the one these providers take, or the value is
dropped between there and `prepare()`.

**Most useful places to look next:**

1. Who calls `LLMRequestPrep.prepare` / `handle.process`, and is `system` among its arguments.
2. Whether the bridge lanes reach that code at all. `kiro/*`, `kenari/*` and `antigravity/*` are
   all local-CLI lanes on `127.0.0.1:20188`.
   `bridge.ts:209-234` only *lifts* the system prompt out of `payload.messages`; it does not
   build one — so ask who fills `payload.messages`.
3. `input.agent.prompt` — what does the active agent's prompt actually contain? If it is the only
   thing landing, that is the smoking gun.

---

## Independent consequences, if the above is confirmed

Folder isolation would currently be enforced only by the filesystem sandbox and
`resolveInsideWorkspace()` in `main.cjs`, **not** by any prompt instruction. Worth verifying
explicitly, because it changes the risk profile.

---

## Secondary findings (do not depend on the above)

### A. The sync path is dead by design, so `Cached Live Data` is always empty

`system.ts:208-210` reads `.arunaki/cache/<nodeId>.csv` and labels it "Cached Live Data".
The repo has **no** `.arunaki/cache/` directory, and `node-2` has no `lastSyncedAt`.

`apps/web/src/lib/knowledgeSync.ts` guards:

```js
const folder = explicitDirectory || localStorage.getItem('arunaki_active_folder');
if (!folder) return false;
```

Its only callers are `AppLayout.tsx:88-96`: a 30-minute interval and a **window `focus`**
handler. It never fires on app start. No active folder → no sync → no cache → the
`Cached Live Data` branch is unreachable in practice.

### B. The existing "Product Catalog" node has empty content

`E:\JS\Arunaki\.arunaki\knowledge.json` (last modified 2026-09-07, three months old):

```
node-2  "Product Catalog"  type=catalog  active=true  content=""  urls=["<google sheet>"]
```

With empty content and no cache it yields only a `Source URL` plus
`Fetch Instruction: invoke webfetch on ...` — which is the "agent has to effort for it"
behaviour originally described. **Fixing the injection alone will not fix this node**; it needs
content, or a working sync.

### C. UI and `knowledge.json` appear out of sync

The Knowledge page shows a node titled `Katalog`; the file contains `Product Catalog`. Either
the rename was never saved, or the UI is showing unsaved state. Confirm before trusting that
screen.

### D. An instruction gap exists independent of the injection problem

Even when the block does run, no instruction covers a source that has only a `Notes:` line.
Rule 1 needs `Cached Live Data`, rule 2 needs a URL. `grep -c Notes system.ts` → the word
appears **once**, at the line that *injects* it, and **zero** times in the instructions.

I added a one-line TRIAL fix for this (a rule `0.`), **uncommitted**. It is inert while the
injection problem is unresolved, and I recommend reverting it until the real cause is fixed, so
it does not read as a second root cause.

---

## Reproduction

Test workspace (outside the repo, so git stays clean):

```
C:\Users\AMD\AppData\Local\Temp\opencode\kktest-clean\.arunaki\knowledge.json
```

```json
{ "nodes": [
  { "id": "main-ai-node", "title": "Agent Core", "content": "internal",
    "active": true, "type": "agent", "urls": "[]" },
  { "id": "node-uji-1", "title": "Katalog Uji Arunaki",
    "content": "Data uji knowledge Arunaki. Kode rujukan: MERAH-8842. Produk: Kaos Polos Cotton, kategori Pakaian, harga beli 62000, harga jual 89000, stok 145. Responsible: Budi Santoso, ext 2231. Gudang: Jakarta.",
    "active": true, "type": "catalog", "urls": "[]" }
], "edges": [] }
```

A node with non-empty `content`, no cache, no URL — the case no instruction covers.

Then, against a running `npm run dev:app`:

```js
POST /api/session
  headers: Authorization: Basic <user:pass>, x-arunaki-directory: <folder>
  body:    { "location": { "directory": "<folder>" },
             "model": { "providerID": "kiro", "id": "kiro/claude-sonnet-4" } }

POST /api/session/<id>/prompt?directory=<folder>
  body:    { "prompt": { "type": "text", "text": "harga jual Kaos Polos Cotton berapa?" } }
```

Credentials: `~/.arunaki/dev-server-password`, `user:password`, default user `arunaki`.

**Ask a second question that needs no data**, e.g. "ada menu apa saja di Arunaki?". If the model
cannot name the Knowledge menu or the Explorer/Chat panels, that confirms the symptom directly
and is a faster check than the catalog question.

Expected while the bug is present: no mention of `89000` or `MERAH-8842`; the model asks for a file.

### Gotchas that cost me real time

- The session field is `location.directory`. Reading `directory` shows blank for every session.
- `... | Select-Object -First N` in PowerShell **terminates the upstream process** — a test script
  piped through it may never run at all, and the "result" is meaningless.
- `system.ts` is ESM: `require("fs")` throws, and a `try/catch` around it silently eats the probe.
  Use the existing `import * as fsSync from "node:fs"`.
- `console.warn` from the engine is not reliably captured in the `dev-app` log.
- `dev-app.cjs` allows **3** crash-restarts. Killing the engine repeatedly to reload code exhausts
  the budget and takes the whole stack down. Restart `dev-app` instead of killing bun.
- Always pair a probe with a control probe in code you know executes.

---

## Repo state when this was written

Uncommitted, 1 file, 1 line:

```
packages/engine/engine/src/session/system.ts   +1   (TRIAL rule "0." — inert)
```

All probe instrumentation was reverted. Nothing was committed or pushed.

Recommendation: revert the TRIAL line. It is harmless but misleading until the real cause is fixed.

---

## Collateral finding

The `Network service crashed or was terminated` message in dev logs is a Chromium **utility
process** crash, and Arunaki already handles it:

```
[main] Child process gone (recovering): Utility crashed
```

That is `main.cjs:19-22`. It recovers; the app does not die. Not a blocker.

---

## Root Cause Identified & Resolved (2026-10-13 18:20 WIB)

### The Architectural Duality Bug
The investigation revealed a split in the engine architecture:
1. **Legacy V1 Runner:** `packages/engine/engine/src/session/prompt.ts` & `system.ts`.
2. **Active V2 Runner:** `packages/engine/core/src/session/runner/llm.ts` & `packages/engine/core/src/system-context/builtins.ts`.

All prior Knowledge base injection, Knowledge menu awareness, and document processing rules were written exclusively in `packages/engine/engine/src/session/system.ts`.
However, the Web UI and desktop API call:
```
POST /api/session/:sessionID/prompt
```
This endpoint is handled by `packages/engine/server/src/handlers/session.ts:142`, which delegates to `SessionV2.prompt` -> `SessionExecutionLocal` -> `SessionRunnerLLM` (`packages/engine/core/src/session/runner/llm.ts`).

In the V2 runner, the system prompt is assembled from `SystemContextRegistry` (`packages/engine/core/src/system-context/builtins.ts`).
In `builtins.ts`, the context consisted only of:
- `<env>` (raw working directory & platform)
- `Today's date`
- `<tool_guidelines>`

**It contained ZERO Arunaki rules, ZERO `<knowledge_base>` data injection, and ZERO Knowledge menu awareness.**
The previous agent's probe measurement was actually **100% correct**: `SystemPrompt.environment()` in `system.ts` was indeed never called, because the active application runtime executes the V2 runner!

### Resolution Applied
1. Integrated full Arunaki rules (`core/arunaki-rules`) and dynamic Knowledge context (`core/knowledge`) into `packages/engine/core/src/system-context/builtins.ts`:
   - Active nodes from `.arunaki/knowledge.json` injected under `<knowledge_base>`.
   - Direct support for `Notes:` text under Rule 0: model answers directly from notes without webfetch, file searching, or asking for an uploaded file.
   - Cached CSV snapshot integration from `.arunaki/cache/${node.id}.csv` (Rule 1).
   - Google Sheet CSV conversion and fetch instructions (Rule 2).
   - Warm conversational acknowledgment (Rule 3) and data verification guarantee (Rule 4).
   - Strict privacy & architecture rules (no internal node IDs or filenames).
   - `KNOWLEDGE MENU AWARENESS` fallback when no data sources are connected.
   - Comprehensive Arunaki system rules (Folder isolation, native tools first, Python scripting fallback, reasoning tags, action-first bias).
2. Preserved Rule 0 in `packages/engine/engine/src/session/system.ts` for consistency.
3. Created unit test suite `packages/engine/core/test/system-context/knowledge-injection.test.ts` (3/3 passing).
4. Updated `packages/engine/core/test/system-context/builtins.test.ts` (4/4 passing).
5. Validated compilation with `npm run build -w apps/web` and `tsc --noEmit` across packages.