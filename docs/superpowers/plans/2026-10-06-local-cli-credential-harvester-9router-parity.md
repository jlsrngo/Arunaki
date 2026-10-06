# 9Router-Parity Credential Harvester & Direct Streaming Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parity dengan 9Router **hanya di sisi komunikasi dengan CLI dan akun yang sudah punya token** — harvest token dari cache lokal, refresh otomatis, kirim request upstream ke endpoint/header/format yang benar, lalu konversasi format dua arah. **Tanpa combo, tanpa multi-akun fallback, tanpa quota/usage/RTK.**

**Architecture:**

1. **Harvester** (server-side) baca token dari cache CLI/IDE di home user → `DiscoveredCredential`, di-cache TTL 60 detik.
2. **Credential Store** simpan kredensial + hasil refresh di state internal Arunaki (bukan menimpa file CLI milik user).
3. **Refresh Module** tiga lapis persis pola 9Router: proaktif (lead time per provider + single-flight), background tick, reaktif 401/403 → refresh → retry.
4. **Upstream Executor** per provider — Codex → `chatgpt.com/backend-api/codex/responses`, Claude → `api.anthropic.com/v1/messages?beta=true` dengan auth header yang benar (bukan `api.openai.com/v1/chat/completions`).
5. **Translator** OpenAI chat ⇄ Anthropic messages **utuh termasuk `tools` / `tool_use` / `tool_result` / `finish_reason` / `usage`**.
6. **Fast-path** disisipkan di `bridge.ts` sebelum jalur `claude -p`; gagal **pre-flight** (belum `writeHead`) → jatuh ke rantai lama (`agy` daemon → opencode/9Router → `claude -p`) yang tetap utuh.
7. **Injector** tulis konfigurasi CLI (`~/.claude/settings.json`, `~/.codex/config.toml`) mengarah ke bridge, dengan backup + gagal-tulis-bila-parse-error.

**Tech Stack:** TypeScript, `bun:test` (test runner engine), `bun:sqlite` (baca `state.vscdb`, bawaan runtime — **nol dependency baru**), React 19, Tailwind CSS, Effect (HttpApiBuilder untuk handler API).

---

## 9Router Reference Map

Path relatif terhadap clone 9Router (`C:\Users\AMD\AppData\Local\Temp\opencode\9router\`). Baca file ini **sebelum** menulis Task terkait — nilai di bawah sudah diverifikasi langsung dari source.

| File | Ambil apa |
|---|---|
| `open-sse/providers/registry/codex.js` (L39, L94-116) | `baseUrl: https://chatgpt.com/backend-api/codex/responses`, `clientId: app_EMoamEEZ73f0CkXaXp7hrann`, `tokenUrl: https://auth.openai.com/oauth/token`, `scope: openid profile email offline_access`, refresh **encoding: form**, `refreshLeadMs: 600000` (10 mnt), `maxRefreshAgeMs: 691200000` (8 hari), `trackRefreshAt: true`, `originator: codex_cli_rs` |
| `open-sse/providers/registry/claude.js` (L23-26, L70-84) | `urlSuffix: ?beta=true`, daftar `Anthropic-Beta` (baris 26 — salin persis), `clientId: 9d1c250a-e61b-44d9-88ed-5944d1962f5e`, `tokenUrl: https://api.anthropic.com/v1/oauth/token`, `scopes: [org:create_api_key, user:profile, user:inference]`, refresh **encoding: json**, `refreshLeadMs: 14400000` (4 jam) |
| `open-sse/executors/codex.js` (L205-250, L456-465) | Header `ChatGPT-Account-ID`, `originator: codex_cli_rs`, `session_id`; allowlist field Responses API; strip item id `rs_/fc_/resp_/msg_` saat `store=false`; flatten `tools` chat → responses |
| `open-sse/executors/default.js` (L13-30, L129, L145-214) | Spec auth: API key → `x-api-key` raw, OAuth → `Authorization: Bearer`; `urlSuffix` per provider; `mergeAnthropicBeta`; strip `claude-code-20250219` bila lintas provider |
| `open-sse/services/tokenRefresh.js` (L138, L203, L224) | `REFRESH_HANDLERS` per provider, proaktif sebelum request, background scheduler (interval 5 menit / lead 30 menit), jitter |
| `open-sse/sse/handlers/chatCore.js` (L424-469) | Reaktif: 401/403 → `refreshWithRetry(3)` → retry 1× → kalau gagal baru fallback |
| `open-sse/executors/kiro.js`, `cursor.js`, `antigravity.js` | Format upstream binary/protobuf/EventStream → **alasan fast-path Arunaki sengaja tidak mencakup provider ini** |
| `src/app/api/oauth/kiro/auto-import/route.js`, `src/app/api/oauth/cursor/import/route.js`, `src/app/api/oauth/codex/import-token/route.js` | Pola auto-import + penandaan `ALWAYS_PROTECTED` |
| `src/sse/services/auth.js` (L345), `src/shared/utils/apiKey.js` | Ekstraksi key dari `Authorization: Bearer` **atau** `x-api-key`; format `sk-{machineId16}-{keyId6}-{crc8}` |
| `src/lib/oauth/providers/index.js` | Daftar 25 provider OAuth + alur PKCE/device-code |

**Catatan perbedaan yang disengaja:** 9Router mengimpor Claude lewat OAuth browser flow (tidak punya import-route Claude). Arunaki menambah harvest dari `~/.claude/.credentials.json` sebagai padanan setara (isi identik: `accessToken`/`refreshToken`/`expiresAt`).

**Referensi di repo Arunaki:**

- `packages/engine/engine/src/server/local-cli/bridge.ts` — `LOCAL_BRIDGE_PORT = 20188` (L8), CORS (L702-704), `/v1/models` hardcoded (L718), route `/v1/chat/completions` (L748), `handleChatCompletion` klasifikasi (L928-954), cabang `isAntigravity` → agy daemon (L1031), cabang `isOpenCode` (L1042), cabang Claude CLI `claude -p` (L1063-1142), forward 9Router (L1161-1207).
- `packages/engine/engine/src/server/routes/instance/httpapi/handlers/provider.ts` — `localCliStatus` (L462), `localCliLogin` (L490), `localCliConnect` (L549), `healLocalCliProviders` (L219), registrasi `.handle(...)` (L644-647).
- `packages/engine/engine/package.json` — `test: bun test` (vitest **hanya** ada di `apps/web`).
- `apps/web/src/components/settings/SettingsCliConnectionsTab.tsx` — kartu status CLI.

---

## Global Constraints

- **Zero Terminal Typing:** token ada di disk → UI menandai "Auto-Imported · Ready" tanpa perintah terminal.
- **No Regressions:** daemon `agy`, `opencode serve`, forward `localhost:20128`, dan jalur `claude -p` harus tetap berfungsi penuh.
- **Fallback pre-flight only:** fast-path hanya boleh gagal **sebelum** `res.writeHead`/`res.write` pertama. Setelah headers terkirim → tutup stream dengan error chunk, jangan spawn daemon.
- **Jangan pernah menulis ke file CLI milik user selain melalui Injector yang sudah di-backup.** Hasil refresh disimpan di state internal Arunaki.
- **Jangan pernah mengirim token mentah ke browser** (baik `GET discovered` maupun handler lain).
- **Endpoint HTTP hanya lewat `HttpApiBuilder.group`** (`handlers/provider.ts`) agar mengikuti session auth & schema yang sudah ada.
- **React Rules of Hooks** di `apps/web`: tidak ada hook di bawah early return.
- **Wajib:** `npm run build -w apps/web` sebelum commit (AGENTS.md Frontend Rule 5).

---

## Dihapus dari versi sebelumnya

- Klaim **"sub-50ms latency"** — first token tetap roundtrip HTTPS ke vendor.
- `better-sqlite3 / sqlite3` dari tech stack → diganti **`bun:sqlite`** (bawaan runtime, read-only `file:...?mode=ro`).
- Fetch generik ke `https://api.openai.com/v1/chat/completions` untuk token Codex (selalu 401 — endpoint itu tidak menerima token ChatGPT OAuth).
- Regex binary sebagai jalur utama pembacaan `state.vscdb`.
- `vitest` untuk test engine → **`bun:test`**.
- `wire_api = "responses"` di injector tanpa menyediakan `/v1/responses` di bridge → diganti `wire_api = "chat"`.

---

### Task 1: Credential Harvester Service (`harvester.ts`)

**Files:**
- Create: `packages/engine/engine/src/server/local-cli/harvester.ts`
- Create: `packages/engine/engine/src/server/local-cli/credential-store.ts`
- Test: `packages/engine/engine/test/harvester.test.ts`

**Interfaces:**

```ts
export interface DiscoveredCredential {
  provider: "codex" | "cursor" | "kiro" | "claude"
  displayName: string
  type: "oauth" | "api_key"
  accessToken: string
  refreshToken?: string
  expiresAt?: number        // epoch ms; undefined = tidak diketahui → biarkan refresh yang menentukan
  accountEmail?: string
  accountId?: string        // codex: tokens.account_id → ChatGPT-Account-ID
  clientId?: string         // kiro: dari file OIDC client registration (wajib utk refresh)
  clientSecret?: string     // kiro
  profileArn?: string       // kiro
  region?: string
  sourcePath: string
  lastRefreshAt?: number
}
export function scanLocalCredentials(): Promise<Record<string, DiscoveredCredential>>
export function readCodexCredential(customHome?: string): DiscoveredCredential | null
export function readCursorCredential(customAppdata?: string): DiscoveredCredential | null
export function readKiroCredential(customHome?: string): DiscoveredCredential | null
export function readClaudeCredential(customHome?: string): DiscoveredCredential | null
```

- [ ] **Step 1: Tulis test gagal (`bun:test`)**

```ts
// packages/engine/engine/test/harvester.test.ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import fs from "fs"
import path from "path"
import os from "os"
import {
  readCodexCredential,
  readKiroCredential,
  readClaudeCredential,
  readCursorCredential,
} from "../src/server/local-cli/harvester"

describe("Credential Harvester", () => {
  const tmpDir = path.join(os.tmpdir(), `arunaki-harvester-${Date.now()}`)
  beforeEach(() => fs.mkdirSync(tmpDir, { recursive: true }))
  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  })

  it("codex: shape asli ~/.codex/auth.json {tokens:{...}} + id_token", () => {
    const dir = path.join(tmpDir, ".codex")
    fs.mkdirSync(dir, { recursive: true })
    const idToken = ["hdr", Buffer.from(JSON.stringify({ email: "dev@x.com" })).toString("base64url"), "sig"].join(".")
    fs.writeFileSync(
      path.join(dir, "auth.json"),
      JSON.stringify({
        tokens: {
          access_token: "sk-proj-abc",
          refresh_token: "rt-1",
          account_id: "acct-9",
          id_token: idToken,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
        last_refresh: new Date().toISOString(),
      }),
    )
    const c = readCodexCredential(tmpDir)
    expect(c?.provider).toBe("codex")
    expect(c?.accessToken).toBe("sk-proj-abc")
    expect(c?.accountId).toBe("acct-9")
    expect(c?.accountEmail).toBe("dev@x.com")
    expect(c?.isValid !== undefined).toBe(true)
  })

  it("codex: OPENAI_API_KEY mode tanpa tokens", () => {
    const dir = path.join(tmpDir, ".codex")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "auth.json"), JSON.stringify({ OPENAI_API_KEY: "sk-proj-keyonly" }))
    const c = readCodexCredential(tmpDir)
    expect(c?.type).toBe("api_key")
    expect(c?.accessToken).toBe("sk-proj-keyonly")
  })

  it("claude: ~/.claude/.credentials.json claudeAiOauth", () => {
    const dir = path.join(tmpDir, ".claude")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, ".credentials.json"),
      JSON.stringify({ claudeAiOauth: { accessToken: "sk-ant-oat01-x", refreshToken: "rt-cl", expiresAt: Date.now() + 8.64e7, scopes: ["user:inference"] } }),
    )
    const c = readClaudeCredential(tmpDir)
    expect(c?.type).toBe("oauth")
    expect(c?.accessToken).toBe("sk-ant-oat01-x")
    expect(c?.refreshToken).toBe("rt-cl")
  })

  it("claude: fallback settings.json env ANTHROPIC_API_KEY", () => {
    const dir = path.join(tmpDir, ".claude")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ env: { ANTHROPIC_API_KEY: "sk-ant-api03-z" } }))
    const c = readClaudeCredential(tmpDir)
    expect(c?.type).toBe("api_key")
    expect(c?.accessToken).toBe("sk-ant-api03-z")
  })

  it("kiro: cache aorAAAAAG + client credentials dari clientIdHash.json", () => {
    const dir = path.join(tmpDir, ".aws", "sso", "cache")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, "abc123.json"),
      JSON.stringify({ accessToken: "kiro-at", refreshToken: "aorAAAAAGrt", expiresAt: new Date(Date.now() + 3.6e6).toISOString(), region: "us-east-1" }),
    )
    fs.writeFileSync(
      path.join(dir, "client-oidc.json"),
      JSON.stringify({ clientId: "cid", clientSecret: "csec", region: "us-east-1", profileArn: "arn:aws:codewhisperer:us-east-1::profile/p" }),
    )
    const c = readKiroCredential(tmpDir)
    expect(c?.refreshToken).toStartWith("aorAAAAAG")
    expect(c?.clientId).toBe("cid")
    expect(c?.clientSecret).toBe("csec")
  })

  it("cursor: baca ItemTable via bun:sqlite read-only", () => {
    const { Database } = require("bun:sqlite")
    const p = path.join(tmpDir, "state.vscdb")
    const db = new Database(p)
    db.exec("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB)")
    db.run("INSERT INTO ItemTable VALUES (?, ?)", ["cursorAuth/accessToken", "cur-at"])
    db.run("INSERT INTO ItemTable VALUES (?, ?)", ["cursorAuth/refreshToken", "cur-rt"])
    db.close()
    const c = readCursorCredential(tmpDir)
    expect(c?.accessToken).toBe("cur-at")
    expect(c?.refreshToken).toBe("cur-rt")
  })
})
```

> `expect(c?.isValid !== undefined).toBe(true)` diganti assertion relevan setelah field `isValid` didefinisikan; test wajib hijau sebelum lanjut.

- [ ] **Step 2: Jalankan test — harus FAIL "Cannot find module"**

Run: `cd packages/engine/engine && bun test test/harvester.test.ts`

- [ ] **Step 3: Implement `harvester.ts`**

Aturan baca per provider (rincian wajib, bukan sekadar "ada file"):

```ts
// packages/engine/engine/src/server/local-cli/harvester.ts
import fs from "fs"
import path from "path"
import os from "os"

export interface DiscoveredCredential { /* sesuai Interfaces di atas */ }

const readJson = (p: string): any | null => {
  try { return JSON.parse(fs.readFileSync(p, "utf8")) } catch { return null }
}

export function readCodexCredential(customHome?: string): DiscoveredCredential | null {
  const p = path.join(customHome || os.homedir(), ".codex", "auth.json")
  const data = readJson(p)
  if (!data) return null

  // Mode OAuth: { tokens: { access_token, refresh_token, account_id, id_token?, expires_at? } }
  const t = data.tokens
  if (t?.access_token) {
    return {
      provider: "codex", displayName: "OpenAI Codex / ChatGPT", type: "oauth",
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      accountId: t.account_id,                       // → header ChatGPT-Account-ID
      // expires_at dalam detik (epoch); kalau tidak ada → undefined (refresh yang menentukan)
      expiresAt: typeof t.expires_at === "number" ? t.expires_at * 1000 : undefined,
      // email TIDAK ada sebagai field → decode payload klaim `email` dari id_token (JWT base64url)
      accountEmail: emailFromJwt(t.id_token),
      sourcePath: p, lastRefreshAt: Date.parse(data.last_refresh || "") || undefined,
    }
  }
  // Mode API key: { OPENAI_API_KEY: "sk-proj-..." }
  if (typeof data.OPENAI_API_KEY === "string") {
    return { provider: "codex", displayName: "OpenAI API Key", type: "api_key",
             accessToken: data.OPENAI_API_KEY, sourcePath: p }
  }
  return null
}

export function readClaudeCredential(customHome?: string): DiscoveredCredential | null {
  const home = customHome || os.homedir()
  // Sumber utama: ~/.claude/.credentials.json (Linux/Windows)
  const credPath = path.join(home, ".claude", ".credentials.json")
  const cred = readJson(credPath)
  const oauth = cred?.claudeAiOauth
  if (oauth?.accessToken) {
    return {
      provider: "claude", displayName: "Claude Code CLI", type: "oauth",
      accessToken: oauth.accessToken, refreshToken: oauth.refreshToken,
      expiresAt: typeof oauth.expiresAt === "number" ? oauth.expiresAt : undefined, // epoch MS
      sourcePath: credPath,
    }
  }
  // Fallback: ~/.claude/settings.json env (hanya utk API key biasa)
  const st = readJson(path.join(home, ".claude", "settings.json"))
  const key = st?.env?.ANTHROPIC_API_KEY || st?.env?.ANTHROPIC_AUTH_TOKEN
  if (typeof key === "string" && key) {
    return { provider: "claude", displayName: "Claude Code CLI", type: "api_key",
             accessToken: key, sourcePath: path.join(home, ".claude", "settings.json") }
  }
  // macOS: token ada di Keychain ("Claude Code-credentials") — di-skip dengan log, tanpa dependency baru
  return null
}

export function readKiroCredential(customHome?: string): DiscoveredCredential | null {
  const cacheDir = path.join(customHome || os.homedir(), ".aws", "sso", "cache")
  if (!fs.existsSync(cacheDir)) return null
  const files = fs.readdirSync(cacheDir).filter((f) => f.endsWith(".json"))
  let tokenEntry: any = null, clientCreds: any = null
  for (const f of files) {
    const d = readJson(path.join(cacheDir, f))
    if (!d) continue
    if (typeof d.refreshToken === "string" && d.refreshToken.startsWith("aorAAAAAG")) tokenEntry = { d, f }
    else if (d.clientId && d.clientSecret) clientCreds = d   // file registrasi OIDC client
  }
  if (!tokenEntry) return null
  const d = tokenEntry.d
  return {
    provider: "kiro", displayName: "AWS Kiro AI", type: "oauth",
    accessToken: d.accessToken, refreshToken: d.refreshToken,
    expiresAt: d.expiresAt ? Date.parse(d.expiresAt) : undefined,
    region: d.region || clientCreds?.region,
    clientId: clientCreds?.clientId, clientSecret: clientCreds?.clientSecret,
    profileArn: clientCreds?.profileArn,
    sourcePath: path.join(cacheDir, tokenEntry.f),
  }
}

export function readCursorCredential(customAppdata?: string): DiscoveredCredential | null {
  const appData = customAppdata || process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
  const candidates = [
    path.join(appData, "Cursor", "User", "globalStorage", "state.vscdb"),
    path.join(os.homedir(), "Library", "Application Support", "Cursor", "User", "globalStorage", "state.vscdb"),
    path.join(os.homedir(), ".config", "Cursor", "User", "globalStorage", "state.vscdb"),
  ]
  for (const dbPath of candidates) {
    if (!fs.existsSync(dbPath)) continue
    try {
      // bun:sqlite, baca-saja; gagal (db terkunci/Node runtime) → lanjut, TIDAK jatuh ke regex binary
      const { Database } = require("bun:sqlite")
      const db = new Database(dbPath, { readonly: true })
      const q = db.query("SELECT value FROM ItemTable WHERE key = ?")
      const at = q.get("cursorAuth/accessToken") as any
      const rt = q.get("cursorAuth/refreshToken") as any
      db.close()
      if (at?.value) {
        return { provider: "cursor", displayName: "Cursor IDE", type: "bearer" as any,
                 accessToken: at.value, refreshToken: rt?.value, sourcePath: dbPath }
      }
    } catch (err) {
      console.warn("[Harvester] cursor read skipped:", (err as Error).message)
    }
  }
  return null
}
```

Catatan implementasi:
- `emailFromJwt`: split `.` → `Buffer.from(parts[1], "base64url").toString("utf8")` → `JSON.parse(...).email`.
- `type: "bearer"` tidak ada di union v2 — Cursor cukup `"oauth"` bila punya refreshToken, selain itu `"api_key"`.
- `scanLocalCredentials()` panggil keempat reader, hasilkan record bertopik provider, **ditulis ke `credential-store.ts`** dan di-cache 60 detik (invalidasi manual tersedia).
- `credential-store.ts`: `load()/save()` ke satu file state internal Arunaki — **cari dulu dengan grep apakah engine sudah punya direktori state lokal** (`grep -r "homedir()" packages/engine/engine/src/server`), kalau tidak ada pakai `path.join(os.homedir(), ".arunaki", "local-cli-credentials.json")`. Simpan hanya kredensial + `lastRefreshAt` + token hasil refresh — **jangan pernah menimpa `~/.codex/auth.json` / `~/.claude/.credentials.json`**.

- [ ] **Step 4: Jalankan test — harus PASS semua**

Run: `cd packages/engine/engine && bun test test/harvester.test.ts`

- [ ] **Step 5: Commit Task 1**

```bash
git add packages/engine/engine/src/server/local-cli/harvester.ts packages/engine/engine/src/server/local-cli/credential-store.ts packages/engine/engine/test/harvester.test.ts
git commit -m "feat(cli): harvest Codex/Claude/Kiro/Cursor credentials from local CLI caches"
```

---

### Task 2: Token Refresh Module (`refresh.ts`) — **inti paritas**

**Files:**
- Create: `packages/engine/engine/src/server/local-cli/refresh.ts`
- Test: `packages/engine/engine/test/refresh.test.ts`

9Router hidup karena refresh ini; tanpa dia token mati dalam hitungan jam. Tiga lapis:

- [ ] **Step 1: Test gagal untuk handler refresh (mock `fetch`)**

```ts
// packages/engine/engine/test/refresh.test.ts
import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import { refreshCredential, checkBeforeRequest, scheduleBackgroundRefresh, stopBackgroundRefresh } from "../src/server/local-cli/refresh"

describe("Token Refresh", () => {
  beforeEach(() => { mock.module("undici", () => ({}) /* placeholder */); stopBackgroundRefresh() })
  afterEach(() => { mock.restore(); stopBackgroundRefresh() })

  it("codex: refresh pakai RT TERBARU + encoding form + client_id benar", async () => {
    const calls: any[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (url: any, init: any) => {
      calls.push({ url: String(url), body: String(init.body) })
      return new Response(JSON.stringify({ access_token: "new-at", refresh_token: "new-rt", expires_in: 3600 }), { status: 200 })
    }) as any
    try {
      const out = await refreshCredential({
        provider: "codex", accessToken: "old", refreshToken: "rt-LATEST", lastRefreshAt: Date.now() - 7.2e6,
      } as any)
      expect(calls[0].url).toContain("https://auth.openai.com/oauth/token")
      expect(calls[0].body).toContain("grant_type=refresh_token")
      expect(calls[0].body).toContain("refresh_token=rt-LATEST")
      expect(calls[0].body).toContain("client_id=app_EMoamEEZ73f0CkXaXp7hrann")
      expect(out.accessToken).toBe("new-at")
      expect(out.refreshToken).toBe("new-rt")     // rotasi disimpan
    } finally { globalThis.fetch = realFetch }
  })

  it("claude: refresh encoding JSON + client_id Claude Code", async () => {
    const calls: any[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (url: any, init: any) => {
      calls.push({ url: String(url), body: String(init.body) })
      return new Response(JSON.stringify({ access_token: "sk-ant-oat02-new", refresh_token: "rt2", expires_in: 86400 }), { status: 200 })
    }) as any
    try {
      const out = await refreshCredential({
        provider: "claude", accessToken: "sk-ant-oat01-old", refreshToken: "rt1", lastRefreshAt: 0,
      } as any)
      expect(calls[0].url).toContain("https://api.anthropic.com/v1/oauth/token")
      const parsed = JSON.parse(calls[0].body)
      expect(parsed.grant_type).toBe("refresh_token")
      expect(parsed.client_id).toBe("9d1c250a-e61b-44d9-88ed-5944d1962f5e")
      expect(out.accessToken).toContain("sk-ant-oat02-new")
    } finally { globalThis.fetch = realFetch }
  })

  it("proaktif: tidak refresh bila masih jauh dari lead; refresh bila < lead", async () => {
    // expiresAt 2 jam lagi, codex lead 10 menit → no-op
    expect(await checkBeforeRequest({ provider: "codex", expiresAt: Date.now() + 7.2e6, lastRefreshAt: Date.now() })).toBe(false)
    // expiresAt 5 menit lagi → refresh dipanggil
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response(JSON.stringify({ access_token: "n", refresh_token: "r", expires_in: 3600 }), { status: 200 })) as any
    try {
      expect(await checkBeforeRequest({ provider: "codex", expiresAt: Date.now() + 5 * 60_000, refreshToken: "rt" } as any)).toBe(true)
    } finally { globalThis.fetch = realFetch }
  })
})
```

- [ ] **Step 2: Implement `refresh.ts`**

```ts
// packages/engine/engine/src/server/local-cli/refresh.ts
import type { DiscoveredCredential } from "./harvester"

// Lead per provider — angka persis dari registry 9Router
const REFRESH_LEAD_MS: Record<string, number> = {
  codex: 600_000,    // registry/codex.js refreshLeadMs (access token ~1 jam)
  claude: 14_400_000, // registry/claude.js refreshLeadMs
  kiro: 60_000,       // placeholder — konfirmasi dari open-sse/providers/registry/kiro.js
  cursor: 60_000,     // konfirmasi dari open-sse/providers/registry/cursor.js
}
// 9Router: jangan refresh lagi bila terlalu sering (codex trackRefreshAt/maxRefreshAgeMs 8 hari)
const MAX_REFRESH_AGE_MS: Record<string, number> = { codex: 691_200_000 }

const inFlight = new Map<string, Promise<DiscoveredCredential | null>>()  // single-flight per provider

export async function refreshCredential(cred: DiscoveredCredential): Promise<DiscoveredCredential | null> {
  const key = `${cred.provider}:${cred.sourcePath}`
  const existing = inFlight.get(key)
  if (existing) return existing                    // 1 lock per akun — request paralel tidak refresh 2×
  const p = doRefresh(cred).finally(() => inFlight.delete(key))
  inFlight.set(key, p)
  return p
}

async function doRefresh(cred: DiscoveredCredential): Promise<DiscoveredCredential | null> {
  try {
    switch (cred.provider) {
      case "codex": return await refreshCodex(cred)
      case "claude": return await refreshClaude(cred)
      case "kiro": return await refreshKiro(cred)     // butuh cred.clientId/clientSecret (Task 1)
      case "cursor": return await refreshCursor(cred)
      default: return null
    }
  } catch (err) {
    console.warn(`[Refresh] ${cred.provider} failed:`, (err as Error).message)
    return null
  }
}

// OPENAI/ChatGPT — FORM encoding, refresh token TERBARU, jangan pakai ulang hasil rotasi
// (9router registry/codex.js: "reuse of a rotated token revokes the whole OpenAI session")
async function refreshCodex(cred: DiscoveredCredential): Promise<DiscoveredCredential | null> {
  if (!cred.refreshToken) return null
  if (cred.lastRefreshAt && Date.now() - cred.lastRefreshAt < (MAX_REFRESH_AGE_MS.codex ?? Infinity)) { /* lanjut */ }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: cred.refreshToken,
    client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
    scope: "openid profile email offline_access",
  })
  const res = await fetch("https://auth.openai.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })
  if (!res.ok) return null
  const data = await res.json()
  return {
    ...cred,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || cred.refreshToken,   // ROTASI: pakai yang baru
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    lastRefreshAt: Date.now(),
  }
}

// ANTHROPIC — JSON encoding, client_id milik Claude Code
async function refreshClaude(cred: DiscoveredCredential): Promise<DiscoveredCredential | null> {
  if (!cred.refreshToken) return null
  const res = await fetch("https://api.anthropic.com/v1/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: cred.refreshToken,
      client_id: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  return {
    ...cred,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || cred.refreshToken,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    lastRefreshAt: Date.now(),
  }
}

// KIRO & CURSOR — endpoint diambil dari registry 9Router saat implementasi:
//   open-sse/providers/registry/kiro.js  (butuh clientId/clientSecret + refreshToken)
//   open-sse/providers/registry/cursor.js (refreshToken dari state.vscdb)
// Pola body mengikuti `refresh.*` block di registry masing-masing (encoding, scope, client_id).
async function refreshKiro(cred: DiscoveredCredential): Promise<DiscoveredCredential | null> {
  if (!cred.clientId || !cred.clientSecret || !cred.refreshToken) return null
  // TODO(impl): salin endpoint + body persis dari registry/kiro.js
  void cred
  return null
}
async function refreshCursor(cred: DiscoveredCredential): Promise<DiscoveredCredential | null> {
  if (!cred.refreshToken) return null
  // TODO(impl): salin endpoint + body persis dari registry/cursor.js
  void cred
  return null
}

/** Lapis 1 — proaktif sebelum request. Return true bila refresh dieksekusi. */
export async function checkBeforeRequest(cred: DiscoveredCredential): Promise<boolean> {
  if (!cred.refreshToken) return false
  const lead = REFRESH_LEAD_MS[cred.provider] ?? 60_000
  const soon = cred.expiresAt ? cred.expiresAt - Date.now() < lead : !cred.lastRefreshAt
  if (!soon) return false
  const next = await refreshCredential(cred)
  if (next) { Object.assign(cred, next); return true }
  return false
}

/** Lapis 2 — background tick (9router: interval 5 menit, kandidat expiry ≤ 30 menit, jitter). */
let timer: ReturnType<typeof setInterval> | null = null
export function scheduleBackgroundRefresh(intervalMs = 5 * 60_000) {
  if (timer) return
  timer = setInterval(async () => {
    const creds = await loadAllCredentials()      // dari credential-store
    for (const cred of Object.values(creds)) {
      if (!cred.refreshToken) continue
      const horizon = cred.expiresAt ? cred.expiresAt - Date.now() : Infinity
      if (horizon > 30 * 60_000) continue
      const jitter = cred.provider === "cursor" ? 12_000 + Math.random() * 4_000 : 1_500 + Math.random() * 200
      setTimeout(() => refreshCredential(cred).then((n) => n && persistCredential(n)), jitter) // hindari burst ke vendor
    }
  }, intervalMs)
}
export function stopBackgroundRefresh() { if (timer) clearInterval(timer); timer = null }
```

- [ ] **Step 3: Lapis 3 — reaktif** → dikerjakan di Task 5 (kode 401/403 di fast-path): `refreshWithRetry` maksimal **3×**, lalu retry request upstream **1×**, baru fallback. Jangan refresh pada 400/404/429 (lihat klasifikasi error di Task 5).

- [ ] **Step 4: Test PASS + commit**

```bash
cd packages/engine/engine && bun test test/refresh.test.ts
git add packages/engine/engine/src/server/local-cli/refresh.ts packages/engine/engine/test/refresh.test.ts
git commit -m "feat(cli): proaktif/background/reactive token refresh with single-flight lock"
```

---

### Task 3: Upstream Executor per Provider (`upstream.ts`)

**Files:**
- Create: `packages/engine/engine/src/server/local-cli/upstream.ts`
- Test: `packages/engine/engine/test/upstream.test.ts`

**Batas scope yang disengaja (sama seperti 9Router):** kiro (EventStream), cursor (protobuf), antigravity **tidak** ditangani fast-path — request untuk provider itu diteruskan ke rantai yang sudah ada (`localhost:20128` / daemon). Fast-path hanya **codex** dan **claude**.

- [ ] **Step 1: Test gagal untuk URL + header upstream**

```ts
// packages/engine/engine/test/upstream.test.ts
import { describe, it, expect } from "bun:test"
import { buildCodexRequest, buildAnthropicHeaders } from "../src/server/local-cli/upstream"

describe("Upstream request builders", () => {
  it("codex → chatgpt.com/backend-api/codex/responses (BUKAN api.openai.com)", () => {
    const req = buildCodexRequest({ model: "gpt-5.1-codex", messages: [{ role: "user", content: "hi" }], stream: true },
      { accountId: "acct-1" } as any)
    expect(req.url).toBe("https://chatgpt.com/backend-api/codex/responses")
    expect(req.headers["ChatGPT-Account-ID"]).toBe("acct-1")
    expect(req.headers["originator"]).toBe("codex_cli_rs")
    expect(req.headers.Authorization).toContain("Bearer ")
    const body = JSON.parse(req.body)
    expect(body.input).toBeDefined()          // format Responses API, bukan {messages}
    expect(body.messages).toBeUndefined()
  })

  it("anthropic oauth → Authorization Bearer + Anthropic-Beta + ?beta=true", () => {
    const h = buildAnthropicHeaders({ type: "oauth", accessToken: "sk-ant-oat01-x" } as any)
    expect(h.Authorization).toBe("Bearer sk-ant-oat01-x")
    expect(h["anthropic-version"]).toBe("2023-06-01")
    expect(h["Anthropic-Beta"]).toContain("oauth-2025-04-20")
  })

  it("anthropic api key → x-api-key raw (tanpa Bearer)", () => {
    const h = buildAnthropicHeaders({ type: "api_key", accessToken: "sk-ant-api03-k" } as any)
    expect(h["x-api-key"]).toBe("sk-ant-api03-k")
    expect(h.Authorization).toBeUndefined()
  })
})
```

- [ ] **Step 2: Implement `upstream.ts`**

```ts
// packages/engine/engine/src/server/local-cli/upstream.ts
import type { DiscoveredCredential } from "./harvester"
import { checkBeforeRequest } from "./refresh"

// ANTHROPIC_BETA — salin persis open-sse/providers/registry/claude.js baris 26
const ANTHROPIC_BETA =
  "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,context-management-2025-06-27,prompt-caching-scope-2026-01-05,advanced-tool-use-2025-11-20,effort-2025-11-24,structured-outputs-2025-12-15,fast-mode-2026-02-01,redact-thinking-2026-02-12,token-efficient-tools-2026-03-28"

export function buildAnthropicHeaders(cred: DiscoveredCredential): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
    "Anthropic-Beta": ANTHROPIC_BETA,
  }
  if (cred.type === "oauth") h.Authorization = `Bearer ${cred.accessToken}`  // default.js: BEARER
  else h["x-api-key"] = cred.accessToken                                     // default.js: XAPIKEY (raw)
  return h
}

export const anthropicUrl = "https://api.anthropic.com/v1/messages?beta=true"

export interface CodexRequest { url: string; headers: Record<string, string>; body: string }

export function buildCodexRequest(openaiPayload: any, cred: DiscoveredCredential): CodexRequest {
  const body = chatToResponses(openaiPayload)
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cred.accessToken}`,
    originator: "codex_cli_rs",
    session_id: cred.accountId || "arunaki",
  }
  if (cred.accountId) headers["ChatGPT-Account-ID"] = cred.accountId  // codex.js:235 — jangan cross-bind akun
  return { url: "https://chatgpt.com/backend-api/codex/responses", headers, body: JSON.stringify(body) }
}

/** OpenAI chat → Responses API (lihat executor/codex.js: allowlist + flatten tools + strip item id). */
export function chatToResponses(p: any): any {
  const input: any[] = []
  for (const m of p.messages ?? []) {
    if (m.role === "system" || m.role === "user") {
      input.push({ type: "message", role: m.role, content: [{ type: m.role === "system" ? "input_text" : "input_text", text: textOf(m.content) }] })
    } else if (m.role === "assistant") {
      if (m.tool_calls?.length) {
        if (textOf(m.content)) input.push({ type: "message", role: "assistant", content: [{ type: "output_text", text: textOf(m.content) }] })
        for (const tc of m.tool_calls) {
          input.push({ type: "function_call", call_id: tc.id, name: tc.function?.name, arguments: tc.function?.arguments ?? "{}" })
        }
      } else {
        input.push({ type: "message", role: "assistant", content: [{ type: "output_text", text: textOf(m.content) }] })
      }
    } else if (m.role === "tool") {
      input.push({ type: "function_call_output", call_id: m.tool_call_id, output: textOf(m.content) })
    }
  }
  const out: any = { model: p.model, input, stream: !!p.stream, store: false }
  if (p.temperature != null) out.temperature = p.temperature
  if (p.max_tokens != null) out.max_output_tokens = p.max_tokens
  if (Array.isArray(p.tools) && p.tools.length) {
    // flatten: {function:{name,...}} → {type:"function", name, description, parameters} (codex.js L77)
    out.tools = p.tools.map((t: any) => {
      const f = t.function || t
      return { type: "function", name: f.name, description: f.description, parameters: f.parameters }
    })
  }
  if (p.tool_choice) out.tool_choice = p.tool_choice === "auto" ? "auto" : "auto"   // 9router: allowlist sederhana dulu
  return out
}

const textOf = (content: any): string =>
  typeof content === "string" ? content
  : Array.isArray(content) ? content.map((c: any) => (typeof c === "string" ? c : c?.text || "")).join("")
  : content && typeof content.text === "string" ? content.text : ""

/** Respons Codex → chunk OpenAI. Event: response.output_text.delta / response.completed. */
export function mapCodexEventToOpenAI(ev: any, ctx: { id: string; created: number; model: string }): string | null {
  if (ev.type === "response.output_text.delta") {
    return sse({ id: ctx.id, object: "chat.completion.chunk", created: ctx.created, model: ctx.model,
      choices: [{ index: 0, delta: { content: ev.delta }, finish_reason: null }] })
  }
  if (ev.type === "response.function_call_arguments.delta") {
    return sse({ id: ctx.id, object: "chat.completion.chunk", created: ctx.created, model: ctx.model,
      choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: ev.delta } }] }, finish_reason: null }] })
  }
  if (ev.type === "response.completed") {
    const calls = (ev.response?.output ?? []).filter((o: any) => o.type === "function_call")
    const finish = calls.length ? "tool_calls" : "stop"
    const first = calls[0]
    const chunks: string[] = []
    if (first) {
      // emit head tool_call agar klien tahu id/name sebelum arguments streaming (atau sudah di-emitted dari item.done)
      void first
    }
    const usage = ev.response?.usage
    chunks.push(sse({ id: ctx.id, object: "chat.completion.chunk", created: ctx.created, model: ctx.model,
      choices: [{ index: 0, delta: {}, finish_reason: finish }],
      usage: usage ? { prompt_tokens: usage.input_tokens, completion_tokens: usage.output_tokens, total_tokens: usage.total_tokens } : undefined }))
    return chunks.join("") + "data: [DONE]\n\n"
  }
  if (ev.type === "response.output_item.done" && ev.item?.type === "function_call") {
    return sse({ id: ctx.id, object: "chat.completion.chunk", created: ctx.created, model: ctx.model,
      choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: ev.item.call_id, type: "function",
        function: { name: ev.item.name, arguments: ev.item.arguments ?? "" } }] }, finish_reason: null }] })
  }
  return null
}
const sse = (o: any) => `data: ${JSON.stringify(o)}\n\n`
```

- [ ] **Step 3: Streaming + reaktif refresh (retry 401/403 satu kali)**

Di dalam `streamAnthropic(...)` / `streamCodex(...)`:

```ts
// urutan: (1) proaktif  (2) fetch upstream  (3) 401/403 → refresh → retry 1×  (4) lepas
await checkBeforeRequest(cred)
let res = await fetchWithUpstream(url, headers, body)
if ((res.status === 401 || res.status === 403) && cred.refreshToken) {
  const next = await refreshCredential(cred)
  if (next) { Object.assign(cred, next); res = await fetchWithUpstream(url, newHeaders, newBody) }
}
if (!res.ok || !res.body) return false   // → caller memutuskan fallback; BELUM ada write ke res klien
```

Klasifikasi error yang berlaku di seluruh fast-path:

| Status | Aksi | Fallback? |
|---|---|---|
| 401 / 403 | refresh (maks 3×) → retry 1× | ya, kalau masih gagal |
| 429 | baca `Retry-After` → tandai cooldown (satu-satunya akun, tidak ada akun lain untuk dicoba) | ya |
| 400 / 404 | **tanpa refresh** | ya (translator mungkin belum lengkap; jalur `claude -p` format-nya beda) |
| 5xx / network / timeout | tanpa refresh | ya |
| sudah `headersSent` | **tidak boleh fallback** — kirim error chunk lalu `res.end()` | tidak |

- [ ] **Step 4: Test PASS + commit**

```bash
cd packages/engine/engine && bun test test/upstream.test.ts
git add packages/engine/engine/src/server/local-cli/upstream.ts packages/engine/engine/test/upstream.test.ts
git commit -m "feat(cli): per-provider upstream executors for ChatGPT Responses and Anthropic Messages"
```

---

### Task 4: Translator Chat ⇄ Anthropic Utuh (`translator.ts`)

Plan lama membuang `tools`, `tool_choice`, dan `role:"tool"` tanpa `tool_use_id` → pasti 400. Task ini wajib lulus sebelum fast-path diaktifkan.

**Files:**
- Create: `packages/engine/engine/src/server/local-cli/translator.ts`
- Test: `packages/engine/engine/test/translator.test.ts`

- [ ] **Step 1: Test gagal**

```ts
// packages/engine/engine/test/translator.test.ts
import { describe, it, expect } from "bun:test"
import { openaiToAnthropic, anthropicSseToOpenAI } from "../src/server/local-cli/translator"

describe("OpenAI ⇄ Anthropic translator", () => {
  it("mempertahankan tools + tool_choice", () => {
    const body = openaiToAnthropic({
      model: "claude-sonnet-4-5",
      messages: [{ role: "user", content: "hitung" }],
      tools: [{ type: "function", function: { name: "calc", description: "d", parameters: { type: "object", properties: { x: { type: "number" } }, required: ["x"] } } }],
      tool_choice: "auto",
      temperature: 0.2,
      max_tokens: 1024,
    })
    expect(body.tools).toHaveLength(1)
    expect(body.tools[0].name).toBe("calc")
    expect(body.tool_choice).toEqual({ type: "auto" })
    expect(body.temperature).toBe(0.2)
    expect(body.max_tokens).toBe(1024)
  })

  it("assistant.tool_calls → content tool_use; role tool → tool_result + tool_use_id", () => {
    const body = openaiToAnthropic({
      model: "m",
      messages: [
        { role: "user", content: "luas" },
        { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "calc", arguments: "{\"x\":2}" } }] },
        { role: "tool", tool_call_id: "call_1", content: "4" },
      ],
      tools: [{ type: "function", function: { name: "calc", parameters: { type: "object", properties: {} } } }],
    })
    expect(body.messages[1].content[0]).toMatchObject({ type: "tool_use", id: "call_1", name: "calc" })
    expect(body.messages[2].role).toBe("user")                       // Anthropic: tool result = user turn
    expect(body.messages[2].content[0]).toMatchObject({ type: "tool_result", tool_use_id: "call_1", content: "4" })
  })

  it("stream Anthropic → OpenAI: tool_use delta + finish_reason + usage", async () => {
    const events = [
      { type: "message_start", message: { id: "msg_1", usage: { input_tokens: 10 } } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "halo" } },
      { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "call_9", name: "calc", input: {} } },
      { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{\"x\":1}" } },
      { type: "content_block_stop", index: 0 },
      { type: "content_block_stop", index: 1 },
      { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 7 } },
      { type: "message_stop" },
    ]
    const out = await anthropicSseToOpenAI(events, { id: "chatcmpl-1", created: 1, model: "m" })
    const chunks = out.filter((s) => s.startsWith("data: ")).map((s) => JSON.parse(s.slice(6)))
    const text = chunks.map((c) => c.choices?.[0]?.delta?.content ?? "").join("")
    expect(text).toBe("halo")
    const toolHead = chunks.find((c) => c.choices?.[0]?.delta?.tool_calls?.[0]?.id === "call_9")
    expect(toolHead.choices[0].delta.tool_calls[0].function.name).toBe("calc")
    const last = chunks[chunks.length - 1]
    expect(last).toBe("[DONE]")
    const finishChunk = chunks.find((c) => c.choices?.[0]?.finish_reason === "tool_use")
    expect(["tool_calls", "stop"]).toContain(finishChunk.choices[0].finish_reason)
    expect(finishChunk.usage.prompt_tokens).toBe(10)
    expect(finishChunk.usage.completion_tokens).toBe(7)
  })
})
```

- [ ] **Step 2: Implement `translator.ts`**

Wajib mencakup, tanpa kecuali:

- **Request:** `system` (semua `role:"system"` digabung) → `body.system`; `tools` (function decl) → `body.tools` (Anthropic shape `{name, description, input_schema}`); `tool_choice` (`"auto"`→`{type:"auto"}`, `"none"`→dihilangkan, `{type:"function"...}`→`{type:"tool", name}`); `temperature`, `top_p`, `max_tokens` (default `payload.max_tokens ?? payload.max_completion_tokens ?? 4096`), `stop`→`stop_sequences`.
- **Content array:** `{type:"text"}`→`{type:"text"}`, `{type:"image_url"}`→`{type:"image", source:{type:"base64", media_type, data}}`.
- **`assistant.tool_calls`** → `content` blocks `tool_use {id, name, input: JSON.parse(arguments)}` (parse gagal → `input:{}` + log, jangan buang).
- **`role:"tool"`** → pesan `user` berisi `[{type:"tool_result", tool_use_id: msg.tool_call_id, content: text}]`; `is_error` kalau payload menyatakan error. **Tanpa `tool_use_id` → Anthropic 400** — jadi kalau `tool_call_id` kosong, lepas ke fallback (return `null` dari translator = tanda "tidak terdukung").
- **Translator return `null`** = payload mengandung elemen yang belum didukung → pemanggil **wajib fallback**, jangan pernah memaksa.
- **Balikan SSE:** `message_start` → buat chunk pertama (`role: "assistant"`), `content_block_start/delta/stop` untuk `text` dan `tool_use` (`input_json_delta` → `tool_calls[].function.arguments`), `message_delta.delta.stop_reason` → `finish_reason` (`"tool_use"`→`"tool_calls"`, `"end_turn"/"stop_sequence"/"max_tokens"`→`"stop"`), `message_delta.usage` melengkapi `usage` sebelum chunk `finish_reason`, lalu `data: [DONE]`. Event `ping`/`content_block_stop` di-skip.
- **Path non-stream** (`message_stop` tanpa `stream:true`) juga wajib: `content[].text` → `choices[0].message.content`, `content[].type==="tool_use"` → `message.tool_calls[]`, `stop_reason` → `finish_reason`, `usage` → `prompt_tokens`/`completion_tokens`.

- [ ] **Step 3: Test PASS + commit**

```bash
cd packages/engine/engine && bun test test/translator.test.ts
git add packages/engine/engine/src/server/local-cli/translator.ts packages/engine/engine/test/translator.test.ts
git commit -m "feat(cli): full tool-calling translator between OpenAI chat and Anthropic messages"
```

---

### Task 5: Fast-Path Routing di `bridge.ts`

**Files:**
- Modify: `packages/engine/engine/src/server/local-cli/bridge.ts`

**Aturan routing** — pakai klasifikasi yang **sudah ada** di `handleChatCompletion` (L928-954), jangan `requestedModel.includes("codex")` lagi:

| Kondisi | Tujuan fast-path |
|---|---|
| model cocok `/^(gpt-\|o[1-9]\|codex)/` **dan** `!isOpenCodeModel` **dan** `!is9RouterModel` | **CodexExecutor** (ChatGPT backend) |
| jatuh ke cabang Claude CLI (setelah cabang `isAntigravity`/`isOpenCode` lolos) **dan** ada kredensial Claude | **AnthropicExecutor** |
| model `cx/`, `oc/`, `kr/`, `vx/`, `9router`, `combomaut` | tetap ke 9Router (L1161) — **jangan disentuh** |
| `isAntigravity` (gemini/antigravity/agy/pro/claude-sonnet-5-5) | tetap ke agy daemon (L1031) — **jangan disentuh** |
| kiro/cursor/antigravity token ada | **tidak** dipakai fast-path (format upstream binary) |

- [ ] **Step 1: Sisipkan fast-path OpenAI-family di atas cabang antigravity**

```ts
// handleChatCompletion — SETELAI klasifikasi isOpenCodeModel/isAntigravity, SEBELUM L1031
const isOpenAIFamily = /^(gpt-|o[1-9]|codex)/.test(requestedModel) && !isOpenCodeModel && !is9RouterModel
if (isOpenAIFamily) {
  const ok = await this.tryDirectCodex(payload, res)   // handles refresh + stream + fallback sendiri
  if (ok) return
  // false = pre-flight gagal → lanjut ke rantai lama (tidak ada header yang ditulis)
}
```

- [ ] **Step 2: Sisipkan fast-path Claude di cabang Claude CLI**

```ts
// SEBELAI checkClaudeStatus() di L1063 — fast-path minta token dulu, spawn CLI hanya bila gagal
const claudeCred = readClaudeCredential()
if (claudeCred && !this.isDirectDisabled("claude")) {
  const ok = await this.tryDirectAnthropic(payload, res, systemPrompt, claudeCred)
  if (ok) return
}
// → lanjut: checkClaudeStatus() → spawn claude -p (L1063+, tidak berubah sama sekali)
```

- [ ] **Step 3: Implement `tryDirectCodex` / `tryDirectAnthropic`**

Kontrak yang **wajib** (ini sumber bug di plan lama):

1. Sebelum menulis apa pun ke `res`: resolve credential → `checkBeforeRequest` → bangun request → `fetch` upstream → kalau gagal sesuai tabel klasifikasi → `return false` **tanpa** menyentuh `res`.
2. `if (res.headersSent) return false` tidak berlaku di tahap ini; **setelah** `res.writeHead(200)` terkirim, semua kegagalan berikutnya harus: kirim `data: {"error":{...}}` + `data: [DONE]` → `res.end()` → `return true` (sudah menangani respon, jangan jatuh ke daemon).
3. Setelah selesai, catat log keputusan (transparency rule AGENTS.md): `[FastPath] claude direct ok (2.1s)` / `[FastPath] codex fallback: 401 after refresh`.
4. Cache hasil `scanLocalCredentials()` 60 detik, jangan `readFileSync` per request.
5. `scheduleBackgroundRefresh()` dipanggil sekali saat `LocalCliBridge.start()` (L784 area) dan `stopBackgroundRefresh()` di `stop()`.

- [ ] **Step 4: Unit test routing (mock upstream) + commit**

```bash
cd packages/engine/engine && bun test test/fastpath.test.ts
git add packages/engine/engine/src/server/local-cli/bridge.ts
git commit -m "feat(cli): route OpenAI-family and Claude requests through credential fast-path with pre-flight fallback"
```

---

### Task 6: CLI Config Auto-Injector (`injector.ts`)

**Files:**
- Create: `packages/engine/engine/src/server/local-cli/injector.ts`
- Test: `packages/engine/engine/test/injector.test.ts`

**Dua bug fungsional di versi lama yang wajib diperbaiki:** (a) JSON parse gagal → file user ditimpa `{}`; (b) Codex section ditulis tanpa `model_provider` di root sehingga diabaikan.

- [ ] **Step 1: Test gagal**

```ts
// packages/engine/engine/test/injector.test.ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import fs from "fs"
import path from "path"
import os from "os"
import { injectClaudeSettings, injectCodexSettings, resetClaudeSettings, resetCodexSettings } from "../src/server/local-cli/injector"

describe("CLI injector", () => {
  const home = path.join(os.tmpdir(), `arunaki-inject-${Date.now()}`)
  beforeEach(() => fs.mkdirSync(home, { recursive: true }))
  afterEach(() => { try { fs.rmSync(home, { recursive: true, force: true }) } catch {} })

  it("claude: JSON rusak → GAGAL, file TIDAK ditimpa", () => {
    const dir = path.join(home, ".claude"); fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "settings.json"), "{ this is not json")
    const r = injectClaudeSettings(home, 20188)
    expect(r.success).toBe(false)
    expect(fs.readFileSync(path.join(dir, "settings.json"), "utf8")).toBe("{ this is not json")  // utuh
  })

  it("claude: merge env + backup dibuat", () => {
    const dir = path.join(home, ".claude"); fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ env: { MY_VAR: "1" }, theme: "dark" }))
    const r = injectClaudeSettings(home, 20188)
    expect(r.success).toBe(true)
    const out = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8"))
    expect(out.env.MY_VAR).toBe("1")                                   // field lama selamat
    expect(out.env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:20188/v1")
    expect(out.env.ANTHROPIC_AUTH_TOKEN).toBe("arunaki-local")
    expect(out.theme).toBe("dark")
    expect(fs.existsSync(path.join(dir, "settings.json.bak-9router"))).toBe(true)
  })

  it("codex: model_provider ditulis di ROOT + section lengkap", () => {
    const dir = path.join(home, ".codex"); fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "config.toml"), "# existing\nmodel = \"gpt-5\"\n")
    const r = injectCodexSettings(home, 20188)
    expect(r.success).toBe(true)
    const toml = fs.readFileSync(path.join(dir, "config.toml"), "utf8")
    expect(toml).toContain('model_provider = "arunaki"')              // ROOT — tanpa ini section diabaikan
    expect(toml).toContain('[model_providers.arunaki]')
    expect(toml).toContain('base_url = "http://127.0.0.1:20188/v1"')
    expect(toml).toContain('wire_api = "chat"')                       // bridge TIDAK punya /v1/responses
    expect(fs.existsSync(path.join(dir, "config.toml.bak-9router"))).toBe(true)
  })

  it("codex: reset hanya hapus kalau model_provider === arunaki", () => {
    const dir = path.join(home, ".codex"); fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "config.toml"), 'model_provider = "openai"\n[model_providers.arunaki]\nbase_url = "x"\n')
    resetCodexSettings(home)
    const toml = fs.readFileSync(path.join(dir, "config.toml"), "utf8")
    expect(toml).toContain('model_provider = "openai"')               // TIDAK dihapus
  })
})
```

- [ ] **Step 2: Implement `injector.ts`**

Aturan wajib:

- **Backup dulu** ke `<file>.bak-9router` (hanya bila belum ada) sebelum tulis apa pun — mengikuti konvensi 9Router.
- **Claude** (`~/.claude/settings.json`): parser toleran komentar & trailing comma (JSONC ringan, ±15 baris). **Parse gagal → `success:false`, file tidak disentuh.** Merge hanya `env.ANTHROPIC_BASE_URL = "http://127.0.0.1:<port>/v1"` dan `env.ANTHROPIC_AUTH_TOKEN = "arunaki-local"` (placeholder agar CLI tidak minta login; **bridge tidak memvalidasi key** — jangan kirim token harvest ke file user), pertahankan semua key lain. Reset: hapus dua key env itu saja.
- **Codex** (`~/.codex/config.toml`): tulis `[model_providers.arunaki]` berisi `base_url` + `wire_api = "chat"` **DAN** `model_provider = "arunaki"` di root (bila root sudah punya `model_provider`, timpa hanya kalau nilainya `arunaki` sebelumnya — untuk reset: hapus section + restore `model_provider` hanya bila saat ini `"arunaki"`, sesuai test di atas). Parser: regex baris (TOML penuh tidak perlu), tapi blok `[model_providers.arunaki]` harus dihapus utuh saat reset.
- Semua fungsi menerima `customHome` param agar bisa diuji (Jangan tulis ke `$HOME` asli di test).
- **Tidak ada** endpoint `/inject` yang mengeksekusi tanpa session — lihat Task 7.

- [ ] **Step 3: Test PASS + commit**

```bash
cd packages/engine/engine && bun test test/injector.test.ts
git add packages/engine/engine/src/server/local-cli/injector.ts packages/engine/engine/test/injector.test.ts
git commit -m "feat(cli): safe 1-click CLI config injector with backup and parse-fail abort"
```

---

### Task 7: HTTP API Handler & UI Badges

**Files:**
- Modify: `packages/engine/engine/src/server/routes/instance/httpapi/handlers/provider.ts`
- Modify: schema `LocalCli*Input` (file schema yang sama dengan `LocalCliStatus/Login/Connect`)
- Modify: `apps/web/src/components/settings/SettingsCliConnectionsTab.tsx`

- [ ] **Step 1: Tambah handler di group `providers` (mengikuti L644-647)**

Registrasi bersama `localCliStatus`/`localCliLogin`/`localCliConnect` agar otomatis memakai session auth & schema pipeline yang sudah ada:

- `localCliDiscovered` → `Effect.fn` yang memanggil `scanLocalCredentials()` (cache 60 detik) dan **mengembalikan hanya metadata**: `{ provider, displayName, type, sourcePath, accountEmail?, expiresAt, lastRefreshAt, hasToken: true }`. **Tanpa `accessToken`/`refreshToken` — token tidak pernah meninggalkan proses server.**
- `localCliRefresh` → `Effect.fn` memicu `refreshCredential()` manual (tombol "Refresh now"), return status baru.
- `localCliInject` → memanggil `injectClaudeSettings`/`injectCodexSettings`, return `InjectResult`.

Bila ternyata route `discovered` tidak tercakup auth group yang sama (cek pendaftaran route di `routes/instance/httpapi/`), **wajib** tambahkan auth sebelum lanjut.

- [ ] **Step 2: UI `SettingsCliConnectionsTab.tsx`**

- Badge hijau **"Auto-Imported · Ready"** bila `hasToken`, dengan countdown sisa masa berlaku (`expiresAt - now`, tampil "-{m}m"/"{h}h"; `undefined` → "expires unknown").
- Badge kuning **"Refresh failed"** bila `localCliRefresh` mengembalikan gagal.
- Tombol **"Auto-Configure CLI"** → `localCliInject`; hasil `success:false` tampilkan `message` (mis. "settings.json parse error — file unchanged") sebagai error state, bukan silent.
- Tombol **"Refresh now"** → `localCliRefresh`.
- **Rules of Hooks:** semua `useState`/`useEffect`/`useMemo` tetap di baris teratas komponen, sebelum early return (AGENTS.md STRICT Rule 1).
- **Badge status teknis memakai bahasa Inggris** (AGENTS.md STRICT Rule 3).

- [ ] **Step 3: Build & commit**

```bash
npm run build -w apps/web   # wajib 0 error
git add packages/engine/engine/src/server/routes/instance/httpapi/handlers/provider.ts apps/web/src/components/settings/SettingsCliConnectionsTab.tsx
git commit -m "feat(ui): auto-imported credential badges, refresh and 1-click CLI config"
```

---

### Task 8: Build Verification & End-to-End Test

**Files:**
- Test: unit + build + E2E manual.

- [ ] **Step 1: Seluruh test engine**

Run: `cd packages/engine/engine && bun test`
Expected: semua `harvester`, `refresh`, `upstream`, `translator`, `injector`, `fastpath` PASS, tanpa regresi test lama.

- [ ] **Step 2: Typecheck & web build**

Run: `npx tsc -b` (atau typecheck yang berlaku di repo) dan `npm run build -w apps/web`
Expected: 0 error.

- [ ] **Step 3: E2E wajib**

1. Token Claude ada di `~/.claude/.credentials.json` → kirim pesan non-stream ke bridge → respons 200 dari Anthropic, **tanpa** proses `claude -p` (cek log `[FastPath]`).
2. Request berisi `tools` + tool call → balasan berisi `tool_calls` dengan `id`/`name` valid → `finish_reason: "tool_calls"` → `usage` terisi.
3. Paksa token expired (ubah `expiresAt` di state) → `checkBeforeRequest` me-refresh → request tetap 200, `lastRefreshAt` berubah.
4. Hapus kredensial → fast-path return `false` **sebelum** `writeHead` → rantai lama (`claude -p` / daemon / forward 9Router) tetap menjawab.
5. Inject Claude & Codex → jalankan CLI masing-masing → terhubung ke `http://127.0.0.1:20188/v1` → reset mengembalikan file seperti semula (cek `.bak-9router`).
6. `GET localCliDiscovered` dari browser → tidak ada `accessToken`/`refreshToken` di response.

- [ ] **Step 4: Update WORKFLOW.md & dev-log**

Tandai item Phase 105 ✅ di `WORKFLOW.md`; buat `docs/dev-logs/dev-log-2026-10-06-local-cli-credential-harvester-9router-parity.md` (format sesuai AGENTS.md).

- [ ] **Step 5: Final commit & push** (hanya setelah `git status --porcelain` bersih)

```bash
git status --porcelain
git add -A && git commit -m "feat(cli): 9Router-parity credential harvest, refresh, and direct streaming"
git push origin main
```

---

## Deviations from 9Router (sengaja, dicatat)

1. **Bridge tidak diberi API key `sk-{machineId}-...`** — bridge hanya `127.0.0.1` dan dipakai CLI lokal; menambah validasi key berisiko memutus `agy`/`opencode` yang sudah jalan. Tambahkan bila bridge keluar dari localhost.
2. **Provider binary (kiro/cursor/antigravity) tidak difast-path** — sama seperti 9Router yang menaruhnya di executor terpisah; Arunaki meneruskan ke `localhost:20128`.
3. **400/404 tetap diizinkan fallback** (9Router: tidak) — format `claude -p` berbeda dari payload Anthropic, jadi fallback masih bisa menyelamatkan request.
4. **Harvest Claude dari file** (`~/.claude/.credentials.json`) menggantikan OAuth browser flow 9Router.
5. **Tidak ada combo / multi-akun / cooldown antar-akun / quota / usage tracking / RTK** — di luar scope permintaan.
