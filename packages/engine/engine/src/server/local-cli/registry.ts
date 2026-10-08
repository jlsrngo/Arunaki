// Single source of truth for the CLI providers Arunaki can bridge.
//
// The settings UI renders one generic card per entry, so adding a provider means adding
// a descriptor here (and localized copy in the web layer) rather than writing another
// hand-rolled card. Keep this presentation-free: ids, urls, commands and file paths
// only. Anything the user reads belongs in the web i18n map keyed by `stepKey`.

export type CliProviderId =
  | "claude"
  | "codex"
  | "opencode"
  | "antigravity"
  | "kiro"
  | "cursor"
  | "nineRouter"

export type CliQuotaKind = "antigravity" | "claude" | "codex" | "none"

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
   * Subscription the vendor requires before it will issue a usable token. Shown on the card so
   * the user learns the requirement before clicking, instead of hitting a wall in the browser.
   * Verified live on a free account: Claude answers "Claude Max atau Pro diperlukan", and the
   * Codex endpoint answers "not supported when using Codex with a ChatGPT account" for every
   * model. The Codex token does decode, so sign-in succeeds and the wall comes at first request.
   */
  entitlement?: { notice: string; noticeId: string; url: string }
}

const CLAUDE_MODELS = ["claude-3-7-sonnet", "claude-3-5-sonnet", "claude-3-5-haiku", "claude-3-opus"]
const CODEX_MODELS = ["gpt-5.1-codex", "gpt-5-codex", "codex-mini-latest"]
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
      "Sign-in works on any plan, but ChatGPT Plus or higher is required to actually run requests. A free account connects and then fails on the first message.",
      noticeId: "Perlu akun ChatGPT Plus (atau lebih tinggi)",
      url: "https://chatgpt.com/codex",
    },
  },
  {
    id: "opencode",
    name: "OpenCode",
    vendor: "opencode",
    docsUrl: "https://opencode.ai",
    quota: "none",
    models: OPENCODE_MODELS,
    // Hosted Zen route needs no sign-in and no local binary.
    requiresCli: false,
    loginMode: "none",
    supportsAutoConfigure: false,
    supportsBrowserLogin: false,
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
    quota: "none",
    models: [],
    requiresCli: true,
    loginMode: "terminal",
    supportsAutoConfigure: false,
    supportsBrowserLogin: false,
  },
  {
    id: "cursor",
    name: "Cursor",
    vendor: "Anysphere",
    quota: "none",
    models: [],
    requiresCli: true,
    loginMode: "terminal",
    supportsAutoConfigure: false,
    supportsBrowserLogin: false,
  },
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
