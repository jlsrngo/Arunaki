export * as PdfReadTool from "./pdf-read"

import { ToolFailure } from "@arunaki/llm"
import { Effect, Layer, Schema } from "effect"
import { makeLocationNode } from "../effect/app-node"
import { LocationMutation } from "../location-mutation"
import { PermissionV2 } from "../permission"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"
import { buildPdfMap } from "@arunaki/tools/pdf-map"
import * as fs from "fs"
import * as path from "path"
import { recordNativeAttempt, recordNativeFailure } from "./doc-fallback"

export const name = "pdf_read"

export const Input = Schema.Struct({
  filePath: Schema.String.annotate({
    description: "The file path or filename of the PDF document (.pdf) to read (e.g. document.pdf or path/to/document.pdf)",
  }),
  maxPages: Schema.optional(Schema.Number).annotate({
    description: "Optional maximum number of pages to inspect",
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
            "Read, extract, and inspect text, page counts, and structure from a PDF document (.pdf). ALWAYS invoke this tool first whenever a user asks to inspect, read, verify, or recap a PDF file (<50ms). Automatically detects scanned/image-only PDFs.",
          input: Input,
          output: Output,
          toModelOutput: ({ output }) => [{ type: "text", text: output.output }],
          execute: (input, context) =>
            Effect.gen(function* () {
              recordNativeAttempt(context.sessionID, input.filePath)
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
                        (f.endsWith(".pdf") && f.toLowerCase().includes(baseName.toLowerCase().replace(".pdf", ""))),
                    )
                    if (match) filePath = path.join(baseDir, match)
                  } catch {}
                }
              }

              if (!fs.existsSync(filePath)) {
                return yield* Effect.fail(new ToolFailure({ message: `File not found: ${input.filePath}` }))
              }

              try {
                const map = yield* Effect.promise(() => buildPdfMap(filePath, input.maxPages))
                return {
                  title: `PDF read: ${path.basename(filePath)} (${map.pageCount} page${map.pageCount > 1 ? "s" : ""})`,
                  output: JSON.stringify(map, null, 2),
                  metadata: { pageCount: map.pageCount, isScanned: map.isScanned },
                }
              } catch (e: any) {
                recordNativeFailure(context.sessionID, input.filePath)
                return yield* Effect.fail(new ToolFailure({ message: `Failed to read PDF document: ${e?.message || e}` }))
              }
            }).pipe(
              Effect.mapError((error) =>
                error instanceof ToolFailure
                  ? error
                  : new ToolFailure({ message: (error as any)?.message || String(error) }),
              ),
            ),
        }),
      })
      .pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/pdf-read",
  layer,
  deps: [ToolRegistry.node, LocationMutation.node, PermissionV2.node],
})
