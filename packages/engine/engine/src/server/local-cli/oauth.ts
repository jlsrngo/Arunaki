import crypto from "crypto"
import fs from "fs"
import http from "http"
import os from "os"
import path from "path"
import crossSpawn from "cross-spawn"
import { persistCredential, type DiscoveredCredential } from "./credential-store.js"
import { startKiroDeviceFlow, pollKiroDeviceFlow } from "./kiro.js"

/**
 * Browser OAuth for the local CLI subscriptions, so a fresh install does not need the
 * vendor CLI installed first. Provider parameters mirror 9Router's registry entries
 * (claude.js / codex.js / antigravity.js); Claude and Codex use PKCE with a public
 * client id, so no client secret is involved.
 */

export type OauthTarget = "claude" | "codex" | "antigravity" | "kiro"

/**
 * Providers that sign in with an OAuth device flow instead of PKCE.
 *
 * There is no loopback redirect to wait on: the vendor hands us a URL that already carries the
 * code, so completion comes from polling the token endpoint. They are kept out of SPECS
 * because they share none of its machinery.
 */
const DEVICE_TARGETS = new Set<OauthTarget>(["kiro"])

interface OauthSpec {
  label: string
  clientId: string
  authorizeUrl: string
  tokenUrl: string
  scopes: string[]
  callbackPath: string
  /**
   * Port the client has registered as an allowed redirect URI. OpenAI/ChatGPT only accept
   * `http://127.0.0.1:1455/auth/callback` for the Codex client and answer
   * "Required parameter is missing" for anything else, so this must not be randomised.
   * Vendors following RFC 8252 accept any loopback port and leave it unset.
   */
  fixedPort?: number
  /**
   * Redirect host. Google and Anthropic follow RFC 8252 and accept any loopback host,
   * but the ChatGPT/Codex client only has `http://localhost:1455/auth/callback`
   * registered, and answers "Required parameter is missing" for the 127.0.0.1 spelling.
   */
  redirectHost?: string
  extraParams?: Record<string, string>
  /** Some vendors (Google) reject a client that has no secret. */
  clientSecretEnv?: [string, string]
  extraHeaders?: Record<string, string>
  displayName: string
}

const SPECS: Partial<Record<OauthTarget, OauthSpec>> = {
  claude: {
    label: "Claude",
    displayName: "Claude Code / Claude Pro",
    clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
    authorizeUrl: "https://claude.ai/oauth/authorize",
    tokenUrl: "https://api.anthropic.com/v1/oauth/token",
    scopes: ["org:create_api_key", "user:profile", "user:inference"],
    callbackPath: "/callback",
    // 9Router refreshes Claude over JSON; the authorize step expects a PKCE verifier.
    extraParams: { code: "true" },
  },
  codex: {
    label: "Codex",
    displayName: "OpenAI Codex / ChatGPT",
    clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
    authorizeUrl: "https://auth.openai.com/oauth/authorize",
    tokenUrl: "https://auth.openai.com/oauth/token",
    scopes: ["openid", "profile", "email", "offline_access"],
    callbackPath: "/auth/callback",
    fixedPort: 1455,
    redirectHost: "localhost",
    extraParams: {
      id_token_add_organizations: "true",
      codex_cli_simplified_flow: "true",
      originator: "codex_cli_rs",
    },
  },
  antigravity: {
    label: "Antigravity",
    displayName: "Google Antigravity (AI Pro)",
    // Resolved from env/local config at runtime: the Antigravity IDE's own OAuth client.
    // Never committed ” GitHub push protection rejects embedded client secrets.
    clientId: "",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
scopes: [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "openid",
      // cclog + experimentsandconfigs are what tie a token to Antigravity; without them the
      // Cloud Code chat endpoint answers 403 PERMISSION_DENIED even for a valid consumer login.
      "https://www.googleapis.com/auth/cclog",
      "https://www.googleapis.com/auth/experimentsandconfigs",
    ],
    callbackPath: "/oauth2callback",
    extraParams: { access_type: "offline", prompt: "consent" },
    clientSecretEnv: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
  },
}

export interface OauthSession {
  id: string
  target: OauthTarget
  authUrl: string
  createdAt: number
}

export interface OauthResult {
  requestId: string
  target: OauthTarget
  status: "pending" | "success" | "error"
  message?: string
  provider?: string
}

interface Pending {
  target: OauthTarget
  verifier: string
  redirectUri: string
  resolve: (code: string) => void
  reject: (err: Error) => void
  settled: boolean
}

const sessions = new Map<string, OauthSession>()
const pending = new Map<string, Pending>()
const results = new Map<string, OauthResult>()

/** device_code -> where the vendor told the user to go approve it. */
const deviceCodes = new Map<string, string>()

const b64url = (buf: Buffer) => buf.toString("base64url")

function loadGoogleClient(): { clientId: string; clientSecret: string } | null {
  const envId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const envSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (envId && envSecret) return { clientId: envId, clientSecret: envSecret }

  try {
    const local = path.join(os.homedir(), ".arunaki", "oauth-clients.json")
    const parsed = JSON.parse(fs.readFileSync(local, "utf8"))
    const g = parsed?.google
    if (g?.clientId && g?.clientSecret) return { clientId: g.clientId, clientSecret: g.clientSecret }
  } catch {}

  return null
}

const loadClientSecret = () => loadGoogleClient()?.clientSecret

function openBrowser(url: string): void {
  if (process.platform === "win32") {
    // Must not go through cmd.exe: it re-parses its arguments and treats "&" in the query
    // string as a command separator, so the browser only ever received the first parameter.
    // Claude answered "Parameter client_id tidak ada" even though client_id was in the URL.
    // rundll32 hands the whole string to the protocol handler untouched.
    crossSpawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], { windowsHide: true })
  } else if (process.platform === "darwin") {
    crossSpawn("open", [url])
  } else {
    crossSpawn("xdg-open", [url])
  }
}

function listenForCode(spec: OauthSpec, requestId: string, p: Pending): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1")
      if (url.pathname !== spec.callbackPath) {
        res.writeHead(404).end()
        return
      }
      const code = url.searchParams.get("code")
      const errDesc = url.searchParams.get("error_description") || url.searchParams.get("error")

      if (errDesc) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        res.end(htmlPage("Sign-in failed", errDesc))
        p.reject(new Error(errDesc))
      } else if (!code) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" })
        res.end(htmlPage("Missing code", "The provider did not return an authorization code."))
        p.reject(new Error("missing authorization code"))
      } else {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        res.end(htmlPage("Connected", `${spec.displayName} is now connected to Arunaki. You can close this tab.`))
        p.resolve(code)
      }
      setTimeout(() => server.close(), 250)
    })

    server.on("error", (err: any) => {
      if (err?.code === "EADDRINUSE" && spec.fixedPort) {
        reject(
          new Error(
            `Port ${spec.fixedPort} is already in use ” that is the redirect URI registered for the ${spec.label} OAuth client. Close whatever is holding it and retry.`,
          ),
        )
      } else {
        reject(err)
      }
    })
    // Vendors with a registered redirect URI pin the port and host; RFC 8252 ones take any.
    const port = spec.fixedPort ?? 0
    const host = spec.redirectHost ?? "127.0.0.1"
    // Bind on loopback regardless of the hostname we advertise, so `localhost` also works
    // on hosts where it resolves to ::1 first.
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address()
      const actual = typeof addr === "object" && addr ? addr.port : port
      p.redirectUri = `http://${host}:${actual}${spec.callbackPath}`
      resolve()
    })
  })
}

function htmlPage(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font:16px/1.6 system-ui,sans-serif;margin:12vh auto;max-width:34rem;padding:0 1.5rem;color:#18181b}
h1{font-size:1.35rem}code{background:#f4f4f5;padding:.1rem .3rem;border-radius:.25rem}</style>
</head><body><h1>${title}</h1><p>${body}</p></body></html>`
}

function decodeJwtClaims(token?: string): any {
  if (!token) return undefined
  const parts = token.split(".")
  if (parts.length < 2) return undefined
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))
  } catch {
    return undefined
  }
}

function decodeJwtEmail(idToken?: string): string | undefined {
  return decodeJwtClaims(idToken)?.email || undefined
}

/**
 * ChatGPT account id, which the Codex endpoint wants in a ChatGPT-Account-ID header.
 *
 * The token response carries no account_id field, so the only place it exists is inside the
 * access token itself. Without it every request is rejected with "model is not supported when
 * using Codex with a ChatGPT account" regardless of which model is asked for.
 */
function decodeChatGptAccountId(accessToken?: string): string | undefined {
  return decodeJwtClaims(accessToken)?.["https://api.openai.com/auth"]?.chatgpt_account_id || undefined
}

async function exchange(
  spec: OauthSpec,
  target: OauthTarget,
  clientId: string,
  p: Pending,
  authCode: string,
): Promise<DiscoveredCredential> {
  const secret = spec.clientSecretEnv ? loadClientSecret() : undefined
  if (spec.clientSecretEnv && !secret) {
    throw new Error(
      "Missing Google OAuth client secret. Set GOOGLE_OAUTH_CLIENT_SECRET or write ~/.arunaki/oauth-clients.json",
    )
  }

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code: authCode,
    redirect_uri: p.redirectUri,
    client_id: clientId,
    code_verifier: p.verifier,
  })
  if (secret) params.set("client_secret", secret)

  const res = await fetch(spec.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      ...(spec.extraHeaders ?? {}),
    },
    body: params.toString(),
    signal: AbortSignal.timeout(30000),
  })

  if (!res.ok) {
    throw new Error(`token exchange HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`)
  }
  const data: any = await res.json()

  return {
    provider: target,
    displayName: spec.displayName,
    type: "oauth",
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accountId:
      data.account_id ??
      data.organization_id ??
      decodeChatGptAccountId(data.access_token) ??
      undefined,
    accountEmail: decodeJwtEmail(data.id_token),
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    lastRefreshAt: Date.now(),
    // Empty on purpose. An OAuth credential lives only in Arunaki's store and has no file on
    // disk; harvester drops credentials whose sourcePath file is gone, so pointing at a path we
    // never write made the freshly minted token disappear on the next rescan, minutes after the
    // browser said "Connected".
    sourcePath: "",
  }
}

/** Kick off the browser flow. Returns the session the UI polls. */
export async function startOauthSession(target: OauthTarget, openInBrowser = true): Promise<OauthSession> {
  if (DEVICE_TARGETS.has(target)) return startDeviceSession(target, openInBrowser)
  const spec = SPECS[target]
  if (!spec) throw new Error(`Unsupported OAuth target: ${target}`)

  // Providers backed by a configured OAuth client need it before we can even build the URL.
  const configured = loadClientSecret() ? loadGoogleClient() : null
  if (spec.clientSecretEnv && !configured) {
    throw new Error(
      "Google OAuth client is not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET, " +
        "or write ~/.arunaki/oauth-clients.json, then retry.",
    )
  }
  const clientId = spec.clientSecretEnv ? configured!.clientId : spec.clientId
  const requestId = crypto.randomUUID()
  const verifier = b64url(crypto.randomBytes(32))
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest())

  let resolveCode: (code: string) => void = () => {}
  let rejectCode: (err: Error) => void = () => {}
  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject
  })

  const p: Pending = { target, verifier, redirectUri: "", resolve: resolveCode, reject: rejectCode, settled: false }
  pending.set(requestId, p)

  await listenForCode(spec, requestId, p)

  // Build the query by hand: URLSearchParams encodes spaces as "+", which is form-body
  // encoding and wrong here. Google's authorize endpoint reads "+" literally, collapses the
  // whole scope list into one malformed value and answers "Missing required parameter: scope".
  const query = {
    response_type: "code",
    client_id: clientId,
    redirect_uri: p.redirectUri,
    scope: spec.scopes.join(" "),
    state: requestId,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...(spec.extraParams ?? {}),
  }
  const authUrl = `${spec.authorizeUrl}?${Object.entries(query)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&")}`

  const session: OauthSession = { id: requestId, target, authUrl, createdAt: Date.now() }
  sessions.set(requestId, session)
  results.set(requestId, { requestId, target, status: "pending" })

  if (openInBrowser) {
    try {
      openBrowser(authUrl)
    } catch {}
  }

  // Drive the exchange off the callback so the UI only has to poll.
  const timeoutMs = 10 * 60_000
  const guard = setTimeout(() => {
    if (p.settled) return
    p.settled = true
    results.set(requestId, { requestId, target, status: "error", message: "Timed out waiting for sign-in" })
    cleanup(requestId)
  }, timeoutMs)

  codePromise
    .then(async (code) => {
      if (p.settled) return
      p.settled = true
      try {
        const cred = await exchange(spec, target, clientId, p, code)
        await persistCredential(cred)
        results.set(requestId, {
          requestId,
          target,
          status: "success",
          provider: cred.provider,
          message: `Connected ${spec.displayName}${cred.accountEmail ? ` as ${cred.accountEmail}` : ""}.`,
        })
      } catch (err: any) {
        results.set(requestId, { requestId, target, status: "error", message: err?.message ?? String(err) })
      } finally {
        clearTimeout(guard)
        cleanup(requestId)
      }
    })
    .catch((err: any) => {
      if (p.settled) return
      p.settled = true
      clearTimeout(guard)
      results.set(requestId, { requestId, target, status: "error", message: err?.message ?? String(err) })
      cleanup(requestId)
    })

  return session
}

function cleanup(requestId: string): void {
  pending.delete(requestId)
  sessions.delete(requestId)
  deviceCodes.delete(requestId)
}

/**
 * Device-flow sign-in. The session's `authUrl` is the vendor's approval page with the code
 * already embedded, so the UI can show it verbatim and the user never types anything.
 */
async function startDeviceSession(target: OauthTarget, openInBrowser: boolean): Promise<OauthSession> {
  const requestId = crypto.randomUUID()
  const start = await startKiroDeviceFlow()

  const session: OauthSession = {
    id: requestId,
    target,
    authUrl: start.verificationUriComplete || start.verificationUri,
    createdAt: Date.now(),
  }
  sessions.set(requestId, session)
  results.set(requestId, { requestId, target, status: "pending" })
  deviceCodes.set(requestId, start.userCode)

  if (openInBrowser) {
    try {
      openBrowser(session.authUrl)
    } catch {}
  }

  const deadline = Date.now() + start.expiresIn
  const guard = setTimeout(() => {
    if (!results.get(requestId)?.status.startsWith("pending")) return
    results.set(requestId, { requestId, target, status: "error", message: "Timed out waiting for sign-in" })
    cleanup(requestId)
  }, start.expiresIn)

  const tick = async () => {
    if (!results.get(requestId) || results.get(requestId)!.status !== "pending") return
    try {
      const status = await pollKiroDeviceFlow(start)
      if (!status.done) {
        if (Date.now() > deadline) return
        setTimeout(() => void tick(), start.interval)
        return
      }
      clearTimeout(guard)
      if (status.error || !status.credential) {
        results.set(requestId, { requestId, target, status: "error", message: status.error ?? "Sign-in failed" })
        cleanup(requestId)
        return
      }
      await persistCredential(status.credential)
      results.set(requestId, {
        requestId,
        target,
        status: "success",
        provider: status.credential.provider,
        message: `Connected ${status.credential.displayName}${
          status.credential.accountEmail ? ` as ${status.credential.accountEmail}` : ""
        }.`,
      })
      cleanup(requestId)
    } catch (err: any) {
      clearTimeout(guard)
      results.set(requestId, { requestId, target, status: "error", message: err?.message ?? String(err) })
      cleanup(requestId)
    }
  }
  void tick()

  return session
}

export function getOauthResult(requestId: string): OauthResult | null {
  return results.get(requestId) ?? null
}

export function oauthTargets(): OauthTarget[] {
  return [...new Set<OauthTarget>([...(Object.keys(SPECS) as OauthTarget[]), ...DEVICE_TARGETS])]
}
