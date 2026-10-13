import { describe, it, expect } from "vitest";
import { normalizeAttachmentName, isImageFile } from "./attachmentUtils";

describe("attachmentUtils", () => {
  // The names carry a Date.now() stamp (added in e790e64d, after this test was written), so the
  // assertion has to be on the contract - unique, sequential, correctly offset - not a literal.
  it("generates unique sequential names for generic clipboard image.png files", () => {
    const names = [0, 1, 2, 3].map((i) => normalizeAttachmentName("image.png", i, 4, 0));

    expect(new Set(names).size).toBe(4);
    expect(names[0]).toMatch(/^image_\d+_1\.png$/);
    expect(names[1]).toMatch(/^image_\d+_2\.png$/);
    expect(names[2]).toMatch(/^image_\d+_3\.png$/);
    expect(names[3]).toMatch(/^image_\d+_4\.png$/);
  });

  it("handles offset when files are already attached", () => {
    expect(normalizeAttachmentName("image.png", 0, 1, 2)).toMatch(/^image_\d+_3\.png$/);
  });

  it("omits the sequence for a lone paste with nothing attached", () => {
    expect(normalizeAttachmentName("image.png", 0, 1, 0)).toMatch(/^image_\d+\.png$/);
  });

  it("preserves descriptive filenames for non-generic files", () => {
    const name = normalizeAttachmentName("financial_report_september.xlsx", 0, 1, 0);
    expect(name).toBe("financial_report_september.xlsx");
  });

  it("correctly identifies image extensions and mime types", () => {
    expect(isImageFile("photo.png", "image/png")).toBe(true);
    expect(isImageFile("photo.jpg", "")).toBe(true);
    expect(isImageFile("doc.pdf", "application/pdf")).toBe(false);
  });
});
