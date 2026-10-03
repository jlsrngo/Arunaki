import { useState, useEffect } from "react";
import {
  Terminal,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Zap,
  Wifi,
  Loader2,
  Info,
  X,
  Layers,
  Globe,
  Radio,
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
  running: boolean;
  url: string;
  models: string[];
}

interface LocalCliData {
  claude: ClaudeCliStatus;
  opencode?: OpenCodeStatus;
  antigravity?: AntigravityStatus;
  nineRouter: NineRouterStatus;
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

export function SettingsCliConnectionsTab({
  providers,
  onRefresh,
}: SettingsCliConnectionsTabProps) {
  // 1. All React Hooks strictly declared at the top level (React Rules of Hooks)
  const [data, setData] = useState<LocalCliData | null>(null);
  const [loading, setLoading] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [connectingTarget, setConnectingTarget] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Ping states per connection ID
  const [testingId, setTestingId] = useState<string | null>(null);
  const [pingResults, setPingResults] = useState<Record<string, PingResult>>({});
  const [expandedDetailsId, setExpandedDetailsId] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/status${directoryQuery()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setData(json.data);
        }
      }
    } catch {
      // Silently ignore connection errors during status probing
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

  const handleLaunchLogin = async () => {
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
          description: "Authorize in your browser, then click 'Scan All Agents' here.",
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

  const handleConnectTarget = async (
    target: "claude" | "9router" | "opencode" | "antigravity",
    activeId: string,
    defaultModel: string,
    friendlyName: string
  ) => {
    setConnectingTarget(target);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/connect${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });

      if (res.ok) {
        localStorage.setItem("arunaki_active_provider", activeId);
        localStorage.setItem("arunaki_active_model", defaultModel);
        await apiFetch(`${API_BASE}/providers/${activeId}/state${directoryQuery()}`, {
          method: "PUT",
          body: JSON.stringify({ active: true }),
        }).catch(() => {});

        toast.success(`${friendlyName} Connected & Active`, {
          description: `Ready to run document tasks using ${defaultModel}.`,
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

  const handleToggleActiveDirect = async (providerId: string, defaultModel: string, friendlyName: string) => {
    try {
      localStorage.setItem("arunaki_active_provider", providerId);
      localStorage.setItem("arunaki_active_model", defaultModel);
      await apiFetch(`${API_BASE}/providers/${providerId}/state${directoryQuery()}`, {
        method: "PUT",
        body: JSON.stringify({ active: true }),
      }).catch(() => {});
      toast.success(`${friendlyName} set as primary active`);
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
            Harness your flat subscription accounts (Claude Pro, Google Antigravity, OpenCode, 9Router) directly with zero per-token cost.
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
          Arunaki connects directly to your computer&apos;s CLI binaries and local proxies. No API credits or pay-as-you-go billing required when running via your personal desktop subscriptions.
        </div>
      </div>

      {/* Vertical List of Connections ("berbaris kebawah seperti provider style nya") */}
      <div className="space-y-3 w-full">
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
              {/* Primary Active Toggle Button (Monochrome) */}
              <button
                type="button"
                onClick={() => {
                  if (claudeProvider) {
                    handleToggleActiveDirect("claude-code", "claude-3-7-sonnet", "Claude Code CLI");
                  } else {
                    handleConnectTarget("claude", "claude-code", "claude-3-7-sonnet", "Claude Code CLI");
                  }
                }}
                disabled={!data?.claude.loggedIn || connectingTarget === "claude"}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border shrink-0 mt-0.5 shadow-xs disabled:opacity-30",
                  isClaudeActive
                    ? "bg-[var(--text-primary)] text-[var(--bg-app)] border-[var(--text-primary)]"
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
                  {data?.claude.version && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-color)] text-[var(--text-muted)]">
                      v{data.claude.version.split(" ")[0]}
                    </span>
                  )}

                  {/* Status Indicator */}
                  {data?.claude.installed ? (
                    data.claude.loggedIn ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        Claude Pro Ready
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        <AlertCircle className="w-2.5 h-2.5" />
                        Login Required
                      </span>
                    )
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-white/5 text-[var(--text-muted)] border border-white/10">
                      Not Detected
                    </span>
                  )}

                  {/* Test Ping Result Badge */}
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

                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <p className="text-[11px] text-[var(--text-muted)] font-mono truncate max-w-[280px]">
                    http://127.0.0.1:{data?.bridgePort || 20188}/v1
                  </p>
                  <span className="text-[10px] text-[var(--text-primary)] font-mono px-2 py-0.5 bg-[var(--bg-app)] border border-[var(--border-color)] rounded-md">
                    Model: claude-3-7-sonnet, claude-3-5-sonnet
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    Flat $20/mo Claude Pro • Zero per-token bills
                  </span>
                </div>
              </div>
            </div>

            {/* Right Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() =>
                  handleTestPing(
                    "claude",
                    `http://127.0.0.1:${data?.bridgePort || 20188}/v1`,
                    "claude-pro-subscription",
                    "claude-3-7-sonnet"
                  )
                }
                disabled={testingId === "claude" || !data?.claude.installed}
                className="px-3 py-1.5 bg-[var(--bg-hover)] hover:opacity-80 text-[var(--text-primary)] border border-[var(--border-strong)] text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5 font-medium shadow-xs disabled:opacity-40"
              >
                {testingId === "claude" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-primary)]" />
                ) : (
                  <Wifi className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                )}
                <span>{testingId === "claude" ? "Testing..." : "Test Ping"}</span>
              </button>

              {data?.claude.loggedIn ? (
                <button
                  type="button"
                  onClick={() => {
                    if (claudeProvider) {
                      handleToggleActiveDirect("claude-code", "claude-3-7-sonnet", "Claude Code CLI");
                    } else {
                      handleConnectTarget("claude", "claude-code", "claude-3-7-sonnet", "Claude Code CLI");
                    }
                  }}
                  disabled={connectingTarget === "claude"}
                  className="px-3 py-1.5 bg-[var(--text-primary)] text-[var(--bg-app)] hover:opacity-90 text-xs rounded-xl transition-all cursor-pointer font-semibold flex items-center gap-1.5 shadow-xs"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{isClaudeActive ? "Active" : "Activate"}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleLaunchLogin}
                  disabled={isLoggingIn}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs rounded-xl transition-all cursor-pointer font-semibold flex items-center gap-1.5 shadow-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{isLoggingIn ? "Launching..." : "Login CLI"}</span>
                </button>
              )}
            </div>
          </div>

          {/* If not installed, show helper */}
          {!data?.claude.installed && (
            <div className="pt-2 border-t border-[var(--border-color)]/60 flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>Install official Claude Code binary via terminal:</span>
              <div className="flex items-center gap-1.5 font-mono px-2 py-1 bg-[var(--bg-app)] border border-[var(--border-color)] rounded-lg text-[11px] text-[var(--text-secondary)]">
                <span>npm i -g @anthropic-ai/claude-code</span>
                <button
                  type="button"
                  onClick={() => handleCopy("npm i -g @anthropic-ai/claude-code")}
                  className="hover:text-[var(--text-primary)] cursor-pointer"
                >
                  {copiedCmd === "npm i -g @anthropic-ai/claude-code" ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>
          )}

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
                <span>Latency: <strong className="text-[var(--text-primary)]">{pingResults["claude"].timeMs}ms</strong></span>
                <span>Status: <strong className="text-[var(--text-primary)]">HTTP {pingResults["claude"].status}</strong></span>
                <span>Bridge: <strong className="text-[var(--text-primary)]">127.0.0.1:{data?.bridgePort || 20188}</strong></span>
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
                  if (opencodeProvider) {
                    handleToggleActiveDirect("opencode", "claude-3-5-sonnet", "OpenCode CLI Agent");
                  } else {
                    handleConnectTarget("opencode", "opencode", "claude-3-5-sonnet", "OpenCode CLI Agent");
                  }
                }}
                disabled={!data?.opencode?.installed || connectingTarget === "opencode"}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border shrink-0 mt-0.5 shadow-xs disabled:opacity-30",
                  isOpenCodeActive
                    ? "bg-[var(--text-primary)] text-[var(--bg-app)] border-[var(--text-primary)]"
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
                  {data?.opencode?.version && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-color)] text-[var(--text-muted)]">
                      v{data.opencode.version}
                    </span>
                  )}

                  {data?.opencode?.installed ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      Installed (v{data.opencode.version})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-white/5 text-[var(--text-muted)] border border-white/10">
                      Not Detected
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

                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <p className="text-[11px] text-[var(--text-muted)] font-mono truncate max-w-[280px]">
                    http://localhost:20128/v1
                  </p>
                  <span className="text-[10px] text-[var(--text-primary)] font-mono px-2 py-0.5 bg-[var(--bg-app)] border border-[var(--border-color)] rounded-md">
                    Model: claude-3-5-sonnet, deepseek-r1
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    Autonomous terminal-based coding agent CLI with multi-provider routing
                  </span>
                </div>
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
                    "claude-3-5-sonnet"
                  )
                }
                disabled={testingId === "opencode" || !data?.opencode?.installed}
                className="px-3 py-1.5 bg-[var(--bg-hover)] hover:opacity-80 text-[var(--text-primary)] border border-[var(--border-strong)] text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5 font-medium shadow-xs disabled:opacity-40"
              >
                {testingId === "opencode" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-primary)]" />
                ) : (
                  <Wifi className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                )}
                <span>{testingId === "opencode" ? "Testing..." : "Test Ping"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (opencodeProvider) {
                    handleToggleActiveDirect("opencode", "claude-3-5-sonnet", "OpenCode CLI Agent");
                  } else {
                    handleConnectTarget("opencode", "opencode", "claude-3-5-sonnet", "OpenCode CLI Agent");
                  }
                }}
                disabled={!data?.opencode?.installed || connectingTarget === "opencode"}
                className="px-3 py-1.5 bg-[var(--text-primary)] text-[var(--bg-app)] hover:opacity-90 text-xs rounded-xl transition-all cursor-pointer font-semibold flex items-center gap-1.5 shadow-xs disabled:opacity-40"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{isOpenCodeActive ? "Active" : "Connect"}</span>
              </button>
            </div>
          </div>

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
                <span>Latency: <strong className="text-[var(--text-primary)]">{pingResults["opencode"].timeMs}ms</strong></span>
                <span>Status: <strong className="text-[var(--text-primary)]">HTTP {pingResults["opencode"].status}</strong></span>
              </div>
            </div>
          )}
        </div>

        {/* ================================================================= */}
        {/* 3. Google Antigravity (Gemini Ecosystem) */}
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
                  if (geminiProvider) {
                    handleToggleActiveDirect("gemini", "gemini-2.5-flash", "Google Antigravity");
                  } else {
                    handleConnectTarget("antigravity", "gemini", "gemini-2.5-flash", "Google Antigravity");
                  }
                }}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border shrink-0 mt-0.5 shadow-xs",
                  isGeminiActive
                    ? "bg-[var(--text-primary)] text-[var(--bg-app)] border-[var(--text-primary)]"
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

                  {data?.antigravity?.detected ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      Antigravity IDE Environment Detected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-white/5 text-[var(--text-muted)] border border-white/10">
                      Standard Shell
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

                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <p className="text-[11px] text-[var(--text-muted)] font-mono truncate max-w-[280px]">
                    https://generativelanguage.googleapis.com/v1beta
                  </p>
                  <span className="text-[10px] text-[var(--text-primary)] font-mono px-2 py-0.5 bg-[var(--bg-app)] border border-[var(--border-color)] rounded-md">
                    Model: gemini-2.5-flash, gemini-2.5-pro
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    1M+ Token Context Window • Deep reasoning and multimodal analysis
                  </span>
                </div>
              </div>
            </div>

            {/* Right Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const key = geminiProvider?.apiKey || "temp-probe";
                  handleTestPing(
                    "antigravity",
                    "https://generativelanguage.googleapis.com/v1beta",
                    key,
                    "gemini-2.5-flash"
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
                  if (geminiProvider) {
                    handleToggleActiveDirect("gemini", "gemini-2.5-flash", "Google Antigravity");
                  } else {
                    handleConnectTarget("antigravity", "gemini", "gemini-2.5-flash", "Google Antigravity");
                  }
                }}
                className="px-3 py-1.5 bg-[var(--text-primary)] text-[var(--bg-app)] hover:opacity-90 text-xs rounded-xl transition-all cursor-pointer font-semibold flex items-center gap-1.5 shadow-xs"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>{isGeminiActive ? "Active" : "Activate"}</span>
              </button>
            </div>
          </div>

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
                <span>Latency: <strong className="text-[var(--text-primary)]">{pingResults["antigravity"].timeMs}ms</strong></span>
                <span>Status: <strong className="text-[var(--text-primary)]">HTTP {pingResults["antigravity"].status}</strong></span>
              </div>
            </div>
          )}
        </div>

        {/* ================================================================= */}
        {/* 4. 9Router Local Gateway */}
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
                  if (nineRouterProvider) {
                    handleToggleActiveDirect("9router", "claude-3-5-sonnet", "9Router Gateway");
                  } else {
                    handleConnectTarget("9router", "9router", "claude-3-5-sonnet", "9Router Gateway");
                  }
                }}
                disabled={!data?.nineRouter.running || connectingTarget === "9router"}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border shrink-0 mt-0.5 shadow-xs disabled:opacity-30",
                  is9RouterActive
                    ? "bg-[var(--text-primary)] text-[var(--bg-app)] border-[var(--text-primary)]"
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

                  {data?.nineRouter.running ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      Port 20128 Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-white/5 text-[var(--text-muted)] border border-white/10">
                      Inactive
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

                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <p className="text-[11px] text-[var(--text-muted)] font-mono truncate max-w-[280px]">
                    http://localhost:20128/v1
                  </p>
                  <span className="text-[10px] text-[var(--text-primary)] font-mono px-2 py-0.5 bg-[var(--bg-app)] border border-[var(--border-color)] rounded-md">
                    Model: 50+ Models Supported
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    Local proxy with prompt compression, token optimizer, and auto-fallback
                  </span>
                </div>
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
                    "claude-3-5-sonnet"
                  )
                }
                disabled={testingId === "9router" || !data?.nineRouter.running}
                className="px-3 py-1.5 bg-[var(--bg-hover)] hover:opacity-80 text-[var(--text-primary)] border border-[var(--border-strong)] text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5 font-medium shadow-xs disabled:opacity-40"
              >
                {testingId === "9router" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-primary)]" />
                ) : (
                  <Wifi className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                )}
                <span>{testingId === "9router" ? "Testing..." : "Test Ping"}</span>
              </button>

              {data?.nineRouter.running ? (
                <button
                  type="button"
                  onClick={() => {
                    if (nineRouterProvider) {
                      handleToggleActiveDirect("9router", "claude-3-5-sonnet", "9Router Gateway");
                    } else {
                      handleConnectTarget("9router", "9router", "claude-3-5-sonnet", "9Router Gateway");
                    }
                  }}
                  className="px-3 py-1.5 bg-[var(--text-primary)] text-[var(--bg-app)] hover:opacity-90 text-xs rounded-xl transition-all cursor-pointer font-semibold flex items-center gap-1.5 shadow-xs"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{is9RouterActive ? "Active" : "Activate"}</span>
                </button>
              ) : (
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[var(--bg-app)] border border-[var(--border-color)] text-[11px] font-mono text-[var(--text-secondary)]">
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
              )}
            </div>
          </div>

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
