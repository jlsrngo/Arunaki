import { Cause, Context, Effect, Layer, Random } from "effect"
import {
  FetchHttpClient,
  Headers,
  HttpClient,
  HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http"
import {
  AuthenticationReason,
  ContentPolicyReason,
  HttpContext,
  HttpRateLimitDetails,
  HttpRequestDetails,
  HttpResponseDetails,
  InvalidRequestReason,
  LLMError,
  ProviderInternalReason,
  QuotaExceededReason,
  RateLimitReason,
  TransportReason,
  UnknownProviderReason,
} from "../schema"
import { isContextOverflow } from "../provider-error"

export interface Interface {
  readonly execute: (
    request: HttpClientRequest.HttpClientRequest,
  ) => Effect.Effect<HttpClientResponse.HttpClientResponse, LLMError>
}

export class Service extends Context.Service<Service, Interface>()("@arunaki/LLM/RequestExecutor") {}

const BODY_LIMIT = 16_384
const MAX_RETRIES = 2
const BASE_DELAY_MS = 500
const MAX_DELAY_MS = 10_000
const REDACTED = "<redacted>"

// One source of truth for what counts as a sensitive name across headers,
// URL query keys, and field names embedded inside request/response bodies.
//
// `SENSITIVE_NAME` is used as both a substring matcher (for free-form header
// names like `Authorization` / `X-API-Key`) and as the body-field alternation
// list. `SHORT_QUERY_NAME` covers anchored short keys like `?key=…` / `?sig=…`
// that are too generic to redact substring-style without false positives.
const SENSITIVE_NAME_SOURCE =
  "authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|token|secret|credential|signature|x-amz-signature"
const SENSITIVE_NAME = new RegExp(SENSITIVE_NAME_SOURCE, "i")
const SHORT_QUERY_NAME = /^(key|sig)$/i
const SENSITIVE_BODY_FIELD = new RegExp(`(?:${SENSITIVE_NAME_SOURCE}|key)`, "i")
const REDACT_JSON_FIELD = new RegExp(`("(?:${SENSITIVE_BODY_FIELD.source})"\\s*:\\s*)"[^"]*"`, "gi")
const REDACT_QUERY_FIELD = new RegExp(`((?:${SENSITIVE_BODY_FIELD.source})=)[^&\\s"]+`, "gi")

const isSensitiveHeaderName = (name: string) => SENSITIVE_NAME.test(name)

const isSensitiveQueryName = (name: string) => isSensitiveHeaderName(name) || SHORT_QUERY_NAME.test(name)

const redactHeaders = (headers: Headers.Headers, redactedNames: ReadonlyArray<string | RegExp>) =>
  Object.fromEntries(
    Object.entries(Headers.redact(headers, [...redactedNames, SENSITIVE_NAME])).map(([name, value]) => [
      name,
      String(value),
    ]),
  )

const redactUrl = (value: string) => {
  if (!URL.canParse(value)) return REDACTED
  const url = new URL(value)
  url.searchParams.forEach((_, key) => {
    if (isSensitiveQueryName(key)) url.searchParams.set(key, REDACTED)
  })
  return url.toString()
}

const normalizedHeaders = (headers: Headers.Headers) =>
  Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))

const requestId = (headers: Record<string, string>) => {
  return (
    headers["x-request-id"] ??
    headers["request-id"] ??
    headers["x-amzn-requestid"] ??
    headers["x-amz-request-id"] ??
    headers["x-goog-request-id"] ??
    headers["cf-ray"]
  )
}

const retryableStatus = (status: number) => status === 429 || status === 503 || status === 504 || status === 529

const retryAfterMs = (headers: Record<string, string>) => {
  const millis = Number(headers["retry-after-ms"])
  if (Number.isFinite(millis)) return Math.max(0, millis)

  const value = headers["retry-after"]
  if (!value) return undefined

  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)

  const date = Date.parse(value)
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now())
  return undefined
}

const addRateLimitValue = (target: Record<string, string>, key: string, value: string) => {
  if (key.length > 0) target[key] = value
}

const rateLimitDetails = (headers: Record<string, string>, retryAfter: number | undefined) => {
  const limit: Record<string, string> = {}
  const remaining: Record<string, string> = {}
  const reset: Record<string, string> = {}

  Object.entries(headers).forEach(([name, value]) => {
    const openaiLimit = /^x-ratelimit-limit-(.+)$/.exec(name)?.[1]
    if (openaiLimit) return addRateLimitValue(limit, openaiLimit, value)

    const openaiRemaining = /^x-ratelimit-remaining-(.+)$/.exec(name)?.[1]
    if (openaiRemaining) return addRateLimitValue(remaining, openaiRemaining, value)

    const openaiReset = /^x-ratelimit-reset-(.+)$/.exec(name)?.[1]
    if (openaiReset) return addRateLimitValue(reset, openaiReset, value)

    const anthropic = /^anthropic-ratelimit-(.+)-(limit|remaining|reset)$/.exec(name)
    if (!anthropic) return
    if (anthropic[2] === "limit") return addRateLimitValue(limit, anthropic[1], value)
    if (anthropic[2] === "remaining") return addRateLimitValue(remaining, anthropic[1], value)
    return addRateLimitValue(reset, anthropic[1], value)
  })

  if (
    retryAfter === undefined &&
    Object.keys(limit).length === 0 &&
    Object.keys(remaining).length === 0 &&
    Object.keys(reset).length === 0
  )
    return undefined

  return new HttpRateLimitDetails({
    retryAfterMs: retryAfter,
    limit: Object.keys(limit).length === 0 ? undefined : limit,
    remaining: Object.keys(remaining).length === 0 ? undefined : remaining,
    reset: Object.keys(reset).length === 0 ? undefined : reset,
  })
}

const requestDetails = (request: HttpClientRequest.HttpClientRequest, redactedNames: ReadonlyArray<string | RegExp>) =>
  new HttpRequestDetails({
    method: request.method,
    url: redactUrl(request.url),
    headers: redactHeaders(request.headers, redactedNames),
  })

const responseDetails = (
  response: HttpClientResponse.HttpClientResponse,
  redactedNames: ReadonlyArray<string | RegExp>,
) =>
  new HttpResponseDetails({
    status: response.status,
    headers: redactHeaders(response.headers, redactedNames),
  })

const secretValues = (request: HttpClientRequest.HttpClientRequest) => {
  const values = new Set<string>()
  const add = (value: string) => {
    if (value.length < 4) return
    values.add(value)
    values.add(encodeURIComponent(value))
  }

  Object.entries(request.headers).forEach(([name, value]) => {
    if (!isSensitiveHeaderName(name)) return
    add(value)
    const bearer = /^Bearer\s+(.+)$/i.exec(value)?.[1]
    if (bearer) add(bearer)
  })

  if (!URL.canParse(request.url)) return values
  new URL(request.url).searchParams.forEach((value, key) => {
    if (isSensitiveQueryName(key)) add(value)
  })
  return values
}

// Two passes: structural (redact `"name": "value"` and `name=value` patterns
// for any field name that looks sensitive) plus literal (replace any actual
// secret values we sent in the request, in case the response echoes one back).
const redactBody = (body: string, request: HttpClientRequest.HttpClientRequest) =>
  Array.from(secretValues(request)).reduce(
    (text, secret) => text.split(secret).join(REDACTED),
    body.replace(REDACT_JSON_FIELD, `$1"${REDACTED}"`).replace(REDACT_QUERY_FIELD, `$1${REDACTED}`),
  )

const responseBody = (body: string | void, request: HttpClientRequest.HttpClientRequest) => {
  if (body === undefined) return {}
  const redacted = redactBody(body, request)
  if (redacted.length <= BODY_LIMIT) return { body: redacted }
  return { body: redacted.slice(0, BODY_LIMIT), bodyTruncated: true }
}

/**
 * A provider error the user can act on.
 *
 * The body is nearly always JSON, and it was being handed over verbatim:
 *
 *   Provider request failed with HTTP 429: {"error":{"message":"Individual quota
 *   reached ... Resets in 2h41m6s.","type":"quota_exceeded"}}
 *
 * The sentence inside is the entire answer; the braces and key names are not, and they were all the
 * user had to read. Pull the message out when the body is shaped like an error, and fall back to the
 * raw text when it is not - a body that genuinely is not JSON still has to reach whoever can debug
 * it.
 */
const providerMessage = (status: number, body: { readonly body?: string }) => {
  const raw = body.body
  if (!raw || raw.length > 500) return `Provider request failed with HTTP ${status}`
  try {
    const parsed = JSON.parse(raw)
    const message =
      (typeof parsed?.error === "string" ? parsed.error : undefined) ??
      parsed?.error?.message ??
      parsed?.message ??
      (typeof parsed?.detail === "string" ? parsed.detail : undefined)
    if (typeof message === "string" && message.trim())
      return `Provider request failed with HTTP ${status}: ${message.trim()}`
  } catch {}
  return `Provider request failed with HTTP ${status}: ${raw}`
}

const responseHttp = (input: {
  readonly request: HttpClientRequest.HttpClientRequest
  readonly response: HttpClientResponse.HttpClientResponse
  readonly redactedNames: ReadonlyArray<string | RegExp>
  readonly body: ReturnType<typeof responseBody>
  readonly requestId?: string | undefined
  readonly rateLimit?: HttpRateLimitDetails | undefined
}) =>
  new HttpContext({
    request: requestDetails(input.request, input.redactedNames),
    response: responseDetails(input.response, input.redactedNames),
    ...input.body,
    requestId: input.requestId,
    rateLimit: input.rateLimit,
  })

const statusReason = (input: {
  readonly status: number
  readonly message: string
  readonly retryAfterMs?: number | undefined
  readonly rateLimit?: HttpRateLimitDetails | undefined
  readonly http: HttpContext
}) => {
  const body = input.http.body ?? ""
  if (/content[-_\s]?policy|content_filter|safety/i.test(body)) {
    return new ContentPolicyReason({ message: input.message, http: input.http })
  }
  if (input.status === 401) {
    return new AuthenticationReason({ message: input.message, kind: "invalid", http: input.http })
  }
  if (input.status === 403) {
    return new AuthenticationReason({ message: input.message, kind: "insufficient-permissions", http: input.http })
  }
  if (input.status === 429) {
    if (/insufficient[-_\s]?quota|quota[-_\s]?exceeded/i.test(body)) {
      return new QuotaExceededReason({ message: input.message, http: input.http })
    }
    return new RateLimitReason({
      message: input.message,
      retryAfterMs: input.retryAfterMs,
      rateLimit: input.rateLimit,
      http: input.http,
    })
  }
  if (
    input.status === 400 ||
    input.status === 404 ||
    input.status === 409 ||
    input.status === 413 ||
    input.status === 422
  ) {
    return new InvalidRequestReason({
      message: input.message,
      classification: isContextOverflow(body) ? "context-overflow" : undefined,
      http: input.http,
    })
  }
  if (input.status >= 500 || retryableStatus(input.status)) {
    return new ProviderInternalReason({
      message: input.message,
      status: input.status,
      retryAfterMs: input.retryAfterMs,
      http: input.http,
    })
  }
  return new UnknownProviderReason({ message: input.message, status: input.status, http: input.http })
}

const statusError =
  (request: HttpClientRequest.HttpClientRequest, redactedNames: ReadonlyArray<string | RegExp>) =>
  (response: HttpClientResponse.HttpClientResponse) =>
    Effect.gen(function* () {
      if (response.status < 400) return response
      const body = yield* response.text.pipe(Effect.catch(() => Effect.void))
      const headers = normalizedHeaders(response.headers)
      const retryAfter = retryAfterMs(headers)
      const rateLimit = rateLimitDetails(headers, retryAfter)
      const details = responseBody(body, request)
      return yield* new LLMError({
        module: "RequestExecutor",
        method: "execute",
        reason: statusReason({
          status: response.status,
          message: providerMessage(response.status, details),
          retryAfterMs: retryAfter,
          rateLimit,
          http: responseHttp({
            request,
            response,
            redactedNames,
            body: details,
            requestId: requestId(headers),
            rateLimit,
          }),
        }),
      })
    })

const formatTransportErrorMessage = (
  request: HttpClientRequest.HttpClientRequest | undefined,
  cause: unknown,
  description?: string,
): string => {
  const url = request?.url
  const endpoint = url && URL.canParse(url) ? new URL(url).host : url
  const isLocal =
    endpoint !== undefined &&
    (endpoint.startsWith("localhost") ||
      endpoint.startsWith("127.0.0.1") ||
      endpoint.startsWith("0.0.0.0") ||
      endpoint.startsWith("[::1]"))

  const causeObj = cause && typeof cause === "object" ? (cause as Record<string, unknown>) : undefined
  const nestedCause = causeObj && typeof causeObj.cause === "object" ? (causeObj.cause as Record<string, unknown>) : undefined
  const code =
    typeof causeObj?.code === "string"
      ? causeObj.code
      : typeof nestedCause?.code === "string"
        ? nestedCause.code
        : undefined
  const causeMsg =
    typeof causeObj?.message === "string"
      ? causeObj.message
      : typeof cause === "string"
        ? cause
        : undefined

  const isConnRefused =
    code === "ConnectionRefused" ||
    code === "ECONNREFUSED" ||
    /connection refused|unable to connect/i.test(causeMsg ?? "")

  const isDnsFailure =
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    /getaddrinfo ENOTFOUND|could not resolve/i.test(causeMsg ?? "")

  const isTimedOut =
    code === "ETIMEDOUT" ||
    code === "TimeoutError" ||
    /timed? ?out/i.test(causeMsg ?? "")

  if (endpoint) {
    if (isConnRefused) {
      return isLocal
        ? `Could not connect to ${endpoint}: connection refused. Is the local service running?`
        : `Could not connect to ${endpoint}: connection refused.`
    }
    if (isDnsFailure) {
      return `Could not resolve host ${endpoint}. Check your network connection.`
    }
    if (isTimedOut) {
      return `Connection to ${endpoint} timed out.`
    }
    if (description && description.trim()) {
      return `Could not reach ${endpoint}: ${description.trim()}`
    }
    if (causeMsg && !/fetch failed/i.test(causeMsg.trim())) {
      return `Could not reach ${endpoint}: ${causeMsg.trim()}`
    }
    return `Could not reach ${endpoint}: network transport failed`
  }

  if (description && description.trim()) {
    return description.trim()
  }
  if (causeMsg && !/fetch failed/i.test(causeMsg.trim())) {
    return causeMsg.trim()
  }
  return "HTTP transport failed"
}

const toHttpError =
  (redactedNames: ReadonlyArray<string | RegExp>, req?: HttpClientRequest.HttpClientRequest) =>
  (error: unknown) => {
    const request = req ?? (error && typeof error === "object" && "request" in error ? (error as any).request : undefined)
    const cause =
      error &&
      typeof error === "object" &&
      "reason" in error &&
      (error as any).reason &&
      typeof (error as any).reason === "object" &&
      "cause" in (error as any).reason
        ? (error as any).reason.cause
        : error && typeof error === "object" && "cause" in error
          ? (error as any).cause
          : undefined

    const transportError = (input: {
      readonly message: string
      readonly kind?: string | undefined
      readonly request?: HttpClientRequest.HttpClientRequest | undefined
    }) =>
      new LLMError({
        module: "RequestExecutor",
        method: "execute",
        reason: new TransportReason({
          message: input.message,
          kind: input.kind,
          url: input.request ? redactUrl(input.request.url) : undefined,
          http: input.request ? new HttpContext({ request: requestDetails(input.request, redactedNames) }) : undefined,
        }),
      })

    if (Cause.isTimeoutError(error)) {
      const endpoint = request?.url && URL.canParse(request.url) ? new URL(request.url).host : request?.url
      const message = endpoint ? `Connection to ${endpoint} timed out.` : error.message
      return transportError({ message, kind: "Timeout", request })
    }
    if (!HttpClientError.isHttpClientError(error)) {
      const message = formatTransportErrorMessage(request, cause)
      return transportError({ message, request })
    }
    const resolvedRequest = request ?? error.request
    if (error.reason._tag === "TransportError") {
      const message = formatTransportErrorMessage(resolvedRequest, error.reason.cause ?? cause, error.reason.description)
      return transportError({
        message,
        kind: error.reason._tag,
        request: resolvedRequest,
      })
    }
    return transportError({
      message: formatTransportErrorMessage(resolvedRequest, cause, `HTTP transport failed: ${error.reason._tag}`),
      kind: error.reason._tag,
      request: resolvedRequest,
    })
  }

const retryDelay = (error: LLMError, attempt: number) => {
  if (error.retryAfterMs !== undefined) return Effect.succeed(Math.min(error.retryAfterMs, MAX_DELAY_MS))
  return Random.nextBetween(
    Math.min(BASE_DELAY_MS * 2 ** attempt * 0.8, MAX_DELAY_MS),
    Math.min(BASE_DELAY_MS * 2 ** attempt * 1.2, MAX_DELAY_MS),
  ).pipe(Effect.map((delay) => Math.round(delay)))
}

const retryStatusFailures = <A, R>(
  effect: Effect.Effect<A, LLMError, R>,
  retries = MAX_RETRIES,
  attempt = 0,
): Effect.Effect<A, LLMError, R> =>
  Effect.catchTag(effect, "LLM.Error", (error): Effect.Effect<A, LLMError, R> => {
    if (!error.retryable || retries <= 0) return Effect.fail(error)
    return retryDelay(error, attempt).pipe(
      Effect.flatMap((delay) => Effect.sleep(delay)),
      Effect.flatMap(() => retryStatusFailures(effect, retries - 1, attempt + 1)),
    )
  })

export const layer: Layer.Layer<Service, never, HttpClient.HttpClient> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient
    const executeOnce = (request: HttpClientRequest.HttpClientRequest) =>
      Effect.gen(function* () {
        const redactedNames = yield* Headers.CurrentRedactedNames
        return yield* http
          .execute(request)
          .pipe(Effect.mapError(toHttpError(redactedNames, request)), Effect.flatMap(statusError(request, redactedNames)))
      })
    return Service.of({
      execute: (request) => retryStatusFailures(executeOnce(request)),
    })
  }),
)

export const fetchLayer = layer.pipe(Layer.provide(FetchHttpClient.layer))

export * as RequestExecutor from "./executor"
