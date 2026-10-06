import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import fs from "fs"
import path from "path"
import os from "os"
import {
  injectClaudeSettings,
  injectCodexSettings,
  resetClaudeSettings,
  resetCodexSettings,
} from "../src/server/local-cli/injector"

describe("CLI injector", () => {
  const home = path.join(os.tmpdir(), `arunaki-inject-${Date.now()}`)
  beforeEach(() => {
    fs.mkdirSync(home, { recursive: true })
  })
  afterEach(() => {
    try {
      fs.rmSync(home, { recursive: true, force: true })
    } catch {}
  })

  it("claude: JSON rusak → GAGAL, file TIDAK ditimpa", () => {
    const dir = path.join(home, ".claude")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "settings.json"), "{ this is not json")
    const r = injectClaudeSettings(home, 20188)
    expect(r.success).toBe(false)
    expect(fs.readFileSync(path.join(dir, "settings.json"), "utf8")).toBe("{ this is not json")
  })

  it("claude: merge env + backup dibuat", () => {
    const dir = path.join(home, ".claude")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, "settings.json"),
      JSON.stringify({ env: { MY_VAR: "1" }, theme: "dark" }),
    )
    const r = injectClaudeSettings(home, 20188)
    expect(r.success).toBe(true)
    const out = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8"))
    expect(out.env.MY_VAR).toBe("1")
    expect(out.env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:20188/v1")
    expect(out.env.ANTHROPIC_AUTH_TOKEN).toBe("arunaki-local")
    expect(out.theme).toBe("dark")
    expect(fs.existsSync(path.join(dir, "settings.json.bak-9router"))).toBe(true)
  })

  it("codex: model_provider ditulis di ROOT + section lengkap", () => {
    const dir = path.join(home, ".codex")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "config.toml"), '# existing\nmodel = "gpt-5"\n')
    const r = injectCodexSettings(home, 20188)
    expect(r.success).toBe(true)
    const toml = fs.readFileSync(path.join(dir, "config.toml"), "utf8")
    expect(toml).toContain('model_provider = "arunaki"')
    expect(toml).toContain("[model_providers.arunaki]")
    expect(toml).toContain('base_url = "http://127.0.0.1:20188/v1"')
    expect(toml).toContain('wire_api = "chat"')
    expect(fs.existsSync(path.join(dir, "config.toml.bak-9router"))).toBe(true)
  })

  it("codex: reset hanya hapus kalau model_provider === arunaki", () => {
    const dir = path.join(home, ".codex")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, "config.toml"),
      'model_provider = "openai"\n[model_providers.arunaki]\nbase_url = "x"\n',
    )
    resetCodexSettings(home)
    const toml = fs.readFileSync(path.join(dir, "config.toml"), "utf8")
    expect(toml).toContain('model_provider = "openai"')
  })
})
