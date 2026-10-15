import { describe, it, expect } from "vitest";
import { formatFileSize, effortEffortLabel } from "./types";

describe("chat input types & helpers", () => {
  describe("formatFileSize", () => {
    it("returns empty string for zero or negative or undefined values", () => {
      expect(formatFileSize()).toBe("");
      expect(formatFileSize(0)).toBe("");
      expect(formatFileSize(-10)).toBe("");
    });

    it("formats small byte sizes correctly", () => {
      expect(formatFileSize(512)).toBe("512 B");
      expect(formatFileSize(1023)).toBe("1023 B");
    });

    it("formats kilobyte sizes with 1 decimal", () => {
      expect(formatFileSize(1024)).toBe("1.0 KB");
      expect(formatFileSize(2048)).toBe("2.0 KB");
      expect(formatFileSize(1536)).toBe("1.5 KB");
    });

    it("formats megabyte sizes with 1 decimal", () => {
      expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
      expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
      expect(formatFileSize(2.5 * 1024 * 1024)).toBe("2.5 MB");
    });
  });

  describe("effortEffortLabel", () => {
    it("maps known effort levels to capitalized labels", () => {
      expect(effortEffortLabel("low")).toBe("Low");
      expect(effortEffortLabel("medium")).toBe("Medium");
      expect(effortEffortLabel("high")).toBe("High");
      expect(effortEffortLabel("tiered")).toBe("Tiered");
    });

    it("capitalizes unknown effort options gracefully", () => {
      expect(effortEffortLabel("maximum")).toBe("Maximum");
      expect(effortEffortLabel("minimal")).toBe("Minimal");
    });
  });
});
