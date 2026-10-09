import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * Kiro's card said quota "none" while CodeWhisperer's GetUsageLimits was returning a full report:
 * plan KIRO FREE, 0.72 of 50 credits used, resetting on the 1st. Three things had to agree for the
 * row to appear, and all three had to be true at once.
 */
const quota = readFileSync(path.resolve(import.meta.dir, "../src/server/local-cli/quota.ts"), "utf8")
const registry = readFileSync(path.resolve(import.meta.dir, "../src/server/local-cli/registry.ts"), "utf8")
const tab = readFileSync(
  path.resolve(import.meta.dir, "../../../../apps/web/src/components/settings/SettingsCliConnectionsTab.tsx"),
  "utf8",
)

describe("Kiro quota is wired end to end", () => {
  test("the fetcher calls GetUsageLimits the way AWS requires", () => {
    // json-1.0 plus x-amz-target. Sending the REST content type is answered with a 400, so this
    // pair is load-bearing rather than decoration.
    expect(quota).toContain("x-amz-target")
    expect(quota).toContain("AmazonCodeWhispererService.GetUsageLimits")
    expect(quota).toContain('"Content-Type": "application/x-amz-json-1.0"')
    expect(quota).toContain("getUsageLimits")
  })

  test("the fetcher is included in the batch the UI calls", () => {
    expect(quota).toMatch(/fetchAllQuotas[\s\S]{0,160}fetchKiroQuota/)
  })

  test("the registry declares kiro as having a quota", () => {
    expect(registry).toContain('"antigravity" | "claude" | "codex" | "kiro" | "none"')
    const kiro = registry.slice(registry.indexOf('id: "kiro"'), registry.indexOf('id: "kiro"') + 400)
    expect(kiro).toContain('quota: "kiro"')
  })

  test("the settings card can render a kiro quota", () => {
    // renderQuota took a literal union, so a kiro row would have been a type error at best and a
    // silently absent row at worst.
    expect(tab).toContain('"antigravity" | "claude" | "codex" | "kiro"')
  })

  test("the plan name is carried through, since it is what says Kiro is free", () => {
    expect(quota).toContain("subscriptionTitle")
  })
})