/**
 * Tracks native document tool attempts and failures per session to enforce:
 * "Prioritize Native First, Allow Python Freely as Fallback".
 * Uses globalThis with Symbol.for to ensure singleton state across monorepo packages and runtimes.
 */

const GLOBAL_ATTEMPTS = Symbol.for("arunaki.nativeDocAttempts")
const GLOBAL_FAILURES = Symbol.for("arunaki.nativeDocFailures")

const g = globalThis as unknown as {
  [GLOBAL_ATTEMPTS]?: Set<string>
  [GLOBAL_FAILURES]?: Set<string>
}

export const nativeDocAttempts = (g[GLOBAL_ATTEMPTS] ??= new Set<string>())
export const nativeDocFailures = (g[GLOBAL_FAILURES] ??= new Set<string>())

export function recordNativeAttempt(sessionID?: string, filePath?: string): void {
  if (sessionID) nativeDocAttempts.add(sessionID)
  if (sessionID && filePath) {
    nativeDocAttempts.add(`${sessionID}:${filePath.toLowerCase().replace(/\\/g, "/")}`)
  }
}

export function recordNativeFailure(sessionID?: string, filePath?: string): void {
  if (sessionID) nativeDocFailures.add(sessionID)
  if (sessionID && filePath) {
    nativeDocFailures.add(`${sessionID}:${filePath.toLowerCase().replace(/\\/g, "/")}`)
  }
}

export function hasAttemptedNative(sessionID?: string, filePath?: string): boolean {
  if (!sessionID) return false
  if (nativeDocAttempts.has(sessionID)) return true
  if (filePath && nativeDocAttempts.has(`${sessionID}:${filePath.toLowerCase().replace(/\\/g, "/")}`)) {
    return true
  }
  return false
}

export function hasFailedNative(sessionID?: string, filePath?: string): boolean {
  if (!sessionID) return false
  if (nativeDocFailures.has(sessionID)) return true
  if (filePath && nativeDocFailures.has(`${sessionID}:${filePath.toLowerCase().replace(/\\/g, "/")}`)) {
    return true
  }
  return false
}
