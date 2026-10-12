import fs from "fs/promises"
import path from "path"
import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { Catalog } from "@arunaki/core/catalog"
import { AppNodeBuilder } from "@arunaki/core/effect/app-node-builder"
import { LayerNode } from "@arunaki/core/effect/layer-node"
import { InstanceRegistry } from "@arunaki/core/instance-registry"
import { Location } from "@arunaki/core/location"
import { LocationServiceMap } from "@arunaki/core/location-services"
import { AbsolutePath } from "@arunaki/core/schema"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"
import { Database } from "../src/database/database"
import { EventV2 } from "../src/event"

/**
 * Reproduces: connecting a provider through the API wrote it to arunaki.json and the catalogue kept
 * serving the previous contents until the app was restarted.
 *
 * The catalogue is projected from the config documents by a plugin transform registered while the
 * location layer is built, and the config layer reads its files once when the location opens. Both
 * live in the LayerMap entry, which had a 60 minute idle TTL and no teardown, so disposing the
 * instance for a directory - which is what every connect, provider edit and config write asks for -
 * dropped the instance and left every service derived from the config exactly where it was.
 */
const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, LocationServiceMap.node])),
)

const write = (directory: string, provider: string) =>
  Effect.promise(() =>
    fs.writeFile(
      path.join(directory, "arunaki.json"),
      JSON.stringify({
        providers: { [provider]: { name: provider, models: { [`${provider}-1`]: { name: provider } } } },
      }),
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
          const locations = yield* LocationServiceMap.Service
          const ref = Location.Ref.make({ directory: AbsolutePath.make(dir.path) })
          const providers = Effect.gen(function* () {
            const ids = (yield* (yield* Catalog.Service).provider.all()).map((provider) => String(provider.id))
            return ids.sort()
          }).pipe(Effect.provide(LocationServiceMap.Service.get(ref)))

          yield* write(dir.path, "alpha")
          expect(yield* providers).toContain("alpha")

          yield* write(dir.path, "beta")
          yield* Effect.promise(() => InstanceRegistry.disposeInstance(dir.path))

          expect(yield* providers).toContain("beta")
          expect(yield* providers).not.toContain("alpha")
        }),
      ),
    ),
  )
})