import { describe, expect } from "bun:test"
import { Effect, Schema } from "effect"
import { Catalog } from "@arunaki/core/catalog"
import { Config } from "@arunaki/core/config"
import { ConfigProviderPlugin } from "@arunaki/core/config/plugin/provider"
import { PluginV2 } from "@arunaki/core/plugin"
import { PluginHost } from "@arunaki/core/plugin/host"
import { ProviderV2 } from "@arunaki/core/provider"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "../plugin/fixture"

/**
 * Reproduces N1.
 *
 * Every local CLI provider is configured with plain model ids - its catalogue comes from a sign-in
 * flow, not from models.dev - and none of them ever reached the model picker. Antigravity, Kiro and
 * Codex all read "Connected" in Settings while contributing zero models to /api/model, so nothing in
 * the chat could select them. The local-CLI tests passed and the bridge served them fine; the
 * catalogue dropped them on the way.
 *
 * The fixture mirrors those entries exactly: no capabilities block, no release date, and model ids the
 * sync has never heard of.
 */

const PROVIDER = "kiro"
const MODELS = ["claude-haiku-4.5", "deepseek-3.2", "glm-5"]

const decode = Schema.decodeUnknownSync(Config.Info)
const it = testEffect(PluginTestLayer)

const load = Effect.fn(function* () {
  const catalog = yield* Catalog.Service
  const plugin = yield* PluginV2.Service
  const host = yield* PluginHost.make(plugin)
  const config = Config.Service.of({
    entries: () =>
      Effect.succeed([
        new Config.Document({
          type: "document",
          info: decode({
            providers: {
              [PROVIDER]: {
                name: "Local CLI provider",
                env: [],
                options: { baseURL: "http://127.0.0.1:20188/v1", apiKey: "local-session" },
                models: Object.fromEntries(MODELS.map((id) => [id, { id, name: id }])),
              },
            },
          }),
        }),
      ]),
  })
  yield* ConfigProviderPlugin.Plugin.effect(host).pipe(Effect.provideService(Config.Service, config))
  return catalog
})

describe("a provider configured by hand reaches the model picker", () => {
  it.effect("models without capabilities or a release date are still offered", () =>
    Effect.gen(function* () {
      const catalog = yield* load()
      const providerID = ProviderV2.ID.make(PROVIDER)

      const all = yield* catalog.model.all()
      const mine = all.filter((m) => m.providerID === providerID)
      expect(mine.length).toBe(MODELS.length)

      const available = yield* catalog.model.available()
      const offered = available.filter((m) => m.providerID === providerID)
      expect(offered.length).toBeGreaterThan(0)
    }),
  )
})