import { useState, useEffect } from "react";
import {
  Terminal,
  Check,
  Loader2,
  RefreshCw,
  Globe,
  ChevronDown,
  SlidersHorizontal,
  X,
  Wifi,
  LogIn,
  LogOut,
  AlertTriangle,
  Scale,
  Sparkles,
  Gauge,
} from "lucide-react";
import { API_BASE, apiFetch, directoryQuery } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import type { Provider } from "./ModelProviderSettings";

interface ClaudeCliStatus {
  installed: boolean;
  version?: string;
  loggedIn: boolean;
  authMethod?: string;
  apiProvider?: string;
  email?: string;
  error?: string;
}

interface OpenCodeStatus {
  installed: boolean;
  version?: string;
  serverRunning?: boolean;
  serverPort?: number;
  authenticatedProviders: string[];
  hasGroq: boolean;
  has9Router: boolean;
  error?: string;
}

interface CliProviderDescriptor {
  id: string;
  name: string;
  vendor: string;
  docsUrl?: string;
  installUrl?: string;
  installSizeMb?: number;
  loginCommand?: string;
  credentialPath?: string;
  credentialTarget?: string;
  quota: "antigravity" | "claude" | "codex" | "kiro" | "none";
  models: string[];
  requiresCli: boolean;
  loginMode: "terminal" | "browser" | "none";
  supportsAutoConfigure: boolean;
  supportsBrowserLogin: boolean;
  /** Subscription the vendor requires before it issues a token. */
  entitlement?: { notice: string; noticeId: string; url: string };
note?: { text: string; textId: string };
}

interface AntigravityStatus {
  detected: boolean;
  cliInstalled?: boolean;
  agyInstalled?: boolean;
  agySignedIn?: boolean;
  agyVersion?: string;
  geminiCliInstalled?: boolean;
  geminiVersion?: string;
  path?: string;
  environment: string;
  loggedIn?: boolean;
  accountEmail?: string;
}

interface NineRouterStatus {
  installed?: boolean;
  version?: string;
  running: boolean;
  url: string;
  models: string[];
}

interface CodexStatus {
  installed: boolean;
  version?: string;
  isCloudOnly: boolean;
  message?: string;
  signedIn: boolean;
  /** "free" here means every request will be refused, despite the token being valid. */
  plan: string | null;
  accountEmail: string | null;
  expiresAt: number | null;
}

export interface DiscoveredCliItem {
  provider: string;
  displayName: string;
  type: string;
  sourcePath: string;
  accountEmail?: string;
  accountId?: string;
  expiresAt?: number;
  lastRefreshAt?: number;
  hasToken: boolean;
}

interface KiroStatus {
  /** Kiro installs nothing: a browser device flow is the only sign-in, so installed is always true. */
  installed: boolean;
  signedIn: boolean;
  requiresCli: boolean;
  accountEmail: string | null;
  region: string;
  hasRefreshToken: boolean;
  expiresAt: number | null;
}

interface LocalCliData {
  claude: ClaudeCliStatus;
  opencode: OpenCodeStatus;
  antigravity: AntigravityStatus;
  nineRouter: NineRouterStatus;
  codex?: CodexStatus;
  kiro?: KiroStatus;
  bridgePort: number;
  bridgeRunning: boolean;
  discovered?: DiscoveredCliItem[];
  /** Provider catalog from the engine registry. Drives every card below. */
  registry?: CliProviderDescriptor[];
}


interface SettingsCliConnectionsTabProps {
  providers: Provider[];
  onRefresh: () => void;
}


/**
 * A provider id. The engine registry is the source of truth, so this is deliberately not a union
 * of literals.
 *
 * It used to be one, and it silently fell behind: kiro was added to the registry and got a card,
 * but not to this type, so TypeScript rejected `id === "kiro"` and sent the fix to the wrong place.
 * No call site depends on the members - they only pass an id along - so the union bought nothing
 * and cost a bug.
 */
type CliProviderId = string;

interface QuotaBucket {
  id: string;
  label: string;
  window: string;
  /** 0..1 fraction remaining */
  remaining: number;
  exhausted?: boolean;
  /** Epoch millis, or undefined when the vendor did not report a reset time. */
  resetAt?: number;
}

interface QuotaReport {
  provider: string;
  ok: boolean;
  reason?: string;
  buckets: QuotaBucket[];
}

interface ModelMeta {
  label: string;
  badge?: string;
  speed?: string;
}

/**
 * Model ids are self-describing, so the dropdown derives what it can from the id instead of
 * carrying a lookup table. "opencode/space-bunny-free" needs no entry to read as
 * "Space Bunny Free", and a model Google ships tomorrow renders without anyone editing this
 * file. The table below is only for editorial copy that cannot be inferred.
 */
const MODEL_METADATA: Record<string, ModelMeta> = {
  "opencode/big-pickle": { label: "Big Pickle", badge: "Zen Built-in", speed: "Reasoning" },
  "groq/openai/gpt-oss-120b": { label: "GPT-OSS 120B", badge: "Groq LPU", speed: "Ultra Fast" },
  "9router/ComboMaut": { label: "ComboMaut", badge: "Smart Combo", speed: "Auto Fallback" },
  "o3-mini": { label: "o3-mini", badge: "Reasoning", speed: "Fast" },
  "o1": { label: "o1", badge: "High Intelligence" },
  "claude-3-7-sonnet": { label: "Claude 3.7 Sonnet", badge: "Hybrid Reasoning", speed: "Fast" },
  "claude-3-5-sonnet": { label: "Claude 3.5 Sonnet", badge: "Capable", speed: "Fast" },
  "claude-3-5-haiku": { label: "Claude 3.5 Haiku", badge: "Compact", speed: "Fast" },
  "deepseek-r1": { label: "DeepSeek R1", badge: "Reasoning", speed: "Smart" },
};

/** Typography only: initialisms that capitalisation cannot be derived from a lowercase id. */
const ACRONYMS: Record<string, string> = { gpt: "GPT", oss: "OSS", llm: "LLM", ai: "AI", tts: "TTS" };

const VENDOR_BADGES: [RegExp, string][] = [
  [/^groq\//, "Groq LPU"],
  [/^(9router|oc|kr|vx|cx)\//, "9Router"],
  [/^opencode\//, "Zen Built-in"],
];

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Turn a raw model id into something readable, falling back to the id when it cannot. */
export function describeModel(id: string | undefined): ModelMeta {
  // A provider can legitimately have no models yet (registry entry with an empty list, or a
  // live fetch that returned nothing). Never let that read as a crash.
  if (!id) return { label: "No models available" };
  const override = MODEL_METADATA[id];
  if (override) return override;

  // Drop the provider prefix and any internal effort tier; both are noise in a label.
  const leaf = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
  const bare = leaf.replace(/-(?:extra-low|low|medium|high|tiered|agent)$/i, "");

  // Ids spell versions with dashes (claude-sonnet-4-6) because that is what vendors ship;
  // a human reads them as 4.6. Rejoin a bare number that follows a version number.
  const parts = bare.split(/[-_]+/).filter(Boolean);
  const words: string[] = [];
  for (const part of parts) {
    const lower = part.toLowerCase();
    // Parameter counts carry a unit suffix: 20b and 70b mean 20B and 70B.
    const sized = lower.match(/^(\d+)([bk])$/);
    const word = ACRONYMS[lower] ?? (sized ? `${sized[1]}${sized[2].toUpperCase()}` : capitalize(part));
    const prev = words[words.length - 1];
    if (prev && /\d$/.test(prev) && /^\d+$/.test(part)) words[words.length - 1] = `${prev}.${part}`;
    else words.push(word);
  }

  const vendor = VENDOR_BADGES.find(([re]) => re.test(id));
  const tier = leaf.match(/-(extra-low|low|medium|high|tiered|agent)$/i)?.[1];
  return {
    label: words.join(" ") || id,
    badge: tier ? tier.split("-").map(capitalize).join(" ") : vendor?.[1],
  };
}

export function SettingsCliConnectionsTab({
  providers,
  onRefresh,
}: SettingsCliConnectionsTabProps) {
  // 1. All React Hooks declared unconditionally at top level (React Rules of Hooks)
  const [data, setData] = useState<LocalCliData>(() => {
    try {
      const saved = localStorage.getItem("arunaki_cached_local_cli_status");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && parsed.antigravity) {
          return parsed;
        }
      }
    } catch {}

    const savedEmail = localStorage.getItem("arunaki_agy_email") || undefined;
    return {
      claude: { installed: true, version: "2.1.202", loggedIn: false },
      opencode: {
        installed: true,
        version: "1.18.30",
        serverRunning: false,
        serverPort: 4097,
        authenticatedProviders: ["9router", "groq"],
        hasGroq: true,
        has9Router: true,
      },
      antigravity: {
        detected: true,
        cliInstalled: true,
        agyInstalled: true,
        loggedIn: true,
        accountEmail: savedEmail,
        environment: "Google Antigravity CLI (agy)",
      },
      nineRouter: {
        installed: true,
        version: "0.5.35",
        running: false,
        url: "http://localhost:20128/v1",
        models: [],
      },
      codex: {
        installed: false,
        isCloudOnly: false,
        message: "OpenAI Codex CLI (@openai/codex) is not installed. Run 'npm i -g @openai/codex'.",
      },
      bridgePort: 20188,
      bridgeRunning: true,
    };
  });

  const { language } = useI18n();
  const isEn = language === "en";

  const [loading, setLoading] = useState(false);
  const [isLoggingOutAntigravity, setIsLoggingOutAntigravity] = useState(false);
  const [showAntigravityLoginModal, setShowAntigravityLoginModal] = useState(false);
  const [activeAuthModalTarget, setActiveAuthModalTarget] = useState<CliProviderId | null>(null);
  const [isSigningInCli, setIsSigningInCli] = useState(false);
  const [testingPingTarget, setTestingPingTarget] = useState<string | null>(null);
  const [pingResults, setPingResults] = useState<
    Record<string, { success: boolean; timeMs: number; message?: string }>
  >({});
  const [refreshingTarget, setRefreshingTarget] = useState<string | null>(null);
  const [signingOutTarget, setSigningOutTarget] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaReport[]>([]);
  const [liveModels, setLiveModels] = useState<Record<string, string[]>>({});
  const [modelsAreLive, setModelsAreLive] = useState<Record<string, boolean>>({});
  const [oauthPendingTarget, setOauthPendingTarget] = useState<CliProviderId | null>(null);

  // One source for model ids: the account's live catalogue first, the registry fallback
  // second. Nothing is hardcoded, so a provider added to the registry just works.
  const modelsFor = (id: string): string[] => {
    const live = liveModels[id];
    if (live?.length) return live;
    return data.registry?.find((d) => d.id === id)?.models ?? [];
  };
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [injectingTarget, setInjectingTarget] = useState<string | null>(null);
  const [refreshErrors, setRefreshErrors] = useState<Record<string, string>>({});
  const [customInput, setCustomInput] = useState<Record<string, string>>({});
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [connectingTarget, setConnectingTarget] = useState<string | null>(null);
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const key of ["claude", "opencode", "codex", "antigravity", "nineRouter"]) {
      const saved = localStorage.getItem(`arunaki_cli_model_${key}`);
      if (saved) out[key] = saved;
    }
    return out;
  });

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/status${directoryQuery()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setData((prev) => {
            const updated = {
              ...prev,
              ...json.data,
              claude: { ...prev.claude, ...json.data.claude },
              opencode: { ...prev.opencode, ...json.data.opencode },
              antigravity: { ...prev.antigravity, ...json.data.antigravity },
              nineRouter: { ...prev.nineRouter, ...json.data.nineRouter },
              codex: { ...prev.codex, ...json.data.codex },
              discovered: json.data.discovered ?? prev.discovered,
            };
            try {
              localStorage.setItem("arunaki_cached_local_cli_status", JSON.stringify(updated));
              if (updated.antigravity?.accountEmail) {
                localStorage.setItem("arunaki_agy_email", updated.antigravity.accountEmail);
              }
            } catch {}
            return updated;
          });
        }
      }
    } catch {
      // Keep verified defaults on error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchQuota();
    // Ask each provider what it can actually run. Antigravity is the one that matters:
    // its catalogue is account-specific and changes as Google retires tiers.
    for (const t of ["antigravity", "opencode", "9router"] as const) fetchModels(t);
  }, []);

  // Provider states
  // Per-provider facts the generic card needs. Everything here is derived state, so it is
  // declared unconditionally with the rest of them (React Rules of Hooks).
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const toggleCard = (id: string) =>
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));


  /**
   * Where each provider's card state comes from.
   *
   * Only the provider-specific part is written down. Every other fact is shared: the credential
   * snapshot, and whether this provider is the active one. That split is what stops the next
   * provider from being half-wired - the earlier literal record needed an entry per provider and
   * silently defaulted to "not installed" when one was missing, which is how Kiro read as absent
   * while it was serving requests.
   */
  const SIGNALS: Partial<
    Record<
      string,
      (d: LocalCliData) => { installed: boolean; signedIn: boolean; email?: string; version?: string }
    >
  > = {
    claude: (d) => ({
      installed: d.claude.installed,
      signedIn: Boolean(d.claude.loggedIn || d.discovered?.some((x) => x.provider === "claude" && x.hasToken)),
      email: d.discovered?.find((x) => x.provider === "claude")?.accountEmail,
      version: d.claude.version,
    }),
    codex: (d) => ({
      installed: Boolean(d.codex?.installed),
      signedIn: Boolean(d.codex?.signedIn || d.discovered?.some((x) => x.provider === "codex" && x.hasToken)),
      email: d.codex?.accountEmail ?? d.discovered?.find((x) => x.provider === "codex")?.accountEmail,
      version: d.codex?.version,
    }),
    opencode: (d) => ({ installed: true, signedIn: true, version: d.opencode.version }),
    antigravity: (d) => ({
      installed: Boolean(d.antigravity?.agyInstalled ?? d.antigravity?.cliInstalled),
      signedIn: Boolean(d.antigravity?.agySignedIn),
      email: d.antigravity?.accountEmail,
      version: d.antigravity?.agyVersion,
    }),
    nineRouter: (d) => ({
      installed: Boolean(d.nineRouter?.installed),
      signedIn: Boolean(d.nineRouter?.running),
      version: d.nineRouter?.version,
    }),
    kiro: (d) => ({
      // Installs nothing, so "installed" is always true and the credential is the only question.
      installed: d.kiro?.installed ?? true,
      signedIn: Boolean(d.kiro?.signedIn || d.discovered?.some((x) => x.provider === "kiro" && x.hasToken)),
      email: d.kiro?.accountEmail ?? d.discovered?.find((x) => x.provider === "kiro")?.accountEmail,
    }),
  };

  /**
   * Card state for every provider the engine offers. Derived from the registry so a provider
   * added there gets a working card without touching this file.
   */
  const cardState: Record<string, { installed: boolean; signedIn: boolean; email?: string; active: boolean; version?: string }> =
    Object.fromEntries(
      (data.registry ?? []).map((d) => {
        const facts = SIGNALS[d.id]?.(data) ?? { installed: false, signedIn: false };
        const token = data.discovered?.find((x) => x.provider === d.id);
        return [
          d.id,
          {
            // Default to the credential when no signal is defined: a provider we do not know how
            // to probe is still genuinely connected if it holds a token.
            installed: facts.installed || Boolean(token?.hasToken),
            signedIn: facts.signedIn || Boolean(token?.hasToken),
            email: facts.email ?? token?.accountEmail,
            version: facts.version,
            // Active can be stored under the provider's connect id rather than its registry id
            // (claude is saved as "claude-code"), so both the local flag and the model-provider
            // list are consulted rather than a per-provider chain of comparisons.
            active:
              localStorage.getItem("arunaki_active_provider") === d.id ||
              providers.some((p) => p.active && (p.id === d.id || p.type === d.id)),
          },
        ];
      }),
    );


  // A credential stays in the local store after its CLI cache is gone so Refresh can
  // recover it ” never label an already expired token "Ready".


  // Live rate-limit windows straight from each vendor ” nothing here is hardcoded.
  // Live model catalogue per provider. The registry list is only a fallback: Google ships
  // and retires tiers constantly, and the static list named models this account cannot call
  // (claude-sonnet-5-5 and gemini-3.7-flash are not in the live catalogue).
  const fetchModels = async (target: string) => {
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/models${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const json = await res.json().catch(() => ({}));
      const models: string[] = json.data?.models ?? [];
      if (models.length) {
        setLiveModels((prev) => ({ ...prev, [target]: models }));
        setModelsAreLive((prev) => ({ ...prev, [target]: true }));
      }
    } catch {
      // Keep whatever the registry gave us.
    }
  };

  const fetchQuota = async () => {
    setQuotaLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/quota${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const json = await res.json().catch(() => ({}));
      setQuota(json.data ?? []);
    } catch {
      setQuota([]);
    } finally {
      setQuotaLoading(false);
    }
  };

  const formatReset = (resetAt?: number) => {
    if (!resetAt) return isEn ? "”" : "”";
    const diff = resetAt - Date.now();
    if (diff <= 0) return isEn ? "now" : "sekarang";
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return isEn ? `${mins}m` : `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return isEn ? `${hours}h ${mins % 60}m` : `${hours}j ${mins % 60}m`;
    const days = Math.floor(hours / 24);
    return isEn ? `${days}d ${hours % 24}h` : `${days}h ${hours % 24}j`;
  };

  /** Setup steps shown in the expanded card. Derived from the descriptor, never hardcoded per card. */
  const renderSetupSteps = (d: CliProviderDescriptor) => {
    const ready = cardState[d.id]?.signedIn;
    const installed = cardState[d.id]?.installed;
    if (ready) return null;
    const steps: { text: string; href?: string }[] = [];
    if (d.requiresCli && !installed) {
      steps.push({
        text: d.installSizeMb
          ? isEn
            ? `Install ${d.name} (${d.installSizeMb} MB)`
            : `Pasang ${d.name} (${d.installSizeMb} MB)`
          : isEn
          ? `Install ${d.name}`
          : `Pasang ${d.name}`,
        href: d.installUrl,
      });
    }
    if (d.loginMode === "terminal" && d.loginCommand) {
      steps.push({
        text: isEn
          ? `Sign in by running ${d.loginCommand} in the terminal`
          : `Masuk dengan menjalankan ${d.loginCommand} di terminal`,
      });
    }
    if (d.credentialPath || d.credentialTarget) {
      steps.push({
        text: d.credentialTarget
          ? isEn
            ? `Arunaki reads the token from Windows Credential Manager (${d.credentialTarget})`
            : `Arunaki membaca token dari Windows Credential Manager (${d.credentialTarget})`
          : isEn
          ? `Arunaki reads the token from ${d.credentialPath} automatically`
          : `Arunaki membaca token dari ${d.credentialPath} secara otomatis`,
      });
    }
    if (!steps.length) return null;
    return (
      <ol className="space-y-0.5 text-[10px] text-[var(--text-muted)]">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="text-zinc-600">{i + 1}.</span>
            <span className="flex items-center gap-1 flex-wrap">
              <span>{s.text}</span>
              {s.href && (
                <a
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-zinc-400 hover:text-zinc-200 underline underline-offset-2"
                >
                  {isEn ? "open" : "buka"}
                </a>
              )}
            </span>
          </li>
        ))}
      </ol>
    );
  };

  /** One card per registry entry. No provider-specific markup outside of this function. */
  const renderProviderCard = (d: CliProviderDescriptor) => {
    // The registry is the source of truth for which providers exist, so narrow once here
    // rather than casting at every handler call.
    const id = d.id as CliProviderId;
    const state = cardState[id] ?? {
      installed: false,
      signedIn: false,
      active: false,
    };
    const expanded = Boolean(expandedCards[id]);
    const discovered = data.discovered?.find((x) => x.provider === id);
    // A valid token is not the same as a working account. Codex on a free plan connects and then
    // refuses every request, so the card has to say which of the two the user has.
    const codexPlan = id === "codex" ? data.codex?.plan : undefined;
    const tokenExpiresAt = id === "codex" ? data.codex?.expiresAt : id === "kiro" ? data.kiro?.expiresAt : null;
    const ping = pingResults[id];
    const busy = connectingTarget === id;
    const dot = state.signedIn
      ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
      : state.installed
      ? "bg-amber-400"
      : loading
      ? "bg-amber-400/60 animate-pulse"
      : "bg-zinc-700";

    return (
      <div
        key={id}
        className={cn(
          "rounded-xl border transition-all duration-200",
          state.active
            ? "bg-[var(--bg-panel)] border-[var(--border-strong)] shadow-xs"
            : "bg-[var(--bg-card)] border-[var(--border-color)]"
        )}
      >
        <div className="px-4 py-3 flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => handleToggleConnection(id, state.active, d.name)}
            disabled={busy}
            title={
              state.active
                ? isEn ? "Click to Disconnect" : "Klik untuk Putuskan"
                : isEn ? "Click to Connect" : "Klik untuk Hubungkan"
            }
            className={cn(
              "w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer group/circle",
              state.active ? "border-white bg-white hover:bg-zinc-200" : "border-zinc-600 hover:border-white bg-transparent"
            )}
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
            ) : state.active ? (
              <>
                <Check className="w-3.5 h-3.5 text-zinc-950 stroke-[3] group-hover/circle:hidden" />
                <X className="w-3.5 h-3.5 text-zinc-950 stroke-[3] hidden group-hover/circle:inline" />
              </>
            ) : (
              <span className="w-2 h-2 rounded-full bg-zinc-600 group-hover/circle:bg-white transition-colors" />
            )}
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-[var(--text-primary)]">{d.name}</span>
              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dot)} />
              <span className="text-[11px] text-[var(--text-muted)] truncate max-w-[220px]">
                {state.signedIn
                  ? isEn ? "Connected" : "Terhubung"
                  : // "Not installed" is meaningless for a provider that installs nothing. Codex
                    // and Claude sign in through a browser, so the only thing left to say is that
                    // a sign-in is still missing.
                    !d.requiresCli
                  ? isEn ? "Sign-in needed" : "Perlu login"
                  : state.installed
                  ? isEn ? "Sign-in needed" : "Perlu login"
                  : loading
                  ? isEn ? "Checking status..." : "Memeriksa status..."
                  : isEn ? "Not installed" : "Belum terpasang"}
              </span>
              {refreshErrors[id] && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  title={refreshErrors[id]}
                >
                  <AlertTriangle className="w-2.5 h-2.5" />
                  Refresh failed
                </span>
              )}
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
              {d.vendor}
              {state.version ? ` • ${d.loginMode === "none" ? "" : d.name + " "}${state.version}` : ""}
            </p>
            {/* Say the requirement up front. Hitting a wall in the browser teaches nothing;
                the user has to come back and guess why it failed. */}
            {!state.signedIn && d.entitlement && (
              <p className="text-[10px] text-amber-500/90 mt-0.5 flex items-center gap-1 flex-wrap">
                <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                <span>{isEn ? d.entitlement.notice : d.entitlement.noticeId}</span>
                <a
                  href={d.entitlement.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-zinc-400 hover:text-zinc-200 underline underline-offset-2"
                >
                  {isEn ? "See plans" : "Lihat paket"}
                </a>
              </p>
            )}
            {/* A standing caveat, not a sign-in wall: shown connected or not. */}
            {d.note && (
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                {isEn ? d.note.text : d.note.textId}
              </p>
            )}
          </div>
        </div>

        {/* Collapsed row stays sparse: model picker, ping, docs, connect. */}
        <div className="px-4 pb-3 flex items-center gap-1.5 flex-wrap">
          {renderModelDropdown(id, modelsFor(id), id, state.active, d.name, Boolean(modelsAreLive[id]))}
          <button
            type="button"
            onClick={() => handleTestPing(id, d.name)}
            disabled={testingPingTarget === id}
            className={cn(
              "px-2.5 py-1 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5 shadow-xs border",
              ping
                ? ping.success
                  ? "bg-zinc-800 text-zinc-200 border-zinc-600"
                  : "bg-zinc-900 text-zinc-500 border-zinc-800"
                : "bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border-zinc-700"
            )}
            title={isEn ? "Test Ping connection & latency" : "Uji koneksi ping & latensi"}
          >
          {testingPingTarget === id ? (
            <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />
          ) : (
            <Wifi className="w-3 h-3 text-zinc-400" />
          )}
          <span>
            {testingPingTarget === id
              ? isEn ? "Testing..." : "Menguji..."
              : isEn ? "Test Ping" : "Uji Ping"}
          </span>
          {ping && !testingPingTarget && (
            <span
              className={ping.success ? "text-emerald-400" : "text-amber-400"}
              title={ping.success ? undefined : isEn ? "Last check failed" : "Pemeriksaan terakhir gagal"}
            >
              {ping.success ? `${ping.timeMs}ms` : isEn ? "failed" : "gagal"}
            </span>
          )}
        </button>
          {d.docsUrl && (
            <button
              type="button"
              onClick={() => window.open(d.docsUrl, "_blank")}
              className="px-2.5 py-1 bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5"
              title={isEn ? "Open the vendor page" : "Buka halaman vendor"}
            >
              <Globe className="w-3 h-3" />
              Docs
            </button>
          )}
          <button
            type="button"
            onClick={() => toggleCard(id)}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title={expanded ? (isEn ? "Collapse" : "Ciutkan") : isEn ? "Expand for limits & setup" : "Buka untuk kuota & panduan"}
          >
            <ChevronDown className={cn("w-4 h-4 transition-transform", expanded && "rotate-180")} />
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => handleToggleConnection(id, state.active, d.name)}
            disabled={busy}
            className={cn(
              "px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 select-none shadow-xs group",
              state.active
                ? "bg-white hover:bg-zinc-200 text-zinc-950 border border-white"
                : "bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-500"
            )}
          >
            {busy ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>{isEn ? "Connecting..." : "Menghubungkan..."}</span>
              </>
            ) : state.active ? (
              <>
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>{isEn ? "Connected" : "Terhubung"}</span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                <span>{isEn ? "Connect" : "Hubungkan"}</span>
              </>
            )}
          </button>
        </div>

        {expanded && (
          <div className="px-4 pb-3 pt-2 border-t border-[var(--border-color)] space-y-3">
            {renderSetupSteps(d)}
            {/* Plan and token lifetime: the two facts that decide whether a connected provider
                can actually answer. A free Codex account reads Connected and refuses everything. */}
            {(codexPlan || tokenExpiresAt) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-500">
                {codexPlan && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1",
                      codexPlan === "free" ? "text-amber-400/90" : "text-emerald-400/90",
                    )}
                    title={
                      codexPlan === "free"
                        ? isEn
                          ? "A free ChatGPT plan connects, but every request is refused by OpenAI"
                          : "Akun ChatGPT free terhubung, tapi setiap request ditolak OpenAI"
                        : isEn
                          ? "Subscription plan"
                          : "Paket langganan"
                    }
                  >
                    {isEn ? "Plan" : "Paket"}: {codexPlan}
                  </span>
                )}
                {tokenExpiresAt && (
                  <span title={isEn ? "When the stored token expires" : "Kapan token tersimpan kedaluwarsa"}>
                    {isEn ? "Token expires" : "Token berakhir"}:{" "}
                    {new Date(tokenExpiresAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            )}
            {d.quota !== "none" && renderQuota(d.quota)}
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              {discovered?.hasToken && d.id !== "nineRouter" && (
                <button
                  type="button"
                  onClick={() => handleRefreshCred(id as "claude" | "codex")}
                  disabled={refreshingTarget === id}
                  className="px-2 py-1 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1"
                  title={isEn ? "Refresh the harvested OAuth token" : "Perbarui token OAuth"}
                >
                  <RefreshCw className={cn("w-3 h-3", refreshingTarget === id && "animate-spin")} />
                  {refreshingTarget === id ? (isEn ? "Refreshing..." : "Memperbarui...") : isEn ? "Refresh token" : "Perbarui token"}
                </button>
              )}
              {d.supportsAutoConfigure && (
                <button
                  type="button"
                  onClick={() => handleInjectCli(id as "claude" | "codex")}
                  disabled={injectingTarget === id}
                  className="px-2 py-1 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1"
                >
                  {injectingTarget === id ? <Loader2 className="w-3 h-3 animate-spin" /> : <SlidersHorizontal className="w-3 h-3" />}
                  Auto-Configure CLI
                </button>
              )}
              {/* Browser PKCE is the default: no CLI to install, one click. The terminal stays as the
                secondary route for people who already have the vendor CLI, which is what 9Router
                offers too. */}
              {d.supportsBrowserLogin && !state.signedIn && (
                <button
                  type="button"
                  onClick={() => handleBrowserSignIn(id)}
                  disabled={oauthPendingTarget === id}
                  className="px-2 py-1 bg-white hover:bg-zinc-200 text-zinc-950 border border-white text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1 disabled:opacity-60"
                  title={
                    isEn
                      ? "Sign in with your browser, no CLI needed"
                      : "Masuk lewat browser, tanpa CLI"
                  }
                >
                  {oauthPendingTarget === id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Globe className="w-3 h-3" />
                  )}
                  {oauthPendingTarget === id
                    ? isEn
                      ? "Waiting for browser..."
                      : "Menunggu browser..."
                    : isEn
                    ? "Sign in with browser"
                    : "Masuk via browser"}
                </button>
              )}
              {/* Signing out deletes the stored token. Without it a user who connected a
                  subscription account had no way to remove it from Arunaki. */}
              {state.signedIn && discovered?.hasToken && (
                <button
                  type="button"
                  onClick={() => handleSignOut(id)}
                  disabled={signingOutTarget === id}
                  className="px-2 py-1 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 border border-zinc-700 rounded text-[10px] font-medium flex items-center gap-1 disabled:opacity-50"
                  title={
                    isEn
                      ? "Remove the stored credential from Arunaki"
                      : "Hapus kredensial tersimpan dari Arunaki"
                  }
                >
                  {signingOutTarget === id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <LogOut className="w-3 h-3" />
                  )}
                  {signingOutTarget === id
                    ? isEn
                      ? "Signing out..."
                      : "Keluar..."
                    : isEn
                    ? "Sign out"
                    : "Keluar"}
                </button>
              )}
              {/* OpenCode's credential lives in its own auth.json, so there is nothing to refresh
                  here and signing out must go through its CLI rather than editing a file Arunaki
                  does not own. */}
              {id === "opencode" && state.signedIn && (
                <button
                  type="button"
                  onClick={() => handleOpenCodeSignOut()}
                  disabled={signingOutTarget === id}
                  className="px-2 py-1 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 border border-zinc-700 rounded text-[10px] font-medium flex items-center gap-1 disabled:opacity-50"
                  title={
                    isEn
                      ? "Run 'opencode auth logout opencode' in a terminal"
                      : "Jalankan 'opencode auth logout opencode' di terminal"
                  }
                >
                  {signingOutTarget === id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <LogOut className="w-3 h-3" />
                  )}
                  {signingOutTarget === id
                    ? isEn
                      ? "Signing out..."
                      : "Keluar..."
                    : isEn
                    ? "Sign out"
                    : "Keluar"}
                </button>
              )}
              {d.loginMode === "terminal" && !state.signedIn && d.id === "antigravity" && (
                <button
                  type="button"
                  onClick={handleAntigravityCliLogin}
                  disabled={isSigningInCli}
                  className="px-2 py-1 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1"
                >
                  {isSigningInCli ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogIn className="w-3 h-3" />}
                  {isEn ? "Open sign-in terminal" : "Buka terminal login"}
                </button>
              )}
              {state.signedIn && d.id === "antigravity" && (
                <button
                  type="button"
                  onClick={() => handleAntigravityLogout()}
                  disabled={isLoggingOutAntigravity}
                  className="px-2 py-1 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1 disabled:opacity-60"
                >
                  {isLoggingOutAntigravity ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <LogOut className="w-3 h-3" />
                  )}
                  {isLoggingOutAntigravity
                    ? isEn ? "Signing out..." : "Keluar..."
                    : isEn ? "Sign out" : "Keluar"}
                </button>
              )}
              {d.loginMode === "terminal" && d.id !== "antigravity" && (
                <button
                  type="button"
                  onClick={() => setActiveAuthModalTarget(id)}
                  className="px-2 py-1 bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1"
                  title={isEn ? "Choose the sign-in method" : "Pilih metode masuk"}
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  {isEn ? "Auth Method" : "Metode Masuk"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  /** Rate-limit buckets for one provider, rendered inside that provider's own card. */
  const renderQuota = (provider: "antigravity" | "claude" | "codex" | "kiro") => {
    const report = quota.find((q) => q.provider === provider);
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300">
            <Gauge className="w-3.5 h-3.5" />
            {isEn ? "Rate Limit Windows" : "Jendela Batas Rate"}
          </div>
          <button
            type="button"
            onClick={fetchQuota}
            disabled={quotaLoading}
            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            title={isEn ? "Refresh quota" : "Muat ulang kuota"}
          >
            <RefreshCw className={cn("w-3 h-3", quotaLoading && "animate-spin")} />
          </button>
        </div>
        {!report || !report.ok ? (
          <div className="text-[10px] text-zinc-600">
            {quotaLoading
              ? isEn ? "Loading..." : "Memuat..."
              : isEn ? "Sign in to view limits" : "Masuk untuk melihat batas"}
          </div>
        ) : (
          <div className="space-y-1.5">
            {report.buckets.map((b) => {
              const pct = Math.round(b.remaining * 100);
              const bar = b.exhausted
                ? "bg-red-500"
                : pct <= 20
                  ? "bg-amber-500"
                  : "bg-emerald-500";
              return (
                <div key={b.id + b.window} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2 text-[10px]">
                    <span className="truncate text-zinc-500">
                      {b.label}
                      {b.window === "5h" ? ` (${b.window})` : ""}
                    </span>
                    <span className={cn("shrink-0 tabular-nums", b.exhausted ? "text-red-400" : "text-zinc-300")}>
                      {pct}% · {formatReset(b.resetAt)}
                    </span>
                  </div>
                  <div className="h-1 mt-0.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", bar)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {report.buckets.some((b) => b.exhausted) && (
              <div className="flex items-center gap-1 text-[10px] text-red-400 pt-0.5">
                <AlertTriangle className="w-2.5 h-2.5" />
                {isEn ? "Some models are exhausted" : "Sebagian model sudah habis"}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const handleRefreshCred = async (target: string) => {
    setRefreshingTarget(target);
    setRefreshErrors((prev) => {
      const next = { ...prev };
      delete next[target];
      return next;
    });
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/refresh${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.data?.success) {
        toast.success(isEn ? "Credentials Refreshed" : "Kredensial Diperbarui", {
          description: json.data.message,
        });
        await fetchStatus();
      } else {
        const msg = json.data?.message || (isEn ? "Failed to refresh token" : "Gagal memperbarui token");
        setRefreshErrors((prev) => ({ ...prev, [target]: msg }));
        toast.error(isEn ? "Token Refresh Failed" : "Gagal Refresh Token", {
          description: msg,
        });
      }
    } catch (err: any) {
      setRefreshErrors((prev) => ({ ...prev, [target]: err.message }));
      toast.error(isEn ? "Refresh Error" : "Kesalahan Refresh", {
        description: err.message,
      });
    } finally {
      setRefreshingTarget(null);
    }
  };


  /** OpenCode owns its auth.json, so signing out delegates to its own CLI. */
  const handleOpenCodeSignOut = async () => {
    setSigningOutTarget("opencode");
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/login${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "opencode-logout" }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.data?.success) {
        toast.success(isEn ? "Terminal opened" : "Terminal dibuka", {
          description: json.data.message,
        });
      } else {
        toast.error(isEn ? "Sign out failed" : "Gagal keluar", { description: json.data?.message ?? "" });
      }
    } catch (err: any) {
      toast.error(isEn ? "Sign out error" : "Kesalahan keluar", { description: err.message });
    } finally {
      setSigningOutTarget(null);
    }
  };

  /** Removes the stored credential. The engine deletes it; nothing here pretends otherwise. */
  const handleSignOut = async (target: string) => {
    setSigningOutTarget(target);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/refresh${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, action: "logout" }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.data?.success) {
        toast.success(isEn ? "Signed out" : "Berhasil keluar", { description: json.data.message });
      } else {
        toast.error(isEn ? "Sign out failed" : "Gagal keluar", {
          description: json.data?.message ?? "",
        });
      }
      await fetchStatus();
    } catch (err: any) {
      toast.error(isEn ? "Sign out error" : "Kesalahan keluar", { description: err.message });
    } finally {
      setSigningOutTarget(null);
    }
  };

  const handleInjectCli = async (target: "claude" | "codex" | "all", action: "inject" | "reset" = "inject") => {
    setInjectingTarget(target);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/inject${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, action }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.data?.success) {
        toast.success(
          action === "inject"
            ? (isEn ? "CLI Configured Successfully" : "CLI Berhasil Dikonfigurasi")
            : (isEn ? "CLI Reset to Defaults" : "Konfigurasi CLI Dikembalikan"),
          {
            description: json.data.message,
          }
        );
        await fetchStatus();
      } else {
        toast.error(isEn ? "Configuration Failed" : "Konfigurasi Gagal", {
          description: json.data?.message || (isEn ? "Failed to update CLI configuration" : "Gagal memperbarui konfigurasi CLI"),
        });
      }
    } catch (err: any) {
      toast.error(isEn ? "Injector Error" : "Kesalahan Injector", {
        description: err.message,
      });
    } finally {
      setInjectingTarget(null);
    }
  };

  const handleLaunchClaudeTerminal = async () => {
    setIsSigningInCli(true);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/login${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "claude" }),
      });
      const json = await res.json();
      if (json.data?.success) {
        toast.info(isEn ? "Terminal Window Opened" : "Jendela Terminal Terbuka", {
          description: isEn
            ? "Claude Code CLI opened in a new terminal window."
            : "Claude Code CLI dibuka pada jendela terminal baru.",
        });
      } else {
        toast.error(isEn ? "Cannot open terminal automatically" : "Tidak dapat membuka terminal otomatis", {
          description: isEn
            ? "Please run 'claude' manually in your terminal."
            : "Silakan jalankan 'claude' secara manual di terminal.",
        });
      }
    } catch (err: any) {
      toast.error(isEn ? "Failed to open Claude terminal" : "Gagal membuka terminal Claude", { description: err.message });
    } finally {
      setIsSigningInCli(false);
    }
  };

  const handleLaunchCodexTerminal = async () => {
    setIsSigningInCli(true);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/login${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "codex" }),
      });
      const json = await res.json();
      if (json.data?.success) {
        toast.info(isEn ? "Terminal Window Opened" : "Jendela Terminal Terbuka", {
          description: isEn
            ? "OpenAI Codex CLI opened in a new terminal window."
            : "OpenAI Codex CLI dibuka pada jendela terminal baru.",
        });
      } else {
        toast.error(isEn ? "Cannot open terminal" : "Tidak dapat membuka terminal", {
          description: isEn
            ? "Please run 'codex' manually in your terminal."
            : "Silakan jalankan 'codex' secara manual di terminal.",
        });
      }
    } catch (err: any) {
      toast.error(isEn ? "Failed to open Codex terminal" : "Gagal membuka terminal Codex", { description: err.message });
    } finally {
      setIsSigningInCli(false);
    }
  };

  const handleLaunchOpenCodeTerminal = async () => {
    setIsSigningInCli(true);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/login${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "opencode-terminal" }),
      });
      const json = await res.json();
      if (json.data?.success) {
        toast.info(isEn ? "Terminal Window Opened" : "Jendela Terminal Terbuka", {
          description: isEn
            ? "OpenCode CLI opened in a new terminal window."
            : "OpenCode CLI dibuka pada jendela terminal baru.",
        });
      } else {
        toast.error(isEn ? "Cannot open terminal" : "Tidak dapat membuka terminal", {
          description: isEn
            ? "Please run 'opencode' manually in your terminal."
            : "Silakan jalankan 'opencode' secara manual di terminal.",
        });
      }
    } catch (err: any) {
      toast.error(isEn ? "Failed to open OpenCode terminal" : "Gagal membuka terminal OpenCode", { description: err.message });
    } finally {
      setIsSigningInCli(false);
    }
  };

  const handleLaunch9Router = async () => {
    setIsSigningInCli(true);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/login${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "9router" }),
      });
      const json = await res.json();
      if (json.data?.success) {
        toast.info(isEn ? "Terminal Window Opened" : "Jendela Terminal Terbuka", {
          description: isEn
            ? "9Router started in a new terminal window."
            : "9Router dijalankan pada jendela terminal baru.",
        });
        setTimeout(fetchStatus, 2500);
      } else {
        toast.error(isEn ? "Cannot open terminal" : "Tidak dapat membuka terminal", {
          description: isEn
            ? "Please run '9router start' manually in your terminal."
            : "Silakan jalankan '9router start' secara manual di terminal.",
        });
      }
    } catch (err: any) {
      toast.error(isEn ? "Failed to start 9Router" : "Gagal menjalankan 9Router", { description: err.message });
    } finally {
      setIsSigningInCli(false);
    }
  };

  const startAntigravityPoll = () => {
    let attempts = 0;
    const pollTimer = setInterval(async () => {
      attempts++;
      try {
        const statusRes = await apiFetch(`${API_BASE}/providers/local-cli/status${directoryQuery()}`);
        if (statusRes.ok) {
          const statusJson = await statusRes.json();
          const agy = statusJson.data?.antigravity;
          if (agy?.loggedIn) {
            clearInterval(pollTimer);
            fetchStatus();
            setShowAntigravityLoginModal(false);
            toast.success("Signed in to Google Antigravity!", {
              description: `Active account: ${agy.accountEmail || "Google Account"}`,
            });
            if (!isGeminiActive) {
              handleConnectTarget("antigravity", "Google Antigravity");
            }
          }
        }
      } catch {}
      if (attempts >= 25) clearInterval(pollTimer);
    }, 1500);
  };

/**
   * Browser PKCE sign-in. Starts the flow, opens the browser, then polls until the callback
   * lands. A user who hits the vendor's "needs a subscription" page just closes the tab, so
   * there is no callback to detect; we surface the registry's entitlement notice instead of
   * spinning forever.
   */
  const handleBrowserSignIn = async (target: CliProviderId) => {
    if (oauthPendingTarget) return;
    setOauthPendingTarget(target);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/oauth/start${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.data?.requestId) throw new Error(json.data?.message ?? `HTTP ${res.status}`);
      const requestId = json.data.requestId as string;

      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise((r) => setTimeout(r, 1500));
        const probe = await apiFetch(
          `${API_BASE}/providers/local-cli/oauth/status${directoryQuery()}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId }) },
        ).catch(() => null);
        const probeJson = probe ? await probe.json().catch(() => ({})) : null;
        const result = probeJson?.data;
        if (!result) continue;
        if (result.status === "success") {
          toast.success(isEn ? "Connected" : "Terhubung", {
            description: isEn ? "Token received." : "Token diterima.",
          });
          await fetchStatus();
          return;
        }
        if (result.status === "error") {
          toast.error(isEn ? "Sign-in failed" : "Login gagal", {
            description: result.message ?? (isEn ? "The vendor rejected the request." : "Vendor menolak."),
          });
          return;
        }
      }
      // Timed out with no callback, which is what closing the entitlement page looks like.
      const notice = data.registry?.find((d) => d.id === target)?.entitlement;
      toast.error(isEn ? "Sign-in not completed" : "Login tidak diselesaikan", {
        description: notice
          ? `${isEn ? notice.notice : notice.noticeId}. ${isEn ? "Check the browser tab, or upgrade, then try again." : "Cek tab browser, atau upgrade, lalu coba lagi."}`
          : isEn
          ? "The browser tab was closed before sign-in finished."
          : "Tab browser ditutup sebelum login selesai.",
      });
    } catch (err: any) {
      toast.error(isEn ? "Could not start sign-in" : "Gagal memulai login", {
        description: err?.message,
      });
    } finally {
      setOauthPendingTarget(null);
    }
  };

  const handleAntigravityCliLogin = async () => {
    setIsSigningInCli(true);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/login${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "antigravity-cli" }),
      });
      const json = await res.json();
      if (json.data?.success) {
        toast.info("Antigravity Terminal Opened", {
          description: isEn
            ? "Terminal window opened for CLI authentication."
            : "Jendela terminal dibuka untuk otentikasi CLI.",
        });
        startAntigravityPoll();
      } else {
        toast.error(isEn ? "Failed to open CLI terminal" : "Gagal membuka CLI terminal", { description: json.data?.message });
      }
    } catch (err: any) {
      toast.error(isEn ? "Failed to initiate CLI login" : "Gagal memulai login CLI", { description: err.message });
    } finally {
      setIsSigningInCli(false);
    }
  };


  const handleAntigravityLogout = async () => {
    setIsLoggingOutAntigravity(true);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/login${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "antigravity-logout" }),
      });
      const json = await res.json();
      if (json.data?.success) {
        toast.info("Logged Out", {
          description: "Google Antigravity credentials cleared. You can now login with a new account.",
        });
        await handleDisconnect("antigravity", "Google Antigravity");
        fetchStatus();
      } else {
        toast.error("Logout failed", { description: json.data?.message });
      }
    } catch (err: any) {
      toast.error("Failed to logout", { description: err.message });
    } finally {
      setIsLoggingOutAntigravity(false);
    }
  };

  // Gemini and Antigravity are the same lane; the provider is stored under either id.
const isGeminiActive =
  localStorage.getItem("arunaki_active_provider") === "gemini" ||
  localStorage.getItem("arunaki_active_provider") === "gemini-cli" ||
  localStorage.getItem("arunaki_active_provider") === "antigravity";

  /**
   * Connect contracts, keyed by provider id.
   *
   * Deliberately a partial map over the engine registry rather than a Record of every provider.
   * Writing all six out by hand meant a new provider could be added to the registry, get a card,
   * and still have no connect contract - which is exactly the shape of the half-wired bugs this
   * page already produced once. Anything absent is handled explicitly below.
   */
  const PROVIDER_CONFIGS: Record<
    string,
    { id: string; name: string; type: string; baseUrl: string; apiKey: string }
  > = {
    // The only provider that does not talk to the local bridge.
    nineRouter: {
      id: "9router",
      name: "9Router Gateway",
      type: "openai-compatible",
      baseUrl: "http://localhost:20128/v1",
      apiKey: "9router",
    },
  };

  /**
   * Resolve a connect contract for any registry provider.
   *
   * The bridge owns every vendor conversation, so it is the correct default: it holds the
   * credentials, decodes each vendor's wire format, and is where the model prefix is stripped.
   * Only a provider that genuinely bypasses it needs an entry above.
   */
  const connectConfigFor = (target: string, name: string) => {
    const override = PROVIDER_CONFIGS[target];
    if (override) return override;
    return {
      id: target,
      name,
      type: "openai-compatible",
      baseUrl: `http://127.0.0.1:${data.bridgePort || 20188}/v1`,
      apiKey: `${target}-local-session`,
    };
  };

  const handleConnectTarget = async (
    target: CliProviderId,
    friendlyName: string
  ) => {
    setConnectingTarget(target);
    const config = connectConfigFor(target, friendlyName);
    // Every registry provider resolves a config now, so a card can never claim to be
    // "not ready to connect" just because this file was not updated alongside the registry.
    if (!config) {
      setConnectingTarget(null);
      toast.error(isEn ? `${friendlyName} is not ready to connect` : `${friendlyName} belum siap dihubungkan`, {
        description: isEn
          ? "No connect endpoint is configured for this provider yet."
          : "Belum ada endpoint koneksi yang dikonfigurasi untuk provider ini.",
      });
      return;
    }
    const chosenModel = selectedModels[target] || modelsFor(target)[0];
    const activeId = config.id;

    try {
      // 1. Ensure provider exists / is updated in SQLite
      await apiFetch(`${API_BASE}/providers/${activeId}${directoryQuery()}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: config.name,
          type: config.type,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model: chosenModel,
        }),
      }).catch(() => {});

      // 2. Activate the provider
      const stateRes = await apiFetch(`${API_BASE}/providers/${activeId}/state${directoryQuery()}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true, model: chosenModel }),
      });

      if (!stateRes.ok) {
        // Fallback: try POST /providers if PUT returned 404
        await apiFetch(`${API_BASE}/providers${directoryQuery()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: activeId,
            name: config.name,
            type: config.type,
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            model: chosenModel,
            active: true,
          }),
        }).catch(() => {});
      }

      // If Claude, OpenCode, or Google Antigravity, also notify bridge/local-cli
      if (target === "claude" || target === "antigravity" || target === "opencode") {
        await apiFetch(`${API_BASE}/providers/local-cli/connect${directoryQuery()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: target === "claude" ? "claude" : target === "opencode" ? "opencode" : "antigravity",
            model: chosenModel,
          }),
        }).catch(() => {});
      }

      // 3. Save to localStorage
      localStorage.setItem("arunaki_active_provider", activeId);
      localStorage.setItem("arunaki_last_active_cli", activeId);
      localStorage.setItem("arunaki_active_model", chosenModel);

      toast.success(`${friendlyName} Connected & Active`, {
        description: `Ready to run document tasks using ${chosenModel}.`,
      });
      onRefresh();
      fetchStatus();
    } catch (err: any) {
      toast.error("Connection Error", { description: err.message });
    } finally {
      setConnectingTarget(null);
    }
  };

  const handleDisconnect = async (providerId: string, friendlyName: string) => {
    try {
      localStorage.removeItem("arunaki_active_provider");
      localStorage.removeItem("arunaki_last_active_cli");
      localStorage.removeItem("arunaki_active_model");
      await apiFetch(`${API_BASE}/providers/${providerId}/state${directoryQuery()}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      }).catch(() => {});
      toast.info(`${friendlyName} Disconnected`, {
        description: "CLI agent disconnected. Arunaki is in standby.",
      });
      onRefresh();
      fetchStatus();
    } catch (err: any) {
      toast.error("Failed to disconnect", { description: err.message });
    }
  };

  const handleToggleConnection = async (
    target: CliProviderId,
    isActive: boolean,
    friendlyName: string
  ) => {
    const config = connectConfigFor(target, friendlyName);
    if (!config) {
      toast.error(isEn ? `${friendlyName} is not ready` : `${friendlyName} belum siap`, {
        description: isEn
          ? "No connect endpoint is configured for this provider yet."
          : "Belum ada endpoint koneksi yang dikonfigurasi untuk provider ini.",
      });
      return;
    }
    if (isActive) {
      await handleDisconnect(config.id, friendlyName);
    } else {
      await handleConnectTarget(target, friendlyName);
    }
  };

  const handleTestPing = async (
    target: CliProviderId,
    friendlyName: string
  ) => {
    setTestingPingTarget(target);
    const startMs = Date.now();
    try {
      if (target === "antigravity" || target === "opencode") {
        try {
          const directRes = await fetch("http://127.0.0.1:20188/v1/models", {
            signal: AbortSignal.timeout(1200),
          }).catch(() => null);
          if (directRes && directRes.ok) {
            const elapsed = Math.max(Date.now() - startMs, 12);
            let opencodeDetail = "OpenCode CLI bridge active (port 20188)";
            if (target === "opencode") {
              const currentModel = (selectedModels.opencode || "").toLowerCase();
              if (currentModel.includes("pickle") || currentModel.startsWith("opencode/")) {
                opencodeDetail = "OpenCode CLI bridge active (OpenCode Zen / Big Pickle)";
              } else if (currentModel.includes("groq") || currentModel.includes("qwen") || currentModel.includes("gpt-oss")) {
                opencodeDetail = "OpenCode CLI bridge active (Groq Cloud LPU)";
              } else if (currentModel.includes("9router")) {
                opencodeDetail = "OpenCode CLI bridge active (9Router Gateway)";
              } else {
                opencodeDetail = `OpenCode CLI bridge active (${data.opencode?.hasGroq ? "Groq Cloud" : "port 20188"})`;
              }
            }
            const detail =
              target === "opencode"
                ? opencodeDetail
                : `Google Antigravity CLI bridge active (${data.antigravity?.agyVersion ? `agy ${data.antigravity.agyVersion}` : "port 20188"})`;
            setPingResults((prev) => ({
              ...prev,
              [target]: {
                success: true,
                timeMs: elapsed,
                message: detail,
              },
            }));
            toast.success(`${friendlyName} Ping OK (${elapsed}ms)`, {
              description: detail,
            });
            return;
          }
        } catch {}
      }

      const res = await apiFetch(`${API_BASE}/providers/local-cli/status${directoryQuery()}`);
      const json = await res.json().catch(() => ({}));
      const local = json.data || data;

      if (json.data) {
        setData((prev) => {
          const updated = {
            ...prev,
            ...json.data,
            claude: { ...prev.claude, ...json.data.claude },
            opencode: { ...prev.opencode, ...json.data.opencode },
            antigravity: { ...prev.antigravity, ...json.data.antigravity },
            nineRouter: { ...prev.nineRouter, ...json.data.nineRouter },
            codex: { ...prev.codex, ...json.data.codex },
          };
          try {
            localStorage.setItem("arunaki_cached_local_cli_status", JSON.stringify(updated));
            if (updated.antigravity?.accountEmail) {
              localStorage.setItem("arunaki_agy_email", updated.antigravity.accountEmail);
            }
          } catch {}
          return updated;
        });
      }

      let isLive = false;
      let detail = "";

      if (target === "antigravity") {
        isLive = !!local.bridgeRunning && (!!local.antigravity?.detected || !!local.antigravity?.cliInstalled);
        detail = isLive
          ? `Google Antigravity CLI bridge active (${local.antigravity?.agyVersion ? `agy ${local.antigravity.agyVersion}` : "port 20188"})`
          : local.bridgeRunning
          ? "Bridge active (Google Antigravity CLI ready)"
          : "Local CLI bridge offline";
      } else if (target === "claude") {
        isLive = !!local.claude?.installed && (!!local.claude?.loggedIn || !!local.bridgeRunning);
        detail = isLive
          ? "Claude Code CLI authenticated & ready"
          : local.claude?.installed
          ? "Login required ('claude login')"
          : "Claude Code CLI not installed";
      } else if (target === "nineRouter") {
        isLive = !!local.nineRouter?.running || !!local.nineRouter?.installed;
        detail = local.nineRouter?.running
          ? "9Router gateway running on port 20128"
          : local.nineRouter?.installed
          ? "9Router installed (ready to start)"
          : "9Router binary not installed";
      } else if (target === "opencode") {
        isLive = !!local.opencode?.installed;
        detail = isLive ? "OpenCode interpreter ready" : "OpenCode not installed";
      } else if (target === "codex") {
        isLive = !!local.codex?.installed;
        detail = isLive ? "OpenAI Codex CLI ready" : "OpenAI Codex CLI not installed";
      }

      const elapsed = Math.max(Date.now() - startMs, 14);

      setPingResults((prev) => ({
        ...prev,
        [target]: {
          success: isLive,
          timeMs: elapsed,
          message: detail,
        },
      }));

      if (isLive) {
        toast.success(`${friendlyName} Ping OK (${elapsed}ms)`, {
          description: detail,
        });
      } else {
        toast.error(`${friendlyName} Ping Offline`, {
          description: detail,
        });
      }
    } catch (err: any) {
      const elapsed = Math.max(Date.now() - startMs, 15);
      setPingResults((prev) => ({
        ...prev,
        [target]: {
          success: false,
          timeMs: elapsed,
          message: err.message,
        },
      }));
      toast.error(`${friendlyName} Ping Error`, {
        description: err.message,
      });
    } finally {
      setTestingPingTarget(null);
    }
  };

  const handleSelectModel = async (
    targetKey: string,
    modelName: string,
    activeId: string,
    isActive: boolean,
    friendlyName: string
  ) => {
    setSelectedModels((prev) => ({ ...prev, [targetKey]: modelName }));
    localStorage.setItem(`arunaki_cli_model_${targetKey}`, modelName);
    setOpenDropdownId(null);

    if (isActive) {
      localStorage.setItem("arunaki_active_model", modelName);
      try {
        await apiFetch(`${API_BASE}/providers/${activeId}/state${directoryQuery()}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: true, model: modelName }),
        });
        toast.success(`${friendlyName} Model Updated`, {
          description: `Now using ${modelName}.`,
        });
        onRefresh();
      } catch {
        toast.error(`Failed to update ${friendlyName} model`);
      }
    } else {
      toast.info(`Selected ${modelName}`, {
        description: `Will be used when you connect ${friendlyName}.`,
      });
    }
  };

  const renderModelDropdown = (
    targetKey: CliProviderId,
    presetModels: string[],
    activeId: string,
    isActive: boolean,
    friendlyName: string,
    isLive = false
  ) => {
    // Nothing to choose from yet: a provider with an empty catalogue gets no dropdown, since
    // an empty picker is noise. The card still shows status, docs, ping and connect.
    if (!presetModels.length) return null;
    const currentModel = selectedModels[targetKey] || presetModels[0];
    const meta = describeModel(currentModel);
    const isOpen = openDropdownId === targetKey;

    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenDropdownId(isOpen ? null : targetKey)}
          className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-600 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5 max-w-[140px] sm:max-w-[180px]"
          title="Choose model manually"
        >
          <SlidersHorizontal className="w-3 h-3 text-zinc-400 shrink-0" />
          <span className="truncate font-mono">{meta.label}</span>
          <ChevronDown className={cn("w-3 h-3 text-zinc-400 shrink-0 transition-transform", isOpen && "rotate-180")} />
        </button>

        {isOpen && (
          // Anchored left: the trigger sits at the left edge of the card, so a
          // right-aligned panel would extend past the viewport and get clipped.
          <div className="absolute left-0 top-full mt-1.5 z-50 w-72 sm:w-80 p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl space-y-2">
            <div className="flex items-center justify-between px-1 pb-1.5 border-b border-zinc-800">
              <span className="text-xs font-semibold text-zinc-200">Model</span>
              <span className="text-[10px] text-zinc-500 font-mono">
              {isLive ? (isEn ? "Live from account" : "Live dari akun") : (isEn ? "Default list" : "Daftar bawaan")}
            </span>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-0.5 pr-1">
              {presetModels.map((m) => {
                const itemMeta = describeModel(m);
                const isSelected = currentModel === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleSelectModel(targetKey, m, activeId, isActive, friendlyName)}
                    className={cn(
                      "w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between gap-2 transition-all cursor-pointer",
                      isSelected
                        ? "bg-zinc-800 text-white font-medium border border-zinc-700"
                        : "text-zinc-300 hover:bg-zinc-900 hover:text-white"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isSelected ? (
                        <Check className="w-3.5 h-3.5 text-white shrink-0" />
                      ) : (
                        <span className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span className="truncate">{itemMeta.label}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {itemMeta.badge && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700/60 font-mono">
                          {itemMeta.badge}
                        </span>
                      )}
                      {itemMeta.speed && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-900 text-zinc-400 border border-zinc-800 font-mono">
                          {itemMeta.speed}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Custom Model Input */}
            <div className="pt-2 border-t border-zinc-800 space-y-1.5">
              <div className="text-[10px] text-zinc-400 font-medium px-1">Custom / Manual Model:</div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={customInput[targetKey] || ""}
                  onChange={(e) => setCustomInput((prev) => ({ ...prev, [targetKey]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customInput[targetKey]?.trim()) {
                      handleSelectModel(targetKey, customInput[targetKey].trim(), activeId, isActive, friendlyName);
                    }
                  }}
                  placeholder="Type model name..."
                  className="flex-1 bg-zinc-900 border border-zinc-800 text-xs text-white px-2.5 py-1 rounded-lg focus:outline-none focus:border-zinc-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (customInput[targetKey]?.trim()) {
                      handleSelectModel(targetKey, customInput[targetKey].trim(), activeId, isActive, friendlyName);
                    }
                  }}
                  className="px-2.5 py-1 bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs rounded-lg transition-all cursor-pointer"
                >
                  Set
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 w-full relative">
      {/* Click outside to close open dropdown */}
      {openDropdownId && (
        <div
          className="fixed inset-0 z-40 bg-transparent"
          onClick={() => setOpenDropdownId(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-[var(--text-primary)] text-base flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[var(--text-primary)]" />
            {isEn ? "Connection CLI & Agent Subscriptions" : "Koneksi CLI & Langganan Agen"}
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {isEn
              ? "Harness your flat subscription accounts (Claude Pro, OpenCode, OpenAI Codex, Google Antigravity, 9Router) directly with zero per-token fees."
              : "Gunakan akun langganan tetap Anda (Claude Pro, OpenCode, OpenAI Codex, Google Antigravity, 9Router) langsung tanpa biaya per-token."}
          </p>
        </div>

        <button
          type="button"
          onClick={fetchStatus}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-all cursor-pointer disabled:opacity-50 shadow-xs"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          <span>{isEn ? "Scan All Agents" : "Pindai Semua Agen"}</span>
        </button>
      </div>

      {/* Every card below comes from the engine registry. */}
      <div className="space-y-2 w-full">
        {(data.registry ?? []).map((descriptor) => renderProviderCard(descriptor))}

        {(data.discovered ?? []).some((x) => x.hasToken) && (
          <div className="px-4 py-3 rounded-xl border border-zinc-800 bg-zinc-950/40 flex items-center gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="min-w-0 text-xs text-zinc-400 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-zinc-200">Discovered Local Caches:</span>
                {/* Derived, not enumerated. This row used to test four providers by name, so
                    OpenCode was found by the harvester and then never rendered. */}
                {(data.discovered ?? [])
                  .filter((x) => x.hasToken)
                  .map((x) => (
                    <span
                      key={x.provider}
                      className="inline-flex items-center gap-1 text-emerald-400 font-medium"
                    >
                      {x.displayName || x.provider} &middot; OK
                    </span>
                  ))}
              </div>
              </div>
            <button
              type="button"
              onClick={() => handleRefreshCred("all")}
              disabled={refreshingTarget === "all"}
              className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5 shrink-0"
              title="Refresh all harvested credentials"
            >
              <RefreshCw className={cn("w-3 h-3", refreshingTarget === "all" && "animate-spin text-zinc-400")} />
              <span>{refreshingTarget === "all" ? "Refreshing..." : "Refresh All"}</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Multi-Provider Auth Modal (Bilingual & Clean Monochrome) ── */}
      {(() => {
        const currentTarget = activeAuthModalTarget || (showAntigravityLoginModal ? "antigravity" : null);
        if (!currentTarget) return null;

        const closeModal = () => {
          setActiveAuthModalTarget(null);
          setShowAntigravityLoginModal(false);
        };

        const config = (() => {
          switch (currentTarget) {
            case "claude":
              return {
                title: isEn ? "Anthropic Claude Authentication" : "Autentikasi Anthropic Claude",
                subtitle: isEn
                  ? "Choose an authentication method to connect your Claude Pro / Team account."
                  : "Pilih metode autentikasi akun Claude Pro / Team ke workstation Arunaki.",
                badgeLetter: "C",
                accountActiveText: data.claude?.email
                  ? (isEn ? `Active account: ${data.claude.email}` : `Akun aktif: ${data.claude.email}`)
                  : undefined,
                isLoggedIn: Boolean(data.claude?.loggedIn),
                cliLabel: isEn ? "Sign in via CLI (Terminal)" : "Masuk via CLI (Terminal)",
                cliBadge: "Claude Code",
                cliDesc: isEn
                  ? "Runs 'claude auth login --claudeai' in terminal for local machine authentication."
                  : "Menjalankan perintah 'claude auth login --claudeai' di terminal untuk otentikasi lokal.",
                cliTradeoffTitle: isEn ? "CLI Considerations:" : "Pertimbangan (Terminal CLI):",
                cliTradeoffText: isEn
                  ? "Opens a console terminal window for initial login. Tokens are stored locally on PC (~/.claude.json) with zero per-token cost."
                  : "Membuka jendela konsol terminal untuk inisialisasi login awal. Token disimpan lokal di PC (~/.claude.json) dan bebas biaya per-token.",
                cliButton: isEn ? "Launch Claude Terminal" : "Buka Terminal Claude",
                onCliAction: () => {
                  handleLaunchClaudeTerminal();
                  closeModal();
                },
              };
            case "codex":
              return {
                title: isEn ? "OpenAI Codex Authentication" : "Autentikasi OpenAI Codex",
                subtitle: isEn
                  ? "Choose an authentication method for your OpenAI / ChatGPT Plus account."
                  : "Pilih metode autentikasi akun OpenAI / ChatGPT Plus ke workstation Arunaki.",
                badgeLetter: "O",
                accountActiveText: undefined,
                isLoggedIn: Boolean(data.codex?.installed),
                cliLabel: isEn ? "Sign in via CLI (Terminal)" : "Masuk via CLI (Terminal)",
                cliBadge: "@openai/codex",
                cliDesc: isEn
                  ? "Uses global '@openai/codex' CLI package via local console on your PC."
                  : "Menggunakan paket CLI global '@openai/codex' melalui konsol lokal di PC Anda.",
                cliTradeoffTitle: isEn ? "CLI Considerations:" : "Pertimbangan (Terminal CLI):",
                cliTradeoffText: isEn
                  ? "Requires global npm '@openai/codex' installation. Runs interactive console sessions locally on your machine."
                  : "Memerlukan instalasi global npm '@openai/codex'. Menjalankan interaksi konsol langsung di PC Anda.",
                cliButton: isEn ? "Launch Codex Terminal" : "Buka Terminal Codex",
                onCliAction: () => {
                  handleLaunchCodexTerminal();
                  closeModal();
                },
              };
            case "opencode":
              return {
                title: isEn ? "OpenCode Agent Authentication" : "Autentikasi OpenCode Agent",
                subtitle: isEn
                  ? "Choose an authentication method to connect OpenCode models to Arunaki."
                  : "Pilih metode autentikasi untuk menghubungkan model OpenCode ke Arunaki.",
                badgeLetter: "OC",
                accountActiveText: data.opencode?.authenticatedProviders?.length
                  ? (isEn
                      ? `Connected providers: ${data.opencode.authenticatedProviders.join(", ")}`
                      : `Penyedia terhubung: ${data.opencode.authenticatedProviders.join(", ")}`)
                  : undefined,
                isLoggedIn: Boolean(data.opencode?.serverRunning || data.opencode?.authenticatedProviders?.length),
                webLabel: isEn ? "Sign in via Web (Groq Hub)" : "Masuk via Web (Groq Hub)",
                webBadge: "Cloud Free API",
                webDesc: isEn
                  ? "Connect free cloud provider keys (Groq / 9Router) directly via web without a terminal."
                  : "Menghubungkan kunci penyedia cloud gratis (Groq / 9Router) langsung via web tanpa terminal.",
                webWarningTitle: isEn ? "Notice (Cloud API):" : "Peringatan (Cloud API):",
                webWarningText: isEn
                  ? "Uses external cloud inference (Groq Llama 3.3 / Qwen). Requires a stable internet connection to cloud endpoints."
                  : "Menggunakan cloud inference eksternal (Groq Llama 3.3 / Qwen). Memerlukan koneksi internet stabil ke endpoint cloud.",
                webButton: isEn ? "Open Groq Console (Web)" : "Buka Konsol Groq (Web)",
                onWebAction: () => {
                  window.open("https://console.groq.com/keys", "_blank");
                  closeModal();
                },
                cliLabel: isEn ? "Sign in via CLI (Terminal)" : "Masuk via CLI (Terminal)",
                cliBadge: "OpenCode CLI",
                cliDesc: isEn
                  ? "Runs local OpenCode daemon server on port 4097 with interactive sessions."
                  : "Menjalankan server daemon OpenCode lokal di port 4097 dengan sesi interaktif.",
                cliTradeoffTitle: isEn ? "CLI Considerations:" : "Pertimbangan (Terminal CLI):",
                cliTradeoffText: isEn
                  ? "Runs a local background process on port 4097. Requires an active terminal runtime on your PC."
                  : "Menjalankan proses latar belakang lokal di port 4097. Membutuhkan runtime terminal aktif di PC.",
                cliButton: isEn ? "Launch OpenCode Terminal" : "Buka Terminal OpenCode",
                onCliAction: () => {
                  handleLaunchOpenCodeTerminal();
                  closeModal();
                },
              };
            case "nineRouter":
              return {
                title: isEn ? "9Router Gateway Integration" : "Integrasi 9Router Gateway",
                subtitle: isEn
                  ? "Connect your local multi-account 9Router gateway to Arunaki."
                  : "Hubungkan gateway multi-akun 9Router lokal ke Arunaki.",
                badgeLetter: "9R",
                accountActiveText: data.nineRouter?.running
                  ? (isEn ? "9Router gateway is running on port 20128" : "Gateway 9Router sedang berjalan di port 20128")
                  : undefined,
                isLoggedIn: Boolean(data.nineRouter?.running),
                webLabel: isEn ? "9Router Web Dashboard" : "Dashboard Web 9Router",
                webBadge: "Web Dashboard",
                webDesc: isEn
                  ? "Open local 9Router dashboard in browser to visually sign in to Google, Claude, OpenAI, and Grok."
                  : "Buka dashboard lokal 9Router di peramban web untuk login email Google, Claude, OpenAI, dan Grok secara visual.",
                webWarningTitle: isEn ? "Notice (Dashboard):" : "Peringatan (Dashboard):",
                webWarningText: isEn
                  ? "Opens local 9Router portal on port 20128. Make sure 9Router service is running before opening."
                  : "Membuka portal lokal 9Router di port 20128. Pastikan layanan 9Router sudah berjalan sebelum membuka tautan.",
                webButton: isEn ? "Open 9Router Dashboard (Web)" : "Buka Dashboard 9Router (Web)",
                onWebAction: () => {
                  window.open("http://localhost:20128", "_blank");
                  closeModal();
                },
                cliLabel: isEn ? "Run via Terminal" : "Jalankan via Terminal",
                cliBadge: "npm i -g 9router && 9router",
                cliDesc: isEn
                  ? "Start local 9Router gateway proxy via console terminal window."
                  : "Mulai gateway proxy lokal 9Router melalui jendela konsol terminal.",
                cliTradeoffTitle: isEn ? "CLI Setup & Command:" : "Petunjuk Instalasi & Perintah:",
                cliTradeoffText: isEn
                  ? "Install globally via 'npm i -g 9router' and launch with '9router'. Exposes an OpenAI-compatible API at http://localhost:20128/v1 for unified CLI, Pro, and free models (ComboMaut, oc/*, kr/*, vx/*)."
                  : "Pasang secara global via 'npm i -g 9router' dan jalankan dengan '9router'. Menyediakan API kompatibel OpenAI di http://localhost:20128/v1 untuk semua akun CLI, Pro, dan model gratis (ComboMaut, oc/*, kr/*, vx/*).",
                cliButton: isEn ? "Start 9Router in Terminal" : "Mulai 9Router di Terminal",
                onCliAction: () => {
                  handleLaunch9Router();
                  closeModal();
                },
              };
            case "antigravity":
            default:
              return {
                title: isEn ? "Google Antigravity Authentication" : "Autentikasi Google Antigravity",
                subtitle: isEn
                  ? "Choose an authentication method to connect Gemini models to Arunaki."
                  : "Pilih metode autentikasi untuk menghubungkan model Gemini ke Arunaki.",
                badgeLetter: "A",
                accountActiveText: data.antigravity?.accountEmail
                  ? `${isEn ? "Current active account: " : "Akun aktif saat ini: "}${data.antigravity.accountEmail}`
                  : undefined,
                isLoggedIn: Boolean(data.antigravity?.loggedIn),
                webLabel: isEn ? "Sign in with Antigravity CLI" : "Masuk dengan Antigravity CLI",
                webBadge: "Terminal agy",
                webDesc: isEn
                  ? "Opens a terminal running the Antigravity CLI. Sign in with your Google AI Pro account there ” agy only authenticates interactively."
                  : "Membuka terminal menjalankan Antigravity CLI. Masuk dengan akun Google AI Pro Anda di sana ” agy hanya bisa autentikasi secara interaktif.",
                webWarningTitle: isEn ? "Notice (CLI sign-in):" : "Peringatan (Login CLI):",
                webWarningText: isEn
                  ? "Antigravity authenticates interactively: a terminal opens running agy, and you complete the Google sign-in there. Direct browser OAuth is refused by Google for this client."
                  : "Antigravity melakukan autentikasi secara interaktif: terminal terbuka menjalankan agy, dan Anda menyelesaikan login Google di sana. OAuth browser langsung ditolak Google untuk client ini.",
                webButton: isEn ? "Sign in with Antigravity (Terminal)" : "Masuk dengan Antigravity (Terminal)",
                onWebAction: handleAntigravityCliLogin,
                cliLabel: isEn ? "Sign in via CLI" : "Masuk via CLI",
                cliBadge: "Terminal agy",
                cliDesc: isEn
                  ? "Uses locally installed Antigravity CLI synced on your computer."
                  : "Menggunakan aplikasi Antigravity CLI lokal yang sudah terpasang dan tersinkronisasi di komputer.",
                cliTradeoffTitle: isEn ? "CLI Considerations:" : "Pertimbangan (Terminal CLI):",
                cliTradeoffText: isEn
                  ? "Opens a physical terminal window (wt/cmd) for initial login. Provides minimal latency (~17ms) and immediately reads active PC session."
                  : "Membuka jendela konsol terminal fisik (wt/cmd) untuk inisialisasi login awal. Memberikan latensi paling minimal (~17ms) & langsung membaca sesi akun aktif PC.",
                cliButton: isEn ? "Launch Terminal CLI" : "Buka Terminal CLI",
                onCliAction: handleAntigravityCliLogin,
              };
          }
        })();

        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative text-left">
              <button
                type="button"
                onClick={closeModal}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                title={isEn ? "Close" : "Tutup"}
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white font-bold text-sm">
                  {config.badgeLetter}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">
                    {config.title}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    {config.subtitle}
                  </p>
                </div>
              </div>

              {config.accountActiveText && (
                <div className="my-3 px-3.5 py-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.7)]" />
                    <span className="text-zinc-300">
                      {config.accountActiveText}
                    </span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 font-medium">
                    {isEn ? "Connected" : "Terhubung"}
                  </span>
                </div>
              )}

{/* Terminal sign-in is the only supported route for these vendors, so the
                  modal shows one option instead of the old browser/terminal pair. */}
              <div className="flex flex-col justify-between p-4.5 rounded-xl border border-zinc-800 hover:border-zinc-600 bg-zinc-900/50 hover:bg-zinc-900/80 transition-all group">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-200">
                          <Terminal className="w-4 h-4" />
                        </div>
                        <span className="font-semibold text-sm text-white">{config.cliLabel}</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300 font-medium">
                        {config.cliBadge}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mb-3.5 leading-relaxed">
                      {config.cliDesc}
                    </p>

                    {/* Kotak Pertimbangan (Monochrome) */}
                    <div className="p-3 rounded-lg bg-zinc-900/90 border border-zinc-800 text-zinc-300 text-[11px] leading-relaxed mb-4">
                      <div className="flex items-start gap-1.5 font-medium text-white mb-1">
                        <Scale className="w-3.5 h-3.5 shrink-0 mt-0.5 text-zinc-400" />
                        <span>{config.cliTradeoffTitle}</span>
                      </div>
                      <p className="text-[10.5px] text-zinc-400 leading-normal">
                        {config.cliTradeoffText}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={config.onCliAction}
                    disabled={isSigningInCli}
                    className="w-full py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 hover:text-white border border-zinc-700 font-semibold text-xs rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    {isSigningInCli ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-300" />
                        <span>{isEn ? "Opening Terminal..." : "Membuka Terminal..."}</span>
                      </>
                    ) : (
                      <>
                        <Terminal className="w-3.5 h-3.5" />
                        <span>{config.cliButton}</span>
                      </>
                    )}
                  </button>
              </div>

              {/* 9Router Gateway Hub Link (Optional centralized login) */}
              {currentTarget !== "nineRouter" && (
                <div className="mt-3.5 p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_4px_rgba(255,255,255,0.6)]" />
                    <span className="text-zinc-300">
                      {isEn
                        ? "Manage multi-accounts centrally like in 9Router (Google, Claude, Codex, Grok)?"
                        : "Kelola multi-akun terpusat seperti di 9Router (Google, Claude, Codex, Grok)?"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.open("http://localhost:20128", "_blank")}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-[11px] rounded-lg cursor-pointer shrink-0 font-medium"
                  >
                    {isEn ? "Open 9Router" : "Buka 9Router"}
                  </button>
                </div>
              )}

              <div className="mt-4 pt-3.5 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500">
                <span>{isEn ? "Arunaki Workstation Integration" : "Integrasi Workstation Arunaki"}</span>
                <button
                  type="button"
                  onClick={closeModal}
                  className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  {isEn ? "Close" : "Tutup"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
