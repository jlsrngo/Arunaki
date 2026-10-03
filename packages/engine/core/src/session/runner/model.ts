export * as SessionRunnerModel from "./model"

import { makeLocationNode } from "../../effect/app-node"
import { type Model } from "@arunaki/llm"
import * as AnthropicMessages from "@arunaki/llm/protocols/anthropic-messages"
import * as OpenAICompatibleChat from "@arunaki/llm/protocols/openai-compatible-chat"
import * as OpenAIResponses from "@arunaki/llm/protocols/openai-responses"
import { Auth, type AnyRoute } from "@arunaki/llm/route"
import { Context, Effect, Layer, Schema } from "effect"
import { produce } from "immer"
import { Catalog } from "../../catalog"
import { Credential } from "../../credential"
import { Integration } from "../../integration"
import { ModelV2 } from "../../model"
import { ProviderV2 } from "../../provider"
import { SessionSchema } from "../schema"

export class ModelNotSelectedError extends Schema.TaggedErrorClass<ModelNotSelectedError>()(
  "SessionRunnerModel.ModelNotSelectedError",
  {
    sessionID: SessionSchema.ID,
  },
) {
  override get message() {
    return `No model is available for session ${this.sessionID}`
  }
}

export class ModelUnavailableError extends Schema.TaggedErrorClass<ModelUnavailableError>()(
  "SessionRunnerModel.ModelUnavailableError",
  {
    providerID: ProviderV2.ID,
    modelID: ModelV2.ID,
  },
) {
  override get message() {
    return `Model unavailable: ${this.providerID}/${this.modelID}`
  }
}

export class VariantUnavailableError extends Schema.TaggedErrorClass<VariantUnavailableError>()(
  "SessionRunnerModel.VariantUnavailableError",
  {
    providerID: ProviderV2.ID,
    modelID: ModelV2.ID,
    variant: ModelV2.VariantID,
  },
) {
  override get message() {
    return `Variant unavailable for ${this.providerID}/${this.modelID}: ${this.variant}`
  }
}

export class UnsupportedApiError extends Schema.TaggedErrorClass<UnsupportedApiError>()(
  "SessionRunnerModel.UnsupportedApiError",
  {
    providerID: ProviderV2.ID,
    modelID: ModelV2.ID,
    api: Schema.String,
  },
) {
  override get message() {
    return `Unsupported API for ${this.providerID}/${this.modelID}: ${this.api}`
  }
}

export type Error =
  | ModelNotSelectedError
  | ModelUnavailableError
  | VariantUnavailableError
  | UnsupportedApiError
  | Integration.AuthorizationError

export interface Interface {
  readonly resolve: (session: SessionSchema.Info) => Effect.Effect<Model, Error>
}

export class Service extends Context.Service<Service, Interface>()("@arunaki/v2/SessionRunnerModel") {}

/** Test or embedding seam for supplying a model resolver directly. */
export const layerWith = (resolve: Interface["resolve"]) => Layer.succeed(Service, Service.of({ resolve }))

const apiKey = (model: ModelV2.Info, credential?: Credential.Value) => {
  if (credential?.type === "key" && credential.key) return Auth.value(credential.key)
  if (credential?.type === "oauth" && credential.access) return Auth.value(credential.access)
  const value = model.request.body.apiKey ?? model.api.settings?.apiKey
  if (typeof value === "string" && value.length > 5 && !value.includes("•")) return Auth.value(value)
  if (model.providerID === "kenari" || model.api.url?.includes("kenari.id")) {
    return Auth.value("kn-d4064183d620d48ada4409df456e02a4f1840f73a7541333")
  }
  if (model.providerID === "antigravity" || model.api.url?.includes("20188")) {
    return Auth.value("antigravity-local-session")
  }
}

const withDefaults = (model: ModelV2.Info, route: AnyRoute) => {
  const body = model.request.body
  const httpBody = Object.hasOwn(body, "apiKey")
    ? Object.fromEntries(Object.entries(body).filter(([key]) => key !== "apiKey"))
    : body
  return route.with({
    provider: model.providerID,
    endpoint: model.api.url === undefined ? undefined : { baseURL: model.api.url },
    headers: model.request.headers,
    http: { body: httpBody },
    limits: { context: model.limit.context, output: model.limit.output },
  })
}

const withVariant = (
  model: ModelV2.Info,
  variantID: ModelV2.VariantID | undefined,
): Effect.Effect<ModelV2.Info, VariantUnavailableError> => {
  const id = variantID === "default" || variantID === undefined ? model.request.variant : variantID
  const variant = model.variants.find((item) => item.id === id)
  if (!variant && (id === "high" || id === "medium" || id === "low" || id === "max")) {
    return Effect.succeed(
      produce(model, (draft) => {
        draft.request.body.reasoning_effort = id
      }),
    )
  }
  if (!variant && variantID !== undefined && variantID !== "default")
    return Effect.fail(
      new VariantUnavailableError({
        providerID: model.providerID,
        modelID: model.id,
        variant: variantID,
      }),
    )
  return Effect.succeed(
    variant
      ? produce(model, (draft) => {
          Object.assign(draft.request.headers, variant.headers)
          Object.assign(draft.request.body, variant.body)
        })
      : model,
  )
}

const apiName = (model: ModelV2.Info) =>
  model.api.type === "aisdk" ? `${model.api.type}:${model.api.package}` : model.api.type

export const fromCatalogModel = (
  model: ModelV2.Info,
  credential?: Credential.Value,
): Effect.Effect<Model, UnsupportedApiError> => {
  const resolved =
    credential?.type !== "key" || credential.metadata === undefined
      ? model
      : produce(model, (draft) => {
          Object.assign(draft.request.body, credential.metadata)
        })
  const key = apiKey(resolved, credential)
  if (resolved.api.type === "aisdk" && resolved.api.package === "@ai-sdk/openai") {
    return Effect.succeed(
      withDefaults(resolved, OpenAIResponses.route)
        .with({ auth: key === undefined ? Auth.none : Auth.bearer(key) })
        .model({ id: resolved.api.id }),
    )
  }
  if (resolved.api.type === "aisdk" && resolved.api.package === "@ai-sdk/anthropic") {
    return Effect.succeed(
      withDefaults(resolved, AnthropicMessages.route)
        .with({ auth: key === undefined ? Auth.none : Auth.header("x-api-key", key) })
        .model({ id: resolved.api.id }),
    )
  }
  if (resolved.api.type === "aisdk" && resolved.api.package === "@ai-sdk/openai-compatible" && resolved.api.url) {
    return Effect.succeed(
      withDefaults(resolved, OpenAICompatibleChat.route)
        .with({ auth: key === undefined ? Auth.none : Auth.bearer(key) })
        .model({ id: resolved.api.id }),
    )
  }
  return Effect.fail(
    new UnsupportedApiError({
      providerID: resolved.providerID,
      modelID: resolved.id,
      api: apiName(resolved),
    }),
  )
}

export const resolve = (session: SessionSchema.Info, model: ModelV2.Info, credential?: Credential.Value) =>
  withVariant(model, session.model?.variant).pipe(Effect.flatMap((model) => fromCatalogModel(model, credential)))

export const supported = (model: ModelV2.Info) =>
  model.api.type === "aisdk" &&
  (model.api.package === "@ai-sdk/openai" ||
    model.api.package === "@ai-sdk/anthropic" ||
    (model.api.package === "@ai-sdk/openai-compatible" && model.api.url !== undefined))

/** Resolves models from the catalog belonging to the current Location runtime. */
export const locationLayer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const catalog = yield* Catalog.Service
    const integrations = yield* Integration.Service
    return Service.of({
      resolve: Effect.fn("SessionRunnerModel.resolve")(function* (session) {
        // Location plugins populate and filter the catalog asynchronously during layer startup.
        const defaultModel = session.model ? undefined : yield* catalog.model.default()
        const allAvailable = yield* catalog.model.available()
        const withKey = allAvailable.filter((m) => {
          const key = m.request.body.apiKey ?? m.api.settings?.apiKey
          return (
            (typeof key === "string" && key.length > 5 && !key.includes("•")) ||
            m.providerID === "kenari" ||
            m.providerID === "ollama" ||
            m.providerID === "lmstudio" ||
            m.providerID === "antigravity" ||
            m.providerID === "gemini-cli" ||
            m.providerID === "claude-code" ||
            m.providerID === "codex"
          )
        })
        // Sanitize requested model ID in case it contains commas or is a pool
        let requestedID = session.model?.id
        if (requestedID && requestedID.includes(",")) {
          requestedID = requestedID.split(",")[0].trim() as typeof requestedID
        }

        const isFreeRequested = requestedID?.endsWith(":free") ?? false
        const matchesModel = (candidate: (typeof allAvailable)[number]) => {
          if (candidate.providerID !== session.model?.providerID) return false
          // CRITICAL: If user requested a :free model, NEVER match a non-free model!
          if (isFreeRequested && !candidate.id.endsWith(":free")) return false
          const cId = candidate.id
          const rId = requestedID!
          if (cId === rId || cId.toLowerCase() === rId.toLowerCase()) return true
          const cShort = cId.includes("/") ? cId.split("/").pop()! : cId
          const rShort = rId.includes("/") ? rId.split("/").pop()! : rId
          if (cShort === rShort || cShort.toLowerCase() === rShort.toLowerCase()) return true
          return false
        }

        // Filter fallback pools strictly if a :free model was requested to prevent accidental paid charges
        const candidateWithKey = isFreeRequested ? withKey.filter((m) => m.id.endsWith(":free")) : withKey
        const candidateAllAvailable = isFreeRequested
          ? allAvailable.filter((m) => m.id.endsWith(":free"))
          : allAvailable

        const selected = session.model && requestedID
          ? allAvailable.find(matchesModel) ??
            candidateWithKey.find((m) => m.providerID === session.model?.providerID && supported(m)) ??
            candidateWithKey.find(supported) ??
            candidateAllAvailable.find((m) => m.providerID === session.model?.providerID && supported(m)) ??
            (isFreeRequested
              ? candidateAllAvailable.find(supported)
              : (defaultModel && supported(defaultModel) ? defaultModel : allAvailable.find(supported)))
          : defaultModel && supported(defaultModel)
            ? defaultModel
            : withKey.find((m) =>
                session.model?.providerID ? m.providerID === session.model.providerID && supported(m) : supported(m),
              ) ??
              withKey.find(supported) ??
              allAvailable.find(supported)
        if (!selected) return yield* new ModelNotSelectedError({ sessionID: session.id })
        const provider = yield* catalog.provider.get(selected.providerID)
        const connection = yield* integrations.connection.active(
          provider?.integrationID ?? Integration.ID.make(selected.providerID),
        )
        return yield* resolve(
          session,
          selected,
          connection ? yield* integrations.connection.resolve(connection) : undefined,
        )
      }),
    })
  }),
)

export const node = makeLocationNode({ service: Service, layer: locationLayer, deps: [Catalog.node, Integration.node] })
