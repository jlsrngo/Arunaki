// Single source of truth for the CLI providers Arunaki can bridge.
//
// The settings UI renders one generic card per entry, so adding a provider means adding
// a descriptor here (and localized copy in the web layer) rather than writing another
// hand-rolled card. Keep this presentation-free: ids, urls, commands and file paths
// only. Anything the user reads belongs in the web i18n map keyed by `stepKey`.

export type CliProviderId = "claude" | "codex" | "opencode" | "antigravity" | "kiro" | "nineRouter"

export type CliQuotaKind = "antigravity" | "claude" | "codex" | "kiro" | "none"

/** How a provider obtains a credential. "none" means it works with no sign-in at all. */
export type CliLoginMode = "terminal" | "browser" | "none"

export interface CliProviderDescriptor {
  id: CliProviderId
  name: string
  vendor: string
  /** Product page behind the Docs button. Omitted when there is nothing to link to. */
  docsUrl?: string
  /** Where the user gets the CLI. Only set when a local binary is genuinely required. */
  installUrl?: string
  installSizeMb?: number
  /** Command Arunaki opens in a terminal to sign in, shown verbatim in the steps. */
  loginCommand?: string
  /** Where the credential lands once signed in. */
  credentialPath?: string
  /** Windows Credential Manager target, when that is where the token actually lives. */
  credentialTarget?: string
  quota: CliQuotaKind
  models: string[]
  /** A local CLI must be installed before signing in is possible. */
  requiresCli: boolean
  loginMode: CliLoginMode
  /** Enables Auto-Configure CLI, which rewrites the vendor's own config file. */
  supportsAutoConfigure: boolean
  /**
   * Browser sign-in through Arunaki. Kept false where the vendor's OAuth client rejects
   * third-party apps, so the UI never offers a button that cannot work.
   */
  supportsBrowserLogin: boolean
  /**
   * What a vendor requires before it will answer. Shown on the card so the user learns the
   * requirement before clicking, rather than hitting a wall in the browser. Verified live, and
   * the two providers differ in kind: Claude answers "Claude Max atau Pro diperlukan" for every
   * model, while Codex works on a free account and simply refuses every model outside the
   * verified list. Read the notice per provider instead of assuming paid-only.
   */
  entitlement?: { notice: string; noticeId: string; url: string }
  /**
   * A standing caveat shown on the card whether or not the provider is connected: something the
   * user will hit in normal use that is not a sign-in wall. Entitlement is the wrong field for it,
   * since that only renders before sign-in, and a performance characteristic is not a requirement.
   */
  note?: { text: string; textId: string }
}

const CLAUDE_MODELS = ["claude-3-7-sonnet", "claude-3-5-sonnet", "claude-3-5-haiku", "claude-3-opus"]
// FALLBACK ONLY. See codex-models.ts - the catalogue is fetched from the account, and these are the
// ids that survived probing.
const CODEX_MODELS = ["gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-6-luna", "gpt-reserve"]
// Kiro ids are prefixed because they overlap every other provider's names; the prefix is
// stripped before the request so AWS still sees its own id.
// FALLBACK ONLY. The catalogue comes from the account: Kiro's ListAvailableModels and Codex's
// backend-api/codex/models. These are what to show when the vendor cannot be reached, and they are
// deliberately a short verified list rather than a long guess - the previous Kiro list named
// claude-sonnet-5, which AWS has never returned.
//
// Codex publishes a catalogue but answers an empty one on a free account, so its fallback was built
// by probing each candidate: 5 answer, 27 are refused with a message that reads like a paywall.
export const KIRO_FALLBACK_MODELS = [
  "kiro/auto",
  "kiro/claude-sonnet-4.5",
  "kiro/claude-haiku-4.5",
  "kiro/deepseek-3.2",
  "kiro/qwen3-coder-next",
]

// The registry itself must stay declarative and cheap to import, so it keeps only the probe
// results; getCliSupportedModels owns the live fetch.
const KIRO_MODELS = KIRO_FALLBACK_MODELS
const OPENCODE_MODELS = [
  "groq/openai/gpt-oss-120b",
  "groq/qwen/qwen3.8-27b",
  "groq/openai/gpt-oss-20b",
  "opencode/big-pickle",
  "9router/ComboMaut",
  "opencode/nemotron-3.5-lightning-free",
]
// Fallback only. The settings UI asks the account via fetchAvailableModels and shows that
// instead; these are the ids we have proven return 200 on a live Antigravity account.
// Names not in the account's live catalogue must not appear here, or the dropdown offers
// models the endpoint rejects.
const ANTIGRAVITY_MODELS = [
  "gemini-3.8-flash-medium",
  "gemini-3.8-flash-low",
  "gemini-3.8-flash-high",
  "gemini-3.7-flash-medium",
  "gemini-3.6-flash-medium",
  "gemini-pro-agent",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
]
const NINEROUTER_MODELS = [
  "9router/ComboMaut",
  "oc/big-pickle",
  "oc/claude-sonnet-4.5",
  "kr/claude-sonnet-4.5",
  "vx/gemini-2.5-pro",
  "deepseek-r1",
  "cx/gpt-5.6-terra",
]

export const CLI_PROVIDER_REGISTRY: CliProviderDescriptor[] = [
  {
    id: "claude",
    name: "Claude",
    vendor: "Anthropic",
    docsUrl: "https://claude.ai",
    loginCommand: "claude auth login",
    credentialPath: "~/.claude/.credentials.json",
    quota: "claude",
    models: CLAUDE_MODELS,
    requiresCli: false,
    loginMode: "terminal",
    supportsAutoConfigure: true,
    // Proven working: the authorize page accepts the request and makes an entitlement
    // decision, it does not reject the client. A free account sees the Pro/Max prompt.
    supportsBrowserLogin: true,
    entitlement: {
      notice: "Requires a Claude Max or Pro subscription",
      noticeId: "Perlu langganan Claude Max atau Pro",
      url: "https://claude.ai",
    },
  },
  {
    id: "codex",
    name: "Codex",
    vendor: "OpenAI",
    docsUrl: "https://chatgpt.com",
    loginCommand: "codex login",
    credentialPath: "~/.codex/auth.json",
    quota: "codex",
    models: CODEX_MODELS,
    requiresCli: false,
    loginMode: "terminal",
    supportsAutoConfigure: false,
    supportsBrowserLogin: true,
    entitlement: {
notice:
      "Works on a free ChatGPT account, but only some models answer. A free login is refused by every other Codex model with \"not supported when using Codex with a ChatGPT account\".",
    noticeId: "Gratis berfungsi, tapi hanya sebagian model",
      url: "https://chatgpt.com/codex",
    },
  },
  {
    id: "opencode",
    name: "OpenCode",
    vendor: "opencode",
    docsUrl: "https://opencode.ai",
    installUrl: "https://opencode.ai",
    loginCommand: "opencode auth login",
    credentialPath: "~/.local/share/opencode/auth.json",
    quota: "none",
    models: OPENCODE_MODELS,
    // The hosted Zen lane answers 403 "only from within OpenCode" without an account session,
    // and the binary exposes no browser OAuth with a public client to copy. Sign-in is therefore
    // terminal-only, exactly like Antigravity, and the chat route stays a direct Zen call rather
    // than OpenCode's own local server, whose agent would run shell commands on this machine.
    requiresCli: true,
loginMode: "terminal",
supportsAutoConfigure: false,
supportsBrowserLogin: false,
// Measured across live smoke runs: 2-6s typical, up to 60s when Zen routes to a cold upstream
// model. Nothing is stuck and no tool is being run, so the honest place for it is on the card
// rather than a spinner that eventually clears.
note: {
text: "Native requests route through OpenCode Zen and can take up to a minute on a cold model. Slow, not stuck.",
textId: "Permintaan native lewat OpenCode Zen bisa sampai semenit saat model baru dipakai. Lambat, bukan macet.",
},
},
{
id: "antigravity",
    name: "Google Antigravity CLI",
    vendor: "Google DeepMind",
    docsUrl: "https://antigravity.google.com",
    installUrl: "https://antigravity.google.com",
    installSizeMb: 181,
    loginCommand: "agy",
    credentialPath: "~/.gemini/oauth_creds.json",
    credentialTarget: "gemini:antigravity",
    quota: "antigravity",
    models: ANTIGRAVITY_MODELS,
    requiresCli: true,
    loginMode: "terminal",
    supportsAutoConfigure: false,
    // Google refuses this OAuth client for third-party apps; terminal sign-in only.
    supportsBrowserLogin: false,
  },
  {
    id: "kiro",
    name: "Kiro",
    vendor: "AWS",
    docsUrl: "https://kiro.dev",
    // Verified live against CodeWhisperer's GetUsageLimits: KIRO FREE with a monthly credit
    // allowance. The plan name is what distinguishes Kiro from the paid-only providers.
    quota: "kiro",
    models: KIRO_MODELS,
    // Device flow with a public client and a browser approval page: no CLI to install.
    requiresCli: false,
    loginMode: "browser",
    supportsAutoConfigure: false,
    supportsBrowserLogin: true,
  },
  // Cursor is deliberately not listed. The credential reader works and scanLocalCredentials still
  // surfaces a Cursor token, but there is no bridge route, no connect contract and no upstream
  // call, so a card for it could only ever say "Not installed" - advertising a provider that
  // cannot answer. Re-add the entry in the same commit that adds the route.
  {
    id: "nineRouter",
    name: "9Router",
    vendor: "9Router",
    docsUrl: "https://9router.com",
    quota: "none",
    models: NINEROUTER_MODELS,
    requiresCli: true,
    loginMode: "terminal",
    supportsAutoConfigure: false,
    supportsBrowserLogin: false,
  },
]

const BY_ID = new Map(CLI_PROVIDER_REGISTRY.map((p) => [p.id, p]))

export function getCliProviderDescriptor(id: string): CliProviderDescriptor | undefined {
  return BY_ID.get(id as CliProviderId)
}
