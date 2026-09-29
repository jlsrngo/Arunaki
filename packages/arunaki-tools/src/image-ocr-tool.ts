import { Effect, Schema } from "effect"
import * as Tool from "@arunaki/engine/tool"
import * as fs from "fs"
import * as path from "path"
import { buildImageOcrMap } from "./image-ocr"

export const Parameters = Schema.Struct({
  filePath: Schema.String.annotate({
    description: "The file path or filename of the image (.png, .jpg, .jpeg, .webp, .bmp) to read and extract text from via OCR.",
  }),
})

export const ImageOcrTool = Tool.define(
  "image_ocr",
  Effect.succeed({
    description: `Extract and read text, numbers, receipts, tables, and notes from an image file (.png, .jpg, .jpeg, .webp, .bmp) using high-accuracy native OCR. Supports both English and Indonesian. ALWAYS use this tool when reading text from image files, screenshots, or receipts on models without native image vision, or to get exact character-level text extraction.`,
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
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
                  f.toLowerCase().includes(baseName.toLowerCase().replace(/\.[^.]+$/, "")),
              )
              if (match) {
                filePath = path.join(baseDir, match)
              } else {
                const attachDir = path.join(baseDir, ".arunaki", "attachments")
                if (fs.existsSync(attachDir)) {
                  const attachFiles = fs.readdirSync(attachDir)
                  const attachMatch = attachFiles.find((f) => f.toLowerCase() === baseName.toLowerCase())
                  if (attachMatch) filePath = path.join(attachDir, attachMatch)
                }
              }
            } catch {}
          }
        }

        if (!fs.existsSync(filePath)) {
          return {
            title: "Image OCR: file not found",
            output: `ERROR: ${params.filePath} not found in workspace (${baseDir}) or attachments cache.`,
            metadata: { confidence: 0, linesCount: 0 },
          }
        }

        try {
          const map = yield* Effect.promise(() => buildImageOcrMap(filePath))
          return {
            title: `Image OCR: ${path.basename(filePath)} (${map.confidence}% confidence, ${map.lines.length} lines)`,
            output: JSON.stringify(map, null, 2),
            metadata: { confidence: map.confidence, linesCount: map.lines.length },
          }
        } catch (e: any) {
          return {
            title: "Image OCR failed",
            output: `ERROR running OCR on ${path.basename(filePath)}: ${e?.message || e}`,
            metadata: { confidence: 0, linesCount: 0 },
          }
        }
      }),
  }),
)
