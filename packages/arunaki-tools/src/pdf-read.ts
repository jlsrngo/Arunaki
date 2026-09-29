import { Effect, Schema } from "effect"
import * as Tool from "@arunaki/engine/tool"
import * as fs from "fs"
import * as path from "path"
import { PDFParse } from "pdf-parse"
import { PdfMap } from "./docmap"
import { recordNativeAttempt, recordNativeFailure } from "./doc-fallback"

export const Parameters = Schema.Struct({
  filePath: Schema.String.annotate({
    description: "The file path or filename of the PDF document (.pdf) to read (e.g. document.pdf or path/to/document.pdf)",
  }),
  maxPages: Schema.optional(Schema.Number).annotate({
    description: "Optional maximum number of pages to inspect",
  }),
})

export async function buildPdfMap(filePath: string, maxPages?: number): Promise<typeof PdfMap.Type> {
  const buf = await fs.promises.readFile(filePath)
  const parser = new PDFParse({ data: buf })
  let textResult: any = null
  let infoResult: any = null

  try {
    textResult = await parser.getText()
    try {
      infoResult = await parser.getInfo()
    } catch {
      // Info extraction is optional
    }
  } finally {
    try {
      await parser.destroy()
    } catch {}
  }

  const rawPages: Array<{ text: string; num: number }> = textResult?.pages || []
  const totalPages = textResult?.total || rawPages.length || 1
  const limit = maxPages && maxPages > 0 ? Math.min(maxPages, rawPages.length) : rawPages.length

  const pages = (limit > 0 ? rawPages.slice(0, limit) : rawPages).map((p, idx) => ({
    number: p.num ?? idx + 1,
    text: (p.text || "").trim(),
  }))

  const combinedText = pages.map((p) => `--- PAGE ${p.number} ---\n${p.text}`).join("\n\n").trim()
  const hasText = pages.some((p) => p.text.length > 0)
  const isScanned = !hasText

  return {
    format: "pdf",
    filePath,
    pageCount: totalPages,
    isScanned,
    text: isScanned
      ? "[No selectable text found in this PDF. It appears to be a scanned document or image-only PDF.]"
      : combinedText,
    pages,
    info: infoResult?.info ? (infoResult.info as Record<string, unknown>) : null,
  }
}

export const PdfReadTool = Tool.define(
  "pdf_read",
  Effect.succeed({
    description: `Read, extract, and inspect text, page counts, and structure from a PDF document (.pdf). ALWAYS invoke this tool first whenever a user asks to inspect, read, verify, or recap a PDF file (<50ms). Automatically detects scanned/image-only PDFs.`,
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        recordNativeAttempt(ctx?.sessionID, params.filePath)
        const baseDir = typeof ctx?.extra?.directory === "string" ? ctx.extra.directory : process.cwd()
        let filePath = params.filePath
        if (!path.isAbsolute(filePath)) {
          filePath = path.resolve(baseDir, filePath)
        }

        if (!fs.existsSync(filePath)) {
          const baseName = path.basename(params.filePath)
          const fallback = path.join(baseDir, baseName)
          const attachmentFallback = path.join(baseDir, ".arunaki", "attachments", baseName)

          if (fs.existsSync(fallback)) {
            filePath = fallback
          } else if (fs.existsSync(attachmentFallback)) {
            filePath = attachmentFallback
          } else {
            try {
              const files = fs.readdirSync(baseDir)
              const match = files.find(
                (f) =>
                  f.toLowerCase() === baseName.toLowerCase() ||
                  (f.endsWith(".pdf") && f.toLowerCase().includes(baseName.toLowerCase().replace(".pdf", ""))),
              )
              if (match) {
                filePath = path.join(baseDir, match)
              }
            } catch {}
          }
        }

        if (!fs.existsSync(filePath)) {
          recordNativeFailure(ctx?.sessionID, params.filePath)
          return {
            title: "PDF read: file not found",
            output: `ERROR: ${params.filePath} not found in workspace (${baseDir})`,
            metadata: { pageCount: 0 },
          }
        }

        try {
          const map = yield* Effect.promise(() => buildPdfMap(filePath, params.maxPages))
          return {
            title: `PDF read: ${path.basename(filePath)} (${map.pageCount} page${map.pageCount > 1 ? "s" : ""})`,
            output: JSON.stringify(map, null, 2),
            metadata: { pageCount: map.pageCount, isScanned: map.isScanned },
          }
        } catch (e) {
          recordNativeFailure(ctx?.sessionID, params.filePath)
          return { title: "PDF read failed", output: `ERROR: ${e}`, metadata: { pageCount: 0 } }
        }
      }),
  }),
)
