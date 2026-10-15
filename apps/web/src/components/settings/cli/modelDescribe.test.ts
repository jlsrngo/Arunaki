import { describe, it, expect } from "vitest";
import { describeModel } from "./modelDescribe";

describe("describeModel", () => {
  it("returns fallback when id is undefined or empty", () => {
    expect(describeModel(undefined)).toEqual({ label: "No models available" });
    expect(describeModel("")).toEqual({ label: "No models available" });
  });

  it("returns exact metadata override for known models", () => {
    expect(describeModel("claude-3-7-sonnet")).toEqual({
      label: "Claude 3.7 Sonnet",
      badge: "Hybrid Reasoning",
      speed: "Fast",
    });
    expect(describeModel("9router/ComboMaut")).toEqual({
      label: "ComboMaut",
      badge: "Smart Combo",
      speed: "Auto Fallback",
    });
  });

  it("parses parameterized and vendor-prefixed models dynamically", () => {
    const meta = describeModel("groq/llama-3-3-70b-versatile");
    expect(meta.label).toContain("Llama 3.3 70B");
    expect(meta.badge).toBe("Groq LPU");
  });
});
