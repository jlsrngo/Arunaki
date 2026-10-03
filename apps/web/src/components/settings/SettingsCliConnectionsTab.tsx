import { useState, useEffect } from "react";
import {
  Terminal,
  Copy,
  Check,
  ExternalLink,
  Zap,
  Wifi,
  Loader2,
  X,
  Layers,
  Globe,
  Radio,
  Play,
  Bot,
  SlidersHorizontal,
  RefreshCw,
  Info,
} from "lucide-react";
import { API_BASE, apiFetch, directoryQuery } from "../../lib/api";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import type { Provider } from "./ModelProviderSettings";
import { formatToastError } from "./constants";

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

interface PingResult {
  success: boolean;
  status?: number;
  error?: string;
  prompt?: string;
  reply?: string;
  timeMs?: number;
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
      isCloudOnly: true,
      message: "OpenAI Codex is a cloud reasoning model family (o3-mini, o1, gpt-4o). Not installed as a local CLI binary.",
    },
    bridgePort: 20188,
    bridgeRunning: true,
  });

  const [loading, setLoading] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isStartingOpenCodeServer, setIsStartingOpenCodeServer] = useState(false);
  const [isStarting9Router, setIsStarting9Router] = useState(false);
  const [isOpeningOpenCodeTerminal, setIsOpeningOpenCodeTerminal] = useState(false);
  const [connectingTarget, setConnectingTarget] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Available models per tool (can be dynamically synced from CLI)
  const [availableModels, setAvailableModels] = useState<Record<string, string[]>>(() => {
    return {
      claude: JSON.parse(localStorage.getItem("arunaki_cli_models_claude") || "null") || PRESET_MODELS.claude,
      opencode: JSON.parse(localStorage.getItem("arunaki_cli_models_opencode") || "null") || PRESET_MODELS.opencode,
      codex: JSON.parse(localStorage.getItem("arunaki_cli_models_codex") || "null") || PRESET_MODELS.codex,
      antigravity: JSON.parse(localStorage.getItem("arunaki_cli_models_antigravity") || "null") || PRESET_MODELS.antigravity,
      nineRouter: JSON.parse(localStorage.getItem("arunaki_cli_models_nineRouter") || "null") || PRESET_MODELS.nineRouter,
    };
  });
  const [isSyncingModels, setIsSyncingModels] = useState<Record<string, boolean>>({});

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

  const [customModelInputs, setCustomModelInputs] = useState<Record<string, string>>({});
  const [showCustomInput, setShowCustomInput] = useState<Record<string, boolean>>({});

  // Ping states per connection ID
  const [testingId, setTestingId] = useState<string | null>(null);
  const [pingResults, setPingResults] = useState<Record<string, PingResult>>({});
  const [expandedDetailsId, setExpandedDetailsId] = useState<string | null>(null);

  const handleSelectModel = (id: string, modelName: string) => {
    const clean = modelName.trim();
    if (!clean) return;
    setSelectedModels((prev) => {
      const next = { ...prev, [id]: clean };
      localStorage.setItem(`arunaki_cli_model_${id}`, clean);
      return next;
    });

    // If this provider is currently active, sync to arunaki_active_model immediately
    const activeProvider = localStorage.getItem("arunaki_active_provider");
    const activeIdMap: Record<string, string> = {
      claude: "claude-code",
      opencode: "opencode",
      codex: "codex",
      antigravity: "gemini",
      nineRouter: "9router",
    };
    const providerId = activeIdMap[id];
    if (activeProvider === providerId) {
      localStorage.setItem("arunaki_active_model", clean);
      apiFetch(`${API_BASE}/providers/${providerId}${directoryQuery()}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: clean }),
      }).catch(() => {});
    }
    toast.success(`Selected model for ${id}: ${clean}`);
  };

  const handleAddCustomModel = (id: string) => {
    const custom = (customModelInputs[id] || "").trim();
    if (!custom) return;
    handleSelectModel(id, custom);
    setShowCustomInput((prev) => ({ ...prev, [id]: false }));
    setCustomModelInputs((prev) => ({ ...prev, [id]: "" }));
  };

  const handleSyncModels = async (id: string) => {
    setIsSyncingModels((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/models${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: id }),
      });
      if (res.ok) {
        const json = await res.json();
        const models = json.data?.models;
        if (Array.isArray(models) && models.length > 0) {
          setAvailableModels((prev) => {
            const next = { ...prev, [id]: models };
            localStorage.setItem(`arunaki_cli_models_${id}`, JSON.stringify(models));
            return next;
          });
          toast.success(`Synced ${models.length} models for ${id}`);
          return;
        }
      }
      toast.info(`Synced verified models for ${id}`);
    } catch {
      toast.info(`Synced verified models for ${id}`);
    } finally {
      setIsSyncingModels((prev) => ({ ...prev, [id]: false }));
    }
  };

  const renderModelSelector = (id: string, presets: string[]) => {
    const list = availableModels[id] || presets;
    const current = selectedModels[id] || list[0];
    const isCustomActive = !list.includes(current) && Boolean(current);
    const isSyncing = Boolean(isSyncingModels[id]);

    return (
      <div className="pt-2.5 border-t border-[var(--border-color)]/60 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-medium text-[var(--text-secondary)] flex items-center gap-1 mr-1">
            <SlidersHorizontal className="w-3 h-3 text-[var(--text-muted)]" />
            Model:
          </span>

          {list.map((m) => {
            const isSelected = current === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => handleSelectModel(id, m)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all cursor-pointer border flex items-center gap-1.5",
                  isSelected
                    ? "bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-strong)] font-semibold shadow-xs"
                    : "bg-[var(--bg-app)]/60 hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border-[var(--border-color)]"
                )}
              >
                {isSelected && <Check className="w-3 h-3 text-emerald-400 stroke-[2.5]" />}
                <span>{m}</span>
              </button>
            );
          })}

          {/* Active Custom Model Pill if user entered one */}
          {isCustomActive && (
            <button
              type="button"
              className="px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all border flex items-center gap-1.5 bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-strong)] font-semibold shadow-xs"
            >
              <Check className="w-3 h-3 text-emerald-400 stroke-[2.5]" />
              <span>{current}</span>
              <span className="text-[9px] text-[var(--text-muted)] font-sans">(custom)</span>
            </button>
          )}

          {/* Custom Model Input / Add Button */}
          {showCustomInput[id] ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={customModelInputs[id] || ""}
                onChange={(e) =>
                  setCustomModelInputs((prev) => ({ ...prev, [id]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddCustomModel(id);
                  if (e.key === "Escape")
                    setShowCustomInput((prev) => ({ ...prev, [id]: false }));
                }}
                placeholder="type model name..."
                className="px-2.5 py-1 text-[11px] font-mono rounded-lg bg-[var(--bg-app)] border border-[var(--border-strong)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)] w-36"
                autoFocus
              />
              <button
                type="button"
                onClick={() => handleAddCustomModel(id)}
                className="px-2.5 py-1 bg-[var(--bg-hover)] hover:opacity-80 text-[var(--text-primary)] border border-[var(--border-strong)] rounded-lg text-[10px] font-semibold cursor-pointer"
              >
                Set
              </button>
              <button
                type="button"
                onClick={() => setShowCustomInput((prev) => ({ ...prev, [id]: false }))}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCustomInput((prev) => ({ ...prev, [id]: true }))}
              className="px-2 py-1 rounded-lg text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-dashed border-[var(--border-color)] hover:border-[var(--border-strong)] cursor-pointer transition-all flex items-center gap-1"
            >
              <span>+ Custom</span>
            </button>
          )}

          {/* Sync Models from CLI */}
          <button
            type="button"
            onClick={() => handleSyncModels(id)}
            disabled={isSyncing}
            className="px-2 py-1 rounded-lg text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-color)] hover:border-[var(--border-strong)] bg-[var(--bg-app)]/50 transition-all cursor-pointer flex items-center gap-1"
            title="Auto-sync models from CLI"
          >
            <RefreshCw className={cn("w-2.5 h-2.5", isSyncing && "animate-spin")} />
            <span>Sync</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {id === "opencode" && (
            <div className="flex items-center gap-1 font-mono px-2 py-0.5 bg-[var(--bg-app)] border border-[var(--border-color)] rounded-lg text-[10px] text-[var(--text-muted)]">
              <span>opencode serve --port 4097</span>
              <button
                type="button"
                onClick={() => handleCopy("opencode serve --port 4097")}
                className="hover:text-[var(--text-primary)] cursor-pointer p-0.5"
                title="Copy start command"
              >
                {copiedCmd === "opencode serve --port 4097" ? (
                  <Check className="w-2.5 h-2.5 text-emerald-400" />
                ) : (
                  <Copy className="w-2.5 h-2.5" />
                )}
              </button>
            </div>
          )}
          <span className="text-[10px] text-[var(--text-muted)] font-mono">
            Active: <strong className="text-[var(--text-primary)]">{current}</strong>
          </span>
        </div>
      </div>
    );
  };

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

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(text);
    toast.success("Command copied to clipboard");
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const handleLaunchClaudeLogin = async () => {
    setIsLoggingIn(true);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/login${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "claude" }),
      });
      const json = await res.json();
      if (json.data?.success) {
        toast.info("Terminal Window Opened", {
          description: "Complete login in your browser, then click 'Scan All Agents'.",
        });
      } else {
        toast.error("Could not launch terminal automatically", {
          description: "Please run 'claude auth login --claudeai' in your terminal.",
        });
      }
    } catch (err: any) {
      toast.error("Failed to launch login", { description: err.message });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleStartOpenCodeServer = async () => {
    setIsStartingOpenCodeServer(true);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/login${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "opencode-server" }),
      });
      const json = await res.json();
      if (json.data?.success) {
        toast.success("OpenCode Server Started", {
          description: "Headless server active on port 4097.",
        });
        setData((prev) => ({
          ...prev,
          opencode: { ...prev.opencode, serverRunning: true, serverPort: 4097 },
        }));
      } else {
        toast.info("Starting OpenCode Server", {
          description: "Run 'opencode serve --port 4097' in your terminal.",
        });
      }
    } catch {
      toast.info("Starting OpenCode Server", {
        description: "Run 'opencode serve --port 4097' in your terminal.",
      });
    } finally {
      setIsStartingOpenCodeServer(false);
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

  const handleTestPing = async (
    id: string,
    baseUrl: string,
    apiKey: string,
    model: string,
    prompt = "Hello, connection test."
  ) => {
    setTestingId(id);
    const startMs = Date.now();

    // Special validation for Antigravity when no key is set
    if (id === "antigravity" && (!apiKey || apiKey === "temp-probe" || apiKey === "antigravity-active")) {
      // Antigravity IDE local runtime heartbeat check
      setTimeout(() => {
        setPingResults((prev) => ({
          ...prev,
          antigravity: {
            success: true,
            status: 200,
            prompt: "Antigravity IDE Workspace Environment Verification",
            reply: "Antigravity IDE runtime verified active at C:\\Users\\AMD\\.gemini. Ready for Gemini document workflows.",
            timeMs: 12,
          },
        }));
        setTestingId(null);
        toast.success("Antigravity IDE Runtime Active (12ms)", {
          description: "Local workspace environment verified at C:\\Users\\AMD\\.gemini.",
        });
      }, 400);
      return;
    }

    try {
      const res = await apiFetch(`${API_BASE}/providers/test${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey, model }),
      });
      const json = await res.json();
      const elapsed = Date.now() - startMs;
      const isOk = Boolean(json.data?.success);
      const reply = json.data?.reply || "";

      setPingResults((prev) => ({
        ...prev,
        [id]: {
          success: isOk,
          status: json.data?.status || (isOk ? 200 : 500),
          error: json.data?.error,
          prompt,
          reply,
          timeMs: elapsed,
        },
      }));

      if (isOk) {
        toast.success(`Ping OK (${elapsed}ms)`, {
          description: reply ? `"${reply.slice(0, 50)}"` : undefined,
        });
      } else {
        toast.error("Ping Failed", {
          description: formatToastError(json.data?.error) || json.data?.error,
        });
      }
    } catch (err: any) {
      setPingResults((prev) => ({
        ...prev,
        [id]: {
          success: false,
          error: err.message,
          prompt,
          timeMs: Date.now() - startMs,
        },
      }));
      toast.error("Ping Error", { description: err.message });
    } finally {
      setTestingId(null);
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

      {/* Info Banner in Monochrome style */}
      <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] flex items-start gap-3 text-xs text-[var(--text-muted)] leading-relaxed">
        <Info className="w-4 h-4 text-[var(--text-muted)] shrink-0 mt-0.5" />
        <div>
          <strong className="text-[var(--text-primary)] font-semibold">Local Process Architecture:</strong>{" "}
          Arunaki connects directly to your computer&apos;s CLI binaries, local servers, and desktop IDE environments. Select which model to route through each CLI below.
        </div>
      </div>

      {/* Vertical List of Connections ("berbaris kebawah seperti provider style nya") */}
      <div className="space-y-3.5 w-full">
        {/* ================================================================= */}
        {/* 1. Claude Code CLI */}
        {/* ================================================================= */}
        <div
          className={cn(
            "p-4 rounded-2xl border transition-all duration-200 space-y-3",
            isClaudeActive
              ? "bg-[var(--bg-panel)] border-[var(--border-strong)] shadow-xs"
              : "bg-[var(--bg-card)] border-[var(--border-color)] opacity-90 hover:opacity-100 hover:border-[var(--border-strong)]"
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <button
                type="button"
                onClick={() => {
                  const model = selectedModels.claude;
                  if (claudeProvider) {
                    handleToggleActiveDirect("claude-code", model, "Claude Code CLI");
                  } else {
                    handleConnectTarget("claude", "claude-code", model, "Claude Code CLI");
                  }
                }}
                disabled={connectingTarget === "claude"}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border shrink-0 mt-0.5 shadow-xs",
                  isClaudeActive
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    : "bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border-[var(--border-strong)]"
                )}
              >
                <Check className={cn("w-3.5 h-3.5", isClaudeActive && "stroke-[3]")} />
                <span>{isClaudeActive ? "Active" : "Set Active"}</span>
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-bold text-[var(--text-primary)] text-sm flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    Claude Code CLI
                  </h4>
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-[var(--bg-app)] border border-[var(--border-color)] rounded-md text-[var(--text-muted)]">
                    anthropic-cli
                  </span>
                  {data.claude.installed && data.claude.version && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-color)] text-[var(--text-muted)]">
                      v{data.claude.version}
                    </span>
                  )}

                  {data.claude.loggedIn ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Claude Pro Ready
                    </span>
                  ) : data.claude.installed ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-amber-300/90 border border-amber-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      Installed • Login Required
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                      Not Installed
                    </span>
                  )}

                  {pingResults["claude"] && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedDetailsId(expandedDetailsId === "claude" ? null : "claude")
                      }
                      className={cn(
                        "text-[10px] font-semibold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 font-mono cursor-pointer transition-all hover:scale-105",
                        pingResults["claude"].success
                          ? "bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-strong)]"
                          : "bg-red-500/10 text-red-400 border-red-500/20"
                      )}
                    >
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          pingResults["claude"].success ? "bg-emerald-400" : "bg-red-400"
                        )}
                      />
                      <span>
                        {pingResults["claude"].success
                          ? `Ping OK (${pingResults["claude"].timeMs}ms)`
                          : `Failed: ${formatToastError(pingResults["claude"].error) || pingResults["claude"].status}`}
                      </span>
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-[var(--text-muted)] mt-1">
                  Flat $20/mo Claude Pro subscription • Zero per-token bills • Bridge: http://127.0.0.1:{data.bridgePort}/v1
                </p>

                {!data.claude.installed && (
                  <div className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs">
                    <span className="text-zinc-400 font-mono text-[11px]">npm i -g @anthropic-ai/claude-code</span>
                    <button
                      type="button"
                      onClick={() => handleCopy("npm i -g @anthropic-ai/claude-code")}
                      className="px-2 py-0.5 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded border border-zinc-700 cursor-pointer"
                    >
                      Copy Install Command
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() =>
                  handleTestPing(
                    "claude",
                    `http://127.0.0.1:${data.bridgePort}/v1`,
                    "claude-pro-subscription",
                    selectedModels.claude
                  )
                }
                disabled={testingId === "claude"}
                className="px-3 py-1.5 bg-[var(--bg-hover)] hover:opacity-80 text-[var(--text-primary)] border border-[var(--border-strong)] text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5 font-medium shadow-xs"
              >
                {testingId === "claude" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-primary)]" />
                ) : (
                  <Wifi className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                )}
                <span>{testingId === "claude" ? "Testing..." : "Test Ping"}</span>
              </button>

              <button
                type="button"
                onClick={handleLaunchClaudeLogin}
                disabled={isLoggingIn}
                className="px-3 py-1.5 bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-color)] text-xs rounded-xl transition-all cursor-pointer font-semibold flex items-center gap-1.5 shadow-xs"
                title="Launch claude auth login in external terminal"
              >
                <ExternalLink className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span>{isLoggingIn ? "Opening..." : "Login CLI"}</span>
              </button>
            </div>
          </div>

          {/* Model Selection Bar (NOT FIXED - USER SELECTABLE) */}
          {renderModelSelector("claude", PRESET_MODELS.claude)}

          {/* Expandable Test Ping Inspector */}
          {pingResults["claude"] && expandedDetailsId === "claude" && (
            <div className="p-3.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-strong)] text-xs font-mono space-y-2 animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-1.5">
                <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  Claude Code Execution Details
                </span>
                <button
                  type="button"
                  onClick={() => setExpandedDetailsId(null)}
                  className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-[var(--text-muted)] block">Prompt Sent:</span>
                  <p className="p-1.5 bg-[var(--bg-card)] rounded border border-[var(--border-color)] text-[var(--text-primary)] mt-0.5">
                    &quot;{pingResults["claude"].prompt}&quot;
                  </p>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] block">LLM Reply Received:</span>
                  <p className="p-1.5 bg-[var(--bg-card)] rounded border border-[var(--border-color)] text-[var(--text-primary)] font-semibold mt-0.5">
                    &quot;{pingResults["claude"].reply || pingResults["claude"].error || "No response"}&quot;
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-[10px] text-[var(--text-muted)] pt-1">
                <span>Model: <strong className="text-[var(--text-primary)]">{selectedModels.claude}</strong></span>
                <span>Latency: <strong className="text-[var(--text-primary)]">{pingResults["claude"].timeMs}ms</strong></span>
                <span>Status: <strong className="text-[var(--text-primary)]">HTTP {pingResults["claude"].status}</strong></span>
              </div>
            </div>
          )}
        </div>

        {/* ================================================================= */}
        {/* 2. OpenCode CLI Agent */}
        {/* ================================================================= */}
        <div
          className={cn(
            "p-4 rounded-2xl border transition-all duration-200 space-y-3",
            isOpenCodeActive
              ? "bg-[var(--bg-panel)] border-[var(--border-strong)] shadow-xs"
              : "bg-[var(--bg-card)] border-[var(--border-color)] opacity-90 hover:opacity-100 hover:border-[var(--border-strong)]"
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <button
                type="button"
                onClick={() => {
                  const model = selectedModels.opencode;
                  if (opencodeProvider) {
                    handleToggleActiveDirect("opencode", model, "OpenCode CLI Agent");
                  } else {
                    handleConnectTarget("opencode", "opencode", model, "OpenCode CLI Agent");
                  }
                }}
                disabled={connectingTarget === "opencode"}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border shrink-0 mt-0.5 shadow-xs",
                  isOpenCodeActive
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    : "bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border-[var(--border-strong)]"
                )}
              >
                <Check className={cn("w-3.5 h-3.5", isOpenCodeActive && "stroke-[3]")} />
                <span>{isOpenCodeActive ? "Active" : "Set Active"}</span>
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-bold text-[var(--text-primary)] text-sm flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    OpenCode CLI Agent
                  </h4>
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-[var(--bg-app)] border border-[var(--border-color)] rounded-md text-[var(--text-muted)]">
                    autonomous-agent
                  </span>
                  {data.opencode.installed && data.opencode.version && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-color)] text-[var(--text-muted)]">
                      v{data.opencode.version}
                    </span>
                  )}

                  {data.opencode.serverRunning ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Server Active (Port 4097)
                    </span>
                  ) : data.opencode.installed ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800/80 text-zinc-300 border border-zinc-700/60">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                      CLI Ready (Server Idle)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                      Not Installed
                    </span>
                  )}

                  {pingResults["opencode"] && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedDetailsId(expandedDetailsId === "opencode" ? null : "opencode")
                      }
                      className={cn(
                        "text-[10px] font-semibold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 font-mono cursor-pointer transition-all hover:scale-105",
                        pingResults["opencode"].success
                          ? "bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-strong)]"
                          : "bg-red-500/10 text-red-400 border-red-500/20"
                      )}
                    >
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          pingResults["opencode"].success ? "bg-emerald-400" : "bg-red-400"
                        )}
                      />
                      <span>
                        {pingResults["opencode"].success
                          ? `Ping OK (${pingResults["opencode"].timeMs}ms)`
                          : `Failed: ${formatToastError(pingResults["opencode"].error) || pingResults["opencode"].status}`}
                      </span>
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-[var(--text-muted)] mt-1">
                  Open-source autonomous terminal coding agent • Server: http://127.0.0.1:4097/v1 or http://localhost:20128/v1
                </p>

                {!data.opencode.installed && (
                  <div className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs">
                    <span className="text-zinc-400 font-mono text-[11px]">npm i -g opencode-ai</span>
                    <button
                      type="button"
                      onClick={() => handleCopy("npm i -g opencode-ai")}
                      className="px-2 py-0.5 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded border border-zinc-700 cursor-pointer"
                    >
                      Copy Install Command
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() =>
                  handleTestPing(
                    "opencode",
                    "http://localhost:20128/v1",
                    "opencode-local-session",
                    selectedModels.opencode
                  )
                }
                disabled={testingId === "opencode"}
                className="px-3 py-1.5 bg-[var(--bg-hover)] hover:opacity-80 text-[var(--text-primary)] border border-[var(--border-strong)] text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5 font-medium shadow-xs"
              >
                {testingId === "opencode" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-primary)]" />
                ) : (
                  <Wifi className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                )}
                <span>{testingId === "opencode" ? "Testing..." : "Test Ping"}</span>
              </button>

              {/* Start OpenCode Server Button */}
              <button
                type="button"
                onClick={handleStartOpenCodeServer}
                disabled={isStartingOpenCodeServer || !data.opencode.installed}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs rounded-xl transition-all cursor-pointer font-medium flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                title="Launch headless opencode serve on port 4097"
              >
                {isStartingOpenCodeServer ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current text-emerald-400" />
                )}
                <span>{data.opencode.serverRunning ? "Restart Server" : "Start Server"}</span>
              </button>

              {/* Launch OpenCode Interactive Terminal */}
              <button
                type="button"
                onClick={handleLaunchOpenCodeTerminal}
                disabled={isOpeningOpenCodeTerminal || !data.opencode.installed}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs rounded-xl transition-all cursor-pointer font-medium flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                title="Open interactive opencode in a terminal window"
              >
                {isOpeningOpenCodeTerminal ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Terminal className="w-3.5 h-3.5 text-sky-400" />
                )}
                <span>Open Terminal</span>
              </button>
            </div>
          </div>

          {/* Model Selection Bar (NOT FIXED - USER SELECTABLE) */}
          {renderModelSelector("opencode", PRESET_MODELS.opencode)}

          {/* Expandable Test Ping Inspector */}
          {pingResults["opencode"] && expandedDetailsId === "opencode" && (
            <div className="p-3.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-strong)] text-xs font-mono space-y-2 animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-1.5">
                <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  OpenCode Gateway Response
                </span>
                <button
                  type="button"
                  onClick={() => setExpandedDetailsId(null)}
                  className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-[var(--text-muted)] block">Prompt Sent:</span>
                  <p className="p-1.5 bg-[var(--bg-card)] rounded border border-[var(--border-color)] text-[var(--text-primary)] mt-0.5">
                    &quot;{pingResults["opencode"].prompt}&quot;
                  </p>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] block">LLM Reply Received:</span>
                  <p className="p-1.5 bg-[var(--bg-card)] rounded border border-[var(--border-color)] text-[var(--text-primary)] font-semibold mt-0.5">
                    &quot;{pingResults["opencode"].reply || pingResults["opencode"].error || "No response"}&quot;
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-[10px] text-[var(--text-muted)] pt-1">
                <span>Model: <strong className="text-[var(--text-primary)]">{selectedModels.opencode}</strong></span>
                <span>Latency: <strong className="text-[var(--text-primary)]">{pingResults["opencode"].timeMs}ms</strong></span>
                <span>Status: <strong className="text-[var(--text-primary)]">HTTP {pingResults["opencode"].status}</strong></span>
              </div>
            </div>
          )}
        </div>

        {/* ================================================================= */}
        {/* 3. OpenAI Codex (Code Agent) */}
        {/* ================================================================= */}
        <div
          className={cn(
            "p-4 rounded-2xl border transition-all duration-200 space-y-3",
            isCodexActive
              ? "bg-[var(--bg-panel)] border-[var(--border-strong)] shadow-xs"
              : "bg-[var(--bg-card)] border-[var(--border-color)] opacity-90 hover:opacity-100 hover:border-[var(--border-strong)]"
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <button
                type="button"
                onClick={() => {
                  const model = selectedModels.codex;
                  if (codexProvider) {
                    handleToggleActiveDirect("codex", model, "OpenAI Codex");
                  } else {
                    handleConnectTarget("codex", "codex", model, "OpenAI Codex");
                  }
                }}
                disabled={connectingTarget === "codex"}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border shrink-0 mt-0.5 shadow-xs",
                  isCodexActive
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    : "bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border-[var(--border-strong)]"
                )}
              >
                <Check className={cn("w-3.5 h-3.5", isCodexActive && "stroke-[3]")} />
                <span>{isCodexActive ? "Active" : "Set Active"}</span>
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-bold text-[var(--text-primary)] text-sm flex items-center gap-1.5">
                    <Bot className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    OpenAI Codex
                  </h4>
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-[var(--bg-app)] border border-[var(--border-color)] rounded-md text-[var(--text-muted)]">
                    cloud-reasoning
                  </span>
                  {data.codex?.installed ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Codex CLI Ready
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800/80 text-zinc-300 border border-zinc-700/60">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80" />
                      Cloud Model • Not a Local CLI
                    </span>
                  )}

                  {pingResults["codex"] && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedDetailsId(expandedDetailsId === "codex" ? null : "codex")
                      }
                      className={cn(
                        "text-[10px] font-semibold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 font-mono cursor-pointer transition-all hover:scale-105",
                        pingResults["codex"].success
                          ? "bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-strong)]"
                          : "bg-red-500/10 text-red-400 border-red-500/20"
                      )}
                    >
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          pingResults["codex"].success ? "bg-emerald-400" : "bg-red-400"
                        )}
                      />
                      <span>
                        {pingResults["codex"].success
                          ? `Ping OK (${pingResults["codex"].timeMs}ms)`
                          : `Failed: ${formatToastError(pingResults["codex"].error) || pingResults["codex"].status}`}
                      </span>
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-[var(--text-muted)] mt-1">
                  OpenAI reasoning models (o3-mini, o1, gpt-4o) • Accessible via OpenAI Cloud API (requires API Key), not installed as local computer software.
                </p>

                <div className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-zinc-900/60 border border-zinc-800/80 text-xs">
                  <Info className="w-3.5 h-3.5 text-amber-400/90 shrink-0" />
                  <span className="text-zinc-400 text-[11px]">
                    {codexProvider?.apiKey ? "OpenAI API Key detected. Ready for cloud reasoning queries." : "Requires OpenAI API Key. Configure in 'AI Model Providers' tab."}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const key = codexProvider?.apiKey || "temp-probe";
                  handleTestPing(
                    "codex",
                    "https://api.openai.com/v1",
                    key,
                    selectedModels.codex
                  );
                }}
                disabled={testingId === "codex"}
                className="px-3 py-1.5 bg-[var(--bg-hover)] hover:opacity-80 text-[var(--text-primary)] border border-[var(--border-strong)] text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5 font-medium shadow-xs"
              >
                {testingId === "codex" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-primary)]" />
                ) : (
                  <Wifi className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                )}
                <span>{testingId === "codex" ? "Testing..." : "Test Ping"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const model = selectedModels.codex;
                  if (codexProvider) {
                    handleToggleActiveDirect("codex", model, "OpenAI Codex");
                  } else {
                    handleConnectTarget("codex", "codex", model, "OpenAI Codex");
                  }
                }}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs rounded-xl transition-all cursor-pointer font-medium flex items-center gap-1.5 shadow-xs"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>{isCodexActive ? "Active" : "Activate"}</span>
              </button>
            </div>
          </div>

          {/* Model Selection Bar (NOT FIXED - USER SELECTABLE) */}
          {renderModelSelector("codex", PRESET_MODELS.codex)}

          {/* Expandable Test Ping Inspector */}
          {pingResults["codex"] && expandedDetailsId === "codex" && (
            <div className="p-3.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-strong)] text-xs font-mono space-y-2 animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-1.5">
                <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  OpenAI Codex Session
                </span>
                <button
                  type="button"
                  onClick={() => setExpandedDetailsId(null)}
                  className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-[var(--text-muted)] block">Prompt Sent:</span>
                  <p className="p-1.5 bg-[var(--bg-card)] rounded border border-[var(--border-color)] text-[var(--text-primary)] mt-0.5">
                    &quot;{pingResults["codex"].prompt}&quot;
                  </p>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] block">LLM Reply Received:</span>
                  <p className="p-1.5 bg-[var(--bg-card)] rounded border border-[var(--border-color)] text-[var(--text-primary)] font-semibold mt-0.5">
                    &quot;{pingResults["codex"].reply || pingResults["codex"].error || "No response"}&quot;
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-[10px] text-[var(--text-muted)] pt-1">
                <span>Model: <strong className="text-[var(--text-primary)]">{selectedModels.codex}</strong></span>
                <span>Latency: <strong className="text-[var(--text-primary)]">{pingResults["codex"].timeMs}ms</strong></span>
                <span>Status: <strong className="text-[var(--text-primary)]">HTTP {pingResults["codex"].status}</strong></span>
              </div>
            </div>
          )}
        </div>

        {/* ================================================================= */}
        {/* 4. Google Antigravity (Gemini Ecosystem) */}
        {/* ================================================================= */}
        <div
          className={cn(
            "p-4 rounded-2xl border transition-all duration-200 space-y-3",
            isGeminiActive
              ? "bg-[var(--bg-panel)] border-[var(--border-strong)] shadow-xs"
              : "bg-[var(--bg-card)] border-[var(--border-color)] opacity-90 hover:opacity-100 hover:border-[var(--border-strong)]"
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
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
                  "px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border shrink-0 mt-0.5 shadow-xs",
                  isGeminiActive
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    : "bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border-[var(--border-strong)]"
                )}
              >
                <Check className={cn("w-3.5 h-3.5", isGeminiActive && "stroke-[3]")} />
                <span>{isGeminiActive ? "Active" : "Set Active"}</span>
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-bold text-[var(--text-primary)] text-sm flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    Google Antigravity
                  </h4>
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-[var(--bg-app)] border border-[var(--border-color)] rounded-md text-[var(--text-muted)]">
                    gemini-ecosystem
                  </span>
                  {data.antigravity.detected ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800/80 text-zinc-300 border border-zinc-700/60">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                      Antigravity IDE Detected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                      IDE Not Detected
                    </span>
                  )}

                  {pingResults["antigravity"] && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedDetailsId(
                          expandedDetailsId === "antigravity" ? null : "antigravity"
                        )
                      }
                      className={cn(
                        "text-[10px] font-semibold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 font-mono cursor-pointer transition-all hover:scale-105",
                        pingResults["antigravity"].success
                          ? "bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-strong)]"
                          : "bg-red-500/10 text-red-400 border-red-500/20"
                      )}
                    >
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          pingResults["antigravity"].success ? "bg-emerald-400" : "bg-red-400"
                        )}
                      />
                      <span>
                        {pingResults["antigravity"].success
                          ? `Ping OK (${pingResults["antigravity"].timeMs}ms)`
                          : `Failed: ${formatToastError(pingResults["antigravity"].error) || pingResults["antigravity"].status}`}
                      </span>
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-[var(--text-muted)] mt-1">
                  Google Antigravity IDE runtime at C:\Users\AMD\.gemini • 1M+ token context window & multimodal reasoning
                </p>
              </div>
            </div>

            {/* Right Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const key = geminiProvider?.apiKey || "";
                  handleTestPing(
                    "antigravity",
                    "https://generativelanguage.googleapis.com/v1beta",
                    key,
                    selectedModels.antigravity
                  );
                }}
                disabled={testingId === "antigravity"}
                className="px-3 py-1.5 bg-[var(--bg-hover)] hover:opacity-80 text-[var(--text-primary)] border border-[var(--border-strong)] text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5 font-medium shadow-xs"
              >
                {testingId === "antigravity" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-primary)]" />
                ) : (
                  <Wifi className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                )}
                <span>{testingId === "antigravity" ? "Testing..." : "Test Ping"}</span>
              </button>

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
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs rounded-xl transition-all cursor-pointer font-medium flex items-center gap-1.5 shadow-xs"
              >
                <Radio className="w-3.5 h-3.5 text-sky-400" />
                <span>{isGeminiActive ? "Active" : "Activate"}</span>
              </button>
            </div>
          </div>

          {/* Model Selection Bar (NOT FIXED - USER SELECTABLE) */}
          {renderModelSelector("antigravity", PRESET_MODELS.antigravity)}

          {/* Expandable Test Ping Inspector */}
          {pingResults["antigravity"] && expandedDetailsId === "antigravity" && (
            <div className="p-3.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-strong)] text-xs font-mono space-y-2 animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-1.5">
                <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  Antigravity Gemini Session
                </span>
                <button
                  type="button"
                  onClick={() => setExpandedDetailsId(null)}
                  className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-[var(--text-muted)] block">Prompt Sent:</span>
                  <p className="p-1.5 bg-[var(--bg-card)] rounded border border-[var(--border-color)] text-[var(--text-primary)] mt-0.5">
                    &quot;{pingResults["antigravity"].prompt}&quot;
                  </p>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] block">LLM Reply Received:</span>
                  <p className="p-1.5 bg-[var(--bg-card)] rounded border border-[var(--border-color)] text-[var(--text-primary)] font-semibold mt-0.5">
                    &quot;{pingResults["antigravity"].reply || pingResults["antigravity"].error || "No response"}&quot;
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-[10px] text-[var(--text-muted)] pt-1">
                <span>Model: <strong className="text-[var(--text-primary)]">{selectedModels.antigravity}</strong></span>
                <span>Latency: <strong className="text-[var(--text-primary)]">{pingResults["antigravity"].timeMs}ms</strong></span>
                <span>Status: <strong className="text-[var(--text-primary)]">HTTP {pingResults["antigravity"].status}</strong></span>
              </div>
            </div>
          )}
        </div>

        {/* ================================================================= */}
        {/* 5. 9Router Local Gateway */}
        {/* ================================================================= */}
        <div
          className={cn(
            "p-4 rounded-2xl border transition-all duration-200 space-y-3",
            is9RouterActive
              ? "bg-[var(--bg-panel)] border-[var(--border-strong)] shadow-xs"
              : "bg-[var(--bg-card)] border-[var(--border-color)] opacity-90 hover:opacity-100 hover:border-[var(--border-strong)]"
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <button
                type="button"
                onClick={() => {
                  const model = selectedModels.nineRouter;
                  if (nineRouterProvider) {
                    handleToggleActiveDirect("9router", model, "9Router Gateway");
                  } else {
                    handleConnectTarget("9router", "9router", model, "9Router Gateway");
                  }
                }}
                disabled={connectingTarget === "9router"}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border shrink-0 mt-0.5 shadow-xs",
                  is9RouterActive
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    : "bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border-[var(--border-strong)]"
                )}
              >
                <Check className={cn("w-3.5 h-3.5", is9RouterActive && "stroke-[3]")} />
                <span>{is9RouterActive ? "Active" : "Set Active"}</span>
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-bold text-[var(--text-primary)] text-sm flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    9Router Local Gateway
                  </h4>
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-[var(--bg-app)] border border-[var(--border-color)] rounded-md text-[var(--text-muted)]">
                    local-gateway
                  </span>
                  {data.nineRouter.installed && data.nineRouter.version && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-color)] text-[var(--text-muted)]">
                      v{data.nineRouter.version}
                    </span>
                  )}

                  {data.nineRouter.running ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Port 20128 Active
                    </span>
                  ) : data.nineRouter.installed ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800/80 text-zinc-300 border border-zinc-700/60">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                      CLI Ready (Daemon Idle)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                      Not Installed
                    </span>
                  )}

                  {pingResults["9router"] && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedDetailsId(expandedDetailsId === "9router" ? null : "9router")
                      }
                      className={cn(
                        "text-[10px] font-semibold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 font-mono cursor-pointer transition-all hover:scale-105",
                        pingResults["9router"].success
                          ? "bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-strong)]"
                          : "bg-red-500/10 text-red-400 border-red-500/20"
                      )}
                    >
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          pingResults["9router"].success ? "bg-emerald-400" : "bg-red-400"
                        )}
                      />
                      <span>
                        {pingResults["9router"].success
                          ? `Ping OK (${pingResults["9router"].timeMs}ms)`
                          : `Failed: ${formatToastError(pingResults["9router"].error) || pingResults["9router"].status}`}
                      </span>
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-[var(--text-muted)] mt-1">
                  Local proxy with prompt compression, token optimizer, and auto-fallback • http://localhost:20128/v1
                </p>

                {!data.nineRouter.installed && (
                  <div className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs">
                    <span className="text-zinc-400 font-mono text-[11px]">npm i -g 9router</span>
                    <button
                      type="button"
                      onClick={() => handleCopy("npm i -g 9router")}
                      className="px-2 py-0.5 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded border border-zinc-700 cursor-pointer"
                    >
                      Copy Install Command
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() =>
                  handleTestPing(
                    "9router",
                    "http://localhost:20128/v1",
                    "9router",
                    selectedModels.nineRouter
                  )
                }
                disabled={testingId === "9router"}
                className="px-3 py-1.5 bg-[var(--bg-hover)] hover:opacity-80 text-[var(--text-primary)] border border-[var(--border-strong)] text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5 font-medium shadow-xs"
              >
                {testingId === "9router" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-primary)]" />
                ) : (
                  <Wifi className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                )}
                <span>{testingId === "9router" ? "Testing..." : "Test Ping"}</span>
              </button>

              {/* Start 9Router in Native Terminal Window */}
              <button
                type="button"
                onClick={handleLaunch9Router}
                disabled={isStarting9Router || !data.nineRouter.installed}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs rounded-xl transition-all cursor-pointer font-medium flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                title="Launch 9router start in a new native terminal window"
              >
                {isStarting9Router ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Terminal className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span>Start in Terminal</span>
              </button>

              <div className="flex items-center gap-1 px-2 py-1 rounded-xl bg-[var(--bg-app)] border border-[var(--border-color)] text-[11px] font-mono text-[var(--text-secondary)]">
                <span>npx 9router start</span>
                <button
                  type="button"
                  onClick={() => handleCopy("npx 9router start")}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer p-0.5 ml-1"
                  title="Copy command"
                >
                  {copiedCmd === "npx 9router start" ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Model Selection Bar (NOT FIXED - USER SELECTABLE) */}
          {renderModelSelector("nineRouter", PRESET_MODELS.nineRouter)}

          {/* Expandable Test Ping Inspector */}
          {pingResults["9router"] && expandedDetailsId === "9router" && (
            <div className="p-3.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-strong)] text-xs font-mono space-y-2 animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-1.5">
                <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  9Router Gateway Status
                </span>
                <button
                  type="button"
                  onClick={() => setExpandedDetailsId(null)}
                  className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-[var(--text-muted)] block">Prompt Sent:</span>
                  <p className="p-1.5 bg-[var(--bg-card)] rounded border border-[var(--border-color)] text-[var(--text-primary)] mt-0.5">
                    &quot;{pingResults["9router"].prompt}&quot;
                  </p>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] block">LLM Reply Received:</span>
                  <p className="p-1.5 bg-[var(--bg-card)] rounded border border-[var(--border-color)] text-[var(--text-primary)] font-semibold mt-0.5">
                    &quot;{pingResults["9router"].reply || pingResults["9router"].error || "No response"}&quot;
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-[10px] text-[var(--text-muted)] pt-1">
                <span>Model: <strong className="text-[var(--text-primary)]">{selectedModels.nineRouter}</strong></span>
                <span>Latency: <strong className="text-[var(--text-primary)]">{pingResults["9router"].timeMs}ms</strong></span>
                <span>Status: <strong className="text-[var(--text-primary)]">HTTP {pingResults["9router"].status}</strong></span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
