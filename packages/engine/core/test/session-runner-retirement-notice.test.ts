import { describe, expect, it } from "bun:test"
import { isProviderRetirementNotice } from "@arunaki/core/session/runner/publish-llm-event"

// This runs on every reply from every provider, so the interesting half is what must NOT match.
// A model answering "is Claude Opus still supported?" is talking about retirement, not retired.
const alone = { hadToolCall: false, hadReasoning: false, textBlocks: 1 } as const

describe("isProviderRetirementNotice", () => {
  it("catches the notice a retired model actually replies with", () => {
    expect(
      isProviderRetirementNotice(
        "Gemini 3.5 Flash is no longer available. Please switch to Gemini 3.7 Flash in the latest version of Antigravity.",
        alone,
      ),
    ).toBe(true)
  })

  it("catches the other ways vendors word it", () => {
    expect(isProviderRetirementNotice("gpt-5.6-terra has been retired.", alone)).toBe(true)
    expect(isProviderRetirementNotice("The model is deprecated.", alone)).toBe(true)
    expect(isProviderRetirementNotice("claude-opus-4-5 is no longer supported.", alone)).toBe(true)
  })

  it("leaves an ordinary answer alone", () => {
    expect(isProviderRetirementNotice("391", alone)).toBe(false)
    expect(
      isProviderRetirementNotice(
        "Is Claude Opus 5 still supported? Yes, it is the current flagship and takes requests all day.",
        alone,
      ),
    ).toBe(false)
  })

  it("does not fire on a reply that only mentions it in passing", () => {
    // The single most likely way to get this wrong: the model is asked about the notice itself.
    expect(
      isProviderRetirementNotice(
        "That error means Gemini 3.5 Flash is no longer available, so pick Gemini 3.7 Flash instead.",
        alone,
      ),
    ).toBe(false)
  })

  it("does not fire when the turn did anything else", () => {
    const notice = "Gemini 3.5 Flash is no longer available. Please switch to Gemini 3.7 Flash."
    expect(isProviderRetirementNotice(notice, { ...alone, hadToolCall: true })).toBe(false)
    expect(isProviderRetirementNotice(notice, { ...alone, hadReasoning: true })).toBe(false)
    expect(isProviderRetirementNotice(notice, { ...alone, textBlocks: 2 })).toBe(false)
  })

  it("does not fire on a real multi-sentence reply that opens with the phrase", () => {
    expect(
      isProviderRetirementNotice(
        "Gemini 3.5 Flash is no longer available. That message means the provider retired the model. You should switch to Gemini 3.7 Flash, which is the current tier in your account.",
        alone,
      ),
    ).toBe(false)
  })

  it("known limit: a single long run-on sentence that opens with the phrase still matches", () => {
    // Recorded rather than hidden. Nothing in the payload distinguishes this from the notice, and
    // the sentence count cannot either, so it is a false positive that would turn a real reply into
    // an error. The assertion is what it actually does, not what we wish it did - so a future
    // change that fixes this shows up as this test failing.
    expect(
      isProviderRetirementNotice(
        "Gemini 3.5 Flash is no longer available, and here is a long answer about what that means for your workflow, with several sentences and a fair amount of detail after the opening line.",
        alone,
      ),
    ).toBe(true)
  })

  it("does not fire on empty text", () => {
    expect(isProviderRetirementNotice("", alone)).toBe(false)
    expect(isProviderRetirementNotice("   \n  ", alone)).toBe(false)
  })
})