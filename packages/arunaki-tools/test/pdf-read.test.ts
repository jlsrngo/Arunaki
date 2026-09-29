import { describe, expect, it } from "bun:test";
import { buildPdfMap } from "../src/pdf-read";

describe("pdf-read", () => {
  it("exports buildPdfMap function", () => {
    expect(typeof buildPdfMap).toBe("function");
  });

  it("handles non-existent PDF file gracefully", async () => {
    await expect(buildPdfMap("non_existent_file.pdf")).rejects.toThrow();
  });
});
