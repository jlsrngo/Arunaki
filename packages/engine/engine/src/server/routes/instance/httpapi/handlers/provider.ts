import { ProviderAuth } from "@/provider/auth"
import { Config } from "@/config/config"
import { ModelsDev } from "@arunaki/core/models-dev"
import { Provider } from "@/provider/provider"
import { Auth } from "@/auth"
import { ConfigProviderV1 } from "@arunaki/core/v1/config/provider"
import * as InstanceState from "@/effect/instance-state"
import { markInstanceForDisposal } from "../lifecycle"

import { mapValues } from "remeda"
import { Duration, Effect, Exit, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import {
  LocalCliConnectInput,
  LocalCliLoginInput,
  ProviderAuthApiError,
  ProviderFetchModelsInput,
  ProviderStateInput,
  ProviderTestInput,
  ProviderUpsert,
} from "../groups/provider"
import {
  checkAntigravityStatus,
  checkClaudeStatus,
  checkCodexStatus,
  checkNineRouterStatus,
  checkOpenCodeServerRunning,
  checkOpenCodeStatus,
  getCliSupportedModels,
  getOpenCodeGroqKey,
  launchClaudeLoginTerminal,
  launchOpenCodeServer,
  launchTerminalWithCommand,
} from "../../../../local-cli/detector"
import { localCliBridge } from "../../../../local-cli/bridge"

function mapProviderAuthError<A, R>(self: Effect.Effect<A, ProviderAuth.Error, R>) {
  return self.pipe(
    Effect.mapError((error) => {
      if (error instanceof ProviderAuth.OauthMissing) {
        return new ProviderAuthApiError({ name: error._tag, data: { providerID: error.providerID } })
      }
      if (error instanceof ProviderAuth.OauthCodeMissing) {
        return new ProviderAuthApiError({ name: error._tag, data: { providerID: error.providerID } })
      }
      if (error instanceof ProviderAuth.OauthCallbackFailed) {
        return new ProviderAuthApiError({ name: error._tag, data: {} })
      }
      if (error instanceof ProviderAuth.ValidationFailed) {
        return new ProviderAuthApiError({ name: error._tag, data: { field: error.field, message: error.message } })
      }
      return new ProviderAuthApiError({ name: "BadRequest", data: {} })
    }),
  )
}

export const providerHandlers = HttpApiBuilder.group(InstanceHttpApi, "provider", (handlers) =>
  Effect.gen(function* () {
    const cfg = yield* Config.Service
    const provider = yield* Provider.Service
    const svc = yield* ProviderAuth.Service
    const authStore = yield* Auth.Service

    const list = Effect.fn("ProviderHttpApi.list")(function* () {
      const config = yield* cfg.get()
      const all = yield* ModelsDev.Service.use((s) => s.get())
      const disabled = new Set(config.disabled_providers ?? [])
      const enabled = config.enabled_providers ? new Set(config.enabled_providers) : undefined
      const filtered: Record<string, (typeof all)[string]> = {}
      for (const [key, value] of Object.entries(all)) {
        if ((enabled ? enabled.has(key) : true) && !disabled.has(key)) filtered[key] = value
      }
      const connected = yield* provider.list()
      const credentials = yield* authStore.all().pipe(Effect.orDie)
      const providers = Object.assign(
        mapValues(filtered, (item) => Provider.fromModelsDevProvider(item)),
        connected,
      )
      return {
        all: Object.values(providers).map(Provider.toPublicInfo),
        default: Provider.defaultModelIDs(providers),
        connected: Object.keys(providers).filter((id) => id in connected || credentials[id]),
      }
    })

    const auth = Effect.fn("ProviderHttpApi.auth")(function* () {
      return yield* svc.methods()
    })

    const authorize = Effect.fn("ProviderHttpApi.authorize")(function* (ctx: {
      params: { providerID: ProviderV2.ID }
      payload: ProviderAuth.AuthorizeInput
    }) {
      return yield* mapProviderAuthError(
        svc.authorize({
          providerID: ctx.params.providerID,
          method: ctx.payload.method,
          inputs: ctx.payload.inputs,
        }),
      )
    })

    const authorizeRaw = Effect.fn("ProviderHttpApi.authorizeRaw")(function* (ctx: {
      params: { providerID: ProviderV2.ID }
      request: HttpServerRequest.HttpServerRequest
    }) {
      const body = yield* Effect.orDie(ctx.request.text)
      const payload = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(ProviderAuth.AuthorizeInput))(body).pipe(
        Effect.mapError(() => new ProviderAuthApiError({ name: "BadRequest", data: {} })),
      )
      // Match legacy route behavior: when authorize() resolves without a
      // result (e.g. no further redirect), serialize as JSON `null` instead
      // of an empty body so clients can `.json()` parse the response.
      const result = yield* authorize({ params: ctx.params, payload })
      return HttpServerResponse.jsonUnsafe(result ?? null)
    })

    const callback = Effect.fn("ProviderHttpApi.callback")(function* (ctx: {
      params: { providerID: ProviderV2.ID }
      payload: ProviderAuth.CallbackInput
    }) {
      yield* mapProviderAuthError(
        svc.callback({
          providerID: ctx.params.providerID,
          method: ctx.payload.method,
          code: ctx.payload.code,
        }),
      )
      return true
    })

    return handlers
      .handle("list", list)
      .handle("auth", auth)
      .handleRaw("authorize", authorizeRaw)
      .handle("callback", callback)
  }),
)

function providerUIItem(
  providerID: string,
  info: ConfigProviderV1.Info,
  active: boolean,
  priority: number,
) {
  const options = info.options as { headerPrefix?: string; headerTitle?: string; priority?: number } | undefined
  const model = Object.keys(info.models ?? {}).join(", ")
  return {
    id: providerID,
    name: info.name ?? providerID,
    type: providerID,
    baseUrl: info.options?.baseURL ?? "",
    apiKey: info.options?.apiKey ?? "",
    model,
    headerPrefix: options?.headerPrefix,
    headerTitle: options?.headerTitle,
    active,
    priority,
  }
}

export const providerSettingsHandlers = HttpApiBuilder.group(InstanceHttpApi, "providers", (handlers) =>
  Effect.gen(function* () {
    const cfg = yield* Config.Service
    const http = yield* HttpClient.HttpClient

    const upsert = Effect.fn("ProviderSettings.upsert")(
      function* (providerID: string, payload: Schema.Schema.Type<typeof ProviderUpsert>) {
        const modelList = (payload.model ?? "")
          .split(",")
          .map((model) => model.trim())
          .filter(Boolean)
        const models = Object.fromEntries(modelList.map((model) => [model, { id: model, name: model }]))
        const config = yield* cfg.get()
        const disabled = new Set(config.disabled_providers ?? [])
        const existing = config.provider?.[providerID]
        const priority =
          (existing?.options as { priority?: number } | undefined)?.priority ?? 0
        // PRESERVE existing valid apiKey if payload key is masked or empty
        let apiKeyToSave: string | undefined = payload.apiKey?.trim()
        if (!apiKeyToSave || apiKeyToSave.includes("•") || apiKeyToSave.includes("****") || apiKeyToSave === "Not Configured") {
          apiKeyToSave = existing?.options?.apiKey || undefined
        }
        if ((!apiKeyToSave || apiKeyToSave.includes("•")) && (providerID === "kenari" || payload.baseUrl?.includes("kenari.id"))) {
          apiKeyToSave = "kn-d4064183d620d48ada4409df456e02a4f1840f73a7541333"
        }

        const provider: ConfigProviderV1.Info = {
          id: providerID,
          name: payload.name || providerID,
          env: [],
          npm: "@ai-sdk/openai-compatible",
          options: {
            apiKey: apiKeyToSave,
            baseURL: payload.baseUrl,
            headerPrefix: payload.headerPrefix || undefined,
            headerTitle: payload.headerTitle || undefined,
            ...(priority ? { priority } : {}),
          },
          models,
        }
        yield* cfg.update({
          provider: { [providerID]: provider },
          ...(modelList.length > 0 ? { model: `${providerID}/${modelList[0]}` } : {}),
        })
        yield* markInstanceForDisposal(yield* InstanceState.context)
        return { data: providerUIItem(providerID, provider, !disabled.has(providerID), priority) }
      },
    )

    const list = Effect.fn("ProviderSettings.list")(function* () {
      const config = yield* cfg.get()
      const disabled = new Set(config.disabled_providers ?? [])
      const entries = Object.entries(config.provider ?? {}).sort((a, b) => {
        const pa = (a[1].options as { priority?: number } | undefined)?.priority ?? 0
        const pb = (b[1].options as { priority?: number } | undefined)?.priority ?? 0
        return pa - pb
      })
      return {
        data: entries.map(([providerID, info]) =>
          providerUIItem(
            providerID,
            info,
            !disabled.has(providerID),
            (info.options as { priority?: number } | undefined)?.priority ?? 0,
          ),
        ),
      }
    })

    const create = Effect.fn("ProviderSettings.create")(function* (ctx: { payload: Schema.Schema.Type<typeof ProviderUpsert> }) {
      return yield* upsert(ctx.payload.type, ctx.payload)
    })

    const update = Effect.fn("ProviderSettings.update")(function* (ctx: {
      params: { providerID: string }
      payload: Schema.Schema.Type<typeof ProviderUpsert>
    }) {
      return yield* upsert(ctx.params.providerID, ctx.payload)
    })

    const setState = Effect.fn("ProviderSettings.setState")(function* (ctx: {
      params: { providerID: string }
      payload: Schema.Schema.Type<typeof ProviderStateInput>
    }) {
      const providerID = ctx.params.providerID
      const config = yield* cfg.get()
      const disabled = new Set(config.disabled_providers ?? [])
      if (ctx.payload.active === false) disabled.add(providerID)
      if (ctx.payload.active === true) disabled.delete(providerID)
      const existing = config.provider?.[providerID]
      let priority = (existing?.options as { priority?: number } | undefined)?.priority ?? 0
      if (ctx.payload.active !== undefined || ctx.payload.priority !== undefined) {
        const patch: Partial<typeof config> = {}
        if (ctx.payload.active !== undefined) patch.disabled_providers = [...disabled]
        if (ctx.payload.priority !== undefined) {
          priority = ctx.payload.priority
          patch.provider = {
            [providerID]: {
              ...existing,
              id: providerID,
              options: { ...(existing?.options ?? {}), priority },
            },
          }
        }
        yield* cfg.update(patch)
        yield* markInstanceForDisposal(yield* InstanceState.context)
      }
      return {
        data: providerUIItem(
          providerID,
          existing ?? { id: providerID },
          ctx.payload.active === undefined ? !disabled.has(providerID) : ctx.payload.active,
          priority,
        ),
      }
    })

    const remove = Effect.fn("ProviderSettings.remove")(function* (ctx: { params: { providerID: string } }) {
      yield* cfg.deleteProvider(ctx.params.providerID)
      yield* markInstanceForDisposal(yield* InstanceState.context)
      return { data: { id: ctx.params.providerID } }
    })

    const testRequest = Effect.fn("ProviderSettings.testRequest")(
      function* (baseURL: string, apiKey: string, model: string | undefined) {
        const prompt = "Hello, connection test."
        const cleanApiKey = (apiKey ?? "").trim()
        if (cleanApiKey.includes("•") || cleanApiKey.includes("****")) {
          return {
            data: {
              success: false,
              status: 400,
              error: "API Key is masked with bullet dots (•). Please enter your actual API key in Configure.",
              prompt,
              model,
            },
          }
        }
        const base = baseURL.replace(/\/+$/, "").replace(/\/chat\/completions$/, "")
        const request = yield* HttpClientRequest.post(`${base}/chat/completions`).pipe(
          HttpClientRequest.setHeaders({
            authorization: `Bearer ${cleanApiKey}`,
            "content-type": "application/json",
          }),
          HttpClientRequest.bodyJson({
            model: model ?? "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 8,
            stream: false,
          }),
          Effect.orDie,
        )
        const res = yield* http.execute(request).pipe(Effect.timeout(Duration.seconds(25)), Effect.exit)
        if (Exit.isFailure(res)) {
          return {
            data: {
              success: false,
              status: 0,
              error: `Request failed: ${String(res.cause)}`,
              prompt,
              model,
            },
          }
        }
        const response = res.value
        const status = response.status
        if (status < 200 || status >= 300) {
          const body = yield* response.text.pipe(Effect.exit)
          return {
            data: {
              success: false,
              status,
              error:
                (Exit.isSuccess(body) ? body.value.slice(0, 200) : "") || `HTTP ${status}`,
              prompt,
              model,
            },
          }
        }
        const json = yield* response.json.pipe(Effect.exit)
        const content = (() => {
          if (Exit.isFailure(json)) return undefined
          const data = json.value as { choices?: Array<{ message?: { content?: unknown } }> }
          const value = data.choices?.[0]?.message?.content
          return typeof value === "string" ? value : undefined
        })()
        return { data: { success: true, status, reply: content, prompt, model } }
      },
    )

    const testConnection = Effect.fn("ProviderSettings.testConnection")(
      function* (ctx: { payload: Schema.Schema.Type<typeof ProviderTestInput> }) {
        let apiKey = (ctx.payload.apiKey ?? "").trim()
        if ((!apiKey || apiKey.includes("•")) && (ctx.payload.baseUrl?.includes("kenari.id"))) {
          apiKey = "kn-d4064183d620d48ada4409df456e02a4f1840f73a7541333"
        }
        return yield* testRequest(ctx.payload.baseUrl, apiKey, ctx.payload.model)
      },
    )

    const testProvider = Effect.fn("ProviderSettings.testProvider")(
      function* (ctx: {
        params: { providerID: string }
        query: { directory?: string; workspace?: string; model?: string }
      }) {
        const config = yield* cfg.get()
        const info = config.provider?.[ctx.params.providerID]
        if (!info) {
          return {
            data: { success: false, status: 404, error: `Provider not found: ${ctx.params.providerID}` },
          }
        }
        let apiKey = (info.options?.apiKey ?? "").trim()
        if ((!apiKey || apiKey.includes("•")) && (ctx.params.providerID === "kenari" || info.options?.baseURL?.includes("kenari.id"))) {
          apiKey = "kn-d4064183d620d48ada4409df456e02a4f1840f73a7541333"
          yield* cfg.update({
            provider: {
              [ctx.params.providerID]: {
                ...info,
                options: { ...(info.options ?? {}), apiKey },
              },
            },
          })
        }
        let model = ctx.query?.model?.trim()
        if (!model && config.model && typeof config.model === "string") {
          const [prov, m] = config.model.split("/")
          if (prov === ctx.params.providerID && m) {
            model = m
          }
        }
        if (!model) {
          model = Object.keys(info.models ?? {})[0]
        }
        return yield* testRequest(info.options?.baseURL ?? "", apiKey, model)
      },
    )

    const fetchModels = Effect.fn("ProviderSettings.fetchModels")(
      function* (ctx: { payload: Schema.Schema.Type<typeof ProviderFetchModelsInput> }) {
        const base = ctx.payload.baseUrl.replace(/\/+$/, "")
        const url = base.endsWith("/models") ? base : `${base}/models`
        let apiKey = (ctx.payload.apiKey ?? "").trim()
        if ((!apiKey || apiKey.includes("•")) && url.includes("kenari.id")) {
          apiKey = "kn-d4064183d620d48ada4409df456e02a4f1840f73a7541333"
        }
        const request = HttpClientRequest.get(url).pipe(
          HttpClientRequest.setHeaders({ authorization: `Bearer ${apiKey}` }),
        )
        const res = yield* http.execute(request).pipe(Effect.timeout(Duration.seconds(8)), Effect.exit)
        if (Exit.isFailure(res)) return { data: { models: [] } }
        const response = res.value
        if (response.status < 200 || response.status >= 300) return { data: { models: [] } }
        const json = yield* response.json.pipe(Effect.exit)
        const models = (() => {
          if (Exit.isFailure(json)) return [] as string[]
          const data = json.value as { data?: Array<{ id?: unknown }> }
          return (data.data ?? [])
            .map((model) => (typeof model?.id === "string" ? model.id : ""))
            .filter((id) => {
              if (!id) return false
              const lower = id.toLowerCase()
              if (lower.includes("whisper")) return false
              if (lower.includes("prompt-guard") || lower.includes("safeguard")) return false
              if (lower.includes("orpheus")) return false
              if (lower.includes("embedding") || lower.includes("moderation")) return false
              if (lower.includes("tts") || lower.includes("audio")) return false
              return true
            })
        })()
        return { data: { models } }
      },
    )

    const localCliStatus = Effect.fn("ProviderSettings.localCliStatus")(function* () {
      const [claude, opencode, opencodeRunning, nineRouter, codex] = yield* Effect.promise(() =>
        Promise.all([
          checkClaudeStatus(),
          checkOpenCodeStatus(),
          checkOpenCodeServerRunning(4097),
          checkNineRouterStatus(),
          checkCodexStatus(),
        ]),
      )
      const antigravity = checkAntigravityStatus()
      return {
        data: {
          claude,
          opencode: {
            ...opencode,
            serverRunning: opencodeRunning,
            serverPort: 4097,
          },
          antigravity,
          nineRouter,
          codex,
          bridgePort: localCliBridge.port,
          bridgeRunning: localCliBridge.running,
        },
      }
    })

    const localCliLogin = Effect.fn("ProviderSettings.localCliLogin")(
      function* (ctx: { payload: Schema.Schema.Type<typeof LocalCliLoginInput> }) {
        if (ctx.payload.target === "claude") {
          const res = launchClaudeLoginTerminal()
          return { data: res }
        }
        if (ctx.payload.target === "opencode" || ctx.payload.target === "opencode-terminal" || ctx.payload.target === "opencode-server") {
          const res = launchTerminalWithCommand("opencode", "OpenCode Interactive Terminal")
          return { data: res }
        }
        if (ctx.payload.target === "9router") {
          const res = launchTerminalWithCommand("9router start", "9Router Local Gateway")
          return { data: res }
        }
        if (ctx.payload.target === "codex") {
          const res = launchTerminalWithCommand("codex", "OpenAI Codex CLI (ChatGPT)")
          return { data: res }
        }
        if (ctx.payload.target === "antigravity" || ctx.payload.target === "agy") {
          const res = launchTerminalWithCommand("agy --help", "Google Antigravity CLI (agy)")
          return { data: res }
        }
        if (ctx.payload.target === "gemini" || ctx.payload.target === "gemini-cli") {
          const res = launchTerminalWithCommand("gemini", "Google Gemini CLI")
          return { data: res }
        }
        return { data: { success: false, message: `Unsupported target: ${ctx.payload.target}` } }
      },
    )

    const localCliConnect = Effect.fn("ProviderSettings.localCliConnect")(
      function* (ctx: { payload: Schema.Schema.Type<typeof LocalCliConnectInput> }) {
        yield* Effect.promise(() => localCliBridge.start())
        if (ctx.payload.target === "claude") {
          const status = yield* Effect.promise(() => checkClaudeStatus())
          if (!status.installed) {
            return yield* HttpApiError.badRequest({ message: "Claude Code CLI is not installed on this system." })
          }
          return yield* upsert("claude-code", {
            name: "Claude Code CLI (Local Subscription)",
            type: "openai-compatible",
            baseUrl: `http://127.0.0.1:${localCliBridge.port}/v1`,
            apiKey: "claude-pro-subscription",
            model: "claude-3-7-sonnet, claude-3-5-sonnet, claude-3-5-haiku",
          })
        }
        if (ctx.payload.target === "opencode") {
          const status = yield* Effect.promise(() => checkOpenCodeStatus())
          if (!status.installed) {
            return yield* HttpApiError.badRequest({ message: "OpenCode CLI is not installed." })
          }
          return yield* upsert("opencode", {
            name: "OpenCode CLI Agent",
            type: "openai-compatible",
            baseUrl: "http://localhost:20128/v1",
            apiKey: "opencode-local-session",
            model: "claude-3-5-sonnet, deepseek-r1, llama-3.3-70b-versatile",
          })
        }
        if (ctx.payload.target === "groq-sync") {
          const key = getOpenCodeGroqKey()
          if (!key) {
            return yield* HttpApiError.badRequest({ message: "No Groq API key found in OpenCode auth cache." })
          }
          return yield* upsert("groq", {
            name: "Groq Cloud (Synced from OpenCode)",
            type: "groq",
            baseUrl: "https://api.groq.com/openai/v1",
            apiKey: key,
            model: "llama-3.3-70b-versatile, deepseek-r1-distill-llama-70b",
          })
        }
        if (ctx.payload.target === "9router") {
          return yield* upsert("9router", {
            name: "9Router Gateway",
            type: "openai-compatible",
            baseUrl: "http://localhost:20128/v1",
            apiKey: "9router",
            model: ctx.payload.model || "claude-3-5-sonnet, deepseek-r1",
          })
        }
        if (ctx.payload.target === "antigravity" || ctx.payload.target === "agy" || ctx.payload.target === "gemini" || ctx.payload.target === "gemini-cli") {
          localCliBridge.prewarmAgyWorker()
          return yield* upsert("antigravity", {
            name: "Google Antigravity CLI (Local Subscription)",
            type: "openai-compatible",
            baseUrl: `http://127.0.0.1:${localCliBridge.port}/v1`,
            apiKey: "antigravity-local-session",
            model: ctx.payload.model || "gemini-3.8-flash, gemini-2.5-flash, gemini-2.5-pro",
          })
        }
        if (ctx.payload.target === "codex") {
          return yield* upsert("codex", {
            name: "OpenAI Codex Agent",
            type: "openai-compatible",
            baseUrl: "https://api.openai.com/v1",
            apiKey: "codex-active",
            model: ctx.payload.model || "o3-mini, o1, gpt-4o, gpt-4o-mini",
          })
        }
        return yield* HttpApiError.badRequest({ message: "Invalid target" })
      },
    )

    const localCliModels = Effect.fnUntraced(
      function* (ctx: { readonly payload: { readonly target: "claude" | "9router" | "opencode" | "antigravity" | "agy" | "codex" | "gemini" | "gemini-cli" } }) {
        const models = yield* Effect.promise(() => getCliSupportedModels(ctx.payload.target))
        return {
          data: {
            target: ctx.payload.target,
            models,
          },
        }
      },
    )

    return handlers
      .handle("listUi", list)
      .handle("upsert", create)
      .handle("update", update)
      .handle("updateState", setState)
      .handle("remove", remove)
      .handle("testConnection", testConnection)
      .handle("testProvider", testProvider)
      .handle("fetchModels", fetchModels)
      .handle("localCliStatus", localCliStatus)
      .handle("localCliLogin", localCliLogin)
      .handle("localCliConnect", localCliConnect)
      .handle("localCliModels", localCliModels)
  }),
)
