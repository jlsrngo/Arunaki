/**
 * Codex model catalogue.
 *
 * Codex publishes its catalogue at backend-api/codex/models, which takes a client_version query
 * parameter. On a free account it answers {"models":[]} while individual models still work, so
 * this falls back to the ids that were verified by probing the endpoint directly.
 */
import { readCodexCredential } from "./harvester.js"

/**
 * Verified on 2026-10-09 against a free account, by sending one request per candidate.
 *
 * Not a list to maintain by hand. 27 other candidates were refused with "not supported when using
 * Codex with a ChatGPT account" - a message that reads like a subscription wall and is really just
 * an unknown model id, which is what made an earlier version of this claim the opposite.
 */
export const CODEX_VERIFIED_FALLBACK = ["gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-6-luna", "gpt-reserve"]

const CODEX_MODELS_URL = "https://chatgpt.com/backend-api/codex/models"

/** The endpoint rejects the request without a client_version, so one has to be sent. */
const CLIENT_VERSION = "0.50.0"

export async function fetchCodexModels(): Promise<string[] | null> {
  const cred = readCodexCredential()
  if (!cred?.accessToken) return null
  try {
    const res = await fetch(`${CODEX_MODELS_URL}?client_version=${CLIENT_VERSION}`, {
      headers: {
        Authorization: `Bearer ${cred.accessToken}`,
        ...(cred.accountId ? { "ChatGPT-Account-ID": cred.accountId } : {}),
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    const data: any = await res.json()
    const ids = (data?.models ?? [])
      .map((m: any) => (typeof m === "string" ? m : m?.id ?? m?.modelId))
      .filter(Boolean)
    return ids.length ? ids : null
  } catch {
    return null
  }
}