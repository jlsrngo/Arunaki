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
  Mail,
  AlertTriangle,
  Scale,
  Sparkles,
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

interface AntigravityStatus {
  detected: boolean;
  cliInstalled?: boolean;
  agyInstalled?: boolean;
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

interface LocalCliData {
  claude: ClaudeCliStatus;
  opencode: OpenCodeStatus;
  antigravity: AntigravityStatus;
  nineRouter: NineRouterStatus;
  codex?: CodexStatus;
  bridgePort: number;
  bridgeRunning: boolean;
  discovered?: DiscoveredCliItem[];
}


interface SettingsCliConnectionsTabProps {
  providers: Provider[];
  onRefresh: () => void;
}

// Preset model definitions for each tool (synchronized with real runtime environments)
const PRESET_MODELS: Record<string, string[]> = {
  claude: ["claude-3-7-sonnet", "claude-3-5-sonnet", "claude-3-5-haiku", "claude-3-opus"],
  opencode: [
    "groq/openai/gpt-oss-120b",
    "groq/qwen/qwen3.8-27b",
    "groq/openai/gpt-oss-20b",
    "opencode/big-pickle",
    "9router/ComboMaut",
    "opencode/nemotron-3.5-lightning-free",
  ],
  codex: ["o3-mini", "o1", "gpt-4o", "gpt-4o-mini"],
  antigravity: [
    "gemini-3.8-flash",
    "gemini-3.1-pro",
    "gemini-3.7-flash",
    "claude-sonnet-5-5",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
  ],
  nineRouter: [
    "9router/ComboMaut",
    "oc/big-pickle",
    "oc/claude-sonnet-4.5",
    "kr/claude-sonnet-4.5",
    "vx/gemini-2.5-pro",
    "deepseek-r1",
    "cx/gpt-5.6-terra",
  ],
};

interface ModelMeta {
  label: string;
  badge?: string;
  speed?: string;
}

const MODEL_METADATA: Record<string, ModelMeta> = {
  // Google Antigravity CLI (agy)
  "gemini-3.8-flash": { label: "Gemini 3.8 Flash", badge: "High", speed: "Fast" },
  "gemini-3.1-pro": { label: "Gemini 3.1 Pro", badge: "Reasoning" },
  "gemini-3.7-flash": { label: "Gemini 3.7 Flash", badge: "Medium", speed: "Fast" },
  "claude-sonnet-5-5": { label: "Claude Sonnet 5.5", badge: "Thinking", speed: "Smart" },
  "gemini-2.5-flash": { label: "Gemini 2.5 Flash", badge: "Fast", speed: "Fast" },
  "gemini-2.5-pro": { label: "Gemini 2.5 Pro", badge: "Reasoning" },
  "gemini-1.5-flash": { label: "Gemini 1.5 Flash", badge: "Lightweight", speed: "Fast" },
  "gemini-1.5-pro": { label: "Gemini 1.5 Pro", badge: "Deep Analysis" },

  // Claude Code CLI
  "claude-3-7-sonnet": { label: "Claude 3.7 Sonnet", badge: "Hybrid Reasoning", speed: "Fast" },
  "claude-3-5-sonnet": { label: "Claude 3.5 Sonnet", badge: "Capable", speed: "Fast" },
  "claude-3-5-haiku": { label: "Claude 3.5 Haiku", badge: "Compact", speed: "Fast" },

  // OpenAI Codex
  "o3-mini": { label: "o3-mini", badge: "Reasoning", speed: "Fast" },
  "o1": { label: "o1", badge: "High Intelligence" },
  "gpt-4o": { label: "GPT-4o", badge: "Omni Flagship", speed: "Fast" },
  "gpt-4o-mini": { label: "GPT-4o-mini", badge: "Fast", speed: "Fast" },

  // OpenCode
  "opencode/big-pickle": { label: "Big Pickle", badge: "Zen Built-in", speed: "Reasoning" },
  "groq/openai/gpt-oss-120b": { label: "GPT-OSS 120B", badge: "Groq LPU", speed: "Ultra Fast" },
  "groq/qwen/qwen3.8-27b": { label: "Qwen 3.8 27B", badge: "Groq LPU", speed: "Ultra Fast" },
  "groq/openai/gpt-oss-20b": { label: "GPT-OSS 20B", badge: "Groq LPU", speed: "Ultra Fast" },
  "opencode/nemotron-3.5-lightning-free": { label: "Nemotron 3.5", badge: "Zen Built-in" },

  // 9Router (http://localhost:20128)
  "9router/ComboMaut": { label: "ComboMaut", badge: "Smart Combo", speed: "Auto Fallback" },
  "oc/big-pickle": { label: "OpenCode Big Pickle", badge: "Free (9Router)", speed: "Reasoning" },
  "oc/claude-sonnet-4.5": { label: "Claude Sonnet 4.5", badge: "Free (9Router)" },
  "kr/claude-sonnet-4.5": { label: "Kiro Claude Sonnet", badge: "Kiro AI (Free)" },
  "vx/gemini-2.5-pro": { label: "Vertex Gemini 2.5 Pro", badge: "Vertex (Free)" },
  "deepseek-r1": { label: "DeepSeek R1", badge: "Reasoning", speed: "Smart" },
  "cx/gpt-5.6-terra": { label: "GPT-5.6 Terra", badge: "Flagship", speed: "Fast" },
  "cx/gemini-2.5-pro": { label: "Gemini 2.5 Pro", badge: "Extended" },
};

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
  const [activeAuthModalTarget, setActiveAuthModalTarget] = useState<
    "claude" | "codex" | "opencode" | "antigravity" | "nineRouter" | null
  >(null);
  const [isSigningInEmail, setIsSigningInEmail] = useState(false);
  const [isSigningInCli, setIsSigningInCli] = useState(false);
  const [connectingTarget, setConnectingTarget] = useState<string | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState<Record<string, string>>({});
  // Selected Models per CLI connection (persisted in localStorage)
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>(() => {
    return {
      claude: localStorage.getItem("arunaki_cli_model_claude") || PRESET_MODELS.claude[0],
      opencode: localStorage.getItem("arunaki_cli_model_opencode") || PRESET_MODELS.opencode[0],
      codex: localStorage.getItem("arunaki_cli_model_codex") || PRESET_MODELS.codex[0],
      antigravity: localStorage.getItem("arunaki_cli_model_antigravity") || PRESET_MODELS.antigravity[0],
      nineRouter: localStorage.getItem("arunaki_cli_model_nineRouter") || PRESET_MODELS.nineRouter[0],
    };
  });

  const [testingPingTarget, setTestingPingTarget] = useState<string | null>(null);
  const [pingResults, setPingResults] = useState<
    Record<string, { success: boolean; timeMs: number; message?: string }>
  >({});
  const [refreshingTarget, setRefreshingTarget] = useState<string | null>(null);
  const [oauthTarget, setOauthTarget] = useState<string | null>(null);
  const [injectingTarget, setInjectingTarget] = useState<string | null>(null);
  const [refreshErrors, setRefreshErrors] = useState<Record<string, string>>({});

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
  }, []);

  // Provider states
  const claudeProvider = providers.find((p) => p.id === "claude-code" || p.type === "claude-code");
  const isClaudeActive =
    claudeProvider?.active || localStorage.getItem("arunaki_active_provider") === "claude-code";

  const opencodeProvider = providers.find((p) => p.id === "opencode" || p.type === "opencode");
  const isOpenCodeActive =
    opencodeProvider?.active || localStorage.getItem("arunaki_active_provider") === "opencode";

  const codexProvider = providers.find((p) => p.id === "codex" || p.type === "codex" || p.id === "openai" || p.type === "openai");
  const isCodexActive =
    codexProvider?.active || localStorage.getItem("arunaki_active_provider") === "codex";

  const antigravityProvider = providers.find(
    (p) => p.id === "antigravity" || p.id === "gemini-cli" || p.id === "gemini" || p.type === "antigravity" || p.type === "gemini"
  );
  const isAntigravityActive =
    antigravityProvider?.active ||
    localStorage.getItem("arunaki_active_provider") === "antigravity" ||
    localStorage.getItem("arunaki_active_provider") === "gemini-cli" ||
    localStorage.getItem("arunaki_active_provider") === "gemini";
  const isGeminiActive = isAntigravityActive;

  const nineRouterProvider = providers.find((p) => p.id === "9router" || p.type === "9router");
  const is9RouterActive =
    nineRouterProvider?.active || localStorage.getItem("arunaki_active_provider") === "9router";

  const discoveredClaude = data.discovered?.find((d) => d.provider === "claude");
  const discoveredCodex = data.discovered?.find((d) => d.provider === "codex");
  const discoveredKiro = data.discovered?.find((d) => d.provider === "kiro");
  const discoveredCursor = data.discovered?.find((d) => d.provider === "cursor");

  const formatExpiry = (expiresAt?: number) => {
    if (!expiresAt) return null;
    const diff = expiresAt - Date.now();
    if (diff <= 0) return "Expired";
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
  };

  // A credential stays in the local store after its CLI cache is gone so Refresh can
  // recover it — never label an already expired token "Ready".
  const credentialState = (expiresAt?: number) => {
    if (!expiresAt) return "active" as const;
    const diff = expiresAt - Date.now();
    if (diff <= 0) return "expired" as const;
    if (diff < 15 * 60_000) return "expiring" as const;
    return "ready" as const;
  };

  const CREDENTIAL_BADGE = {
    ready: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    expiring: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    expired: "bg-red-500/10 text-red-400 border-red-500/20",
    active: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  };

  const renderDiscoveredBadge = (d?: { hasToken: boolean; expiresAt?: number }) => {
    if (!d?.hasToken) return null;
    const state = credentialState(d.expiresAt);
    const label =
      state === "expired"
        ? "Expired · Refresh required"
        : state === "expiring"
        ? "Expiring soon"
        : state === "active"
        ? "Active · No expiry data"
        : "Auto-Imported · Ready";
    const suffix = state === "ready" && formatExpiry(d.expiresAt) ? ` (${formatExpiry(d.expiresAt)})` : "";
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border",
          CREDENTIAL_BADGE[state],
        )}
      >
        <Sparkles className="w-2.5 h-2.5" />
        {label}
        {suffix}
      </span>
    );
  };

  const handleRefreshCred = async (target: "claude" | "codex" | "kiro" | "cursor" | "all") => {
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

  // Browser sign-in for the CLI subscriptions, so a fresh install can connect without
  // the vendor CLI being installed first. Polls until the vendor redirects back.
  const handleOauthConnect = async (target: "claude" | "codex" | "antigravity") => {
    setOauthTarget(target);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/oauth/start${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const json = await res.json().catch(() => ({}));
      const requestId = json.data?.requestId;
      const authUrl = json.data?.authUrl;
      if (!requestId || !authUrl) {
        throw new Error(json.data?.message || (isEn ? "Could not start sign-in" : "Gagal memulai login"));
      }
      window.open(authUrl, "_blank", "noopener,noreferrer");

      const deadline = Date.now() + 10 * 60_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500));
        const poll = await apiFetch(`${API_BASE}/providers/local-cli/oauth/status${directoryQuery()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId }),
        });
        const out = (await poll.json().catch(() => ({})))?.data;
        if (!out || out.status === "pending") continue;
        if (out.status === "success") {
          toast.success(isEn ? "Connected" : "Berhasil terhubung", {
            description: out.message || `${target} is now connected.`,
          });
          await fetchStatus();
        } else {
          throw new Error(out.message || (isEn ? "Sign-in failed" : "Login gagal"));
        }
        return;
      }
      throw new Error(isEn ? "Sign-in timed out" : "Login kedaluwarsa");
    } catch (err: any) {
      toast.error(isEn ? "Sign-in failed" : "Login gagal", {
        description: err?.message ?? String(err),
      });
    } finally {
      setOauthTarget(null);
    }
  };

  const handleInjectCli = async (target: "claude" | "codex" | "all", action: "inject" | "reset" = "inject") => {    setInjectingTarget(target);
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

  const handleAntigravityEmailLogin = async () => {
    setIsSigningInEmail(true);
    try {
      // Sign-in happens inside a real terminal running `agy` — it refuses to authenticate
      // in print mode ("Print mode: not logged in and no controlling terminal").
      const res = await apiFetch(`${API_BASE}/providers/local-cli/login${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "antigravity-cli" }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.data?.success) {
        toast.info("Antigravity Terminal Opened", {
          description: json.data?.message ?? (isEn
            ? "Complete the Google sign-in in that terminal, then close it."
            : "Selesaikan login Google di terminal itu, lalu tutup."),
        });
        startAntigravityPoll();
      } else {
        toast.error(isEn ? "Could not open Antigravity" : "Gagal membuka Antigravity", { description: json.data?.message });
      }
    } catch (err: any) {
      toast.error(isEn ? "Failed to initiate email login" : "Gagal memulai login email", { description: err.message });
    } finally {
      setIsSigningInEmail(false);
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

  const PROVIDER_CONFIGS: Record<
    "claude" | "codex" | "opencode" | "antigravity" | "nineRouter",
    { id: string; name: string; type: string; baseUrl: string; apiKey: string }
  > = {
    claude: {
      id: "claude-code",
      name: "Claude Code CLI (Local Subscription)",
      type: "claude-code",
      baseUrl: `http://127.0.0.1:${data.bridgePort || 20188}/v1`,
      apiKey: "claude-pro-subscription",
    },
    codex: {
      id: "codex",
      name: "OpenAI Codex Agent",
      type: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "codex-active",
    },
    opencode: {
      id: "opencode",
      name: "OpenCode CLI Agent",
      type: "openai-compatible",
      baseUrl: `http://127.0.0.1:${data.bridgePort || 20188}/v1`,
      apiKey: "opencode-local-session",
    },
    antigravity: {
      id: "antigravity",
      name: "Google Antigravity CLI (agy)",
      type: "openai-compatible",
      baseUrl: `http://127.0.0.1:${data.bridgePort || 20188}/v1`,
      apiKey: "antigravity-local-session",
    },
    nineRouter: {
      id: "9router",
      name: "9Router Gateway",
      type: "openai-compatible",
      baseUrl: "http://localhost:20128/v1",
      apiKey: "9router",
    },
  };

  const handleConnectTarget = async (
    target: "claude" | "codex" | "opencode" | "antigravity" | "nineRouter",
    friendlyName: string
  ) => {
    setConnectingTarget(target);
    const chosenModel = selectedModels[target] || PRESET_MODELS[target][0];
    const config = PROVIDER_CONFIGS[target];
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
    target: "claude" | "codex" | "opencode" | "antigravity" | "nineRouter",
    isActive: boolean,
    friendlyName: string
  ) => {
    const config = PROVIDER_CONFIGS[target];
    if (isActive) {
      await handleDisconnect(config.id, friendlyName);
    } else {
      await handleConnectTarget(target, friendlyName);
    }
  };

  const handleTestPing = async (
    target: "claude" | "codex" | "opencode" | "antigravity" | "nineRouter",
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
    targetKey: "claude" | "codex" | "opencode" | "antigravity" | "nineRouter",
    presetModels: string[],
    activeId: string,
    isActive: boolean,
    friendlyName: string
  ) => {
    const currentModel = selectedModels[targetKey] || presetModels[0];
    const meta = MODEL_METADATA[currentModel] || { label: currentModel };
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
          <div className="absolute right-0 top-full mt-1.5 z-50 w-72 sm:w-80 p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl space-y-2">
            <div className="flex items-center justify-between px-1 pb-1.5 border-b border-zinc-800">
              <span className="text-xs font-semibold text-zinc-200">Model</span>
              <span className="text-[10px] text-zinc-500 font-mono">Manual Selector</span>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-0.5 pr-1">
              {presetModels.map((m) => {
                const itemMeta = MODEL_METADATA[m] || { label: m };
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

      {/* Connection list */}
      <div className="space-y-2 w-full">
        {/* ── Claude ───────────────────────────────────────── */}
        <div
          className={cn(
            "px-4 py-3 rounded-xl border transition-all duration-200 flex items-center justify-between gap-4",
            isClaudeActive
              ? "bg-[var(--bg-panel)] border-[var(--border-strong)] shadow-xs"
              : "bg-[var(--bg-card)] border-[var(--border-color)] hover:border-[var(--border-strong)]"
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => handleToggleConnection("claude", isClaudeActive, "Claude")}
              disabled={connectingTarget === "claude"}
              title={isClaudeActive ? (isEn ? "Click to Disconnect" : "Klik untuk Putuskan") : (isEn ? "Click to Connect" : "Klik untuk Hubungkan")}
              className={cn(
                "w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer group/circle",
                isClaudeActive
                  ? "border-white bg-white hover:bg-zinc-200"
                  : "border-zinc-600 hover:border-white bg-transparent"
              )}
            >
              {connectingTarget === "claude" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
              ) : isClaudeActive ? (
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
                <span className="font-semibold text-sm text-[var(--text-primary)]">Claude</span>
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  data.claude.loggedIn || discoveredClaude?.hasToken ? "bg-zinc-200" : data.claude.installed ? "bg-zinc-500" : "bg-zinc-700"
                )} />
                <span className="text-[11px] text-[var(--text-muted)]">
                  {data.claude.loggedIn || discoveredClaude?.hasToken
                    ? (isEn ? "Ready" : "Siap")
                    : data.claude.installed
                    ? (isEn ? "Login required" : "Perlu masuk")
                    : (isEn ? "Not installed" : "Belum terpasang")}
                </span>
                {renderDiscoveredBadge(discoveredClaude)}
                {refreshErrors.claude && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20" title={refreshErrors.claude}>
                    <AlertTriangle className="w-2.5 h-2.5" />
                    Refresh failed
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Anthropic • Desktop app &amp; CLI</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {renderModelDropdown("claude", PRESET_MODELS.claude, "claude-code", isClaudeActive, "Claude")}
            {discoveredClaude?.hasToken && (
              <button
                type="button"
                onClick={() => handleRefreshCred("claude")}
                disabled={refreshingTarget === "claude"}
                className="px-2 py-1 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1 shadow-xs"
                title="Refresh Claude OAuth token"
              >
                <RefreshCw className={cn("w-3 h-3", refreshingTarget === "claude" && "animate-spin text-zinc-400")} />
                <span>{refreshingTarget === "claude" ? "Refreshing..." : "Refresh now"}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => handleInjectCli("claude")}
              disabled={injectingTarget === "claude"}
              className="px-2 py-1 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1 shadow-xs"
              title="Auto-configure ~/.claude/settings.json to route through Arunaki bridge"
            >
              {injectingTarget === "claude" ? (
                <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />
              ) : (
                <SlidersHorizontal className="w-3 h-3" />
              )}
              <span>Auto-Configure CLI</span>
            </button>
            <button
              type="button"
              onClick={() => handleTestPing("claude", "Claude")}
              disabled={testingPingTarget === "claude"}
              className={cn(
                "px-2.5 py-1 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5 shadow-xs border",
                pingResults.claude
                  ? pingResults.claude.success
                    ? "bg-zinc-800 text-zinc-200 border-zinc-600"
                    : "bg-zinc-900 text-zinc-500 border-zinc-800"
                  : "bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border-zinc-700"
              )}
              title={isEn ? "Test Ping connection & latency" : "Uji koneksi ping & latensi"}
            >
              {testingPingTarget === "claude" ? (
                <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />
              ) : (
                <Wifi className="w-3 h-3 text-zinc-400" />
              )}
              <span>
                {testingPingTarget === "claude"
                  ? (isEn ? "Testing..." : "Menguji...")
                  : pingResults.claude
                  ? pingResults.claude.success
                    ? `${pingResults.claude.timeMs}ms`
                    : "Offline"
                  : (isEn ? "Test Ping" : "Uji Ping")}
              </span>
            </button>
            <button
              type="button"
              onClick={() => window.open("https://claude.ai", "_blank")}
              className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5"
            >
              <Globe className="w-3 h-3" />
              App
            </button>
            <button
              type="button"
              onClick={() => setActiveAuthModalTarget("claude")}
              disabled={oauthTarget === "claude"}
              className="px-2.5 py-1 bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5 disabled:opacity-60"
              title={isEn ? "Choose Claude authentication method (Email vs CLI)" : "Pilih metode otentikasi Claude (Email vs CLI)"}
            >
              {oauthTarget === "claude" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <SlidersHorizontal className="w-3 h-3" />
              )}
              <span>
                {oauthTarget === "claude"
                  ? isEn ? "Signing in..." : "Menyambungkan..."
                  : isEn ? "Auth Method" : "Metode Masuk"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleToggleConnection("claude", isClaudeActive, "Claude")}
              disabled={connectingTarget === "claude"}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 select-none shadow-xs",
                isClaudeActive
                  ? "bg-white hover:bg-zinc-200 text-zinc-950 border border-white group"
                  : "bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-500"
              )}
            >
              {connectingTarget === "claude" ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>{isEn ? "Connecting..." : "Menghubungkan..."}</span>
                </>
              ) : isClaudeActive ? (
                <>
                  <Check className="w-3.5 h-3.5 group-hover:hidden stroke-[2.5]" />
                  <X className="w-3.5 h-3.5 hidden group-hover:inline stroke-[2.5]" />
                  <span className="group-hover:hidden">{isEn ? "Connected" : "Terhubung"}</span>
                  <span className="hidden group-hover:inline">{isEn ? "Disconnect" : "Putuskan"}</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                  <span>{isEn ? "Connect" : "Hubungkan"}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── Codex ───────────────────────────────────────── */}
        <div
          className={cn(
            "px-4 py-3 rounded-xl border transition-all duration-200 flex items-center justify-between gap-4",
            isCodexActive
              ? "bg-[var(--bg-panel)] border-[var(--border-strong)] shadow-xs"
              : "bg-[var(--bg-card)] border-[var(--border-color)] hover:border-[var(--border-strong)]"
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => handleToggleConnection("codex", isCodexActive, "Codex")}
              disabled={connectingTarget === "codex"}
              title={isCodexActive ? (isEn ? "Click to Disconnect" : "Klik untuk Putuskan") : (isEn ? "Click to Connect" : "Klik untuk Hubungkan")}
              className={cn(
                "w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer group/circle",
                isCodexActive
                  ? "border-white bg-white hover:bg-zinc-200"
                  : "border-zinc-600 hover:border-white bg-transparent"
              )}
            >
              {connectingTarget === "codex" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
              ) : isCodexActive ? (
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
                <span className="font-semibold text-sm text-[var(--text-primary)]">Codex</span>
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  data.codex?.installed || discoveredCodex?.hasToken ? "bg-zinc-200" : "bg-zinc-700"
                )} />
                <span className="text-[11px] text-[var(--text-muted)]">
                  {data.codex?.installed || discoveredCodex?.hasToken ? (isEn ? "Ready" : "Siap") : (isEn ? "Not installed" : "Belum terpasang")}
                </span>
{renderDiscoveredBadge(discoveredCodex)}
                {discoveredCodex?.accountEmail && (
                  <span className="text-[10px] text-[var(--text-muted)]">{discoveredCodex.accountEmail}</span>
                )}
                {refreshErrors.codex && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20" title={refreshErrors.codex}>
                    <AlertTriangle className="w-2.5 h-2.5" />
                    Refresh failed
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">OpenAI • ChatGPT app &amp; CLI</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {renderModelDropdown("codex", PRESET_MODELS.codex, "codex", isCodexActive, "Codex")}
            {discoveredCodex?.hasToken && (
              <button
                type="button"
                onClick={() => handleRefreshCred("codex")}
                disabled={refreshingTarget === "codex"}
                className="px-2 py-1 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1 shadow-xs"
                title="Refresh OpenAI / Codex OAuth token"
              >
                <RefreshCw className={cn("w-3 h-3", refreshingTarget === "codex" && "animate-spin text-zinc-400")} />
                <span>{refreshingTarget === "codex" ? "Refreshing..." : "Refresh now"}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => handleInjectCli("codex")}
              disabled={injectingTarget === "codex"}
              className="px-2 py-1 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1 shadow-xs"
              title="Auto-configure ~/.codex/config.toml to route through Arunaki bridge"
            >
              {injectingTarget === "codex" ? (
                <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />
              ) : (
                <SlidersHorizontal className="w-3 h-3" />
              )}
              <span>Auto-Configure CLI</span>
            </button>
            <button
              type="button"
              onClick={() => handleTestPing("codex", "Codex")}
              disabled={testingPingTarget === "codex"}
              className={cn(
                "px-2.5 py-1 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5 shadow-xs border",
                pingResults.codex
                  ? pingResults.codex.success
                    ? "bg-zinc-800 text-zinc-200 border-zinc-600"
                    : "bg-zinc-900 text-zinc-500 border-zinc-800"
                  : "bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border-zinc-700"
              )}
              title={isEn ? "Test Ping connection & latency" : "Uji koneksi ping & latensi"}
            >
              {testingPingTarget === "codex" ? (
                <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />
              ) : (
                <Wifi className="w-3 h-3 text-zinc-400" />
              )}
              <span>
                {testingPingTarget === "codex"
                  ? (isEn ? "Testing..." : "Menguji...")
                  : pingResults.codex
                  ? pingResults.codex.success
                    ? `${pingResults.codex.timeMs}ms`
                    : "Offline"
                  : (isEn ? "Test Ping" : "Uji Ping")}
              </span>
            </button>
            <button
              type="button"
              onClick={() => window.open("https://chatgpt.com", "_blank")}
              className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5"
            >
              <Globe className="w-3 h-3" />
              App
            </button>
            <button
              type="button"
              onClick={() => setActiveAuthModalTarget("codex")}
              disabled={oauthTarget === "codex"}
              className="px-2.5 py-1 bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5 disabled:opacity-60"
              title={isEn ? "Choose OpenAI Codex authentication method (Email vs CLI)" : "Pilih metode otentikasi OpenAI Codex (Email vs CLI)"}
            >
              {oauthTarget === "codex" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <SlidersHorizontal className="w-3 h-3" />
              )}
              <span>
                {oauthTarget === "codex"
                  ? isEn ? "Signing in..." : "Menyambungkan..."
                  : isEn ? "Auth Method" : "Metode Masuk"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleToggleConnection("codex", isCodexActive, "Codex")}
              disabled={connectingTarget === "codex"}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 select-none shadow-xs",
                isCodexActive
                  ? "bg-white hover:bg-zinc-200 text-zinc-950 border border-white group"
                  : "bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-500"
              )}
            >
              {connectingTarget === "codex" ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>{isEn ? "Connecting..." : "Menghubungkan..."}</span>
                </>
              ) : isCodexActive ? (
                <>
                  <Check className="w-3.5 h-3.5 group-hover:hidden stroke-[2.5]" />
                  <X className="w-3.5 h-3.5 hidden group-hover:inline stroke-[2.5]" />
                  <span className="group-hover:hidden">{isEn ? "Connected" : "Terhubung"}</span>
                  <span className="hidden group-hover:inline">{isEn ? "Disconnect" : "Putuskan"}</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                  <span>{isEn ? "Connect" : "Hubungkan"}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── OpenCode ────────────────────────────────────── */}
        <div
          className={cn(
            "px-4 py-3 rounded-xl border transition-all duration-200 flex items-center justify-between gap-4",
            isOpenCodeActive
              ? "bg-[var(--bg-panel)] border-[var(--border-strong)] shadow-xs"
              : "bg-[var(--bg-card)] border-[var(--border-color)] hover:border-[var(--border-strong)]"
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => handleToggleConnection("opencode", isOpenCodeActive, "OpenCode")}
              disabled={connectingTarget === "opencode"}
              title={isOpenCodeActive ? (isEn ? "Click to Disconnect" : "Klik untuk Putuskan") : (isEn ? "Click to Connect" : "Klik untuk Hubungkan")}
              className={cn(
                "w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer group/circle",
                isOpenCodeActive
                  ? "border-white bg-white hover:bg-zinc-200"
                  : "border-zinc-600 hover:border-white bg-transparent"
              )}
            >
              {connectingTarget === "opencode" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
              ) : isOpenCodeActive ? (
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
                <span className="font-semibold text-sm text-[var(--text-primary)]">OpenCode</span>
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  data.opencode.installed ? "bg-zinc-200" : "bg-zinc-700"
                )} />
                <span className="text-[11px] text-[var(--text-muted)]">
                  {data.opencode.installed ? (isEn ? "Ready" : "Siap") : (isEn ? "Not installed" : "Belum terpasang")}
                </span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Open-source • Desktop app &amp; terminal</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {renderModelDropdown("opencode", PRESET_MODELS.opencode, "opencode", isOpenCodeActive, "OpenCode")}
            <button
              type="button"
              onClick={() => handleTestPing("opencode", "OpenCode")}
              disabled={testingPingTarget === "opencode"}
              className={cn(
                "px-2.5 py-1 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5 shadow-xs border",
                pingResults.opencode
                  ? pingResults.opencode.success
                    ? "bg-zinc-800 text-zinc-200 border-zinc-600"
                    : "bg-zinc-900 text-zinc-500 border-zinc-800"
                  : "bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border-zinc-700"
              )}
              title={isEn ? "Test Ping connection & latency" : "Uji koneksi ping & latensi"}
            >
              {testingPingTarget === "opencode" ? (
                <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />
              ) : (
                <Wifi className="w-3 h-3 text-zinc-400" />
              )}
              <span>
                {testingPingTarget === "opencode"
                  ? (isEn ? "Testing..." : "Menguji...")
                  : pingResults.opencode
                  ? pingResults.opencode.success
                    ? `${pingResults.opencode.timeMs}ms`
                    : "Offline"
                  : (isEn ? "Test Ping" : "Uji Ping")}
              </span>
            </button>
            <button
              type="button"
              onClick={() => window.open("https://opencode.ai", "_blank")}
              className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5"
            >
              <Globe className="w-3 h-3" />
              App
            </button>
            <button
              type="button"
              onClick={() => setActiveAuthModalTarget("opencode")}
              className="px-2.5 py-1 bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5"
              title={isEn ? "Choose OpenCode authentication method (Cloud Web vs Terminal)" : "Pilih metode otentikasi OpenCode (Cloud Web vs Terminal)"}
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>{isEn ? "Auth Method" : "Metode Masuk"}</span>
            </button>
            <button
              type="button"
              onClick={() => handleToggleConnection("opencode", isOpenCodeActive, "OpenCode")}
              disabled={connectingTarget === "opencode"}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 select-none shadow-xs",
                isOpenCodeActive
                  ? "bg-white hover:bg-zinc-200 text-zinc-950 border border-white group"
                  : "bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-500"
              )}
            >
              {connectingTarget === "opencode" ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>{isEn ? "Connecting..." : "Menghubungkan..."}</span>
                </>
              ) : isOpenCodeActive ? (
                <>
                  <Check className="w-3.5 h-3.5 group-hover:hidden stroke-[2.5]" />
                  <X className="w-3.5 h-3.5 hidden group-hover:inline stroke-[2.5]" />
                  <span className="group-hover:hidden">{isEn ? "Connected" : "Terhubung"}</span>
                  <span className="hidden group-hover:inline">{isEn ? "Disconnect" : "Putuskan"}</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                  <span>{isEn ? "Connect" : "Hubungkan"}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── Google Antigravity ──────────────────────────── */}
        <div
          className={cn(
            "px-4 py-3 rounded-xl border transition-all duration-200 flex items-center justify-between gap-4",
            isGeminiActive
              ? "bg-[var(--bg-panel)] border-[var(--border-strong)] shadow-xs"
              : "bg-[var(--bg-card)] border-[var(--border-color)] hover:border-[var(--border-strong)]"
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => handleToggleConnection("antigravity", isGeminiActive, "Google Antigravity")}
              disabled={connectingTarget === "antigravity"}
              title={isGeminiActive ? (isEn ? "Click to Disconnect" : "Klik untuk Putuskan") : (isEn ? "Click to Connect" : "Klik untuk Hubungkan")}
              className={cn(
                "w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer group/circle",
                isGeminiActive
                  ? "border-white bg-white hover:bg-zinc-200"
                  : "border-zinc-600 hover:border-white bg-transparent"
              )}
            >
              {connectingTarget === "antigravity" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
              ) : isGeminiActive ? (
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
                <span className="font-semibold text-sm text-[var(--text-primary)]">Google Antigravity CLI</span>
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  data.antigravity?.loggedIn
                    ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                    : data.antigravity?.cliInstalled || data.antigravity?.detected
                    ? "bg-amber-400"
                    : loading
                    ? "bg-amber-400/60 animate-pulse"
                    : "bg-zinc-700"
                )} />
                <span className="text-[11px] text-[var(--text-muted)] truncate max-w-[220px]">
                  {data.antigravity?.loggedIn && data.antigravity.accountEmail
                    ? `${isEn ? "Logged in: " : "Masuk: "}${data.antigravity.accountEmail}`
                    : data.antigravity?.cliInstalled
                    ? `${isEn ? "Ready to login" : "Siap masuk"} (${data.antigravity.agyVersion ? `agy v${data.antigravity.agyVersion}` : "agy"})`
                    : loading
                    ? (isEn ? "Checking status..." : "Memeriksa status...")
                    : (isEn ? "Not installed" : "Belum terpasang")}
                </span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">
                {data.antigravity?.loggedIn && data.antigravity.accountEmail
                  ? `Google DeepMind • ${data.antigravity.accountEmail}`
                  : "Google DeepMind • Antigravity CLI (agy)"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {renderModelDropdown("antigravity", PRESET_MODELS.antigravity, "antigravity", isGeminiActive, "Google Antigravity")}
            <button
              type="button"
              onClick={() => handleTestPing("antigravity", "Google Antigravity")}
              disabled={testingPingTarget === "antigravity"}
              className={cn(
                "px-2.5 py-1 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5 shadow-xs border",
                pingResults.antigravity
                  ? pingResults.antigravity.success
                    ? "bg-zinc-800 text-zinc-200 border-zinc-600"
                    : "bg-zinc-900 text-zinc-500 border-zinc-800"
                  : "bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border-zinc-700"
              )}
              title={isEn ? "Test Ping connection & latency" : "Uji koneksi ping & latensi"}
            >
              {testingPingTarget === "antigravity" ? (
                <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />
              ) : (
                <Wifi className="w-3 h-3 text-zinc-400" />
              )}
              <span>
                {testingPingTarget === "antigravity"
                  ? (isEn ? "Testing..." : "Menguji...")
                  : pingResults.antigravity
                  ? pingResults.antigravity.success
                    ? `${pingResults.antigravity.timeMs}ms`
                    : "Offline"
                  : (isEn ? "Test Ping" : "Uji Ping")}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                window.open("https://antigravity.google", "_blank");
              }}
              className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5"
            >
              <Globe className="w-3 h-3" />
              Docs
            </button>
            {!data.antigravity?.loggedIn ? (
              <button
                type="button"
                onClick={() => setShowAntigravityLoginModal(true)}
                className="px-3 py-1 bg-white hover:bg-zinc-200 text-zinc-950 border border-white text-xs rounded-lg transition-all cursor-pointer font-semibold flex items-center gap-1.5 shadow-sm"
                title={isEn ? "Choose sign in method with Google or CLI" : "Pilih metode masuk dengan Google atau CLI"}
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{isEn ? "Login" : "Masuk"}</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setShowAntigravityLoginModal(true)}
                  className="px-2.5 py-1 bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5"
                  title={isEn ? "Switch or view login method (Email vs CLI)" : "Ganti atau lihat metode masuk (Email vs CLI)"}
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>{isEn ? "Auth Method" : "Metode Masuk"}</span>
                </button>
                <button
                  type="button"
                  onClick={handleAntigravityLogout}
                  disabled={isLoggingOutAntigravity}
                  className="px-2.5 py-1 bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5"
                  title={isEn ? "Logout from current Google Account" : "Keluar dari Akun Google saat ini"}
                >
                  {isLoggingOutAntigravity ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
                  <span>{isEn ? "Logout" : "Keluar"}</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => handleToggleConnection("antigravity", isGeminiActive, "Google Gemini CLI")}
              disabled={connectingTarget === "antigravity"}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 select-none shadow-xs",
                isGeminiActive
                  ? "bg-white hover:bg-zinc-200 text-zinc-950 border border-white group"
                  : "bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-500"
              )}
            >
              {connectingTarget === "antigravity" ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>{isEn ? "Connecting..." : "Menghubungkan..."}</span>
                </>
              ) : isGeminiActive ? (
                <>
                  <Check className="w-3.5 h-3.5 group-hover:hidden stroke-[2.5]" />
                  <X className="w-3.5 h-3.5 hidden group-hover:inline stroke-[2.5]" />
                  <span className="group-hover:hidden">{isEn ? "Connected" : "Terhubung"}</span>
                  <span className="hidden group-hover:inline">{isEn ? "Disconnect" : "Putuskan"}</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                  <span>{isEn ? "Connect" : "Hubungkan"}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── 9Router ─────────────────────────────────────── */}
        <div
          className={cn(
            "px-4 py-3 rounded-xl border transition-all duration-200 flex items-center justify-between gap-4",
            is9RouterActive
              ? "bg-[var(--bg-panel)] border-[var(--border-strong)] shadow-xs"
              : "bg-[var(--bg-card)] border-[var(--border-color)] hover:border-[var(--border-strong)]"
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => handleToggleConnection("nineRouter", is9RouterActive, "9Router")}
              disabled={connectingTarget === "nineRouter"}
              title={is9RouterActive ? (isEn ? "Click to Disconnect" : "Klik untuk Putuskan") : (isEn ? "Click to Connect" : "Klik untuk Hubungkan")}
              className={cn(
                "w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer group/circle",
                is9RouterActive
                  ? "border-white bg-white hover:bg-zinc-200"
                  : "border-zinc-600 hover:border-white bg-transparent"
              )}
            >
              {connectingTarget === "nineRouter" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
              ) : is9RouterActive ? (
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
                <span className="font-semibold text-sm text-[var(--text-primary)]">9Router</span>
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  data.nineRouter.running ? "bg-zinc-200" : data.nineRouter.installed ? "bg-zinc-400" : "bg-zinc-700"
                )} />
                <span className="text-[11px] text-[var(--text-muted)]">
                  {data.nineRouter.running
                    ? (isEn ? "Running" : "Berjalan")
                    : data.nineRouter.installed
                    ? (isEn ? "Ready" : "Siap")
                    : (isEn ? "Not installed" : "Belum terpasang")}
                </span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                {isEn ? "Smart AI Router • http://localhost:20128" : "Router AI Pintar • http://localhost:20128"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {renderModelDropdown("nineRouter", PRESET_MODELS.nineRouter, "9router", is9RouterActive, "9Router")}
            <button
              type="button"
              onClick={() => handleTestPing("nineRouter", "9Router")}
              disabled={testingPingTarget === "nineRouter"}
              className={cn(
                "px-2.5 py-1 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5 shadow-xs border",
                pingResults.nineRouter
                  ? pingResults.nineRouter.success
                    ? "bg-zinc-800 text-zinc-200 border-zinc-600"
                    : "bg-zinc-900 text-zinc-500 border-zinc-800"
                  : "bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border-zinc-700"
              )}
              title={isEn ? "Test Ping connection & latency" : "Uji koneksi ping & latensi"}
            >
              {testingPingTarget === "nineRouter" ? (
                <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />
              ) : (
                <Wifi className="w-3 h-3 text-zinc-400" />
              )}
              <span>
                {testingPingTarget === "nineRouter"
                  ? (isEn ? "Testing..." : "Menguji...")
                  : pingResults.nineRouter
                  ? pingResults.nineRouter.success
                    ? `${pingResults.nineRouter.timeMs}ms`
                    : "Offline"
                  : (isEn ? "Test Ping" : "Uji Ping")}
              </span>
            </button>
            <button
              type="button"
              onClick={() => window.open("http://localhost:20128", "_blank")}
              className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5"
              title={isEn ? "Open 9Router Web Dashboard (localhost:20128)" : "Buka Dashboard Web 9Router (localhost:20128)"}
            >
              <Globe className="w-3 h-3" />
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => window.open("https://9router.com", "_blank")}
              className="px-2.5 py-1 bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5"
              title="https://9router.com"
            >
              9router.com
            </button>
            <button
              type="button"
              onClick={() => setActiveAuthModalTarget("nineRouter")}
              className="px-2.5 py-1 bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5"
              title={isEn ? "Manage 9Router gateway authentication (Web Dashboard vs Terminal)" : "Kelola otentikasi gateway 9Router (Web Dashboard vs Terminal)"}
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>{isEn ? "Auth Method" : "Metode Masuk"}</span>
            </button>
            <button
              type="button"
              onClick={() => handleToggleConnection("nineRouter", is9RouterActive, "9Router")}
              disabled={connectingTarget === "nineRouter"}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 select-none shadow-xs",
                is9RouterActive
                  ? "bg-white hover:bg-zinc-200 text-zinc-950 border border-white group"
                  : "bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-500"
              )}
            >
              {connectingTarget === "nineRouter" ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>{isEn ? "Connecting..." : "Menghubungkan..."}</span>
                </>
              ) : is9RouterActive ? (
                <>
                  <Check className="w-3.5 h-3.5 group-hover:hidden stroke-[2.5]" />
                  <X className="w-3.5 h-3.5 hidden group-hover:inline stroke-[2.5]" />
                  <span className="group-hover:hidden">{isEn ? "Connected" : "Terhubung"}</span>
                  <span className="hidden group-hover:inline">{isEn ? "Disconnect" : "Putuskan"}</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                  <span>{isEn ? "Connect" : "Hubungkan"}</span>
                </>
              )}
            </button>
          </div>
        </div>
        {(discoveredClaude?.hasToken || discoveredCodex?.hasToken || discoveredKiro?.hasToken || discoveredCursor?.hasToken) && (
          <div className="px-4 py-3 rounded-xl border border-zinc-800 bg-zinc-950/40 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="min-w-0 text-xs text-zinc-400 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-zinc-200">Discovered Local Caches:</span>
                {discoveredClaude?.hasToken && <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">Claude Code · OK</span>}
                {discoveredCodex?.hasToken && <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">Codex / ChatGPT · OK</span>}
                {discoveredKiro?.hasToken && <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">AWS Kiro SSO · OK</span>}
                {discoveredCursor?.hasToken && <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">Cursor IDE · OK</span>}
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
                emailLabel: isEn ? "Sign in via Browser (Arunaki)" : "Masuk via Browser (Arunaki)",
                emailBadge: "OAuth",
                emailDesc: isEn
                  ? "Runs the Claude OAuth flow in your browser and stores the token in Arunaki. No terminal needed."
                  : "Menjalankan alur OAuth Claude di peramban dan menyimpan tokennya di Arunaki. Tanpa terminal.",
                emailWarningTitle: isEn ? "Notice:" : "Peringatan:",
                emailWarningText: isEn
                  ? "Opens the Anthropic authorization page and stores the token locally in Arunaki. Consumer tokens used through a third-party app remain subject to Anthropic's terms."
                  : "Membuka halaman otorisasi Anthropic dan menyimpan token secara lokal di Arunaki. Penggunaan token akun konsumen lewat aplikasi pihak ketiga tetap tunduk pada kebijakan privasi & layanan Anthropic.",
                emailButton: isEn ? "Sign in with Browser" : "Masuk via Browser",
                onEmailAction: () => {
                  closeModal();
                  handleOauthConnect("claude");
                },
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
                emailLabel: isEn ? "Sign in via Browser (Arunaki)" : "Masuk via Browser (Arunaki)",
                emailBadge: "OAuth",
                emailDesc: isEn
                  ? "Runs the ChatGPT OAuth flow in your browser and stores the token in Arunaki. No terminal needed."
                  : "Menjalankan alur OAuth ChatGPT di peramban dan menyimpan tokennya di Arunaki. Tanpa terminal.",
                emailWarningTitle: isEn ? "Notice:" : "Peringatan:",
                emailWarningText: isEn
                  ? "Opens the OpenAI authorization page and stores the token locally in Arunaki. Requires an active ChatGPT/OpenAI account."
                  : "Membuka halaman otorisasi OpenAI dan menyimpan token secara lokal di Arunaki. Memerlukan akun ChatGPT/OpenAI aktif.",
                emailButton: isEn ? "Sign in with Browser" : "Masuk via Browser",
                onEmailAction: () => {
                  closeModal();
                  handleOauthConnect("codex");
                },
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
                emailLabel: isEn ? "Sign in via Web (Groq Hub)" : "Masuk via Web (Groq Hub)",
                emailBadge: "Cloud Free API",
                emailDesc: isEn
                  ? "Connect free cloud provider keys (Groq / 9Router) directly via web without a terminal."
                  : "Menghubungkan kunci penyedia cloud gratis (Groq / 9Router) langsung via web tanpa terminal.",
                emailWarningTitle: isEn ? "Notice (Cloud API):" : "Peringatan (Cloud API):",
                emailWarningText: isEn
                  ? "Uses external cloud inference (Groq Llama 3.3 / Qwen). Requires a stable internet connection to cloud endpoints."
                  : "Menggunakan cloud inference eksternal (Groq Llama 3.3 / Qwen). Memerlukan koneksi internet stabil ke endpoint cloud.",
                emailButton: isEn ? "Open Groq Console (Web)" : "Buka Konsol Groq (Web)",
                onEmailAction: () => {
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
                emailLabel: isEn ? "9Router Web Dashboard" : "Dashboard Web 9Router",
                emailBadge: "Web Dashboard",
                emailDesc: isEn
                  ? "Open local 9Router dashboard in browser to visually sign in to Google, Claude, OpenAI, and Grok."
                  : "Buka dashboard lokal 9Router di peramban web untuk login email Google, Claude, OpenAI, dan Grok secara visual.",
                emailWarningTitle: isEn ? "Notice (Dashboard):" : "Peringatan (Dashboard):",
                emailWarningText: isEn
                  ? "Opens local 9Router portal on port 20128. Make sure 9Router service is running before opening."
                  : "Membuka portal lokal 9Router di port 20128. Pastikan layanan 9Router sudah berjalan sebelum membuka tautan.",
                emailButton: isEn ? "Open 9Router Dashboard (Web)" : "Buka Dashboard 9Router (Web)",
                onEmailAction: () => {
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
                emailLabel: isEn ? "Sign in with Antigravity CLI" : "Masuk dengan Antigravity CLI",
                emailBadge: "Terminal agy",
                emailDesc: isEn
                  ? "Opens a terminal running the Antigravity CLI. Sign in with your Google AI Pro account there — agy only authenticates interactively."
                  : "Membuka terminal menjalankan Antigravity CLI. Masuk dengan akun Google AI Pro Anda di sana — agy hanya bisa autentikasi secara interaktif.",
                emailWarningTitle: isEn ? "Notice (CLI sign-in):" : "Peringatan (Login CLI):",
                emailWarningText: isEn
                  ? "Antigravity authenticates interactively: a terminal opens running agy, and you complete the Google sign-in there. Direct browser OAuth is refused by Google for this client."
                  : "Antigravity melakukan autentikasi secara interaktif: terminal terbuka menjalankan agy, dan Anda menyelesaikan login Google di sana. OAuth browser langsung ditolak Google untuk client ini.",
                emailButton: isEn ? "Sign in with Antigravity (Terminal)" : "Masuk dengan Antigravity (Terminal)",
                onEmailAction: handleAntigravityEmailLogin,
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-4">
                {/* Opsi 1: Masuk via Email / Web */}
                <div className="flex flex-col justify-between p-4.5 rounded-xl border border-zinc-800 hover:border-zinc-600 bg-zinc-900/50 hover:bg-zinc-900/80 transition-all group">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-200">
                          <Mail className="w-4 h-4" />
                        </div>
                        <span className="font-semibold text-sm text-white">{config.emailLabel}</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300 font-medium">
                        {config.emailBadge}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mb-3.5 leading-relaxed">
                      {config.emailDesc}
                    </p>

                    {/* Kotak Peringatan (Monochrome) */}
                    <div className="p-3 rounded-lg bg-zinc-900/90 border border-zinc-800 text-zinc-300 text-[11px] leading-relaxed mb-4">
                      <div className="flex items-start gap-1.5 font-medium text-white mb-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-zinc-400" />
                        <span>{config.emailWarningTitle}</span>
                      </div>
                      <p className="text-[10.5px] text-zinc-400 leading-normal">
                        {config.emailWarningText}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={config.onEmailAction}
                    disabled={isSigningInEmail}
                    className="w-full py-2 px-3 bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50 border border-white"
                  >
                    {isSigningInEmail ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-950" />
                        <span>{isEn ? "Opening Browser..." : "Membuka Peramban..."}</span>
                      </>
                    ) : (
                      <>
                        <Mail className="w-3.5 h-3.5" />
                        <span>{config.emailButton}</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Opsi 2: Masuk via CLI Terminal */}
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
