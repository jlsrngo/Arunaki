export * as ImageOcrTool from "./image-ocr"

import { ToolFailure } from "@arunaki/llm"
import { Effect, Layer, Schema } from "effect"
import { makeLocationNode } from "../effect/app-node"
import { LocationMutation } from "../location-mutation"
import { PermissionV2 } from "../permission"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"
import { buildImageOcrMap } from "@arunaki/tools/image-ocr"
import * as fs from "fs"
import * as path from "path"

export const name = "image_ocr"

export const Input = Schema.Struct({
  filePath: Schema.String.annotate({
    description:
      "The file path or filename of the image (.png, .jpg, .jpeg, .webp, .bmp) to read and extract text from via OCR (e.g. receipt.png, table.jpg, or path/to/image.png)",
  }),
})

export const Output = Schema.Struct({
  title: Schema.String,
  output: Schema.String,
  metadata: Schema.Record(Schema.String, Schema.Unknown).pipe(Schema.optional),
})
export type Output = typeof Output.Type

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const mutation = yield* LocationMutation.Service
    const permission = yield* PermissionV2.Service

    yield* tools
      .register({
        [name]: Tool.make({
          description:
            "Extract and read text, numbers, receipts, tables, and notes from an image file (.png, .jpg, .jpeg, .webp, .bmp) using high-accuracy native OCR. Supports both English and Indonesian. ALWAYS invoke this tool when reading text from image files, screenshots, or receipts on models without native image vision, or to get exact character-level text extraction.",
          input: Input,
          output: Output,
          toModelOutput: ({ output }) => [{ type: "text", text: output.output }],
          execute: (input, context) =>
            Effect.gen(function* () {
              const source = {
                type: "tool" as const,
                messageID: context.assistantMessageID,
                callID: context.toolCallID,
              }
              const target = yield* mutation.resolve({ path: input.filePath, kind: "file" })
              const external = target.externalDirectory
              if (external)
                yield* permission.assert({
                  ...LocationMutation.externalDirectoryPermission(external),
                  sessionID: context.sessionID,
                  agent: context.agent,
                  source,
                })

              let filePath = target.canonical
              if (!fs.existsSync(filePath)) {
                const baseDir = path.dirname(filePath)
                const baseName = path.basename(input.filePath)
                const attachmentFallback = path.join(baseDir, ".arunaki", "attachments", baseName)

                if (fs.existsSync(attachmentFallback)) {
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
                return yield* Effect.fail(new ToolFailure({ message: `Image file not found: ${input.filePath}` }))
              }

              try {
                const map = yield* Effect.promise(() => buildImageOcrMap(filePath))
                return {
                  title: `Image OCR: ${path.basename(filePath)} (${map.confidence}% confidence, ${map.lines.length} lines)`,
                  output: JSON.stringify(map, null, 2),
                  metadata: { confidence: map.confidence, linesCount: map.lines.length },
                }
              } catch (e: any) {
                return yield* Effect.fail(
                  new ToolFailure({ message: `Failed to extract text via OCR from ${path.basename(filePath)}: ${e?.message || e}` }),
                )
              }
            }),
        }),
      })
      .pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/image-ocr",
  layer,
  deps: [ToolRegistry.node, LocationMutation.node, PermissionV2.node],
})
