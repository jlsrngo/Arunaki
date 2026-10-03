import { useState, useEffect } from "react";
import { Terminal, CheckCircle2, AlertCircle, RefreshCw, Copy, Check, Sparkles, ExternalLink, Zap } from "lucide-react";
import { API_BASE, apiFetch, directoryQuery } from "../../lib/api";
import { toast } from "sonner";

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
  onConnected?: () => void;
}

export function LocalCliSection({ onConnected }: LocalCliSectionProps) {
  const [data, setData] = useState<LocalCliData | null>(null);
  const [loading, setLoading] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

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
        onConnected?.();
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
        {/* Claude Code CLI Card */}
        <div className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-app)] space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs text-[var(--text-primary)]">Claude Code CLI</span>
                {data?.claude.version && (
                  <span className="text-[10px] text-[var(--text-muted)]">v{data.claude.version}</span>
                )}
              </div>

              {/* Status Badge */}
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

            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Anthropic official CLI. Supports Claude 3.7 Sonnet & 3.5 Sonnet using your flat Claude Pro ($20/mo) subscription.
            </p>
          </div>

          {/* Actions & Code Snippets */}
          <div className="pt-2 border-t border-[var(--border-color)]/60 space-y-2">
            {data?.claude.installed ? (
              data.claude.loggedIn ? (
                <button
                  onClick={() => handleConnect("claude")}
                  disabled={isConnecting}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-xs cursor-pointer disabled:opacity-60"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Use Claude Pro as Active Agent</span>
                </button>
              ) : (
                <div className="space-y-2">
                  <button
                    onClick={handleLaunchLogin}
                    disabled={isLoggingIn}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition-all shadow-xs cursor-pointer disabled:opacity-60"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Launch Terminal Login</span>
                  </button>

                  <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] text-[11px] font-mono text-[var(--text-secondary)]">
                    <span className="truncate">claude auth login --claudeai</span>
                    <button
                      onClick={() => handleCopy("claude auth login --claudeai")}
                      className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1"
                      title="Copy command"
                    >
                      {copiedCmd === "claude auth login --claudeai" ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>
              )
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
          </div>
        </div>

        {/* 9Router Local Gateway Card */}
        <div className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-app)] space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-[var(--text-primary)]">9Router Local Gateway</span>

              {data?.nineRouter.running ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  Running on :20128
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/5 text-[var(--text-muted)] border border-white/10">
                  Inactive
                </span>
              )}
            </div>

            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Open-source multi-provider local router with token optimizer and auto-fallback across 50+ models.
            </p>
          </div>

          <div className="pt-2 border-t border-[var(--border-color)]/60 space-y-2">
            {data?.nineRouter.running ? (
              <button
                onClick={() => handleConnect("9router")}
                disabled={isConnecting}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold bg-[var(--text-primary)] hover:opacity-90 text-[var(--bg-app)] transition-all shadow-xs cursor-pointer disabled:opacity-60"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Connect Active 9Router Hub</span>
              </button>
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
