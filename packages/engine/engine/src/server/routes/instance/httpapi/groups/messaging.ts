import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi";
import { Authorization } from "../middleware/authorization";
import { InstanceContextMiddleware } from "../middleware/instance-context";
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing";
import { described } from "./metadata";

export const TelegramConfigSchema = Schema.Struct({
  enabled: Schema.Boolean,
  botToken: Schema.String,
  allowedUserId: Schema.String,
  targetFolder: Schema.optional(Schema.String),
}).annotate({ identifier: "TelegramConfig" });

export const MessagingConfigSchema = Schema.Struct({
  telegram: TelegramConfigSchema,
}).annotate({ identifier: "MessagingConfig" });

export const TelegramStatusSchema = Schema.Struct({
  connected: Schema.Boolean,
  botUsername: Schema.NullOr(Schema.String),
  botFirstName: Schema.NullOr(Schema.String),
  lastActive: Schema.NullOr(Schema.Number),
  lastError: Schema.NullOr(Schema.String),
}).annotate({ identifier: "TelegramStatus" });

export const MessagingStatusSchema = Schema.Struct({
  telegram: TelegramStatusSchema,
}).annotate({ identifier: "MessagingStatus" });

export const TestTelegramPayload = Schema.Struct({
  botToken: Schema.String,
}).annotate({ identifier: "TestTelegramPayload" });

export const TestTelegramResult = Schema.Struct({
  success: Schema.Boolean,
  botUsername: Schema.optional(Schema.String),
  botFirstName: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
}).annotate({ identifier: "TestTelegramResult" });

export const ActiveSessionPayload = Schema.Struct({
  sessionID: Schema.String,
  directory: Schema.String,
}).annotate({ identifier: "ActiveSessionPayload" });

const root = "/messaging";
const uiRoot = "/api/messaging";

export const MessagingApi = HttpApi.make("messaging")
  .add(
    HttpApiGroup.make("messaging")
      .add(
        HttpApiEndpoint.get("getConfig", `${root}/config`, {
          query: WorkspaceRoutingQuery,
          success: described(MessagingConfigSchema, "Get messaging configuration"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "messaging.getConfig",
            summary: "Get messaging configuration",
            description: "Retrieve external messaging apps (e.g. Telegram BYOB) configuration settings.",
          })
        ),

        HttpApiEndpoint.post("updateConfig", `${root}/config`, {
          query: WorkspaceRoutingQuery,
          payload: MessagingConfigSchema,
          success: described(MessagingConfigSchema, "Successfully updated messaging configuration"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "messaging.updateConfig",
            summary: "Update messaging configuration",
            description: "Update external messaging apps configuration and reload active gateway listeners.",
          })
        ),

        HttpApiEndpoint.get("getStatus", `${root}/status`, {
          query: WorkspaceRoutingQuery,
          success: described(MessagingStatusSchema, "Get messaging status"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "messaging.getStatus",
            summary: "Get messaging status",
            description: "Check live connection status and metadata for messaging gateways.",
          })
        ),

        HttpApiEndpoint.post("testConnection", `${root}/test`, {
          query: WorkspaceRoutingQuery,
          payload: TestTelegramPayload,
          success: described(TestTelegramResult, "Test bot token connection result"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "messaging.testConnection",
            summary: "Test bot connection",
            description: "Verify a Telegram bot token against the Telegram API without saving.",
          })
        ),

        HttpApiEndpoint.post("setActiveSession", `${root}/active-session`, {
          query: WorkspaceRoutingQuery,
          payload: ActiveSessionPayload,
          success: described(Schema.Boolean, "Active session set"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "messaging.setActiveSession",
            summary: "Set active workstation session",
            description: "Inform messaging gateways of the active workstation session for a directory.",
          })
        )
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "messaging",
          description: "HttpApi messaging gateway routes.",
        })
      )
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization)
  )
  .add(
    HttpApiGroup.make("messagingUi")
      .add(
        HttpApiEndpoint.get("getConfig", `${uiRoot}/config`, {
          query: WorkspaceRoutingQuery,
          success: described(MessagingConfigSchema, "Get messaging configuration"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "messagingUi.getConfig",
            summary: "Get messaging configuration (UI alias)",
            description: "Retrieve external messaging apps configuration settings via /api prefix.",
          })
        ),

        HttpApiEndpoint.post("updateConfig", `${uiRoot}/config`, {
          query: WorkspaceRoutingQuery,
          payload: MessagingConfigSchema,
          success: described(MessagingConfigSchema, "Successfully updated messaging configuration"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "messagingUi.updateConfig",
            summary: "Update messaging configuration (UI alias)",
            description: "Update external messaging apps configuration via /api prefix.",
          })
        ),

        HttpApiEndpoint.get("getStatus", `${uiRoot}/status`, {
          query: WorkspaceRoutingQuery,
          success: described(MessagingStatusSchema, "Get messaging status"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "messagingUi.getStatus",
            summary: "Get messaging status (UI alias)",
            description: "Check live connection status and metadata for messaging gateways via /api prefix.",
          })
        ),

        HttpApiEndpoint.post("testConnection", `${uiRoot}/test`, {
          query: WorkspaceRoutingQuery,
          payload: TestTelegramPayload,
          success: described(TestTelegramResult, "Test bot token connection result"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "messagingUi.testConnection",
            summary: "Test bot connection (UI alias)",
            description: "Verify a Telegram bot token via /api prefix.",
          })
        ),

        HttpApiEndpoint.post("setActiveSession", `${uiRoot}/active-session`, {
          query: WorkspaceRoutingQuery,
          payload: ActiveSessionPayload,
          success: described(Schema.Boolean, "Active session set"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "messagingUi.setActiveSession",
            summary: "Set active workstation session (UI alias)",
            description: "Inform messaging gateways of the active workstation session for a directory via /api prefix.",
          })
        )
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "messagingUi",
          description: "HttpApi UI messaging gateway routes.",
        })
      )
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization)
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "Arunaki Messaging HttpApi",
      version: "0.0.1",
      description: "Messaging gateway integration surface.",
    })
  );
