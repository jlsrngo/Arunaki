import { useState, useEffect } from "react";
import {
  Terminal,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  Sparkles,
  ExternalLink,
  Zap,
  Wifi,
  Loader2,
  Info,
  X,
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

interface NineRouterStatus {
  running: boolean;
  url: string;
  models: string[];
}

interface LocalCliData {
  claude: ClaudeCliStatus;
  nineRouter: NineRouterStatus;
  bridgePort: number;
  bridgeRunning: boolean;
}

interface LocalCliSectionProps {
  providers: Provider[];
  onToggleActive: (p: Provider) => void;
  onRefresh: () => void;
}

export function LocalCliSection({ providers, onToggleActive, onRefresh }: LocalCliSectionProps) {
  // All Hooks declared at top level
  const [data, setData] = useState<LocalCliData | null>(null);
  const [loading, setLoading] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Claude ping states
  const [testingClaude, setTestingClaude] = useState(false);
  const [claudeTestResult, setClaudeTestResult] = useState<{
    success: boolean;
    status?: number;
    error?: string;
    reply?: string;
    timeMs?: number;
  } | null>(null);
  const [showClaudeDetails, setShowClaudeDetails] = useState(false);

  // 9Router ping states
  const [testing9Router, setTesting9Router] = useState(false);
  const [nineRouterTestResult, setNineRouterTestResult] = useState<{
    success: boolean;
    status?: number;
    error?: string;
    reply?: string;
    timeMs?: number;
  } | null>(null);
  const [show9RouterDetails, setShow9RouterDetails] = useState(false);

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
      // Silently ignore or set null on local test errors
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  // Provider configuration detection
  const claudeProvider = providers.find((p) => p.id === "claude-code" || p.type === "claude-code");
  const isClaudeActive =
    claudeProvider?.active || localStorage.getItem("arunaki_active_provider") === "claude-code";

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
        toast.info("Terminal Launched", {
          description: "Authorize in your browser, then click 'Scan Status' below.",
        });
      } else {
        toast.error("Could not launch terminal automatically", {
          description: "Please run 'claude auth login --claudeai' in your terminal.",
        });
      }
    } catch (err: any) {
      toast.error("Failed to launch login", {
        description: err.message,
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleConnect = async (target: "claude" | "9router") => {
    setIsConnecting(true);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/connect${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      if (res.ok) {
        toast.success(target === "claude" ? "Claude Code Agent Connected!" : "9Router Connected!", {
          description: "Configured as active local provider. Ready for zero-cost document runs.",
        });
        localStorage.setItem("arunaki_active_provider", target === "claude" ? "claude-code" : "9router");
        localStorage.setItem(
          "arunaki_active_model",
          target === "claude" ? "claude-3-7-sonnet" : "claude-3-5-sonnet"
        );
        onRefresh();
        fetchStatus();
      } else {
        const json = await res.json().catch(() => ({}));
        toast.error("Connection Failed", {
          description: json.message || "Failed to configure provider.",
        });
      }
    } catch (err: any) {
      toast.error("Connection Error", { description: err.message });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleToggleClaude = () => {
    if (claudeProvider) {
      onToggleActive(claudeProvider);
    } else {
      handleConnect("claude");
    }
  };

  const handleToggle9Router = () => {
    if (nineRouterProvider) {
      onToggleActive(nineRouterProvider);
    } else {
      handleConnect("9router");
    }
  };

  const handleTestClaudePing = async () => {
    setTestingClaude(true);
    const startMs = Date.now();
    try {
      // First ensure the bridge is started
      await apiFetch(`${API_BASE}/providers/local-cli/connect${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "claude" }),
      }).catch(() => {});

      const res = await apiFetch(`${API_BASE}/providers/test${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: `http://127.0.0.1:${data?.bridgePort || 20188}/v1`,
          apiKey: "claude-pro-subscription",
          model: "claude-3-7-sonnet",
        }),
      });
      const json = await res.json();
      const elapsed = Date.now() - startMs;
      const isOk = json.data?.success;

      setClaudeTestResult({
        success: !!isOk,
        status: json.data?.status || (isOk ? 200 : 500),
        error: json.data?.error,
        reply: json.data?.reply,
        timeMs: elapsed,
      });

      if (isOk) {
        toast.success(`Claude CLI Connected! (${elapsed}ms)`, {
          description: json.data?.reply ? `"${json.data.reply.slice(0, 50)}"` : undefined,
        });
      } else {
        toast.error("Claude CLI Ping Failed", {
          description: formatToastError(json.data?.error) || json.data?.error,
        });
      }
    } catch (err: any) {
      setClaudeTestResult({
        success: false,
        error: err.message,
      });
      toast.error("Claude CLI Ping Error", { description: err.message });
    } finally {
      setTestingClaude(false);
    }
  };

  const handleTest9RouterPing = async () => {
    setTesting9Router(true);
    const startMs = Date.now();
    try {
      const res = await apiFetch(`${API_BASE}/providers/test${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: "http://localhost:20128/v1",
          apiKey: "9router",
          model: "claude-3-5-sonnet",
        }),
      });
      const json = await res.json();
      const elapsed = Date.now() - startMs;
      const isOk = json.data?.success;

      setNineRouterTestResult({
        success: !!isOk,
        status: json.data?.status || (isOk ? 200 : 500),
        error: json.data?.error,
        reply: json.data?.reply,
        timeMs: elapsed,
      });

      if (isOk) {
        toast.success(`9Router Connected! (${elapsed}ms)`);
      } else {
        toast.error("9Router Ping Failed", {
          description: formatToastError(json.data?.error) || "Is 9Router running on port 20128?",
        });
      }
    } catch (err: any) {
      setNineRouterTestResult({
        success: false,
        error: err.message,
      });
      toast.error("9Router Ping Error", { description: err.message });
    } finally {
      setTesting9Router(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              Local Code Agent & CLI Subscriptions
              <span className="text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                No API Key Required
              </span>
            </h4>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Harness your existing Claude Pro, Google AI, or 9Router flat subscriptions locally.
            </p>
          </div>
        </div>

        <button
          onClick={fetchStatus}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-color)] bg-[var(--bg-app)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          <span>Scan Status</span>
        </button>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
        {/* ============================================================== */}
        {/* Claude Code CLI Card */}
        {/* ============================================================== */}
        <div
          className={cn(
            "p-4 rounded-xl border transition-all space-y-3 flex flex-col justify-between",
            isClaudeActive
              ? "bg-[var(--bg-panel)] border-[var(--border-strong)] shadow-xs"
              : "bg-[var(--bg-app)] border-[var(--border-color)]"
          )}
        >
          <div className="space-y-2.5">
            {/* Top Row: Name, Version, Badges & Toggle */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-xs text-[var(--text-primary)]">Claude Code CLI</span>
                {data?.claude.version && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)]">
                    v{data.claude.version}
                  </span>
                )}

                {/* Status Pill */}
                {data?.claude.installed ? (
                  data.claude.loggedIn ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      Claude Pro Ready
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <AlertCircle className="w-2.5 h-2.5" />
                      Login Required
                    </span>
                  )
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/5 text-[var(--text-muted)] border border-white/10">
                    Not Detected
                  </span>
                )}
              </div>

              {/* Primary Active Toggle Button */}
              {data?.claude.installed && (
                <button
                  type="button"
                  onClick={handleToggleClaude}
                  disabled={!data.claude.loggedIn || isConnecting}
                  title={isClaudeActive ? "Currently active primary provider" : "Click to set as primary active provider"}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer border shrink-0 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed",
                    isClaudeActive
                      ? "bg-[var(--text-primary)] text-[var(--bg-app)] border-[var(--text-primary)]"
                      : "bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border-[var(--border-strong)]"
                  )}
                >
                  <Check className={cn("w-3 h-3", isClaudeActive && "stroke-[3]")} />
                  <span>{isClaudeActive ? "Active" : "Set Active"}</span>
                </button>
              )}
            </div>

            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Anthropic official CLI. Supports Claude 3.7 Sonnet & 3.5 Sonnet using your flat Claude Pro ($20/mo) subscription.
            </p>

            {/* Test Connection Result Badge */}
            {claudeTestResult && (
              <div className="pt-0.5">
                <button
                  type="button"
                  onClick={() => setShowClaudeDetails(!showClaudeDetails)}
                  className={cn(
                    "text-[10px] font-semibold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 font-mono cursor-pointer transition-all hover:scale-105",
                    claudeTestResult.success
                      ? "bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-strong)]"
                      : "bg-red-500/10 text-red-400 border-red-500/20"
                  )}
                >
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      claudeTestResult.success ? "bg-emerald-400" : "bg-red-400"
                    )}
                  />
                  <span>
                    {claudeTestResult.success
                      ? `Ping OK (${claudeTestResult.timeMs}ms)`
                      : `Failed: ${formatToastError(claudeTestResult.error) || claudeTestResult.status}`}
                  </span>
                  <Info className="w-2.5 h-2.5 text-[var(--text-muted)]" />
                </button>
              </div>
            )}

            {/* Expandable Test Inspection Details */}
            {claudeTestResult && showClaudeDetails && (
              <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] text-[11px] font-mono space-y-1.5">
                <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-1">
                  <span className="font-semibold text-[var(--text-primary)]">Ping Inspection</span>
                  <button
                    onClick={() => setShowClaudeDetails(false)}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-[var(--text-muted)] flex justify-between">
                  <span>Latency:</span>
                  <span className="text-[var(--text-primary)]">{claudeTestResult.timeMs}ms</span>
                </div>
                {claudeTestResult.reply && (
                  <div className="text-[var(--text-muted)]">
                    <span>Reply: </span>
                    <span className="text-emerald-400 font-sans">"{claudeTestResult.reply.slice(0, 100)}"</span>
                  </div>
                )}
                {claudeTestResult.error && (
                  <div className="text-red-400">
                    <span>Error: {claudeTestResult.error}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Row & Buttons */}
          <div className="pt-2 border-t border-[var(--border-color)]/60 space-y-2">
            {data?.claude.installed ? (
              <div className="flex items-center gap-2">
                {/* Test Connection Button */}
                <button
                  type="button"
                  onClick={handleTestClaudePing}
                  disabled={testingClaude}
                  className="flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border border-[var(--border-strong)] bg-[var(--bg-hover)] text-[var(--text-primary)] hover:opacity-90 flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  title="Test connection to Claude CLI"
                >
                  {testingClaude ? (
                    <Loader2 className="w-3 h-3 animate-spin text-[var(--text-primary)]" />
                  ) : (
                    <Wifi className="w-3 h-3 text-[var(--text-muted)]" />
                  )}
                  <span>{testingClaude ? "Testing..." : "Test Ping"}</span>
                </button>

                {/* Primary Action Button */}
                {data.claude.loggedIn ? (
                  <button
                    type="button"
                    onClick={handleToggleClaude}
                    disabled={isConnecting}
                    className={cn(
                      "flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer",
                      isClaudeActive
                        ? "bg-emerald-600/90 text-white"
                        : "bg-emerald-600 hover:bg-emerald-500 text-white"
                    )}
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>{isClaudeActive ? "Active" : "Activate Pro"}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleLaunchLogin}
                    disabled={isLoggingIn}
                    className="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Login Terminal</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <span className="text-[11px] text-[var(--text-muted)]">Install via terminal:</span>
                <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] text-[11px] font-mono text-[var(--text-secondary)]">
                  <span className="truncate">npm i -g @anthropic-ai/claude-code</span>
                  <button
                    onClick={() => handleCopy("npm install -g @anthropic-ai/claude-code")}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1"
                    title="Copy install command"
                  >
                    {copiedCmd === "npm install -g @anthropic-ai/claude-code" ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Quick terminal login command snippet */}
            {data?.claude.installed && !data.claude.loggedIn && (
              <div className="flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] text-[11px] font-mono text-[var(--text-secondary)]">
                <span className="truncate">claude auth login --claudeai</span>
                <button
                  onClick={() => handleCopy("claude auth login --claudeai")}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-0.5"
                  title="Copy command"
                >
                  {copiedCmd === "claude auth login --claudeai" ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ============================================================== */}
        {/* 9Router Local Gateway Card */}
        {/* ============================================================== */}
        <div
          className={cn(
            "p-4 rounded-xl border transition-all space-y-3 flex flex-col justify-between",
            is9RouterActive
              ? "bg-[var(--bg-panel)] border-[var(--border-strong)] shadow-xs"
              : "bg-[var(--bg-app)] border-[var(--border-color)]"
          )}
        >
          <div className="space-y-2.5">
            {/* Top Row */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-xs text-[var(--text-primary)]">9Router Gateway</span>

                {data?.nineRouter.running ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    Port 20128 Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/5 text-[var(--text-muted)] border border-white/10">
                    Inactive
                  </span>
                )}
              </div>

              {/* Primary Active Toggle */}
              {data?.nineRouter.running && (
                <button
                  type="button"
                  onClick={handleToggle9Router}
                  title={is9RouterActive ? "Currently active primary provider" : "Click to set as primary active provider"}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer border shrink-0 shadow-xs",
                    is9RouterActive
                      ? "bg-[var(--text-primary)] text-[var(--bg-app)] border-[var(--text-primary)]"
                      : "bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border-[var(--border-strong)]"
                  )}
                >
                  <Check className={cn("w-3 h-3", is9RouterActive && "stroke-[3]")} />
                  <span>{is9RouterActive ? "Active" : "Set Active"}</span>
                </button>
              )}
            </div>

            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Open-source multi-provider local router with token optimizer and auto-fallback across 50+ models.
            </p>

            {/* Test Connection Result Badge */}
            {nineRouterTestResult && (
              <div className="pt-0.5">
                <button
                  type="button"
                  onClick={() => setShow9RouterDetails(!show9RouterDetails)}
                  className={cn(
                    "text-[10px] font-semibold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 font-mono cursor-pointer transition-all hover:scale-105",
                    nineRouterTestResult.success
                      ? "bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-strong)]"
                      : "bg-red-500/10 text-red-400 border-red-500/20"
                  )}
                >
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      nineRouterTestResult.success ? "bg-emerald-400" : "bg-red-400"
                    )}
                  />
                  <span>
                    {nineRouterTestResult.success
                      ? `Ping OK (${nineRouterTestResult.timeMs}ms)`
                      : `Failed: ${formatToastError(nineRouterTestResult.error) || nineRouterTestResult.status}`}
                  </span>
                  <Info className="w-2.5 h-2.5 text-[var(--text-muted)]" />
                </button>
              </div>
            )}

            {/* Expandable Test Inspection Details */}
            {nineRouterTestResult && show9RouterDetails && (
              <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] text-[11px] font-mono space-y-1.5">
                <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-1">
                  <span className="font-semibold text-[var(--text-primary)]">Ping Inspection</span>
                  <button
                    onClick={() => setShow9RouterDetails(false)}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-[var(--text-muted)] flex justify-between">
                  <span>Latency:</span>
                  <span className="text-[var(--text-primary)]">{nineRouterTestResult.timeMs}ms</span>
                </div>
                {nineRouterTestResult.error && (
                  <div className="text-red-400">
                    <span>Error: {nineRouterTestResult.error}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Row & Buttons */}
          <div className="pt-2 border-t border-[var(--border-color)]/60 space-y-2">
            {data?.nineRouter.running ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTest9RouterPing}
                  disabled={testing9Router}
                  className="flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border border-[var(--border-strong)] bg-[var(--bg-hover)] text-[var(--text-primary)] hover:opacity-90 flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  title="Test ping to 9Router"
                >
                  {testing9Router ? (
                    <Loader2 className="w-3 h-3 animate-spin text-[var(--text-primary)]" />
                  ) : (
                    <Wifi className="w-3 h-3 text-[var(--text-muted)]" />
                  )}
                  <span>{testing9Router ? "Testing..." : "Test Ping"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggle9Router}
                  disabled={isConnecting}
                  className={cn(
                    "flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer",
                    is9RouterActive
                      ? "bg-[var(--text-primary)] text-[var(--bg-app)]"
                      : "bg-[var(--text-primary)] hover:opacity-90 text-[var(--bg-app)]"
                  )}
                >
                  <Zap className="w-3 h-3" />
                  <span>{is9RouterActive ? "Active" : "Activate Hub"}</span>
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <span className="text-[11px] text-[var(--text-muted)]">Run local daemon:</span>
                <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] text-[11px] font-mono text-[var(--text-secondary)]">
                  <span className="truncate">npx 9router start</span>
                  <button
                    onClick={() => handleCopy("npx 9router start")}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1"
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
