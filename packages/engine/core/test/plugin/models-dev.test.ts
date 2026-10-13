import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Catalog } from "@arunaki/core/catalog"
import { Config } from "@arunaki/core/config"
import { Integration } from "@arunaki/core/integration"
import { AppNodeBuilder } from "@arunaki/core/effect/app-node-builder"
import { LayerNode } from "@arunaki/core/effect/layer-node"
import { EventV2 } from "@arunaki/core/event"
import { Flag } from "@arunaki/core/flag/flag"
import { Location } from "@arunaki/core/location"
import { ModelV2 } from "@arunaki/core/model"
import { ModelsDev } from "@arunaki/core/models-dev"
import { ModelsDevPlugin } from "@arunaki/core/plugin/models-dev"
import { ProviderV2 } from "@arunaki/core/provider"
import { AbsolutePath } from "@arunaki/core/schema"
import { location } from "../fixture/location"
import { testEffect } from "../lib/effect"
import { catalogHost, host, integrationHost } from "./host"

// ModelsDevPlugin reads Config to learn which providers config already lists. Without this the
// plugin effect dies on `Service not found: @arunaki/v2/Config` and both cases fail before running
// a single assertion - they read as a broken plugin rather than as a broken test.
const configLayer = Layer.succeed(
  Config.Service,
  Config.Service.of({
    get: () => Effect.succeed({} as any),
    entries: () => Effect.succeed([]),
  } as any),
)

const locationLayer = Layer.succeed(
  Location.Service,
  Location.Service.of(location({ directory: AbsolutePath.make(import.meta.dir) })),
)
const layer = AppNodeBuilder.build(
  LayerNode.group([Catalog.node, Integration.node, EventV2.node, Config.node]),
  [
    [Location.node, locationLayer],
    [Config.node, configLayer],
  ],
)
const it = testEffect(layer)

describe("ModelsDevPlugin", () => {
  it.effect("projects models.dev modes as separate models instead of variants", () =>
    Effect.gen(function* () {
      const integrations = yield* Integration.Service
      const catalog = yield* Catalog.Service
      const models = ModelsDev.Service.of({
        get: () =>
          Effect.succeed({
            acme: {
              id: "acme",
              name: "Acme",
              env: [],
              npm: "@ai-sdk/openai-compatible",
              api: "https://api.acme.test/v1",
              models: {
                "gpt-5.4": {
                  id: "gpt-5.4",
                  name: "GPT-5.4",
                  family: "gpt",
                  release_date: "2026-01-01",
                  attachment: false,
                  reasoning: true,
                  temperature: true,
                  tool_call: true,
                  cost: {
                    input: 2.5,
                    output: 15,
                    tiers: [
                      {
                        tier: { type: "context", size: 272_000 },
                        input: 3,
                        output: 18,
                        cache_read: 0.25,
                      },
                    ],
                    context_over_200k: { input: 5, output: 22.5, cache_read: 0.5 },
                  },
                  limit: { context: 1_050_000, input: 922_000, output: 128_000 },
                  experimental: {
                    modes: {
                      fast: {
                        cost: { input: 5, output: 30, cache_read: 0.5 },
                        provider: {
                          headers: { "x-mode": "fast" },
                          body: { service_tier: "priority" },
                        },
                      },
                    },
                  },
                },
              },
            },
          } satisfies Record<string, ModelsDev.Provider>),
        refresh: () => Effect.void,
      })

      yield* ModelsDevPlugin.effect(
        host({
          catalog: catalogHost(catalog),
          integration: integrationHost(integrations),
        }),
      ).pipe(Effect.provideService(ModelsDev.Service, models))

      const providerID = ProviderV2.ID.make("acme")
      const base = yield* catalog.model.get(providerID, ModelV2.ID.make("gpt-5.4"))
      const fast = yield* catalog.model.get(providerID, ModelV2.ID.make("gpt-5.4-fast"))

      expect(base?.variants).toEqual([])
      expect(base?.request.body).toEqual({})
      expect(fast).toMatchObject({
        id: "gpt-5.4-fast",
        providerID: "acme",
        name: "GPT-5.4 Fast",
        api: { id: "gpt-5.4" },
        request: {
          headers: { "x-mode": "fast" },
          body: { service_tier: "priority" },
        },
        variants: [],
      })
      expect(fast?.cost).toEqual([
        { input: 5, output: 30, cache: { read: 0.5, write: 0 } },
        {
          tier: { type: "context", size: 272_000 },
          input: 3,
          output: 18,
          cache: { read: 0.25, write: 0 },
        },
        {
          tier: { type: "context", size: 200_000 },
          input: 5,
          output: 22.5,
          cache: { read: 0.5, write: 0 },
        },
      ])
    }),
  )

  it.effect("registers key methods for providers with environment variables", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => {
        const previous = {
          path: Flag.Arunaki_MODELS_PATH,
          disabled: Flag.Arunaki_DISABLE_MODELS_FETCH,
        }
        Flag.Arunaki_MODELS_PATH = path.join(import.meta.dir, "fixtures", "models-dev.json")
        Flag.Arunaki_DISABLE_MODELS_FETCH = true
        return previous
      }),
      () =>
        Effect.gen(function* () {
          const integrations = yield* Integration.Service
          const catalog = yield* Catalog.Service
          yield* ModelsDevPlugin.effect(
            host({
              catalog: catalogHost(catalog),
              integration: integrationHost(integrations),
            }),
          )
          expect(yield* integrations.list()).toEqual([
            new Integration.Info({
              id: Integration.ID.make("acme"),
              name: "Acme",
              methods: [
                { type: "key" },
                {
                  type: "env",
                  names: ["ACME_API_KEY"],
                },
              ],
              connections: [],
            }),
          ])
        }).pipe(Effect.provide(AppNodeBuilder.build(ModelsDev.node))),
      (previous) =>
        Effect.sync(() => {
          Flag.Arunaki_MODELS_PATH = previous.path
          Flag.Arunaki_DISABLE_MODELS_FETCH = previous.disabled
        }),
    ),
  )
})
