import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * The Kiro card sat on "Refreshing..." forever. The UI clears its spinner in a finally, which only
 * runs once the request resolves, and four of the five vendor token endpoints had no deadline -
 * so a hung refresh left the card spinning indefinitely and the token row looked absent.
 *
 * The Google one already had a timeout, which is why this read as provider specific when it was
 * simply unguarded.
 */
const refresh = readFileSync(
  path.resolve(import.meta.dir, "../src/server/local-cli/refresh.ts"),
  "utf8",
)

describe("every vendor token refresh is bounded", () => {
  test("each fetch to a vendor token endpoint carries a timeout", () => {
    const lines = refresh.split("\n")
    const starts: number[] = []
    lines.forEach((l, i) => {
      if (l.includes("await fetch(")) starts.push(i)
    })
    expect(starts.length).toBeGreaterThanOrEqual(4)
    // A fetch call spans several lines and its argument object closes on a line of its own, so
    // scan forward to that rather than trying to match braces with a regex.
    for (const start of starts) {
      const call = lines.slice(start, start + 14).join("\n")
      const end = call.indexOf("\n  })")
      const scoped = end === -1 ? call : call.slice(0, end)
      expect(scoped).toContain("signal: AbortSignal.timeout(")
    }
  })

  test("the deadline is a named constant rather than a magic number per call", () => {
    expect(refresh).toContain("const REFRESH_TIMEOUT_MS")
    expect(refresh.match(/AbortSignal\.timeout\(15000\)/g) ?? []).toHaveLength(0)
  })
})