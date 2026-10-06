import { describe, it, expect } from "bun:test"
import fs from "fs"
import path from "path"
import os from "os"
import {
  readCodexCredential,
  readKiroCredential,
  readClaudeCredential,
  readCursorCredential,
} from "../src/server/local-cli/harvester"

function makeTestDir(name: string): string {
  const dir = path.join(os.tmpdir(), `arunaki-harvester-${name}-${Date.now()}-${Math.floor(Math.random() * 1000)}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

describe("Credential Harvester", () => {
  it("codex: shape asli ~/.codex/auth.json {tokens:{...}} + id_token", () => {
    const tmp = makeTestDir("codex-oauth")
    const dir = path.join(tmp, ".codex")
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
    const c = readCodexCredential(tmp)
    expect(c?.provider).toBe("codex")
    expect(c?.accessToken).toBe("sk-proj-abc")
    expect(c?.accountId).toBe("acct-9")
    expect(c?.accountEmail).toBe("dev@x.com")
  })

  it("codex: OPENAI_API_KEY mode tanpa tokens", () => {
    const tmp = makeTestDir("codex-key")
    const dir = path.join(tmp, ".codex")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "auth.json"), JSON.stringify({ OPENAI_API_KEY: "sk-proj-keyonly" }))
    const c = readCodexCredential(tmp)
    expect(c?.type).toBe("api_key")
    expect(c?.accessToken).toBe("sk-proj-keyonly")
  })

  it("claude: ~/.claude/.credentials.json claudeAiOauth", () => {
    const tmp = makeTestDir("claude-oauth")
    const dir = path.join(tmp, ".claude")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, ".credentials.json"),
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "sk-ant-oat01-x",
          refreshToken: "rt-cl",
          expiresAt: Date.now() + 8.64e7,
          scopes: ["user:inference"],
        },
      }),
    )
    const c = readClaudeCredential(tmp)
    expect(c?.type).toBe("oauth")
    expect(c?.accessToken).toBe("sk-ant-oat01-x")
    expect(c?.refreshToken).toBe("rt-cl")
  })

  it("claude: fallback settings.json env ANTHROPIC_API_KEY", () => {
    const tmp = makeTestDir("claude-env")
    const dir = path.join(tmp, ".claude")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ env: { ANTHROPIC_API_KEY: "sk-ant-api03-z" } }))
    const c = readClaudeCredential(tmp)
    expect(c?.type).toBe("api_key")
    expect(c?.accessToken).toBe("sk-ant-api03-z")
  })

  it("kiro: cache aorAAAAAG + client credentials dari clientIdHash.json", () => {
    const tmp = makeTestDir("kiro")
    const dir = path.join(tmp, ".aws", "sso", "cache")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, "abc123.json"),
      JSON.stringify({ accessToken: "kiro-at", refreshToken: "aorAAAAAGrt", expiresAt: new Date(Date.now() + 3.6e6).toISOString(), region: "us-east-1" }),
    )
    fs.writeFileSync(
      path.join(dir, "client-oidc.json"),
      JSON.stringify({ clientId: "cid", clientSecret: "csec", region: "us-east-1", profileArn: "arn:aws:codewhisperer:us-east-1::profile/p" }),
    )
    const c = readKiroCredential(tmp)
    expect(c?.refreshToken?.startsWith("aorAAAAAG")).toBe(true)
    expect(c?.clientId).toBe("cid")
    expect(c?.clientSecret).toBe("csec")
  })

  it("cursor: baca ItemTable via bun:sqlite read-only", () => {
    const tmp = makeTestDir("cursor")
    const { Database } = require("bun:sqlite")
    const p = path.join(tmp, "state.vscdb")
    const db = new Database(p)
    db.exec("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB)")
    db.run("INSERT INTO ItemTable VALUES (?, ?)", ["cursorAuth/accessToken", "cur-at"])
    db.run("INSERT INTO ItemTable VALUES (?, ?)", ["cursorAuth/refreshToken", "cur-rt"])
    db.close()
    const c = readCursorCredential(tmp)
    expect(c?.accessToken).toBe("cur-at")
    expect(c?.refreshToken).toBe("cur-rt")
  })
})
