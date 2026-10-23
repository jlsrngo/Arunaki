import { execFileSync } from "child_process"
import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"

export type RustDocCommand = "excel" | "word" | "ppt" | "pdf"

/**
 * Checks whether the Rust document tools feature flag is enabled.
 * Default is OFF so that existing TypeScript behavior remains 100% unchanged
 * unless explicitly opted in via `ARUNAKI_RUST_TOOLS=1` or `ARUNAKI_RUST_TOOLS=true`.
 */
export function isRustToolsEnabled(): boolean {
  const val = (process.env.ARUNAKI_RUST_TOOLS ?? "").trim().toLowerCase()
  return val === "1" || val === "true"
}

/**
 * Locates the compiled `arunaki-docs` binary across workspace target directories
 * or packaged resources. Returns null if not built or not found.
 */
export function findRustDocsBinary(): string | null {
  if (process.env.ARUNAKI_RUST_DOCS_BIN) {
    return fs.existsSync(process.env.ARUNAKI_RUST_DOCS_BIN) ? process.env.ARUNAKI_RUST_DOCS_BIN : null
  }

  const exeName = process.platform === "win32" ? "arunaki-docs.exe" : "arunaki-docs"
  const here = path.dirname(fileURLToPath(import.meta.url))
  const repoRoot = path.resolve(here, "..", "..", "..")

  const candidates = [
    path.join(repoRoot, "target", "release", exeName),
    path.join(repoRoot, "target", "debug", exeName),
    path.join(process.cwd(), "target", "release", exeName),
    path.join(process.cwd(), "target", "debug", exeName),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

/**
 * Attempts to run the native Rust `arunaki-docs` sidecar if `ARUNAKI_RUST_TOOLS=1` is set.
 * Returns the parsed JSON object on success, or `null` if disabled, missing binary, or on any error
 * so that the caller seamlessly falls back to the TypeScript implementation.
 */
export function tryRunRustDocMap<T>(cmd: RustDocCommand, filePath: string, extraArgs: string[] = []): T | null {
  if (!isRustToolsEnabled()) {
    return null
  }

  // Only route .xlsx/.csv to Rust excel parser (.xls stays on SheetJS fallback)
  if (cmd === "excel" && !filePath.toLowerCase().endsWith(".xlsx") && !filePath.toLowerCase().endsWith(".csv")) {
    return null
  }

  const bin = findRustDocsBinary()
  if (!bin) {
    return null
  }

  try {
    const stdout = execFileSync(bin, [cmd, filePath, ...extraArgs], {
      encoding: "utf8",
      timeout: 15000,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    })
    return JSON.parse(stdout.trim()) as T
  } catch {
    return null
  }
}
