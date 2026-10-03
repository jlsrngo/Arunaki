import { useState, useEffect } from "react";
import {
  Terminal,
  Check,
  Loader2,
  RefreshCw,
  Globe,
} from "lucide-react";
import { API_BASE, apiFetch, directoryQuery } from "../../lib/api";
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
  path?: string;
  environment: string;
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
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.1-pro",
    "claude-sonnet-4.6",
    "claude-opus-4.6",
    "gpt-oss-120b",
  ],
  nineRouter: ["cx/gpt-5.6-terra", "cx/gemini-2.5-pro", "claude-3-5-sonnet", "deepseek-r1"],
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

  const [loading, setLoading] = useState(false);
  const [isOpeningClaudeTerminal, setIsOpeningClaudeTerminal] = useState(false);
  const [isStarting9Router, setIsStarting9Router] = useState(false);
  const [isOpeningOpenCodeTerminal, setIsOpeningOpenCodeTerminal] = useState(false);
  const [isOpeningCodexTerminal, setIsOpeningCodexTerminal] = useState(false);
  const [connectingTarget, setConnectingTarget] = useState<string | null>(null);
  // Selected Models per CLI connection (persisted in localStorage)
  const [selectedModels] = useState<Record<string, string>>(() => {
    return {
      claude: localStorage.getItem("arunaki_cli_model_claude") || PRESET_MODELS.claude[0],
      opencode: localStorage.getItem("arunaki_cli_model_opencode") || PRESET_MODELS.opencode[0],
      codex: localStorage.getItem("arunaki_cli_model_codex") || PRESET_MODELS.codex[0],
      antigravity: localStorage.getItem("arunaki_cli_model_antigravity") || PRESET_MODELS.antigravity[0],
      nineRouter: localStorage.getItem("arunaki_cli_model_nineRouter") || PRESET_MODELS.nineRouter[0],
    };
  });

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

  const geminiProvider = providers.find((p) => p.id === "gemini" || p.type === "gemini");
  const isGeminiActive =
    geminiProvider?.active || localStorage.getItem("arunaki_active_provider") === "gemini";

  const nineRouterProvider = providers.find((p) => p.id === "9router" || p.type === "9router");
  const is9RouterActive =
    nineRouterProvider?.active || localStorage.getItem("arunaki_active_provider") === "9router";


  const handleLaunchClaudeTerminal = async () => {
    setIsOpeningClaudeTerminal(true);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/login${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "claude" }),
      });
      const json = await res.json();
      if (json.data?.success) {
        toast.info("Terminal Window Opened", {
          description: "Claude Code CLI opened in a new terminal window.",
        });
      } else {
        toast.error("Could not launch terminal automatically", {
          description: "Please run 'claude' manually in your terminal.",
        });
      }
    } catch (err: any) {
      toast.error("Failed to launch Claude terminal", { description: err.message });
    } finally {
      setIsOpeningClaudeTerminal(false);
    }
  };

  const handleLaunchCodexTerminal = async () => {
    setIsOpeningCodexTerminal(true);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/login${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "codex" }),
      });
      const json = await res.json();
      if (json.data?.success) {
        toast.info("Terminal Window Opened", {
          description: "OpenAI Codex CLI opened in a new terminal window.",
        });
      } else {
        toast.error("Could not launch terminal", {
          description: "Please run 'codex' manually in terminal.",
        });
      }
    } catch (err: any) {
      toast.error("Failed to launch Codex terminal", { description: err.message });
    } finally {
      setIsOpeningCodexTerminal(false);
    }
  };

  const handleLaunchOpenCodeTerminal = async () => {
    setIsOpeningOpenCodeTerminal(true);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/login${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "opencode-terminal" }),
      });
      const json = await res.json();
      if (json.data?.success) {
        toast.info("Terminal Window Opened", {
          description: "OpenCode CLI opened in a new terminal window.",
        });
      } else {
        toast.error("Could not launch terminal", {
          description: "Please run 'opencode' manually in terminal.",
        });
      }
    } catch (err: any) {
      toast.error("Failed to launch OpenCode terminal", { description: err.message });
    } finally {
      setIsOpeningOpenCodeTerminal(false);
    }
  };

  const handleLaunch9Router = async () => {
    setIsStarting9Router(true);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/login${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "9router" }),
      });
      const json = await res.json();
      if (json.data?.success) {
        toast.info("Terminal Window Opened", {
          description: "9Router started in a new terminal window.",
        });
        setTimeout(fetchStatus, 2500);
      } else {
        toast.error("Could not launch terminal", {
          description: "Please run '9router start' manually in terminal.",
        });
      }
    } catch (err: any) {
      toast.error("Failed to start 9Router", { description: err.message });
    } finally {
      setIsStarting9Router(false);
    }
  };

  const handleConnectTarget = async (
    target: "claude" | "9router" | "opencode" | "antigravity" | "codex",
    activeId: string,
    defaultModel: string,
    friendlyName: string
  ) => {
    setConnectingTarget(target);
    const chosenModel = selectedModels[target] || defaultModel;
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/connect${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, model: chosenModel }),
      });

      if (res.ok) {
        localStorage.setItem("arunaki_active_provider", activeId);
        localStorage.setItem("arunaki_last_active_cli", activeId);
        localStorage.setItem("arunaki_active_model", chosenModel);
        await apiFetch(`${API_BASE}/providers/${activeId}/state${directoryQuery()}`, {
          method: "PUT",
          body: JSON.stringify({ active: true }),
        }).catch(() => {});

        toast.success(`${friendlyName} Connected & Active`, {
          description: `Ready to run document tasks using ${chosenModel}.`,
        });
        onRefresh();
        fetchStatus();
      } else {
        const json = await res.json().catch(() => ({}));
        toast.error("Connection Failed", {
          description: json.message || `Failed to configure ${friendlyName}.`,
        });
      }
    } catch (err: any) {
      toast.error("Connection Error", { description: err.message });
    } finally {
      setConnectingTarget(null);
    }
  };

  const handleToggleActiveDirect = async (providerId: string, model: string, friendlyName: string) => {
    try {
      localStorage.setItem("arunaki_active_provider", providerId);
      localStorage.setItem("arunaki_last_active_cli", providerId);
      localStorage.setItem("arunaki_active_model", model);
      await apiFetch(`${API_BASE}/providers/${providerId}/state${directoryQuery()}`, {
        method: "PUT",
        body: JSON.stringify({ active: true }),
      }).catch(() => {});
      toast.success(`${friendlyName} set as primary active (${model})`);
      onRefresh();
    } catch {
      toast.error(`Failed to activate ${friendlyName}`);
    }
  };


  return (
    <div className="space-y-5 w-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-[var(--text-primary)] text-base flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[var(--text-primary)]" />
            Connection CLI & Agent Subscriptions
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Harness your flat subscription accounts (Claude Pro, OpenCode, OpenAI Codex, Google Antigravity, 9Router) directly with zero per-token fees.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchStatus}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-all cursor-pointer disabled:opacity-50 shadow-xs"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          <span>Scan All Agents</span>
        </button>
      </div>

      {/* Simple connection list for non-technical users */}
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
              onClick={() => {
                const model = selectedModels.claude;
                if (claudeProvider) {
                  handleToggleActiveDirect("claude-code", model, "Claude");
                } else {
                  handleConnectTarget("claude", "claude-code", model, "Claude");
                }
              }}
              disabled={connectingTarget === "claude"}
              className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer",
                isClaudeActive
                  ? "border-white bg-white"
                  : "border-zinc-600 hover:border-zinc-400"
              )}
            >
              {isClaudeActive && <Check className="w-3 h-3 text-zinc-900 stroke-[3]" />}
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-[var(--text-primary)]">Claude</span>
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  data.claude.loggedIn ? "bg-zinc-200" : data.claude.installed ? "bg-zinc-500" : "bg-zinc-700"
                )} />
                <span className="text-[11px] text-[var(--text-muted)]">
                  {data.claude.loggedIn ? "Ready" : data.claude.installed ? "Login required" : "Not installed"}
                </span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Anthropic • Desktop app &amp; CLI</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
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
              onClick={handleLaunchClaudeTerminal}
              disabled={isOpeningClaudeTerminal || !data.claude.installed}
              className="px-2.5 py-1 bg-zinc-800/50 hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 border border-zinc-700/50 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5 disabled:opacity-30"
            >
              {isOpeningClaudeTerminal ? <Loader2 className="w-3 h-3 animate-spin" /> : <Terminal className="w-3 h-3" />}
              CLI
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
              onClick={() => {
                const model = selectedModels.codex;
                if (codexProvider) {
                  handleToggleActiveDirect("codex", model, "Codex");
                } else {
                  handleConnectTarget("codex", "codex", model, "Codex");
                }
              }}
              disabled={connectingTarget === "codex"}
              className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer",
                isCodexActive
                  ? "border-white bg-white"
                  : "border-zinc-600 hover:border-zinc-400"
              )}
            >
              {isCodexActive && <Check className="w-3 h-3 text-zinc-900 stroke-[3]" />}
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-[var(--text-primary)]">Codex</span>
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  data.codex?.installed ? "bg-zinc-200" : "bg-zinc-700"
                )} />
                <span className="text-[11px] text-[var(--text-muted)]">
                  {data.codex?.installed ? "Ready" : "Not installed"}
                </span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">OpenAI • ChatGPT app &amp; CLI</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
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
              onClick={handleLaunchCodexTerminal}
              disabled={isOpeningCodexTerminal || !data.codex?.installed}
              className="px-2.5 py-1 bg-zinc-800/50 hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 border border-zinc-700/50 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5 disabled:opacity-30"
            >
              {isOpeningCodexTerminal ? <Loader2 className="w-3 h-3 animate-spin" /> : <Terminal className="w-3 h-3" />}
              CLI
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
              onClick={() => {
                const model = selectedModels.opencode;
                if (opencodeProvider) {
                  handleToggleActiveDirect("opencode", model, "OpenCode");
                } else {
                  handleConnectTarget("opencode", "opencode", model, "OpenCode");
                }
              }}
              disabled={connectingTarget === "opencode"}
              className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer",
                isOpenCodeActive
                  ? "border-white bg-white"
                  : "border-zinc-600 hover:border-zinc-400"
              )}
            >
              {isOpenCodeActive && <Check className="w-3 h-3 text-zinc-900 stroke-[3]" />}
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-[var(--text-primary)]">OpenCode</span>
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  data.opencode.installed ? "bg-zinc-200" : "bg-zinc-700"
                )} />
                <span className="text-[11px] text-[var(--text-muted)]">
                  {data.opencode.installed ? "Ready" : "Not installed"}
                </span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Open-source • Desktop app &amp; terminal</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
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
              onClick={handleLaunchOpenCodeTerminal}
              disabled={isOpeningOpenCodeTerminal || !data.opencode.installed}
              className="px-2.5 py-1 bg-zinc-800/50 hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 border border-zinc-700/50 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5 disabled:opacity-30"
            >
              {isOpeningOpenCodeTerminal ? <Loader2 className="w-3 h-3 animate-spin" /> : <Terminal className="w-3 h-3" />}
              CLI
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
              onClick={() => {
                const model = selectedModels.antigravity;
                if (geminiProvider) {
                  handleToggleActiveDirect("gemini", model, "Google Antigravity");
                } else {
                  handleConnectTarget("antigravity", "gemini", model, "Google Antigravity");
                }
              }}
              className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer",
                isGeminiActive
                  ? "border-white bg-white"
                  : "border-zinc-600 hover:border-zinc-400"
              )}
            >
              {isGeminiActive && <Check className="w-3 h-3 text-zinc-900 stroke-[3]" />}
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-[var(--text-primary)]">Google Antigravity</span>
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  data.antigravity.detected ? "bg-zinc-200" : "bg-zinc-700"
                )} />
                <span className="text-[11px] text-[var(--text-muted)]">
                  {data.antigravity.detected ? "Ready" : "Not detected"}
                </span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Gemini • Desktop IDE</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="px-2.5 py-1 bg-zinc-800/60 text-zinc-400 border border-zinc-700/50 text-[11px] rounded-lg font-medium flex items-center gap-1.5">
              <Globe className="w-3 h-3" />
              Desktop App
            </div>
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
              onClick={() => {
                const model = selectedModels.nineRouter;
                if (nineRouterProvider) {
                  handleToggleActiveDirect("9router", model, "9Router");
                } else {
                  handleConnectTarget("9router", "9router", model, "9Router");
                }
              }}
              disabled={connectingTarget === "9router"}
              className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer",
                is9RouterActive
                  ? "border-white bg-white"
                  : "border-zinc-600 hover:border-zinc-400"
              )}
            >
              {is9RouterActive && <Check className="w-3 h-3 text-zinc-900 stroke-[3]" />}
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-[var(--text-primary)]">9Router</span>
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  data.nineRouter.running ? "bg-zinc-200" : data.nineRouter.installed ? "bg-zinc-400" : "bg-zinc-700"
                )} />
                <span className="text-[11px] text-[var(--text-muted)]">
                  {data.nineRouter.running ? "Running" : data.nineRouter.installed ? "Ready" : "Not installed"}
                </span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Local gateway • Terminal only</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleLaunch9Router}
              disabled={isStarting9Router || !data.nineRouter.installed}
              className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5 disabled:opacity-30"
            >
              {isStarting9Router ? <Loader2 className="w-3 h-3 animate-spin" /> : <Terminal className="w-3 h-3" />}
              Terminal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
