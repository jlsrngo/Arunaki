import { describe, it, expect } from "vitest";
import { toLLMMessages } from "../src/session/runner/to-llm-message";

describe("toLLMMessages attachment handling", () => {
  it("converts image attachments to media parts with exact mime and data", () => {
    const msg = {
      id: "msg_test_1",
      sessionID: "ses_test",
      type: "user" as const,
      text: "check these images",
      files: [
        { name: "image_1.png", mime: "image/png", uri: "data:image/png;base64,AAA" },
        { name: "image_2.png", mime: "image/png", uri: "data:image/png;base64,BBB" },
      ],
      time: Date.now(),
    };

    const result = toLLMMessages([msg], { id: "test-model", provider: "test" });
    expect(result[0].content).toHaveLength(3);
    expect(result[0].content[0]).toEqual({ type: "text", text: "check these images" });
    expect(result[0].content[1]).toMatchObject({
      type: "media",
      mediaType: "image/png",
      data: "data:image/png;base64,AAA",
      filename: "image_1.png",
    });
    expect(result[0].content[2]).toMatchObject({
      type: "media",
      mediaType: "image/png",
      data: "data:image/png;base64,BBB",
      filename: "image_2.png",
    });
  });

  it("provides pdf_read hint for attached PDF documents instead of generic read", () => {
    const msg = {
      id: "msg_test_2",
      sessionID: "ses_test",
      type: "user" as const,
      text: "read this pdf",
      files: [
        { name: "document.pdf", mime: "application/pdf", uri: "data:application/pdf;base64,CCC" },
      ],
      time: Date.now(),
    };

    const result = toLLMMessages([msg], { id: "test-model", provider: "test" });
    const hintPart = (result[0].content as any[])[1];
    expect(hintPart.type).toBe("text");
    expect(hintPart.text).toContain("pdf_read");
    expect(hintPart.text).not.toContain("Use the 'read' tool");
  });
});
