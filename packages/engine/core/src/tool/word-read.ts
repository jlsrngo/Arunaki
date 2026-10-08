export * as WordReadTool from "./word-read"

import { ToolFailure } from "@arunaki/llm"
import { Effect, Layer, Schema } from "effect"
import { makeLocationNode } from "../effect/app-node"
import { LocationMutation } from "../location-mutation"
import { PermissionV2 } from "../permission"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"
import { buildWordMap } from "@arunaki/tools/word-map"
import * as fs from "fs"
import * as path from "path"
import { recordNativeAttempt, recordNativeFailure } from "./doc-fallback"

export const name = "word_read"

export const Input = Schema.Struct({
  filePath: Schema.String.annotate({
    description: "The file path or filename of the Word document (.docx) to read (relative to workspace or absolute)",
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
            "Read, extract, and inspect text, paragraphs, and tables from a Word document (.docx). Returns a complete Document Map (JSON) with paragraphs ({index, text}) and structured tables ({index, rows}). ALWAYS invoke this tool first whenever a user asks to inspect, read, check, or summarize Word documents natively with zero external dependencies, instead of python scripts or COM.",
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
                try {
                  const files = fs.readdirSync(baseDir)
                  const match = files.find(
                    (f) =>
                      f.toLowerCase() === baseName.toLowerCase() ||
                      (f.endsWith(".docx") && f.toLowerCase().includes(baseName.toLowerCase().replace(".docx", ""))) ||
                      (f.endsWith(".doc") && f.toLowerCase().includes(baseName.toLowerCase().replace(".doc", ""))),
                  )
                  if (match) filePath = path.join(baseDir, match)
                } catch {}
              }

              if (!fs.existsSync(filePath)) {
                recordNativeFailure(context.sessionID, input.filePath)
                return yield* Effect.fail(new ToolFailure({ message: `File not found: ${input.filePath}` }))
              }

              try {
                const map = yield* Effect.promise(() => buildWordMap(filePath))
                return {
                  title: `Word read: ${path.basename(filePath)}`,
                  output: JSON.stringify(map),
                  metadata: { paragraphs: map.paragraphs.length, tables: map.tables.length },
                }
              } catch (e: any) {
                recordNativeFailure(context.sessionID, input.filePath)
                return yield* Effect.fail(new ToolFailure({ message: `Failed to read Word document: ${e?.message || e}` }))
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
  name: "tool/word-read",
  layer,
  deps: [ToolRegistry.node, LocationMutation.node, PermissionV2.node],
})
