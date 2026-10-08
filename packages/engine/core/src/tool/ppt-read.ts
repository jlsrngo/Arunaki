export * as PptReadTool from "./ppt-read"

import { ToolFailure } from "@arunaki/llm"
import { Effect, Layer, Schema } from "effect"
import { makeLocationNode } from "../effect/app-node"
import { LocationMutation } from "../location-mutation"
import { PermissionV2 } from "../permission"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"
import { buildPptMap } from "@arunaki/tools/ppt-map"
import * as fs from "fs"
import * as path from "path"
import { recordNativeAttempt, recordNativeFailure } from "./doc-fallback"

export const name = "ppt_read"

export const Input = Schema.Struct({
  filePath: Schema.String.annotate({
    description: "The file path or filename of the PowerPoint presentation (.pptx) to read (relative to workspace or absolute)",
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
            "Read, extract, and inspect slides and text from a PowerPoint presentation (.pptx). Returns a complete Document Map (JSON) with slides ({slideNumber, text}). ALWAYS invoke this tool first whenever a user asks to inspect, read, check, or summarize PowerPoint presentations natively with zero external dependencies.",
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
                      (f.endsWith(".pptx") && f.toLowerCase().includes(baseName.toLowerCase().replace(".pptx", ""))) ||
                      (f.endsWith(".ppt") && f.toLowerCase().includes(baseName.toLowerCase().replace(".ppt", ""))),
                  )
                  if (match) filePath = path.join(baseDir, match)
                } catch {}
              }

              if (!fs.existsSync(filePath)) {
                recordNativeFailure(context.sessionID, input.filePath)
                return yield* Effect.fail(new ToolFailure({ message: `File not found: ${input.filePath}` }))
              }

              try {
                const map = yield* Effect.promise(() => buildPptMap(filePath))
                return {
                  title: `PowerPoint read: ${path.basename(filePath)}`,
                  output: JSON.stringify(map),
                  metadata: { slides: map.slides.length },
                }
              } catch (e: any) {
                recordNativeFailure(context.sessionID, input.filePath)
                return yield* Effect.fail(new ToolFailure({ message: `Failed to read PowerPoint presentation: ${e?.message || e}` }))
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
  name: "tool/ppt-read",
  layer,
  deps: [ToolRegistry.node, LocationMutation.node, PermissionV2.node],
})
