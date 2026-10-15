import { describe, it, expect } from "vitest";
import { isFreeModel, getModelFamily } from "./providerModelUtils";

describe("providerModelUtils", () => {
  describe("isFreeModel", () => {
    it("detects models containing free", () => {
      expect(isFreeModel("gpt-4o-mini-free")).toBe(true);
      expect(isFreeModel("meta/llama-3.1-8b-instruct:free")).toBe(true);
      expect(isFreeModel("claude-3-7-sonnet")).toBe(false);
    });
  });

  describe("getModelFamily", () => {
    it("identifies major AI model families accurately", () => {
      expect(getModelFamily("claude-3-5-sonnet-20241022")).toBe("Claude");
      expect(getModelFamily("deepseek/deepseek-r1")).toBe("DeepSeek");
      expect(getModelFamily("google/gemini-2.0-flash")).toBe("Gemini");
      expect(getModelFamily("openai/gpt-4o")).toBe("GPT");
      expect(getModelFamily("qwen/qwen-2.5-coder-32b")).toBe("Qwen");
      expect(getModelFamily("meta-llama/llama-3.3-70b-instruct")).toBe("Llama");
      expect(getModelFamily("custom-unknown-model")).toBe("Other");
    });
  });
});
