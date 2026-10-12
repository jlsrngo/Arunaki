export * as ConfigProviderPlugin from "./provider"

import { define } from "../../plugin/internal"
import { Effect } from "effect"
import path from "path"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http"
import { Config } from "../../config"
import { Global } from "../../global"
import { ModelV2 } from "../../model"
import { ProviderV2 } from "../../provider"

/**
 * The local CLI bridge is a network service, not a module, so this is how core reaches a live
 * model list without depending on the engine package that hosts the detectors. The engine asks
 * /models?provider=<id> and the provider answers - AWS, Google, the OpenCode CLI.
 */
const BRIDGE_URLS = /^https?:\/\/(127\.0\.0\.1|localhost):\d+\/v1$/i

const liveBridgeModels = (http: HttpClient.HttpClient, url: string, providerID: string) =>
  http
    .execute(HttpClientRequest.get(`${url}/models?provider=${encodeURIComponent(providerID)}`))
    .pipe(
      Effect.flatMap((response) =>
        response.json.pipe(
          Effect.map((json: any) =>
            (json?.data ?? [])
              .map((item: { id?: unknown }) => (typeof item?.id === "string" ? item.id : ""))
              .filter(Boolean),
          ),
        ),
      ),
      // Longer than the slowest detector's own budget, which is the point: `opencode models` spawns
      // the CLI and probes every configured upstream, and a shorter deadline here gave up before it
      // answered and quietly left that provider on its config list. Bounded so a bridge that is not
      // up yet cannot stall boot.
      Effect.timeout("20 seconds"),
      // A provider that does not answer has no live list. That is not an error: the config entry
      // stays in charge, and it was itself written from a live fetch the last time this worked.
      Effect.orElseSucceed(() => [] as string[]),
    )

export const Plugin = define<HttpClient.HttpClient | Config.Service | Global.Service>({
  id: "config-provider",
  effect: Effect.fn(function* (ctx) {
    const config = yield* Config.Service
    const global = yield* Global.Service
    const http = yield* HttpClient.HttpClient

    // A provider entry is a credential and an endpoint: it belongs to the person, not to the
    // folder they happen to have open. Project config is still read for everything that is
    // genuinely per-project - instructions, agents, MCP, permissions - but not for this.
    //
    // Nothing ever wrote to a project's arunaki.json for this key, so a project file that had one
    // could only ever go stale, and a stale one silently wins over the global file because it is
    // read last. That is how a folder kept serving a model list the user had already replaced: the
    // global file was corrected and the catalogue kept the folder's copy, routing requests to a
    // different provider because the bridge reads the model id and not the provider name.
    const accountFiles = (entries: readonly Config.Entry[]) =>
      entries.filter(
        (entry): entry is Config.Document =>
          entry.type === "document" &&
          // No path means the document did not come off disk, so it cannot be a project's.
          (entry.path === undefined || path.resolve(entry.path).startsWith(path.resolve(global.config))),
      )

    yield* ctx.integration.transform(
      Effect.fn(function* (integrations) {
        const files = accountFiles(yield* config.entries())
        const configuredIntegrations = new Set(
          files.flatMap((file) =>
            Object.entries(file.info.providers ?? {}).flatMap(([id, provider]) =>
              provider.env === undefined ? [] : [id],
            ),
          ),
        )
        for (const file of files) {
          for (const [id, item] of Object.entries(file.info.providers ?? {})) {
            const integrationID = id
            if (!configuredIntegrations.has(id) && !integrations.get(integrationID)) continue
            integrations.update(integrationID, (integration) => {
              integration.name = item.name ?? integration.name
            })
            if (item.env !== undefined) {
              integrations.method.update({
                integrationID,
                method: { type: "env", names: [...item.env] },
              })
            }
          }
        }
      }),
    )

    yield* ctx.catalog.transform(
      Effect.fn(function* (catalog) {
        const entries = accountFiles(yield* config.entries())
        const configuredDefault = Config.latest(entries, "model")
        if (configuredDefault !== undefined) {
          const model = ModelV2.parse(configuredDefault)
          catalog.model.default.set(model.providerID, model.modelID)
        }
        for (const file of entries) {
          for (const [id, item] of Object.entries(file.info.providers ?? {})) {
            const providerID = id
            catalog.provider.update(providerID, (provider) => {
              if (item.name !== undefined) provider.name = item.name
              if (item.api !== undefined) provider.api = { ...item.api }
              if (item.request !== undefined) {
                Object.assign(provider.request.headers, item.request.headers)
                Object.assign(provider.request.body, item.request.body)
              }
            })
            for (const [id, config] of Object.entries(item.models ?? {})) {
              catalog.model.update(providerID, id, (model) => {
                if (config.family !== undefined) model.family = config.family
                if (config.name !== undefined) model.name = config.name
                if (config.api !== undefined) model.api = { ...model.api, ...config.api }
                if (config.capabilities !== undefined) {
                  model.capabilities = {
                    tools: config.capabilities.tools,
                    input: [...config.capabilities.input],
                    output: [...config.capabilities.output],
                  }
                } else if (model.capabilities.input.length === 0) {
                  // Catalog.available() keeps only models whose capabilities start with "text", and a
                  // model declared only in config starts from the schema default of empty
                  // (schema/src/model.ts). Every local CLI provider is configured this way - its
                  // catalogue comes from a sign-in flow, not models.dev - so Antigravity, Kiro and
                  // Codex each read "Connected" in Settings while contributing nothing selectable.
                  // An OpenAI-compatible chat endpoint is text in, text out, tools, unless told
                  // otherwise.
                  model.capabilities = { tools: true, input: ["text"], output: ["text"] }
                }
                if (model.time.released === 0) {
                  // available() also keeps only models younger than 18 months, and age derives from
                  // time.released, which defaults to 0 - read as 1970, roughly 20,000 days old. A model
                  // the user configured by hand meant to be used, so treat it as current rather than
                  // dropping it silently.
                  model.time = { released: Date.now() }
                }
                if (config.request !== undefined) {
                  Object.assign(model.request.headers, config.request.headers)
                  Object.assign(model.request.body, config.request.body)
                  if (config.request.variant !== undefined) model.request.variant = config.request.variant
                }
                if (config.variants !== undefined) {
                  for (const variant of config.variants) {
                    let existing = model.variants.find((item) => item.id === variant.id)
                    if (!existing) {
                      existing = {
                        id: variant.id,
                        headers: {},
                        body: {},
                      }
                      model.variants.push(existing)
                    }
                    Object.assign(existing.headers, variant.headers)
                    Object.assign(existing.body, variant.body)
                  }
                }
                if (config.cost !== undefined) {
                  model.cost = (Array.isArray(config.cost) ? config.cost : [config.cost]).map((cost) => ({
                    tier: cost.tier && { ...cost.tier },
                    input: cost.input,
                    output: cost.output,
                    cache: {
                      read: cost.cache?.read ?? 0,
                      write: cost.cache?.write ?? 0,
                    },
                  }))
                }
                if (config.disabled !== undefined) model.enabled = !config.disabled
                if (config.limit !== undefined) model.limit = { ...model.limit, ...config.limit }
              })
            }
          }
        }

        // A provider reached through the local CLI bridge does not get its catalogue from the config
        // file. It gets it from the provider, every time the catalogue is built.
        //
        // Writing the live list into config and reading it back is what let a stale name outlive
        // the model: the bridge routes on the model id rather than on the provider, so an id that has
        // been retired does not fail, it is answered by whatever else claims that name. Kiro was
        // serving Gemini models for hours because of it. The config entry is kept as the answer when
        // the provider does not respond - that list was itself written from a live fetch - and is
        // overridden, not merged, when it does, so a retired model stops being offered.
        const bridged = new Map<string, string>()
        for (const file of entries) {
          for (const [id, item] of Object.entries(file.info.providers ?? {})) {
            const url = (item.api as { url?: string } | undefined)?.url
            if (url && BRIDGE_URLS.test(url)) bridged.set(id, url)
          }
        }
        if (bridged.size > 0) {
          const live = yield* Effect.forEach(
            [...bridged],
            (item) =>
              liveBridgeModels(http, item[1], item[0]).pipe(Effect.map((models) => [item[0], models] as const)),
            { concurrency: "unbounded", discard: false },
          ).pipe(Effect.orElseSucceed(() => [] as (readonly [string, string[]])[]))

          for (const [id, models] of live) {
            if (models.length === 0) continue
            for (const modelID of models) {
              catalog.model.update(id, modelID, () => {})
            }
            for (const existing of catalog.provider.list()) {
              if (existing.provider.id !== id) continue
              for (const model of [...existing.models.keys()]) {
                if (!models.includes(model)) catalog.model.remove(id, model)
              }
            }
          }
        }
      }),
    )
  }),
})

