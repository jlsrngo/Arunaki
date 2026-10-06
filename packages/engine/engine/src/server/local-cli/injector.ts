import fs from "fs"
import path from "path"
import os from "os"

export interface InjectResult {
  tool: "claude" | "codex" | "opencode"
  path: string
  success: boolean
  message: string
}

function parseJsonc(text: string): any {
  // Strip single-line comments and multi-line comments
  const clean = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^\\:])\/\/.*$/gm, "$1")
    .replace(/,(\s*[\]}])/g, "$1")
    .trim()
  return JSON.parse(clean)
}

function ensureBackup(filePath: string): void {
  const backupPath = `${filePath}.bak-9router`
  if (fs.existsSync(filePath) && !fs.existsSync(backupPath)) {
    try {
      fs.copyFileSync(filePath, backupPath)
    } catch {}
  }
}

export function injectClaudeSettings(customHome?: string, bridgePort = 20188): InjectResult {
  const home = customHome || os.homedir()
  const dir = path.join(home, ".claude")
  const settingsPath = path.join(dir, "settings.json")

  try {
    fs.mkdirSync(dir, { recursive: true })
    let current: any = {}

    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, "utf8")
      try {
        current = parseJsonc(raw)
      } catch (err: any) {
        return {
          tool: "claude",
          path: settingsPath,
          success: false,
          message: `settings.json parse error — file unchanged: ${err.message}`,
        }
      }
      ensureBackup(settingsPath)
    }

    current.env = current.env || {}
    current.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${bridgePort}/v1`
    current.env.ANTHROPIC_AUTH_TOKEN = "arunaki-local"
    current.hasCompletedOnboarding = true

    fs.writeFileSync(settingsPath, JSON.stringify(current, null, 2), "utf8")
    return {
      tool: "claude",
      path: settingsPath,
      success: true,
      message: `Updated ANTHROPIC_BASE_URL in ~/.claude/settings.json`,
    }
  } catch (err: any) {
    return {
      tool: "claude",
      path: settingsPath,
      success: false,
      message: err.message,
    }
  }
}

export function resetClaudeSettings(customHome?: string): InjectResult {
  const home = customHome || os.homedir()
  const settingsPath = path.join(home, ".claude", "settings.json")

  if (!fs.existsSync(settingsPath)) {
    return { tool: "claude", path: settingsPath, success: true, message: "No settings file found" }
  }

  try {
    const raw = fs.readFileSync(settingsPath, "utf8")
    const current = parseJsonc(raw)
    if (current.env) {
      delete current.env.ANTHROPIC_BASE_URL
      delete current.env.ANTHROPIC_AUTH_TOKEN
    }
    fs.writeFileSync(settingsPath, JSON.stringify(current, null, 2), "utf8")
    return { tool: "claude", path: settingsPath, success: true, message: "Reset Claude settings" }
  } catch (err: any) {
    return { tool: "claude", path: settingsPath, success: false, message: err.message }
  }
}

export function injectCodexSettings(customHome?: string, bridgePort = 20188): InjectResult {
  const home = customHome || os.homedir()
  const dir = path.join(home, ".codex")
  const configPath = path.join(dir, "config.toml")

  try {
    fs.mkdirSync(dir, { recursive: true })
    ensureBackup(configPath)

    let content = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : ""

    // Strip previous arunaki section if present
    content = content.replace(/\[model_providers\.arunaki\][\s\S]*?(?=\n\[|$)/g, "").trim()

    // Ensure model_provider = "arunaki" at root
    if (/^model_provider\s*=\s*.*$/m.test(content)) {
      content = content.replace(/^model_provider\s*=\s*.*$/m, 'model_provider = "arunaki"')
    } else {
      content = `model_provider = "arunaki"\n\n${content}`.trim()
    }

    const section = `\n\n[model_providers.arunaki]\nbase_url = "http://127.0.0.1:${bridgePort}/v1"\nwire_api = "chat"\n`
    content = `${content}${section}`

    fs.writeFileSync(configPath, content, "utf8")
    return {
      tool: "codex",
      path: configPath,
      success: true,
      message: `Configured model_providers.arunaki in ~/.codex/config.toml`,
    }
  } catch (err: any) {
    return {
      tool: "codex",
      path: configPath,
      success: false,
      message: err.message,
    }
  }
}

export function resetCodexSettings(customHome?: string): InjectResult {
  const home = customHome || os.homedir()
  const configPath = path.join(home, ".codex", "config.toml")

  if (!fs.existsSync(configPath)) {
    return { tool: "codex", path: configPath, success: true, message: "No config file found" }
  }

  try {
    let content = fs.readFileSync(configPath, "utf8")

    // Remove section
    content = content.replace(/\[model_providers\.arunaki\][\s\S]*?(?=\n\[|$)/g, "").trim()

    // Only remove model_provider if it is set to "arunaki"
    if (/^model_provider\s*=\s*"arunaki"/m.test(content)) {
      content = content.replace(/^model_provider\s*=\s*"arunaki"\r?\n?/m, "").trim()
    }

    fs.writeFileSync(configPath, content ? `${content}\n` : "", "utf8")
    return { tool: "codex", path: configPath, success: true, message: "Reset Codex config" }
  } catch (err: any) {
    return { tool: "codex", path: configPath, success: false, message: err.message }
  }
}
