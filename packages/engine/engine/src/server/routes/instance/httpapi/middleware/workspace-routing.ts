import { WorkspaceV2 } from "@arunaki/core/workspace"
import { Session } from "@/session/session"
import { getWorkspaceRouteSessionID } from "@/server/shared/workspace-routing"
import { NotFoundError } from "@/storage/storage"
import { Flag } from "@arunaki/core/flag/flag"
import { Context, Data, Effect, Layer, Option, Schema } from "effect"
import * as os from "node:os"
import * as path from "node:path"
import * as fs from "node:fs"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiMiddleware } from "effect/unstable/httpapi"
import { InvalidRequestError } from "../errors"

// Query fields this middleware reads from the URL. Spread into every
// endpoint query schema in groups that apply WorkspaceRoutingMiddleware,
// otherwise HttpApi rejects requests carrying these params with 400.
// HttpApiMiddleware in effect-smol cannot declare query params today —
// remove this once upstream supports middleware-declared query schemas.
export const WorkspaceRoutingQueryFields = {
  directory: Schema.optional(Schema.String),
  workspace: Schema.optional(Schema.String),
}

export const WorkspaceRoutingQuery = Schema.Struct(WorkspaceRoutingQueryFields)

// Arunaki is agent-per-folder: every request is routed locally. The remote
// sandbox proxy and Workspace service machinery were removed — this router
// only resolves the local directory and an optional workspace id from the
// request, session, or environment.
type RequestPlan = Data.TaggedEnum<{
  InvalidWorkspace: {}
  Local: { readonly directory: string; readonly workspaceID?: WorkspaceV2.ID }
}>
const RequestPlan = Data.taggedEnum<RequestPlan>()
const InvalidWorkspaceID = Symbol("InvalidWorkspaceID")

export class WorkspaceRouteContext extends Context.Service<
  WorkspaceRouteContext,
  {
    readonly directory: string
    readonly workspaceID?: WorkspaceV2.ID
  }
>()("@arunaki/ExperimentalHttpApiWorkspaceRouteContext") {}

export class WorkspaceRoutingMiddleware extends HttpApiMiddleware.Service<
  WorkspaceRoutingMiddleware,
  {
    provides: WorkspaceRouteContext
    requires: Session.Service
  }
>()("@arunaki/ExperimentalHttpApiWorkspaceRouting") {}

function requestURL(request: HttpServerRequest.HttpServerRequest): URL {
  return new URL(request.url, "http://localhost")
}

function configuredWorkspaceID(): WorkspaceV2.ID | undefined {
  return Flag.Arunaki_WORKSPACE_ID ? WorkspaceV2.ID.make(Flag.Arunaki_WORKSPACE_ID) : undefined
}

function selectedWorkspaceID(url: URL, sessionWorkspaceID?: WorkspaceV2.ID): WorkspaceV2.ID | undefined {
  const workspaceParam = url.searchParams.get("workspace")
  return sessionWorkspaceID ?? (workspaceParam ? WorkspaceV2.ID.make(workspaceParam) : undefined)
}

function selectedV2WorkspaceID(
  url: URL,
  sessionWorkspaceID?: WorkspaceV2.ID,
): WorkspaceV2.ID | typeof InvalidWorkspaceID | undefined {
  if (sessionWorkspaceID) return sessionWorkspaceID
  const workspaceParam = url.searchParams.get("workspace")
  if (!workspaceParam) return undefined
  const workspaceID = Schema.decodeUnknownOption(WorkspaceV2.ID)(workspaceParam)
  if (Option.isNone(workspaceID)) return InvalidWorkspaceID
  return workspaceID.value
}

function defaultDirectory(request: HttpServerRequest.HttpServerRequest, url: URL): string {
  const dir =
    url.searchParams.get("directory") ||
    request.headers["x-arunaki-directory"] ||
    request.headers["x-directory"] ||
    request.headers["x-folder"] ||
    request.headers["x-workspace-directory"]
  if (dir) return dir
  
  const scratchDir = path.join(os.homedir(), ".arunaki", "scratch")
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true })
  }
  return scratchDir
}

function planRequest(
  request: HttpServerRequest.HttpServerRequest,
  session?: Session.Info,
): Effect.Effect<RequestPlan> {
  const url = requestURL(request)
  const envWorkspaceID = configuredWorkspaceID()
  const workspaceID = url.pathname.startsWith("/api/")
    ? selectedV2WorkspaceID(url, session?.workspaceID)
    : selectedWorkspaceID(url, session?.workspaceID)
  if (workspaceID === InvalidWorkspaceID) return Effect.succeed(RequestPlan.InvalidWorkspace())
  return Effect.succeed(
    RequestPlan.Local({
      directory:
        ((session as any)?.location?.directory as string | undefined) ||
        session?.directory ||
        defaultDirectory(request, url),
      workspaceID: envWorkspaceID ?? workspaceID,
    }),
  )
}

function routeWorkspace<E>(
  effect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, WorkspaceRouteContext>,
  plan: RequestPlan,
): Effect.Effect<HttpServerResponse.HttpServerResponse, E> {
  return RequestPlan.$match(plan, {
    InvalidWorkspace: () =>
      Effect.succeed(
        HttpServerResponse.jsonUnsafe(
          new InvalidRequestError({
            message: "Invalid workspace query parameter",
            kind: "Query",
            field: "workspace",
          }),
          { status: 400 },
        ),
      ),
    Local: ({ directory, workspaceID }) =>
      effect.pipe(Effect.provideService(WorkspaceRouteContext, WorkspaceRouteContext.of({ directory, workspaceID }))),
  })
}

function routeHttpApiWorkspace<E>(
  effect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, WorkspaceRouteContext>,
): Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  E,
  Session.Service | HttpServerRequest.HttpServerRequest
> {
  return Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const sessionID = getWorkspaceRouteSessionID(requestURL(request))
    const session = sessionID
      ? yield* Session.Service.use((svc) => svc.get(sessionID)).pipe(
          Effect.catchIf(
            (error): error is NotFoundError => NotFoundError.isInstance(error),
            () => Effect.succeed(undefined),
          ),
          Effect.catchDefect(() => Effect.succeed(undefined)),
        )
      : undefined
    const plan = yield* planRequest(request, session)
    return yield* routeWorkspace(effect, plan)
  })
}

export const workspaceRoutingLayer = Layer.effect(
  WorkspaceRoutingMiddleware,
  Effect.gen(function* () {
    return WorkspaceRoutingMiddleware.of((effect) => routeHttpApiWorkspace(effect))
  }),
)