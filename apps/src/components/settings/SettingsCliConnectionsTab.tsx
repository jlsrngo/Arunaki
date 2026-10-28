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
  Sparkles,
  Gauge,
} from "lucide-react";
import { API_BASE, BRIDGE_URL, apiFetch, bridgeFetch, directoryQuery, tauriCliLogin } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { toast } from "sonner";
import { cn } from "../../lib/utils";

import type {
  ClaudeCliStatus,
  OpenCodeStatus,
  CliProviderDescriptor,
  AntigravityStatus,
  NineRouterStatus,
  CodexStatus,
  KiroStatus,
  DiscoveredCliItem,
  LocalCliData,
  QuotaBucket,
  QuotaReport,
  ModelMeta,
  CliProviderId,
  SettingsCliConnectionsTabProps,
} from "./cli/types";
import { describeModel } from "./cli/modelDescribe";
import { MultiProviderAuthModal } from "./cli/MultiProviderAuthModal";

export type {
  ClaudeCliStatus,
  OpenCodeStatus,
  CliProviderDescriptor,
  AntigravityStatus,
  NineRouterStatus,
  CodexStatus,
  KiroStatus,
  DiscoveredCliItem,
  LocalCliData,
  QuotaBucket,
  QuotaReport,
  ModelMeta,
  CliProviderId,
  SettingsCliConnectionsTabProps,
};
export { describeModel };
import { FALLBACK_CLI_REGISTRY } from "./cli/registry";
export { FALLBACK_CLI_REGISTRY };

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
          if (!parsed.registry || !parsed.registry.length) {
            parsed.registry = FALLBACK_CLI_REGISTRY;
          }
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
      registry: FALLBACK_CLI_REGISTRY,
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

  // One source for model ids: the engine catalogue first, then the account's live list, then the
  // registry fallback. Nothing is hardcoded, so a provider added to the registry just works.
  const modelsFor = (id: string): string[] => {
    const fallbackList = (data.registry?.find((d) => d.id === id) ?? FALLBACK_CLI_REGISTRY.find((d) => d.id === id))?.models ?? [];
    const live = liveModels[id];
    if (live && live.length > 1) return live;
    const catalogued = catalogueModels[id] || catalogueModels[`${id}-cli`] || catalogueModels[`${id}-local`];
    if (catalogued && catalogued.length > 1) {
      return Array.from(new Set([...catalogued, ...fallbackList]));
    }
    if (live && live.length > 0) {
      return Array.from(new Set([...live, ...fallbackList]));
    }
    if (catalogued && catalogued.length > 0) {
      return Array.from(new Set([...catalogued, ...fallbackList]));
    }
    return fallbackList;
  };
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [injectingTarget, setInjectingTarget] = useState<string | null>(null);
  const [refreshErrors, setRefreshErrors] = useState<Record<string, string>>({});
  const [customInput, setCustomInput] = useState<Record<string, string>>({});
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [connectingTarget, setConnectingTarget] = useState<string | null>(null);
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const key of ["claude", "opencode", "codex", "antigravity", "nineRouter", "kiro"]) {
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
              registry: json.data.registry ?? prev.registry,
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
    for (const t of ["antigravity", "opencode", "9router", "kiro"] as const) fetchModels(t);
  }, []);

  // Rate-limit windows move on their own. Fetching once on mount left every bar showing whatever
  // the numbers happened to be when the tab opened - for a weekly window that is up to a week of
  // fiction - and the only way to correct it was the button. Sixty seconds sits well inside the
  // shortest window any of these vendors report, and the engine caches the answer for two anyway.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return;
      // Silent: the spinner belongs to the click, not to the timer that would blink it every minute.
      fetchQuota(false);
    }, 60_000);
    return () => clearInterval(timer);
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
      signedIn: Boolean(d.antigravity?.agySignedIn || d.sources?.antigravity?.connected),
      email:
        d.antigravity?.accountEmail ||
        d.sources?.antigravity?.accountEmail ||
        (d.sources?.antigravity?.accountInfo?.includes("@") ? d.sources?.antigravity?.accountInfo : undefined) ||
        d.discovered?.find((x) => x.provider === "antigravity")?.accountEmail ||
        (typeof window !== "undefined" ? localStorage.getItem("arunaki_agy_email") || undefined : undefined),
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
      (data.registry && data.registry.length > 0 ? data.registry : FALLBACK_CLI_REGISTRY).map((d) => {
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
  //
  // The engine catalogue is the source, not a second listing built here. The bridge returns raw
  // ids, so Antigravity's card listed 22 tier models — gemini-3.8-flash-high and its four siblings
  // as separate entries — while the composer had folded those into 16 models with the tier as a
  // variant, so picking one here chose something the chat could not use. Reading the same
  // catalogue the composer reads means the two cannot drift again.
  const [catalogueModels, setCatalogueModels] = useState<Record<string, string[]>>({});
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiFetch(`${API_BASE}/model${directoryQuery()}`);
        if (!res.ok) return;
        const json = await res.json().catch(() => ({}));
        const grouped: Record<string, string[]> = {};
        for (const entry of (json?.data ?? []) as any[]) {
          const providerID = String(entry?.providerID ?? "");
          const id = String(entry?.id ?? "");
          if (!providerID || !id) continue;
          (grouped[providerID] ??= []).push(id);
        }
        if (!cancelled && Object.keys(grouped).length > 0) setCatalogueModels(grouped);
      } catch {
        // The bridge fetch below still fills the card.
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const fetchQuota = async (manual = true) => {
    if (manual) setQuotaLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/quota${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const json = await res.json().catch(() => ({}));
      setQuota(json.data ?? []);
    } catch {
      if (manual) setQuota([]);
    } finally {
      if (manual) setQuotaLoading(false);
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
    // OpenCode's credential lives in its own auth.json. Arunaki cannot refresh it, and the
    // endpoint has no such target, so the generic buttons below used to fire a request that could
    // only ever 400 and leave a permanent "Refresh failed" badge on a card that reads Connected.
    // It also rendered a second, generic Sign out next to the one that delegates to its CLI.
    const ownsOwnCredential = id === "opencode" || id === "antigravity";
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
      ? "bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]"
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
            onClick={(e) => {
              e.stopPropagation();
              handleToggleConnection(id, state.active, d.name);
            }}
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
              {state.email ? ` • ${state.email}` : ""}
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
              className={ping.success ? "text-white font-medium" : "text-amber-400"}
              title={ping.success ? undefined : isEn ? "Last check failed" : "Pemeriksaan terakhir gagal"}
            >
              {ping.timeMs}ms
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
            onClick={(e) => {
              e.stopPropagation();
              handleToggleConnection(id, state.active, d.name);
            }}
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
                      codexPlan === "free" ? "text-amber-400/90" : "text-zinc-300 font-medium",
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
              {discovered?.hasToken && d.id !== "nineRouter" && !ownsOwnCredential && (
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
              {/* Browser PKCE is the default: no CLI to install, one click. Shows for initial sign-in or when refresh failed */}
              {d.supportsBrowserLogin && (!state.signedIn || Boolean(refreshErrors[id])) && (
                <button
                  type="button"
                  onClick={() => handleBrowserSignIn(id)}
                  disabled={oauthPendingTarget === id}
                  className="px-2.5 py-1 bg-white hover:bg-zinc-200 text-zinc-950 border border-white text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5 disabled:opacity-60 shadow-xs"
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
                    : refreshErrors[id]
                    ? isEn
                      ? "Re-authenticate via browser"
                      : "Masuk ulang via browser"
                    : isEn
                    ? "Sign in with browser"
                    : "Masuk via browser"}
                </button>
              )}
              {/* Signing out deletes the stored token. Without it a user who connected a
                  subscription account had no way to remove it from Arunaki. */}
              {state.signedIn && (discovered?.hasToken || d.id === "kiro") && !ownsOwnCredential && (
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
            onClick={() => fetchQuota(true)}
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
              const rawRemaining = typeof b.remaining === "number" ? b.remaining : 0;
              const pct = Math.max(0, Math.min(100, Math.round(rawRemaining > 1 ? rawRemaining : rawRemaining * 100)));
              const bar = b.exhausted
                ? "bg-red-500"
                : pct <= 15
                  ? "bg-red-400"
                  : "bg-[#e59344]";
              // Google hands back the same displayName for its Gemini quota and its third-party
              // quota, so the card drew two identical "Weekly Limit Remaining" rows - one at 71%,
              // one at 0% - and nothing said which account either one belonged to. The bucket id is
              // the only thing that separates them, so it becomes the disambiguator, and only when
              // the labels actually collide: Claude, Codex and Kiro all ship distinct labels and
              // there is nothing to add.
              const tag =
                report.buckets.filter((o) => o.label === b.label).length > 1
                  ? b.id.replace(/-[^-]*$/, "")
                  : "";
              return (
                <div key={b.id + b.window} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2 text-[10px]">
                    <span className="truncate text-zinc-500" title={tag ? `${b.label} (${tag})` : b.label}>
                      {b.label}
                      {b.window === "5h" ? ` (${b.window})` : ""}
                      {tag && tag !== b.label ? ` · ${tag}` : ""}
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
      const res = await tauriCliLogin("opencode-logout");
      if (res.success) {
        toast.success(isEn ? "Signed out from OpenCode" : "Berhasil keluar dari OpenCode", {
          description: res.message,
        });
        await fetchStatus();
      } else {
        toast.error(isEn ? "Sign out failed" : "Gagal keluar", { description: res.message ?? "" });
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
      const res = await tauriCliLogin("claude");
      if (res.success) {
        toast.info(isEn ? "Terminal Window Opened" : "Jendela Terminal Terbuka", {
          description: res.message,
        });
      } else {
        toast.error(isEn ? "Cannot open terminal automatically" : "Tidak dapat membuka terminal otomatis", {
          description: res.message,
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
      const res = await tauriCliLogin("codex");
      if (res.success) {
        toast.info(isEn ? "Terminal Window Opened" : "Jendela Terminal Terbuka", {
          description: res.message,
        });
      } else {
        toast.error(isEn ? "Cannot open terminal" : "Tidak dapat membuka terminal", {
          description: res.message,
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
      const res = await tauriCliLogin("opencode-terminal");
      if (res.success) {
        toast.info(isEn ? "Terminal Window Opened" : "Jendela Terminal Terbuka", {
          description: res.message,
        });
      } else {
        toast.error(isEn ? "Cannot open terminal" : "Tidak dapat membuka terminal", {
          description: res.message,
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
      const res = await tauriCliLogin("antigravity-cli");
      if (res.success) {
        toast.info("Antigravity Terminal Opened", {
          description: isEn
            ? "Terminal window opened for CLI authentication."
            : "Jendela terminal dibuka untuk otentikasi CLI.",
        });
        startAntigravityPoll();
      } else {
        toast.error(isEn ? "Failed to open CLI terminal" : "Gagal membuka CLI terminal", { description: res.message });
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
      const res = await tauriCliLogin("antigravity-logout");
      if (res.success) {
        toast.info("Logged Out", {
          description: "Google Antigravity credentials cleared. You can now login with a new account.",
        });
        await handleDisconnect("antigravity", "Google Antigravity");
        fetchStatus();
      } else {
        toast.error("Logout failed", { description: res.message });
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

    // Optimistic instant update: update state & notify chat immediately (0ms delay)
    localStorage.setItem("arunaki_active_provider", activeId);
    localStorage.setItem("arunaki_last_active_cli", activeId);
    localStorage.setItem("arunaki_active_model", chosenModel);
    localStorage.setItem(`arunaki_cli_model_${target}`, chosenModel);
    localStorage.setItem(`arunaki_provider_model_${activeId}`, chosenModel);

    window.dispatchEvent(
      new CustomEvent("arunaki:provider-change", {
        detail: { providerId: activeId, model: chosenModel },
      })
    );

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

      // If any local CLI or bridge provider, also notify bridge/local-cli
      const localCliTargets = ["claude", "antigravity", "opencode", "kiro", "codex", "9router", "gemini", "agy"];
      if (localCliTargets.includes(target)) {
        await apiFetch(`${API_BASE}/providers/local-cli/connect${directoryQuery()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: target === "claude" ? "claude" : target === "opencode" ? "opencode" : target === "antigravity" ? "antigravity" : target,
            model: chosenModel,
          }),
        }).catch(() => {});
      }

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
      window.dispatchEvent(
        new CustomEvent("arunaki:provider-change", {
          detail: { providerId: "kenari", model: "mimo-v2-5:free" },
        })
      );
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
    const state = cardState[target];
    if (!isActive && !state?.signedIn) {
      toast.error(
        isEn
          ? `Please sign in to ${friendlyName} first before connecting.`
          : `Silakan login ke ${friendlyName} terlebih dahulu sebelum menghubungkan.`
      );
      setExpandedCards((prev) => ({ ...prev, [target]: true }));
      return;
    }
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
          const directRes = await bridgeFetch(`${BRIDGE_URL}/v1/models`, {
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
      } else if (target === "kiro") {
        // Kiro used to fall out of this chain entirely. It installs nothing - a browser device
        // flow is the only sign-in - so there is no binary to look for, and with no branch here
        // isLive stayed false with an empty message: the card read "Test Ping failed" and the
        // toast said "Ping Offline" with no reason, while the bridge answered 200 for every
        // kiro/ model. A check that cannot succeed is worse than no check, because it looks like
        // the provider is down.
        isLive = !!local.bridgeRunning && !!local.kiro?.signedIn;
        detail = isLive
          ? `Kiro connected via the local CLI bridge (AWS CodeWhisperer, ${local.kiro?.region ?? "us-east-1"})`
          : local.kiro?.signedIn
          ? "Kiro signed in, but the local CLI bridge is offline"
          : "Kiro sign-in needed";
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
      localStorage.setItem(`arunaki_provider_model_${activeId}`, modelName);
      try {
        await apiFetch(`${API_BASE}/providers/${activeId}/state${directoryQuery()}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: true, model: modelName }),
        });
        toast.success(`${friendlyName} Model Updated`, {
          description: `Now using ${modelName}.`,
        });
        window.dispatchEvent(
          new CustomEvent("arunaki:provider-change", {
            detail: { providerId: activeId, model: modelName },
          })
        );
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
        {(data.registry && data.registry.length > 0 ? data.registry : FALLBACK_CLI_REGISTRY).map((descriptor) => renderProviderCard(descriptor))}

        {(data.discovered ?? []).some((x) => x.hasToken) && (
          <div className="px-4 py-3 rounded-xl border border-zinc-800 bg-zinc-950/40 flex items-center justify-center flex-wrap gap-3">
            <div className="flex items-center justify-center flex-wrap gap-2 text-xs text-zinc-300">
              <Sparkles className="w-4 h-4 text-white shrink-0" />
              <span className="font-semibold text-white">Discovered Local Caches:</span>
              {/* Derived, not enumerated. This row used to test four providers by name, so
                  OpenCode was found by the harvester and then never rendered. */}
              {(data.discovered ?? [])
                .filter((x) => x.hasToken)
                .map((x) => (
                  <span
                    key={x.provider}
                    className="inline-flex items-center gap-1 text-white font-medium"
                  >
                    {x.displayName || x.provider} &middot; OK
                  </span>
                ))}
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
      <MultiProviderAuthModal
        target={activeAuthModalTarget || (showAntigravityLoginModal ? "antigravity" : null)}
        data={data}
        isEn={isEn}
        isSigningInCli={isSigningInCli}
        onClose={() => {
          setActiveAuthModalTarget(null);
          setShowAntigravityLoginModal(false);
        }}
        onLaunchClaudeTerminal={handleLaunchClaudeTerminal}
        onLaunchCodexTerminal={handleLaunchCodexTerminal}
        onLaunchOpenCodeTerminal={handleLaunchOpenCodeTerminal}
        onLaunch9Router={handleLaunch9Router}
        onAntigravityCliLogin={handleAntigravityCliLogin}
      />
    </div>
  );
}
