export * as SystemContextBuiltIns from "./builtins"

import { makeLocationNode } from "../effect/app-node"
import { DateTime, Effect, Layer, Schema } from "effect"
import { Location } from "../location"
import { SystemContext } from "./index"
import { InstructionContext } from "../instruction-context"
import { SystemContextRegistry } from "./registry"
import { FSUtil } from "../fs-util"
import { Global } from "../global"

const builtIns = Layer.effectDiscard(
  Effect.gen(function* () {
    const location = yield* Location.Service
    const registry = yield* SystemContextRegistry.Service
    const normalizedDir = location.directory.toLowerCase().replace(/\\/g, "/")
    const isScratch =
      normalizedDir.includes("/.arunaki/scratch") ||
      normalizedDir.endsWith("/.arunaki/scratch") ||
      normalizedDir.includes(".arunaki/scratch")

    const environment = isScratch
      ? [
          "<env>",
          `  Workspace status: No project folder opened (unconnected scratchpad)`,
          `  Is folder connected: no`,
          `  Platform: ${process.platform}`,
          "</env>",
        ].join("\n")
      : [
          "<env>",
          `  Working directory: ${location.directory}`,
          `  Workspace root folder: ${location.project.directory}`,
          `  Is directory a git repo: ${location.vcs?.type === "git" ? "yes" : "no"}`,
          `  Platform: ${process.platform}`,
          "</env>",
        ].join("\n")
    const context = SystemContext.combine([
      SystemContext.make({
        key: SystemContext.Key.make("core/environment"),
        codec: Schema.toCodecJson(Schema.String),
        load: Effect.succeed(environment),
        baseline: (environment) =>
          ["Here is some useful information about the environment you are running in:", environment].join("\n"),
        update: (_previous, environment) => ["The environment you are running in is now:", environment].join("\n"),
      }),
      SystemContext.make({
        key: SystemContext.Key.make("core/date"),
        codec: Schema.toCodecJson(Schema.String),
        load: DateTime.nowAsDate.pipe(Effect.map((date) => date.toDateString())),
        baseline: (date) => `Today's date: ${date}`,
        update: (_previous, date) => `Today's date is now: ${date}`,
      }),
      SystemContext.make({
        key: SystemContext.Key.make("core/tool-rules"),
        codec: Schema.toCodecJson(Schema.String),
        load: Effect.succeed(
          [
            "<tool_guidelines>",
            "CRITICAL: Always use the native function calling protocol to execute tools.",
            "NEVER emit fake or pseudo tool call logs (e.g. '[Assistant tool call]: ...', '[Tool result]: ...', or '[Assistant]: ...') in chat text.",
            "Your message text is rendered directly to the user in the UI. Simulating tool executions in conversational text is strictly forbidden.",
            "</tool_guidelines>",
          ].join("\n"),
        ),
        baseline: (text) => text,
        update: (_previous, text) => text,
      }),
    ])

    yield* registry.register({ key: SystemContext.Key.make("core/builtins"), load: Effect.succeed(context) })
  }),
)

export const node = makeLocationNode({
  name: "system-context-builtins",
  layer: builtIns,
  deps: [Location.node, SystemContextRegistry.node, InstructionContext.node, FSUtil.node, Global.node],
})
