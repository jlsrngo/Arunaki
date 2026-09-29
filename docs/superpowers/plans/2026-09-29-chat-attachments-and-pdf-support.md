# Chat Attachments Isolation, Multi-Image Deduplication, and Native PDF Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent chat attachments from polluting the user's workspace folder, ensure multiple pasted images get unique names and reach multimodal vision without overwriting, and provide a fast native `pdf_read` tool so the agent never gets trapped in terminal pip-install/OCR loops.

**Architecture:**
1. **Frontend Isolation & Deduplication:** Move chat attachments from workspace root writes to ephemeral in-memory Base64 data URLs / `.arunaki/attachments/` cache, automatically assigning unique sequential names (`image_1.png`, `image_2.png`, etc.) when pasting from clipboard.
2. **Engine Multimodal Vision Routing:** Pass all attached images directly to LLM context as `media` parts so Vision models immediately perceive every image without disk reads; update prompt instructions to inspect visual parts directly.
3. **Native PDF Tooling:** Implement `pdf_read` in `@arunaki/tools` and register it in engine core using `pdf-parse`, instantly extracting text and page counts (<50ms) and detecting scanned image PDFs automatically.

**Tech Stack:** React 19, TypeScript, Effect-TS, `@arunaki/tools`, `pdf-parse`, Vite, Vitest.

## Global Constraints
- Strictly adhere to React Rules of Hooks (all hooks at the very top, zero hooks under conditionals).
- Agent only accesses the active project folder; do not pollute workspace root with chat upload artifacts.
- Keep prompts and codebase clean English.
- Avoid introducing unapproved dependencies (`pdf-parse` is already present in `node_modules`).
- Run `npm run build -w apps/web` before declaring any task complete.

---

### Task 1: Multi-Image Deduplication & Unique Naming in ChatInputBox

**Files:**
- Create: `apps/web/src/components/workstation/chat/attachmentUtils.ts`
- Modify: `apps/web/src/components/workstation/chat/ChatInputBox.tsx:315-356`
- Test: `apps/web/src/components/workstation/chat/attachmentUtils.test.ts`

**Interfaces:**
- Consumes: `File[]` from file input or paste event
- Produces: `normalizeAttachmentName(rawName: string, batchIndex: number, totalInBatch: number, existingCount: number): string`

- [ ] **Step 1: Write the failing unit test**

Create `apps/web/src/components/workstation/chat/attachmentUtils.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/components/workstation/chat/attachmentUtils.test.ts`  
Expected: FAIL ("Cannot find module './attachmentUtils'")

- [ ] **Step 3: Implement `attachmentUtils.ts`**

Create `apps/web/src/components/workstation/chat/attachmentUtils.ts`:
```ts
export function isImageFile(fileName: string, mimeType?: string): boolean {
  if (mimeType && mimeType.startsWith("image/")) return true;
  return /\.(png|jpg|jpeg|webp|gif|svg|bmp)$/i.test(fileName);
}

export function normalizeAttachmentName(
  rawName: string,
  batchIndex: number,
  totalInBatch: number,
  existingCount: number = 0
): string {
  const isGenericImage = /^image(\s*\(\d+\))?\.png$/i.test(rawName.trim());
  if (isGenericImage && (totalInBatch > 1 || existingCount > 0)) {
    const fileNumber = existingCount + batchIndex + 1;
    return `image_${fileNumber}.png`;
  }
  return rawName;
}
```

- [ ] **Step 4: Update `ChatInputBox.tsx` to use `normalizeAttachmentName` and remove root auto-save**

In `apps/web/src/components/workstation/chat/ChatInputBox.tsx`:
Import `normalizeAttachmentName` and `isImageFile`.
Update `handleAddFiles`:
```tsx
  const handleAddFiles = async (filesToAdd: File[]) => {
    const currentCount = attachedFiles.length;
    for (let i = 0; i < filesToAdd.length; i++) {
      const file = filesToAdd[i];
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const resolvedName = normalizeAttachmentName(file.name, i, filesToAdd.length, currentCount);
        const isImg = isImageFile(resolvedName, file.type);
        const localPreviewUrl = isImg ? URL.createObjectURL(file) : "";
        const timestamp = Date.now();
        const fileId = `${resolvedName}-${timestamp}-${Math.random()}`;

        setAttachedFiles((prev) => [
          ...prev,
          {
            id: fileId,
            name: resolvedName,
            url: localPreviewUrl,
            dataUrl,
            mime: file.type || (isImg ? "image/png" : "application/octet-stream"),
            size: file.size,
            isImage: isImg,
          },
        ]);

        // CRITICAL: DO NOT save chat attachments to the root workspace folder!
        // Chat attachments are ephemeral context parts passed in sendPrompt.
        // For non-image files requiring disk access (xlsx/pdf), save to hidden .arunaki/attachments/
        const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
        if (!isImg && desktop?.writeFile) {
          const internalAttachmentPath = `.arunaki/attachments/${resolvedName}`;
          desktop.writeFile(internalAttachmentPath, dataUrl).catch((e: any) => {
            console.warn("[ChatInputBox] Could not cache non-image attachment internally:", e);
          });
        }
      } catch (err) {
        console.warn("[ChatInputBox] Failed to read file:", err);
        toast.error(`Failed to read file ${file.name}`);
      }
    }
  };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run apps/web/src/components/workstation/chat/attachmentUtils.test.ts`  
Expected: PASS

- [ ] **Step 6: Verify build**

Run: `npm run build -w apps/web`  
Expected: Build passes with 0 errors.

---

### Task 2: Multimodal Vision & Attachment Guidance in Engine Core

**Files:**
- Modify: `packages/engine/core/src/session/runner/to-llm-message.ts:13-53`
- Modify: `packages/engine/engine/src/session/prompt/default.txt:20-35`
- Modify: `packages/engine/engine/src/session/system.ts:130-145`
- Test: `packages/engine/core/test/attachment-hints.test.ts`

**Interfaces:**
- Consumes: `FileAttachment` with `.name`, `.mime`, `.uri`
- Produces: LLM `ContentPart` (media part for images, descriptive hint for office/pdf docs)

- [ ] **Step 1: Write test for attachment hints in `to-llm-message.ts`**

Create `packages/engine/core/test/attachment-hints.test.ts`:
```ts
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
    expect(result[0].content[1]).toMatchObject({ type: "media", mediaType: "image/png", data: "data:image/png;base64,AAA", filename: "image_1.png" });
    expect(result[0].content[2]).toMatchObject({ type: "media", mediaType: "image/png", data: "data:image/png;base64,BBB", filename: "image_2.png" });
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
    const hintPart = result[0].content[1];
    expect(hintPart.type).toBe("text");
    expect((hintPart as any).text).toContain("pdf_read");
    expect((hintPart as any).text).not.toContain("Use the 'read' tool");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run packages/engine/core/test/attachment-hints.test.ts`  
Expected: FAIL (pdf_read hint not found)

- [ ] **Step 3: Update `packages/engine/core/src/session/runner/to-llm-message.ts`**

Modify `media` function in `to-llm-message.ts`:
```ts
const media = (file: FileAttachment): ContentPart => {
  if (isImageMime(file.mime)) {
    return {
      type: "media",
      mediaType: file.mime,
      data: file.uri,
      filename: file.name,
      metadata: file.description === undefined ? undefined : { description: file.description },
    };
  }

  const name = file.name || "document";
  const ext = (name.split(".").pop() || "").toLowerCase();
  let hint = "";
  if (
    ext === "xlsx" ||
    ext === "xls" ||
    ext === "csv" ||
    file.mime?.includes("spreadsheet") ||
    file.mime?.includes("excel") ||
    file.mime?.includes("csv")
  ) {
    hint = ` — Call the 'excel_read' tool with filePath="${name}" to extract sheets, cells, and rows instantly.`;
  } else if (ext === "docx" || ext === "doc" || file.mime?.includes("word")) {
    hint = ` — Call the 'word_read' tool with filePath="${name}" to extract paragraphs and tables instantly.`;
  } else if (ext === "pptx" || ext === "ppt" || file.mime?.includes("presentation")) {
    hint = ` — Call the 'ppt_read' tool with filePath="${name}" to inspect slides instantly.`;
  } else if (ext === "pdf" || file.mime?.includes("pdf")) {
    hint = ` — Call the 'pdf_read' tool with filePath="${name}" to extract text, page count, and document structure instantly.`;
  } else {
    hint = ` — Use the 'read' tool with filePath="${name}" to inspect this file.`;
  }

  return {
    type: "text",
    text: `[Attached File: ${name} (${file.mime || "application/octet-stream"})${hint}]`,
  };
};
```

- [ ] **Step 4: Update prompts in `default.txt` and `system.ts`**

In `packages/engine/engine/src/session/prompt/default.txt`:
Add under Document Operations Priority:
```text
   - Image Attachments: When the user attaches or pastes images, screenshots, or receipts, inspect them directly via multimodal vision context. Do NOT expect image files on disk or run python OCR unless explicitly requested.
   - PDF Documents (.pdf): Always use `pdf_read` first (<50ms). If `pdf_read` indicates a scanned document (no selectable text), report the scanned status to the user.
```

In `packages/engine/engine/src/session/system.ts`:
Add under document tool priority instructions:
```text
  * PDF DOCUMENTS (.pdf): When the user attaches or references a PDF, invoke 'pdf_read' first (<50ms) to inspect text and page structure. Never run shell scripts or pip install for PDF reading when 'pdf_read' is available.
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/engine/core/test/attachment-hints.test.ts`  
Expected: PASS

---

### Task 3: Implement Native `pdf_read` in `@arunaki/tools`

**Files:**
- Create: `packages/arunaki-tools/src/pdf-read.ts`
- Modify: `packages/arunaki-tools/src/index.ts`
- Modify: `packages/arunaki-tools/package.json`
- Test: `packages/arunaki-tools/test/pdf-read.test.ts`

**Interfaces:**
- Consumes: `{ filePath: string; maxPages?: number }`
- Produces: `{ pageCount: number; isScanned: boolean; text: string; info?: Record<string, unknown> }`

- [ ] **Step 1: Write test for `pdf_read` in `@arunaki/tools`**

Create `packages/arunaki-tools/test/pdf-read.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildPdfMap } from "../src/pdf-read";

describe("pdf-read", () => {
  it("exports buildPdfMap function", () => {
    expect(typeof buildPdfMap).toBe("function");
  });

  it("handles non-existent PDF file gracefully", async () => {
    await expect(buildPdfMap("non_existent_file.pdf")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run packages/arunaki-tools/test/pdf-read.test.ts`  
Expected: FAIL ("Cannot find module '../src/pdf-read'")

- [ ] **Step 3: Implement `packages/arunaki-tools/src/pdf-read.ts`**

Create `packages/arunaki-tools/src/pdf-read.ts`:
```ts
import { Effect, Schema } from "effect";
import * as Tool from "@arunaki/engine/tool";
import * as fs from "fs";
import * as path from "path";
import pdfParse from "pdf-parse";
import { recordNativeAttempt, recordNativeFailure } from "./doc-fallback";

export const Parameters = Schema.Struct({
  filePath: Schema.String.annotate({
    description: "The file path or filename of the PDF document (.pdf) to read (e.g. report.pdf or path/to/report.pdf)",
  }),
  maxPages: Schema.optional(Schema.Number).annotate({
    description: "Maximum number of pages to extract (default: all pages)",
  }),
});

export interface PdfExtractResult {
  filePath: string;
  pageCount: number;
  isScanned: boolean;
  text: string;
  info?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  hint?: string;
}

export async function buildPdfMap(filePath: string, maxPages?: number): Promise<PdfExtractResult> {
  const resolvedPath = path.resolve(filePath);
  const dataBuffer = await fs.promises.readFile(resolvedPath);
  
  const options: { max?: number } = {};
  if (maxPages && maxPages > 0) {
    options.max = maxPages;
  }

  const data = await pdfParse(dataBuffer, options);
  const cleanText = (data.text || "").trim();
  const isScanned = cleanText.length === 0;

  return {
    filePath: path.basename(filePath),
    pageCount: data.numpages || 1,
    isScanned,
    text: isScanned
      ? "[No selectable text found in this PDF. It appears to be a scanned document or image-only PDF.]"
      : cleanText,
    info: data.info || undefined,
    metadata: data.metadata || undefined,
    hint: isScanned
      ? "This document contains scanned images without embedded text."
      : undefined,
  };
}

export default Tool.define("pdf_read", {
  description:
    "Fast native reader for PDF documents (<50ms). Extracts all text, page counts, and metadata. Detects scanned image-only PDFs automatically.",
  parameters: Parameters,
  execute: ({ filePath, maxPages }) =>
    Effect.gen(function* () {
      yield* Effect.promise(() => recordNativeAttempt("pdf_read", filePath));
      try {
        const result = yield* Effect.promise(() => buildPdfMap(filePath, maxPages));
        return {
          output: JSON.stringify(result, null, 2),
        };
      } catch (err: any) {
        yield* Effect.promise(() => recordNativeFailure("pdf_read", filePath, err?.message || String(err)));
        return {
          output: `Error reading PDF '${filePath}': ${err?.message || err}`,
        };
      }
    }),
});
```

- [ ] **Step 4: Export `pdf-read` in `packages/arunaki-tools/src/index.ts` and `package.json`**

In `packages/arunaki-tools/src/index.ts`:
Add:
```ts
export * as PdfRead from "./pdf-read";
```

In `packages/arunaki-tools/package.json`:
Add to `exports`:
```json
"./pdf-read": "./src/pdf-read.ts"
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run packages/arunaki-tools/test/pdf-read.test.ts`  
Expected: PASS

---

### Task 4: Register `pdf_read` in Engine Core Tool Registry

**Files:**
- Create: `packages/engine/core/src/tool/pdf-read.ts`
- Modify: `packages/engine/core/src/tool/registry.ts`
- Modify: `packages/engine/engine/src/tool/shell/prompt.ts`
- Modify: `packages/engine/core/src/tool/bash.ts`
- Test: `packages/engine/core/test/doc-read.test.ts`

**Interfaces:**
- Consumes: `packages/arunaki-tools/src/pdf-read`
- Produces: Registered `pdf_read` tool in core `BuiltInTools`

- [ ] **Step 1: Write test checking `pdf_read` registration**

In `packages/engine/core/test/doc-read.test.ts`:
Add test assertion:
```ts
expect(toolNames).toContain("pdf_read");
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run packages/engine/core/test/doc-read.test.ts`  
Expected: FAIL (toolNames does not contain "pdf_read")

- [ ] **Step 3: Implement `packages/engine/core/src/tool/pdf-read.ts`**

Create `packages/engine/core/src/tool/pdf-read.ts`:
```ts
import { Tool } from "./tool";
import { Schema } from "effect";
import { buildPdfMap } from "@arunaki/tools/pdf-read";

export const name = "pdf_read";

export const Parameters = Schema.Struct({
  filePath: Schema.String.annotate({
    description: "The file path or filename of the PDF (.pdf) to read",
  }),
  maxPages: Schema.optional(Schema.Number).annotate({
    description: "Optional maximum number of pages to inspect",
  }),
});

export const pdfReadTool = Tool.define(name, {
  description:
    "Fast native document reader for PDF files (<50ms). Extracts text, page count, and detects scanned image-only PDFs instantly without external shell or python dependencies.",
  parameters: Parameters,
  execute: ({ filePath, maxPages }) => async () => {
    try {
      const res = await buildPdfMap(filePath, maxPages);
      return {
        output: JSON.stringify(res, null, 2),
      };
    } catch (err: any) {
      return {
        output: `Error reading PDF '${filePath}': ${err?.message || err}`,
      };
    }
  },
});
```

- [ ] **Step 4: Register `pdf_read` in `registry.ts` and document tool priorities**

In `packages/engine/core/src/tool/registry.ts`:
Import `pdfReadTool` and add to default tools list.
In `packages/engine/core/src/tool/bash.ts` & `packages/engine/engine/src/tool/shell/prompt.ts`:
Include `pdf_read` alongside `excel_read`, `word_read`, `ppt_read`.

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run packages/engine/core/test/doc-read.test.ts`  
Expected: PASS

---

### Task 5: Full Build & Regression Verification

**Files:**
- None (verification phase)

- [ ] **Step 1: Run Web UI build**

Run: `npm run build -w apps/web`  
Expected: 0 TypeScript errors, clean bundle generation.

- [ ] **Step 2: Run complete tool test suite**

Run: `npx vitest run packages/arunaki-tools/test/ packages/engine/core/test/doc-read.test.ts apps/web/src/components/workstation/chat/attachmentUtils.test.ts`  
Expected: All tests PASS.

- [ ] **Step 3: Update documentation and dev-log**

Update `WORKFLOW.md` with:
- `[x] Chat attachment workspace isolation (no root pollution)`
- `[x] Multi-image paste deduplication (image_1.png, image_2.png)`
- `[x] Native pdf_read tool (<50ms text extraction)`
Create dev-log in `docs/dev-logs/dev-log-2026-09-29-chat-attachments-and-pdf-support.md`.
