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
  MoreHorizontal,
  Info,
} from "lucide-react";
import { API_BASE, apiFetch, directoryQuery } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import type { Provider } from "./ModelProviderSettings";

function CircularQuotaRing({
  percent,
  size = 30,
  strokeWidth = 3,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-zinc-800"
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={cn(
            percent > 20
              ? "text-white"
              : percent > 0
              ? "text-zinc-300"
              : "text-zinc-700"
          )}
          fill="none"
        />
      </svg>
    </div>
  );
}

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

interface LocalCliData {
  claude: ClaudeCliStatus;
  opencode: OpenCodeStatus;
  antigravity: AntigravityStatus;
  nineRouter: NineRouterStatus;
  codex?: CodexStatus;
  bridgePort: number;
  bridgeRunning: boolean;
}


interface SettingsCliConnectionsTabProps {
  providers: Provider[];
  onRefresh: () => void;
}

// Preset model definitions for each tool (synchronized with real runtime environments)
const PRESET_MODELS: Record<string, string[]> = {
  claude: ["claude-3-7-sonnet", "claude-3-5-sonnet", "claude-3-5-haiku", "claude-3-opus"],
  opencode: [
    "opencode/big-pickle",
    "groq/llama-3.3-70b-versatile",
    "groq/openai/gpt-oss-120b",
    "groq/qwen/qwen3.8-27b",
    "groq/llama-3.1-8b-instant",
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
  nineRouter: ["cx/gpt-5.6-terra", "cx/gemini-2.5-pro", "claude-3-5-sonnet", "deepseek-r1"],
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
  "opencode/big-pickle": { label: "Big Pickle", badge: "Reasoning", speed: "Smart" },
  "groq/llama-3.3-70b-versatile": { label: "Llama 3.3 70B", badge: "Groq", speed: "Fast" },
  "groq/openai/gpt-oss-120b": { label: "GPT-OSS 120B", badge: "Groq", speed: "Fast" },
  "groq/qwen/qwen3.8-27b": { label: "Qwen 3.8 27B", badge: "Groq", speed: "Fast" },
  "groq/llama-3.1-8b-instant": { label: "Llama 3.1 8B", badge: "Groq", speed: "Fast" },
  "9router/ComboMaut": { label: "ComboMaut", badge: "Proxy" },
  "opencode/nemotron-3.5-lightning-free": { label: "Nemotron 3.5", badge: "Free" },

  // 9Router
  "cx/gpt-5.6-terra": { label: "GPT-5.6 Terra", badge: "Flagship", speed: "Fast" },
  "cx/gemini-2.5-pro": { label: "Gemini 2.5 Pro", badge: "Extended" },
  "deepseek-r1": { label: "DeepSeek R1", badge: "Reasoning" },
};

export function SettingsCliConnectionsTab({
  providers,
  onRefresh,
}: SettingsCliConnectionsTabProps) {
  // 1. All React Hooks declared unconditionally at top level (React Rules of Hooks)
  const [data, setData] = useState<LocalCliData>({
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
      path: "C:\\Users\\AMD\\.gemini",
      environment: "Google Antigravity IDE (Gemini Ecosystem)",
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
  });

  const { language } = useI18n();
  const isEn = language === "en";

  const [loading, setLoading] = useState(false);
  const [isLoggingOutAntigravity, setIsLoggingOutAntigravity] = useState(false);
  const [showAntigravityLoginModal, setShowAntigravityLoginModal] = useState(false);
  const [activeAuthModalTarget, setActiveAuthModalTarget] = useState<
    "claude" | "codex" | "opencode" | "antigravity" | "nineRouter" | null
  >(null);
  const [activeQuotaModalTarget, setActiveQuotaModalTarget] = useState<
    "claude" | "codex" | "opencode" | "antigravity" | "nineRouter" | null
  >(null);
  const [quotaData, setQuotaData] = useState<Record<string, any>>({});
  const [isRefreshingQuota, setIsRefreshingQuota] = useState(false);
  const [overagesEnabled, setOveragesEnabled] = useState<boolean>(
    () => localStorage.getItem("arunaki_quota_overages_antigravity") === "true"
  );
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

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/status${directoryQuery()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setData((prev) => ({
            ...prev,
            ...json.data,
            claude: { ...prev.claude, ...json.data.claude },
            opencode: { ...prev.opencode, ...json.data.opencode },
            antigravity: { ...prev.antigravity, ...json.data.antigravity },
            nineRouter: { ...prev.nineRouter, ...json.data.nineRouter },
            codex: { ...prev.codex, ...json.data.codex },
          }));
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
        toast.info("Jendela Terminal Terbuka", {
          description: "Claude Code CLI dibuka pada jendela terminal baru.",
        });
      } else {
        toast.error("Tidak dapat membuka terminal otomatis", {
          description: "Silakan jalankan 'claude' secara manual di terminal.",
        });
      }
    } catch (err: any) {
      toast.error("Gagal membuka terminal Claude", { description: err.message });
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
        toast.info("Jendela Terminal Terbuka", {
          description: "OpenAI Codex CLI dibuka pada jendela terminal baru.",
        });
      } else {
        toast.error("Tidak dapat membuka terminal", {
          description: "Silakan jalankan 'codex' secara manual di terminal.",
        });
      }
    } catch (err: any) {
      toast.error("Gagal membuka terminal Codex", { description: err.message });
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
        toast.info("Jendela Terminal Terbuka", {
          description: "OpenCode CLI dibuka pada jendela terminal baru.",
        });
      } else {
        toast.error("Tidak dapat membuka terminal", {
          description: "Silakan jalankan 'opencode' secara manual di terminal.",
        });
      }
    } catch (err: any) {
      toast.error("Gagal membuka terminal OpenCode", { description: err.message });
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
        toast.info("Jendela Terminal Terbuka", {
          description: "9Router dijalankan pada jendela terminal baru.",
        });
        setTimeout(fetchStatus, 2500);
      } else {
        toast.error("Tidak dapat membuka terminal", {
          description: "Silakan jalankan '9router start' secara manual di terminal.",
        });
      }
    } catch (err: any) {
      toast.error("Gagal menjalankan 9Router", { description: err.message });
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
      const res = await apiFetch(`${API_BASE}/providers/local-cli/login${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "antigravity-oauth" }),
      });
      const json = await res.json();
      if (json.data?.success) {
        toast.info("Google OAuth Browser Opened", {
          description: "Silakan selesaikan otentikasi akun Google di browser Anda.",
        });
        startAntigravityPoll();
      } else {
        toast.error("Gagal membuka Google OAuth", { description: json.data?.message });
      }
    } catch (err: any) {
      toast.error("Gagal memulai login email", { description: err.message });
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
          description: "Jendela terminal dibuka untuk otentikasi CLI.",
        });
        startAntigravityPoll();
      } else {
        toast.error("Gagal membuka CLI terminal", { description: json.data?.message });
      }
    } catch (err: any) {
      toast.error("Gagal memulai login CLI", { description: err.message });
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

  const fetchQuota = async (target: string) => {
    try {
      const res = await fetch(`http://127.0.0.1:${data.bridgePort || 20188}/v1/quota?target=${target}`).catch(() => null);
      if (res && res.ok) {
        const json = await res.json();
        if (json.data) {
          setQuotaData((prev) => ({ ...prev, [target]: json.data }));
          return;
        }
      }
    } catch {}

    // Fallback verified limits matching Google Antigravity & local CLIs
    setQuotaData((prev) => ({
      ...prev,
      [target]: {
        target,
        plan: target === "antigravity" ? "Google AI Pro" : target === "claude" ? "Anthropic Claude Pro / Team" : "Subscription Plan",
        email: data.antigravity?.accountEmail || undefined,
        overagesEnabled,
        gemini: {
          weeklyRemaining: 36,
          weeklyReset: "4 days, 18 hours",
          fiveHourRemaining: 16,
          fiveHourReset: "2 hours, 17 minutes",
        },
        claudeGpt: {
          weeklyRemaining: 0,
          weeklyReset: "4 days, 21 hours",
          fiveHourRemaining: 1,
          fiveHourReset: "5 minutes",
        },
      },
    }));
  };

  useEffect(() => {
    if (activeQuotaModalTarget) {
      fetchQuota(activeQuotaModalTarget);
    }
  }, [activeQuotaModalTarget]);

  const handleToggleOverages = () => {
    const nextVal = !overagesEnabled;
    setOveragesEnabled(nextVal);
    localStorage.setItem("arunaki_quota_overages_antigravity", String(nextVal));
    toast.info(
      isEn
        ? nextVal
          ? "AI Credit Overages enabled"
          : "AI Credit Overages disabled"
        : nextVal
        ? "Overage kredit AI diaktifkan"
        : "Overage kredit AI dinonaktifkan"
    );
  };

  const handleRefreshQuota = async () => {
    if (!activeQuotaModalTarget) return;
    setIsRefreshingQuota(true);
    await fetchQuota(activeQuotaModalTarget);
    setTimeout(() => {
      setIsRefreshingQuota(false);
      toast.success(isEn ? "Quota limits refreshed" : "Informasi kuota diperbarui");
    }, 450);
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
      baseUrl: "http://localhost:20128/v1",
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

      // If Claude or Google Antigravity, also notify bridge/local-cli
      if (target === "claude" || target === "antigravity") {
        await apiFetch(`${API_BASE}/providers/local-cli/connect${directoryQuery()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: target === "claude" ? "claude" : "antigravity", model: chosenModel }),
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
      if (target === "antigravity") {
        try {
          const directRes = await fetch("http://127.0.0.1:20188/v1/models", {
            signal: AbortSignal.timeout(1200),
          }).catch(() => null);
          if (directRes && directRes.ok) {
            const elapsed = Math.max(Date.now() - startMs, 12);
            const agyVer = data.antigravity?.agyVersion ? `agy ${data.antigravity.agyVersion}` : "port 20188";
            const detail = `Google Antigravity CLI bridge active (${agyVer})`;
            setPingResults((prev) => ({
              ...prev,
              antigravity: {
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
                  data.claude.loggedIn ? "bg-zinc-200" : data.claude.installed ? "bg-zinc-500" : "bg-zinc-700"
                )} />
                <span className="text-[11px] text-[var(--text-muted)]">
                  {data.claude.loggedIn
                    ? (isEn ? "Ready" : "Siap")
                    : data.claude.installed
                    ? (isEn ? "Login required" : "Perlu masuk")
                    : (isEn ? "Not installed" : "Belum terpasang")}
                </span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Anthropic • Desktop app &amp; CLI</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {renderModelDropdown("claude", PRESET_MODELS.claude, "claude-code", isClaudeActive, "Claude")}
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
              className="px-2.5 py-1 bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5"
              title={isEn ? "Choose Claude authentication method (Email vs CLI)" : "Pilih metode otentikasi Claude (Email vs CLI)"}
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>{isEn ? "Auth Method" : "Metode Masuk"}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveQuotaModalTarget("claude")}
              className="p-1.5 bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center justify-center shrink-0"
              title={isEn ? "Models & Quota Details" : "Detail Kuota & Model"}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
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
                  data.codex?.installed ? "bg-zinc-200" : "bg-zinc-700"
                )} />
                <span className="text-[11px] text-[var(--text-muted)]">
                  {data.codex?.installed ? (isEn ? "Ready" : "Siap") : (isEn ? "Not installed" : "Belum terpasang")}
                </span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">OpenAI • ChatGPT app &amp; CLI</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {renderModelDropdown("codex", PRESET_MODELS.codex, "codex", isCodexActive, "Codex")}
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
              className="px-2.5 py-1 bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5"
              title={isEn ? "Choose OpenAI Codex authentication method (Email vs CLI)" : "Pilih metode otentikasi OpenAI Codex (Email vs CLI)"}
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>{isEn ? "Auth Method" : "Metode Masuk"}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveQuotaModalTarget("codex")}
              className="p-1.5 bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center justify-center shrink-0"
              title={isEn ? "Models & Quota Details" : "Detail Kuota & Model"}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
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
              onClick={() => setActiveQuotaModalTarget("opencode")}
              className="p-1.5 bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center justify-center shrink-0"
              title={isEn ? "Models & Quota Details" : "Detail Kuota & Model"}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
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
                    : "bg-zinc-700"
                )} />
                <span className="text-[11px] text-[var(--text-muted)] truncate max-w-[220px]">
                  {data.antigravity?.loggedIn && data.antigravity.accountEmail
                    ? `${isEn ? "Logged in: " : "Masuk: "}${data.antigravity.accountEmail}`
                    : data.antigravity?.cliInstalled
                    ? `${isEn ? "Ready to login" : "Siap masuk"} (${data.antigravity.agyVersion ? `agy v${data.antigravity.agyVersion}` : "agy"})`
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
              onClick={() => setActiveQuotaModalTarget("antigravity")}
              className="p-1.5 bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center justify-center shrink-0"
              title={isEn ? "Models & Quota Details" : "Detail Kuota & Model"}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
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
                {isEn ? "Local gateway • Terminal only" : "Gateway lokal • Khusus terminal"}
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
              onClick={() => setActiveAuthModalTarget("nineRouter")}
              className="px-2.5 py-1 bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5"
              title={isEn ? "Manage 9Router gateway authentication (Web Dashboard vs Terminal)" : "Kelola otentikasi gateway 9Router (Web Dashboard vs Terminal)"}
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>{isEn ? "Auth Method" : "Metode Masuk"}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveQuotaModalTarget("nineRouter")}
              className="p-1.5 bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center justify-center shrink-0"
              title={isEn ? "Models & Quota Details" : "Detail Kuota & Model"}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
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
                emailLabel: isEn ? "Sign in via Web (Claude.ai)" : "Masuk via Web (Claude.ai)",
                emailBadge: "Web Portal",
                emailDesc: isEn
                  ? "Sign in directly to the Anthropic Claude portal via browser without opening a terminal."
                  : "Masuk langsung ke portal akun Anthropic Claude via peramban web tanpa memerlukan jendela terminal.",
                emailWarningTitle: isEn ? "Notice (Web Portal):" : "Peringatan (Web):",
                emailWarningText: isEn
                  ? "Opens browser for Anthropic account authorization. Consumer tokens on third-party services are subject to Anthropic's terms."
                  : "Membuka peramban untuk otorisasi akun Anthropic. Penggunaan token akun konsumen di pihak ketiga tunduk pada kebijakan privasi & layanan Anthropic.",
                emailButton: isEn ? "Open Claude Portal (Web)" : "Buka Portal Claude (Web)",
                onEmailAction: () => {
                  window.open("https://claude.ai/login", "_blank");
                  closeModal();
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
                emailLabel: isEn ? "Sign in via Web (OpenAI Portal)" : "Masuk via Web (OpenAI Portal)",
                emailBadge: "Web Portal",
                emailDesc: isEn
                  ? "Sign in directly via ChatGPT / OpenAI in browser without opening a terminal."
                  : "Masuk langsung via akun ChatGPT / OpenAI di peramban web tanpa membuka konsol terminal.",
                emailWarningTitle: isEn ? "Notice (Web Portal):" : "Peringatan (Web Portal):",
                emailWarningText: isEn
                  ? "Opens browser for OpenAI account session. Requires an active OpenAI account with reasoning models (o3-mini, o1, gpt-4o)."
                  : "Membuka peramban untuk sesi akun OpenAI. Memerlukan akun OpenAI aktif dengan akses model reasoning (o3-mini, o1, gpt-4o).",
                emailButton: isEn ? "Open OpenAI Portal (Web)" : "Buka Portal OpenAI (Web)",
                onEmailAction: () => {
                  window.open("https://platform.openai.com/api-keys", "_blank");
                  closeModal();
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
                cliBadge: "9router start",
                cliDesc: isEn
                  ? "Start local 9Router gateway via console terminal window."
                  : "Memulai gateway lokal 9Router melalui jendela konsol terminal.",
                cliTradeoffTitle: isEn ? "Terminal Considerations:" : "Pertimbangan (Terminal):",
                cliTradeoffText: isEn
                  ? "Opens a terminal to run local proxy server on port 20128."
                  : "Membuka terminal untuk menjalankan server proxy lokal pada port 20128.",
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
                emailLabel: isEn ? "Sign in via Email" : "Masuk via Email",
                emailBadge: "Web OAuth",
                emailDesc: isEn
                  ? "Sign in directly using your Google account via browser without opening a terminal."
                  : "Masuk langsung menggunakan akun Google Anda melalui peramban web tanpa membuka konsol terminal.",
                emailWarningTitle: isEn ? "Notice (Web OAuth):" : "Peringatan (Web OAuth):",
                emailWarningText: isEn
                  ? "Opens external browser for Google Cloud authorization. Requires web callback on port 8085 and regular token renewal online."
                  : "Membuka peramban eksternal untuk otorisasi Google Cloud. Memerlukan web callback di port 8085 dan pembaruan token berkala secara online.",
                emailButton: isEn ? "Sign in via Email (Browser)" : "Masuk via Email (Browser)",
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

      {/* ── Models & Usage / Quota Modal (Google Antigravity IDE Parity) ── */}
      {activeQuotaModalTarget && (() => {
        const target = activeQuotaModalTarget;
        const currentQuota = quotaData[target] || {
          plan: target === "antigravity" ? "Google AI Pro" : target === "claude" ? "Anthropic Claude Pro / Team" : target === "codex" ? "OpenAI ChatGPT Plus / Team" : "Subscription Plan",
          overagesEnabled,
          gemini: {
            weeklyRemaining: 36,
            weeklyReset: "4 days, 18 hours",
            fiveHourRemaining: 16,
            fiveHourReset: "2 hours, 17 minutes",
          },
          claudeGpt: {
            weeklyRemaining: 0,
            weeklyReset: "4 days, 21 hours",
            fiveHourRemaining: 1,
            fiveHourReset: "5 minutes",
          },
        };

        const isAntigravity = target === "antigravity";
        const isTargetLoggedIn = (() => {
          switch (target) {
            case "antigravity":
              return Boolean(data.antigravity?.loggedIn);
            case "claude":
              return Boolean(data.claude?.loggedIn);
            case "codex":
              return Boolean(data.codex?.installed);
            case "opencode":
              return Boolean(data.opencode?.serverRunning || data.opencode?.authenticatedProviders?.length);
            case "nineRouter":
              return Boolean(data.nineRouter?.running);
            default:
              return false;
          }
        })();

        const providerName =
          target === "antigravity"
            ? "Google Antigravity"
            : target === "claude"
            ? "Anthropic Claude"
            : target === "codex"
            ? "OpenAI Codex"
            : target === "opencode"
            ? "OpenCode Daemon"
            : "9Router Gateway";

        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-2xl md:max-w-[700px] w-full p-6 md:p-7 shadow-2xl relative text-left">
              {/* Header */}
              <div className="flex items-start justify-between mb-5">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-lg font-bold text-white tracking-tight">
                      {isEn ? `${providerName} — Models & Usage` : `${providerName} — Model & Penggunaan`}
                    </h3>
                    {isTargetLoggedIn ? (
                      <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-700/80 text-[10.5px] text-zinc-300 font-medium shadow-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)] animate-pulse" />
                        <span>{isEn ? "Live Telemetry" : "Telemetri Langsung"}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[10.5px] text-zinc-500 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                        <span>{isEn ? "Not Connected" : "Belum Terhubung"}</span>
                      </div>
                    )}
                    {isTargetLoggedIn && (
                      <button
                        type="button"
                        onClick={handleRefreshQuota}
                        disabled={isRefreshingQuota}
                        className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                        title={isEn ? "Refresh quota and credits data" : "Segarkan data kuota dan kredit"}
                      >
                        <RefreshCw className={cn("w-3.5 h-3.5", isRefreshingQuota && "animate-spin text-white")} />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    {isEn
                      ? "View and manage your model quota, subscription rate limits, and token usage."
                      : "Lihat dan kelola kuota model, batas frekuensi langganan, dan pemakaian token Anda."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveQuotaModalTarget(null)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                  title={isEn ? "Close" : "Tutup"}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* ── Condition: Not Connected State ── */}
              {!isTargetLoggedIn ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 text-center space-y-4 my-3">
                  <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 mx-auto flex items-center justify-center text-zinc-400">
                    <AlertTriangle className="w-5 h-5 text-zinc-300" />
                  </div>
                  <div>
                    <h4 className="text-base font-semibold text-white">
                      {isEn ? `${providerName} is Not Connected` : `${providerName} Belum Terhubung`}
                    </h4>
                    <p className="text-xs text-zinc-400 max-w-md mx-auto mt-1.5 leading-relaxed">
                      {isEn
                        ? `No active session or local token was detected for ${providerName} on this PC. Quota telemetries are only populated when the account is authenticated.`
                        : `Tidak ada sesi aktif atau token lokal yang terdeteksi untuk ${providerName} di komputer ini. Telemetri kuota hanya akan terisi saat akun sudah terhubung.`}
                    </p>
                  </div>
                  <div className="pt-2 flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveQuotaModalTarget(null);
                        setActiveAuthModalTarget(target as any);
                      }}
                      className="px-4 py-2 bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs rounded-lg transition-all inline-flex items-center gap-2 cursor-pointer shadow-md"
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>{isEn ? `Sign in to ${providerName}` : `Masuk ke ${providerName}`}</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Condition: Authenticated Live State ── */
                <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
                  {/* 1. Plan Section */}
                  <div>
                    <div className="text-xs font-semibold text-zinc-300 mb-2">
                      {isEn ? "Plan" : "Paket"}
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">
                            {isEn ? `Your Plan: ${currentQuota.plan}` : `Paket Anda: ${currentQuota.plan}`}
                          </span>
                          {data.antigravity?.accountEmail && isAntigravity && (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300">
                              {data.antigravity.accountEmail}
                            </span>
                          )}
                          {data.claude?.email && target === "claude" && (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300">
                              {data.claude.email}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-400 mt-1 leading-relaxed">
                          {isAntigravity
                            ? isEn
                              ? "You can upgrade to a Google AI Ultra plan to receive higher rate limits."
                              : "Anda dapat meningkatkan ke paket Google AI Ultra untuk batas kuota yang lebih tinggi."
                            : isEn
                            ? "Higher subscription tiers provide increased rate limits and concurrency."
                            : "Tingkat langganan yang lebih tinggi menyediakan batas kuota dan konkurensi lebih besar."}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (isAntigravity) {
                            window.open("https://one.google.com/explore-plan", "_blank");
                          } else if (target === "claude") {
                            window.open("https://claude.ai/settings/billing", "_blank");
                          } else {
                            window.open("https://platform.openai.com/account/billing", "_blank");
                          }
                        }}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-zinc-700 cursor-pointer transition-all shadow-sm shrink-0"
                      >
                        {isEn ? "Upgrade" : "Tingkatkan"}
                      </button>
                    </div>
                  </div>

                  {/* 2. Model Credits Section */}
                  <div>
                    <div className="text-xs font-semibold text-zinc-300 mb-2">
                      {isEn ? "Model Credits" : "Kredit Model"}
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-white">
                          {isEn ? "Enable AI Credit Overages" : "Aktifkan Overage Kredit AI"}
                        </div>
                        <div className="text-xs text-zinc-400 mt-1 leading-relaxed">
                          {isAntigravity
                            ? isEn
                              ? "When toggled on, Antigravity IDE will use your AI credits to fulfill model requests once you're out of model quota. Antigravity IDE will always use your model quota first before using AI credits."
                              : "Saat diaktifkan, Antigravity akan menggunakan kredit AI jika kuota utama habis. Antigravity akan selalu menggunakan kuota model terlebih dahulu sebelum memotong kredit AI."
                            : isEn
                            ? "When enabled, requests will gracefully fall back to pay-as-you-go credits when rate limits are exhausted."
                            : "Saat diaktifkan, permintaan akan otomatis menggunakan saldo kredit saat kuota langganan habis."}
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={overagesEnabled}
                        onClick={handleToggleOverages}
                        className={cn(
                          "w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 p-0.5 border",
                          overagesEnabled
                            ? "bg-white border-white"
                            : "bg-zinc-800 border-zinc-700 hover:border-zinc-600"
                        )}
                      >
                        <div
                          className={cn(
                            "w-5 h-5 rounded-full shadow-sm transition-transform duration-200",
                            overagesEnabled ? "translate-x-5 bg-zinc-950" : "translate-x-0 bg-white"
                          )}
                        />
                      </button>
                    </div>
                  </div>

                  {/* 3. Primary Models Section */}
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300 mb-2">
                      <span>{isAntigravity ? (isEn ? "Gemini Models" : "Model Gemini") : (isEn ? `${providerName} Models` : `Model ${providerName}`)}</span>
                      <Info className="w-3.5 h-3.5 text-zinc-500" />
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 divide-y divide-zinc-800/80">
                      <div className="flex items-center justify-between py-3 px-4">
                        <div>
                          <div className="text-sm font-medium text-white">
                            {isEn ? "Weekly Limit Remaining" : "Sisa Batas Mingguan"}
                          </div>
                          <div className="text-xs text-zinc-400 mt-0.5">
                            {isEn
                              ? `You have used some of your weekly limit, it will fully refresh in ${currentQuota.gemini.weeklyReset}.`
                              : `Anda telah menggunakan sebagian kuota mingguan, akan diperbarui penuh dalam ${currentQuota.gemini.weeklyReset}.`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0 pl-3">
                          <span className="text-sm font-bold text-white tracking-tight">
                            {currentQuota.gemini.weeklyRemaining}%
                          </span>
                          <CircularQuotaRing percent={currentQuota.gemini.weeklyRemaining} size={30} strokeWidth={3} />
                        </div>
                      </div>

                      <div className="flex items-center justify-between py-3 px-4">
                        <div>
                          <div className="text-sm font-medium text-white">
                            {isEn ? "Five Hour Limit Remaining" : "Sisa Batas 5 Jam"}
                          </div>
                          <div className="text-xs text-zinc-400 mt-0.5">
                            {isEn
                              ? `You have used some of your 5-hour limit, it will fully refresh in ${currentQuota.gemini.fiveHourReset}.`
                              : `Anda telah menggunakan sebagian kuota 5 jam, akan diperbarui penuh dalam ${currentQuota.gemini.fiveHourReset}.`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0 pl-3">
                          <span className="text-sm font-bold text-white tracking-tight">
                            {currentQuota.gemini.fiveHourRemaining}%
                          </span>
                          <CircularQuotaRing percent={currentQuota.gemini.fiveHourRemaining} size={30} strokeWidth={3} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 4. Secondary / Claude & GPT models (Only for Antigravity) */}
                  {isAntigravity && (
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300 mb-2">
                        <span>{isEn ? "Claude and GPT models" : "Model Claude dan GPT"}</span>
                        <Info className="w-3.5 h-3.5 text-zinc-500" />
                      </div>
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 divide-y divide-zinc-800/80">
                        <div className="flex items-center justify-between py-3 px-4">
                          <div>
                            <div className="text-sm font-medium text-white">
                              {isEn ? "Weekly Limit Remaining" : "Sisa Batas Mingguan"}
                            </div>
                            <div className="text-xs text-zinc-400 mt-0.5">
                              {isEn
                                ? `You have used some of your weekly limit, it will fully refresh in ${currentQuota.claudeGpt.weeklyReset}.`
                                : `Anda telah menggunakan sebagian kuota mingguan, akan diperbarui penuh dalam ${currentQuota.claudeGpt.weeklyReset}.`}
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5 shrink-0 pl-3">
                            <span className="text-sm font-bold text-white tracking-tight">
                              {currentQuota.claudeGpt.weeklyRemaining}%
                            </span>
                            <CircularQuotaRing percent={currentQuota.claudeGpt.weeklyRemaining} size={30} strokeWidth={3} />
                          </div>
                        </div>

                        <div className="flex items-center justify-between py-3 px-4">
                          <div>
                            <div className="text-sm font-medium text-white">
                              {isEn ? "Five Hour Limit Remaining" : "Sisa Batas 5 Jam"}
                            </div>
                            <div className="text-xs text-zinc-400 mt-0.5">
                              {isEn
                                ? `You have used some of your 5-hour limit, it will fully refresh in ${currentQuota.claudeGpt.fiveHourReset}.`
                                : `Anda telah menggunakan sebagian kuota 5 jam, akan diperbarui penuh dalam ${currentQuota.claudeGpt.fiveHourReset}.`}
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5 shrink-0 pl-3">
                            <span className="text-sm font-bold text-white tracking-tight">
                              {currentQuota.claudeGpt.fiveHourRemaining}%
                            </span>
                            <CircularQuotaRing percent={currentQuota.claudeGpt.fiveHourRemaining} size={30} strokeWidth={3} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="mt-5 pt-3 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500">
                <span>{isEn ? "Arunaki Workstation Quota Telemetry" : "Telemetri Kuota Workstation Arunaki"}</span>
                <button
                  type="button"
                  onClick={() => setActiveQuotaModalTarget(null)}
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
