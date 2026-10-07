import crypto from "crypto"
import fs from "fs"
import http from "http"
import os from "os"
import path from "path"
import crossSpawn from "cross-spawn"
import { persistCredential, type DiscoveredCredential } from "./credential-store.js"

/**
 * Browser OAuth for the local CLI subscriptions, so a fresh install does not need the
 * vendor CLI installed first. Provider parameters mirror 9Router's registry entries
 * (claude.js / codex.js / antigravity.js); Claude and Codex use PKCE with a public
 * client id, so no client secret is involved.
 */

export type OauthTarget = "claude" | "codex" | "antigravity"

interface OauthSpec {
  label: string
  clientId: string
  authorizeUrl: string
  tokenUrl: string
  scopes: string[]
  callbackPath: string
  extraParams?: Record<string, string>
  /** Some vendors (Google) reject a client that has no secret. */
  clientSecretEnv?: [string, string]
  extraHeaders?: Record<string, string>
  displayName: string
}

const SPECS: Record<OauthTarget, OauthSpec> = {
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
    extraParams: {
      id_token_add_organizations: "true",
      codex_cli_simplified_flow: "true",
      originator: "codex_cli_rs",
    },
  },
  antigravity: {
    label: "Antigravity",
    displayName: "Google Antigravity (AI Pro)",
    clientId: "884354919052-36trc1jjb3tguiac32ov6cod268c5blh.apps.googleusercontent.com",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "openid",
    ],
    callbackPath: "/oauth2callback",
    extraParams: { access_type: "offline", prompt: "consent" },
    clientSecretEnv: [
      "GOOGLE_OAUTH_CLIENT_ID",
      "GOOGLE_OAUTH_CLIENT_SECRET",
    ],
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

const b64url = (buf: Buffer) => buf.toString("base64url")

function loadClientSecret(): string | undefined {
  const fromEnv =
    process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET
      ? process.env.GOOGLE_OAUTH_CLIENT_SECRET
      : undefined
  if (fromEnv) return fromEnv
  try {
    const local = path.join(os.homedir(), ".arunaki", "oauth-clients.json")
    const parsed = JSON.parse(fs.readFileSync(local, "utf8"))
    return parsed?.google?.clientSecret
  } catch {
    return undefined
  }
}

function openBrowser(url: string): void {
  if (process.platform === "win32") {
    crossSpawn("cmd.exe", ["/c", "start", '""', url], { windowsHide: true })
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

    server.on("error", reject)
    // Port 0: let the OS pick, so several flows can run without colliding.
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address()
      const port = typeof addr === "object" && addr ? addr.port : 0
      p.redirectUri = `http://127.0.0.1:${port}${spec.callbackPath}`
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

function decodeJwtEmail(idToken?: string): string | undefined {
  if (!idToken) return undefined
  const parts = idToken.split(".")
  if (parts.length < 2) return undefined
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))
    return payload.email || undefined
  } catch {
    return undefined
  }
}

async function exchange(
  spec: OauthSpec,
  target: OauthTarget,
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
    client_id: spec.clientId,
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
    accountId: data.account_id ?? data.organization_id ?? undefined,
    accountEmail: decodeJwtEmail(data.id_token),
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    lastRefreshAt: Date.now(),
    sourcePath: path.join(os.homedir(), ".arunaki", `oauth-${target}.json`),
  }
}

/** Kick off the browser flow. Returns the session the UI polls. */
export async function startOauthSession(target: OauthTarget, openInBrowser = true): Promise<OauthSession> {
  const spec = SPECS[target]
  if (!spec) throw new Error(`Unsupported OAuth target: ${target}`)

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

  const params = new URLSearchParams({
    response_type: "code",
    client_id: spec.clientId,
    redirect_uri: p.redirectUri,
    scope: spec.scopes.join(" "),
    state: requestId,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...(spec.extraParams ?? {}),
  })
  const authUrl = `${spec.authorizeUrl}?${params.toString()}`

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
        const cred = await exchange(spec, target, p, code)
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
}

export function getOauthResult(requestId: string): OauthResult | null {
  return results.get(requestId) ?? null
}

export function oauthTargets(): OauthTarget[] {
  return Object.keys(SPECS) as OauthTarget[]
}
