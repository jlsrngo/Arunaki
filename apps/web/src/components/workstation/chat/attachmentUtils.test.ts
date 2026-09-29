import { describe, it, expect } from "vitest";
import { normalizeAttachmentName, isImageFile } from "./attachmentUtils";

describe("attachmentUtils", () => {
  it("generates unique sequential names for generic clipboard image.png files", () => {
    const name1 = normalizeAttachmentName("image.png", 0, 4, 0);
    const name2 = normalizeAttachmentName("image.png", 1, 4, 0);
    const name3 = normalizeAttachmentName("image.png", 2, 4, 0);
    const name4 = normalizeAttachmentName("image.png", 3, 4, 0);

    expect(name1).toBe("image_1.png");
    expect(name2).toBe("image_2.png");
    expect(name3).toBe("image_3.png");
    expect(name4).toBe("image_4.png");
  });

  it("handles offset when files are already attached", () => {
    const name = normalizeAttachmentName("image.png", 0, 1, 2);
    expect(name).toBe("image_3.png");
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
