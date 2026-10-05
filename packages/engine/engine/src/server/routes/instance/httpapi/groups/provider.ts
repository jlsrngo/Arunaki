import { ProviderAuth } from "@/provider/auth"
import { Provider } from "@/provider/provider"

import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import {
  WorkspaceRoutingMiddleware,
  WorkspaceRoutingQuery,
  WorkspaceRoutingQueryFields,
} from "../middleware/workspace-routing"
import { described } from "./metadata"
import { ProviderV2 } from "@arunaki/core/provider"

const root = "/provider"

const ProviderAuthErrorName = Schema.Union([
  Schema.Literal("BadRequest"),
  Schema.Literal("ProviderAuthOauthMissing"),
  Schema.Literal("ProviderAuthOauthCodeMissing"),
  Schema.Literal("ProviderAuthOauthCallbackFailed"),
  Schema.Literal("ProviderAuthValidationFailed"),
])
export class ProviderAuthApiError extends Schema.ErrorClass<ProviderAuthApiError>("ProviderAuthError")(
  {
    name: ProviderAuthErrorName,
    data: Schema.Struct({
      providerID: Schema.optional(ProviderV2.ID),
      field: Schema.optional(Schema.String),
      message: Schema.optional(Schema.String),
      kind: Schema.optional(Schema.String),
    }),
  },
  { httpApiStatus: 400 },
) {}

const uiRoot = "/api/providers"

export const ProviderUI = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  type: Schema.String,
  baseUrl: Schema.String,
  apiKey: Schema.String,
  model: Schema.String,
  headerPrefix: Schema.optional(Schema.String),
  headerTitle: Schema.optional(Schema.String),
  active: Schema.Boolean,
  priority: Schema.Number,
})

export const ProviderUpsert = Schema.Struct({
  name: Schema.String,
  type: Schema.String,
  baseUrl: Schema.String,
  apiKey: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  headerPrefix: Schema.optional(Schema.String),
  headerTitle: Schema.optional(Schema.String),
})

export const ProviderTestInput = Schema.Struct({
  baseUrl: Schema.String,
  apiKey: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
})

export const ProviderFetchModelsInput = Schema.Struct({
  baseUrl: Schema.String,
  apiKey: Schema.optional(Schema.String),
})

export const ProviderStateInput = Schema.Struct({
  active: Schema.optional(Schema.Boolean),
  priority: Schema.optional(Schema.Number),
})

export const ProviderTestResult = Schema.Struct({
  success: Schema.Boolean,
  status: Schema.Number,
  error: Schema.optional(Schema.String),
  reply: Schema.optional(Schema.String),
  prompt: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
})

export const ProviderListResult = Schema.Struct({ data: Schema.Array(ProviderUI) })
export const ProviderWriteResult = Schema.Struct({ data: ProviderUI })
export const ProviderDeleteResult = Schema.Struct({ data: Schema.Struct({ id: Schema.String }) })
export const ProviderModelsResult = Schema.Struct({ data: Schema.Struct({ models: Schema.Array(Schema.String) }) })
export const ProviderTestEnvelope = Schema.Struct({ data: ProviderTestResult })
export const ProviderPingQuery = Schema.Struct({
  ...WorkspaceRoutingQueryFields,
  model: Schema.optional(Schema.String),
})

export const LocalCliStatusItem = Schema.Struct({
  installed: Schema.Boolean,
  version: Schema.optional(Schema.UndefinedOr(Schema.String)),
  loggedIn: Schema.Boolean,
  authMethod: Schema.optional(Schema.UndefinedOr(Schema.String)),
  apiProvider: Schema.optional(Schema.UndefinedOr(Schema.String)),
  email: Schema.optional(Schema.UndefinedOr(Schema.String)),
  error: Schema.optional(Schema.UndefinedOr(Schema.String)),
})

export const OpenCodeStatusItem = Schema.Struct({
  installed: Schema.Boolean,
  version: Schema.optional(Schema.UndefinedOr(Schema.String)),
  serverRunning: Schema.optional(Schema.UndefinedOr(Schema.Boolean)),
  serverPort: Schema.optional(Schema.UndefinedOr(Schema.Number)),
  authenticatedProviders: Schema.Array(Schema.String),
  hasGroq: Schema.Boolean,
  has9Router: Schema.Boolean,
  error: Schema.optional(Schema.UndefinedOr(Schema.String)),
})

export const AntigravityStatusItem = Schema.Struct({
  detected: Schema.Boolean,
  cliInstalled: Schema.optional(Schema.UndefinedOr(Schema.Boolean)),
  agyInstalled: Schema.optional(Schema.UndefinedOr(Schema.Boolean)),
  agyVersion: Schema.optional(Schema.UndefinedOr(Schema.String)),
  geminiCliInstalled: Schema.optional(Schema.UndefinedOr(Schema.Boolean)),
  geminiVersion: Schema.optional(Schema.UndefinedOr(Schema.String)),
  path: Schema.optional(Schema.UndefinedOr(Schema.String)),
  environment: Schema.String,
  loggedIn: Schema.optional(Schema.UndefinedOr(Schema.Boolean)),
  accountEmail: Schema.optional(Schema.UndefinedOr(Schema.String)),
})

export const LocalCliStatus = Schema.Struct({
  claude: LocalCliStatusItem,
  opencode: OpenCodeStatusItem,
  antigravity: AntigravityStatusItem,
  nineRouter: Schema.Struct({
    installed: Schema.optional(Schema.UndefinedOr(Schema.Boolean)),
    version: Schema.optional(Schema.UndefinedOr(Schema.String)),
    running: Schema.Boolean,
    url: Schema.String,
    models: Schema.Array(Schema.String),
  }),
  codex: Schema.optional(Schema.UndefinedOr(Schema.Struct({
    installed: Schema.Boolean,
    version: Schema.optional(Schema.UndefinedOr(Schema.String)),
    isCloudOnly: Schema.Boolean,
    message: Schema.String,
  }))),
  bridgePort: Schema.Number,
  bridgeRunning: Schema.Boolean,
})

export const LocalCliStatusEnvelope = Schema.Struct({ data: LocalCliStatus })

export const LocalCliLoginInput = Schema.Struct({
  target: Schema.Literals([
    "claude",
    "gemini",
    "antigravity",
    "antigravity-oauth",
    "antigravity-cli",
    "agy",
    "antigravity-logout",
    "opencode",
    "opencode-server",
    "opencode-terminal",
    "9router",
    "codex",
  ]),
})

export const LocalCliLoginResult = Schema.Struct({
  data: Schema.Struct({
    success: Schema.Boolean,
    message: Schema.String,
  }),
})

export const LocalCliConnectInput = Schema.Struct({
  target: Schema.Literals(["claude", "9router", "opencode", "groq-sync", "antigravity", "agy", "codex", "gemini", "gemini-cli"]),
  model: Schema.optional(Schema.UndefinedOr(Schema.String)),
})

export const LocalCliModelsInput = Schema.Struct({
  target: Schema.Literals(["claude", "9router", "opencode", "antigravity", "agy", "codex", "gemini", "gemini-cli"]),
})

export const LocalCliModelsResult = Schema.Struct({
  data: Schema.Struct({
    target: Schema.String,
    models: Schema.Array(Schema.String),
  }),
})

export const ProviderApi = HttpApi.make("provider")
  .add(
    HttpApiGroup.make("provider")
      .add(
        HttpApiEndpoint.get("list", root, {
          query: WorkspaceRoutingQuery,
          success: described(Provider.ListResult, "List of providers"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "provider.list",
            summary: "List providers",
            description: "Get a list of all available AI providers, including both available and connected ones.",
          }),
        ),
        HttpApiEndpoint.get("auth", `${root}/auth`, {
          query: WorkspaceRoutingQuery,
          success: described(ProviderAuth.Methods, "Provider auth methods"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "provider.auth",
            summary: "Get provider auth methods",
            description: "Retrieve available authentication methods for all AI providers.",
          }),
        ),
        HttpApiEndpoint.post("authorize", `${root}/:providerID/oauth/authorize`, {
          params: { providerID: ProviderV2.ID },
          query: WorkspaceRoutingQuery,
          payload: ProviderAuth.AuthorizeInput,
          success: described(Schema.UndefinedOr(ProviderAuth.Authorization), "Authorization URL and method"),
          error: ProviderAuthApiError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "provider.oauth.authorize",
            summary: "Start OAuth authorization",
            description: "Start the OAuth authorization flow for a provider.",
          }),
        ),
        HttpApiEndpoint.post("callback", `${root}/:providerID/oauth/callback`, {
          params: { providerID: ProviderV2.ID },
          query: WorkspaceRoutingQuery,
          payload: ProviderAuth.CallbackInput,
          success: described(Schema.Boolean, "OAuth callback processed successfully"),
          error: ProviderAuthApiError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "provider.oauth.callback",
            summary: "Handle OAuth callback",
            description: "Handle the OAuth callback from a provider after user authorization.",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "provider",
          description: "Experimental HttpApi provider routes.",
        }),
      )
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
    HttpApiGroup.make("providers")
      .add(
        HttpApiEndpoint.get("listUi", uiRoot, {
          query: WorkspaceRoutingQuery,
          success: described(ProviderListResult, "List configured providers"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "providers.list",
            summary: "List configured providers",
            description: "List providers saved in the workspace config, for the settings UI.",
          }),
        ),
        HttpApiEndpoint.post("upsert", uiRoot, {
          query: WorkspaceRoutingQuery,
          payload: ProviderUpsert,
          success: described(ProviderWriteResult, "Provider added"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "providers.add",
            summary: "Add provider",
            description: "Add a new OpenAI-compatible provider to the workspace config.",
          }),
        ),
        HttpApiEndpoint.put("update", `${uiRoot}/:providerID`, {
          params: { providerID: Schema.String },
          query: WorkspaceRoutingQuery,
          payload: ProviderUpsert,
          success: described(ProviderWriteResult, "Provider updated"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "providers.update",
            summary: "Update provider",
            description: "Update a configured provider's credentials and models.",
          }),
        ),
        HttpApiEndpoint.put("updateState", `${uiRoot}/:providerID/state`, {
          params: { providerID: Schema.String },
          query: WorkspaceRoutingQuery,
          payload: ProviderStateInput,
          success: described(ProviderWriteResult, "Provider state updated"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "providers.updateState",
            summary: "Update provider state",
            description: "Toggle a provider active/inactive or change its routing priority.",
          }),
        ),
        HttpApiEndpoint.delete("remove", `${uiRoot}/:providerID`, {
          params: { providerID: Schema.String },
          query: WorkspaceRoutingQuery,
          success: described(ProviderDeleteResult, "Provider deleted"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "providers.delete",
            summary: "Delete provider",
            description: "Remove a configured provider from the workspace config.",
          }),
        ),
        HttpApiEndpoint.post("testConnection", `${uiRoot}/test`, {
          query: WorkspaceRoutingQuery,
          payload: ProviderTestInput,
          success: described(ProviderTestEnvelope, "Connection test result"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "providers.test",
            summary: "Test provider connection",
            description: "Send a probe request to an OpenAI-compatible endpoint.",
          }),
        ),
        HttpApiEndpoint.post("testProvider", `${uiRoot}/:providerID/test`, {
          params: { providerID: Schema.String },
          query: ProviderPingQuery,
          success: described(ProviderTestEnvelope, "Connection test result"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "providers.testProvider",
            summary: "Test saved provider connection",
            description: "Send a probe request to a saved provider's endpoint.",
          }),
        ),
        HttpApiEndpoint.post("fetchModels", `${uiRoot}/fetch-models`, {
          query: WorkspaceRoutingQuery,
          payload: ProviderFetchModelsInput,
          success: described(ProviderModelsResult, "Discovered models"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "providers.fetchModels",
            summary: "Fetch models from endpoint",
            description: "List model IDs exposed by an OpenAI-compatible endpoint.",
          }),
        ),
        HttpApiEndpoint.get("localCliStatus", `${uiRoot}/local-cli/status`, {
          query: WorkspaceRoutingQuery,
          success: described(LocalCliStatusEnvelope, "Status of local AI CLI tools"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "providers.localCliStatus",
            summary: "Get local CLI status",
            description: "Check status of local AI coding CLI tools like Claude Code and 9Router.",
          }),
        ),
        HttpApiEndpoint.post("localCliLogin", `${uiRoot}/local-cli/login`, {
          query: WorkspaceRoutingQuery,
          payload: LocalCliLoginInput,
          success: described(LocalCliLoginResult, "Login command launch result"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "providers.localCliLogin",
            summary: "Launch local CLI login",
            description: "Launch terminal authentication for local CLI tool (e.g. Claude Code).",
          }),
        ),
        HttpApiEndpoint.post("localCliConnect", `${uiRoot}/local-cli/connect`, {
          query: WorkspaceRoutingQuery,
          payload: LocalCliConnectInput,
          success: described(ProviderWriteResult, "Provider configured and connected"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "providers.localCliConnect",
            summary: "Connect local CLI provider",
            description: "Automatically configure and activate local CLI as a provider.",
          }),
        ),
        HttpApiEndpoint.post("localCliModels", `${uiRoot}/local-cli/models`, {
          query: WorkspaceRoutingQuery,
          payload: LocalCliModelsInput,
          success: described(LocalCliModelsResult, "List of available models for local CLI"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "providers.localCliModels",
            summary: "Fetch local CLI models",
            description: "Automatically retrieve the actual available models configured for a local CLI or IDE.",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "providers",
          description: "Provider management routes for the settings UI.",
        }),
      )
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "Arunaki experimental HttpApi",
      version: "0.0.1",
      description: "Experimental HttpApi surface for selected instance routes.",
    }),
  )
