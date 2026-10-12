import fs from "fs/promises"
import path from "path"
import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { Config } from "@arunaki/core/config"
import { AppNodeBuilder } from "@arunaki/core/effect/app-node-builder"
import { LayerNode } from "@arunaki/core/effect/layer-node"
import { InstanceRegistry } from "@arunaki/core/instance-registry"
import { Location } from "@arunaki/core/location"
import { LocationServiceMap } from "@arunaki/core/location-services"
import { AbsolutePath } from "@arunaki/core/schema"
import { Database } from "../src/database/database"
import { EventV2 } from "../src/event"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

/**
 * Reproduces: connecting a provider through the API wrote it to arunaki.json and the catalogue kept
 * serving the previous contents until the app was restarted.
 *
 * The config layer reads its files once when the location opens, and it lives in the LayerMap entry,
 * which had a 60 minute idle TTL and no teardown at all. So disposing the instance for a directory -
 * which is what every connect, provider edit and config write asks for - dropped the instance and
 * left every service derived from the config exactly where it was.
 *
 * This asserts on Config.entries() rather than the catalogue on purpose: the catalogue now ignores
 * project-scoped provider entries (credentials are account-wide), so writing one here would test
 * the scoping rule instead of the teardown.
 */
const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, LocationServiceMap.node])),
)

const models = (directory: string) =>
  Effect.gen(function* () {
    const entries = yield* (yield* Config.Service).entries()
    return entries
      .filter((entry): entry is Config.Document => entry.type === "document")
      .flatMap((file) => Object.keys(file.info.providers ?? {}))
      .sort()
  }).pipe(Effect.provide(LocationServiceMap.Service.get(Location.Ref.make({ directory: AbsolutePath.make(directory) }))))

const write = (directory: string, provider: string) =>
  Effect.promise(() =>
    fs.writeFile(
      path.join(directory, "arunaki.json"),
      JSON.stringify({ providers: { [provider]: { name: provider, models: { [`${provider}-1`]: { name: provider } } } } }),
    ),
  )

describe("a location rebuilt after its instance is disposed", () => {
  it.live("reads the configuration that is on disk now", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((dir) =>
        Effect.gen(function* () {
          yield* write(dir.path, "alpha")
          expect(yield* models(dir.path)).toContain("alpha")

          yield* write(dir.path, "beta")
          yield* Effect.promise(() => InstanceRegistry.disposeInstance(dir.path))

          expect(yield* models(dir.path)).toContain("beta")
          expect(yield* models(dir.path)).not.toContain("alpha")
        }),
      ),
    ),
  )
})