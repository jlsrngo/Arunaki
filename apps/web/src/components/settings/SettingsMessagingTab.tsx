import { useState, useEffect, useCallback, memo } from "react";
import {
  MessageSquare,
  ShieldCheck,
  Folder,
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  RefreshCw,
  HelpCircle,
  Send,
  Info,
  BookOpen,
  Copy,
  Check,
  X,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";
import { API_BASE, apiFetch } from "../../lib/api";
import { cn } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";

interface TelegramStatus {
  connected: boolean;
  botUsername?: string | null;
  botFirstName?: string | null;
  lastActive?: number | null;
  lastError?: string | null;
}

export const SettingsMessagingTab = memo(function SettingsMessagingTab() {
  const { t } = useI18n();
  // All React Hooks at the very top (Zero Violations of Rules of Hooks)
  const [enabled, setEnabled] = useState(false);
  const [botToken, setBotToken] = useState("");
  const [allowedUserId, setAllowedUserId] = useState("");
  const [targetFolder, setTargetFolder] = useState("");
  const [showToken, setShowToken] = useState(false);

  const [showGuideModal, setShowGuideModal] = useState(false);
  const [guideStep, setGuideStep] = useState(1);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [status, setStatus] = useState<TelegramStatus>({
    connected: false,
    botUsername: null,
    botFirstName: null,
    lastActive: null,
    lastError: null,
  });

  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    botUsername?: string;
    botFirstName?: string;
    error?: string;
  } | null>(null);

  const fetchConfigAndStatus = useCallback(async () => {
    try {
      setLoading(true);
      let [configRes, statusRes] = await Promise.all([
        apiFetch(`${API_BASE}/messaging/config`),
        apiFetch(`${API_BASE}/messaging/status`),
      ]);

      // Fallback to root route if /api alias returned non-200
      if (!configRes.ok) {
        configRes = await apiFetch("/messaging/config");
      }
      if (!statusRes.ok) {
        statusRes = await apiFetch("/messaging/status");
      }

      if (configRes.ok) {
        let configJson: any = null;
        try {
          configJson = await configRes.json();
        } catch {}
        const tg = configJson?.data?.telegram || configJson?.telegram;
        if (tg) {
          setEnabled(Boolean(tg.enabled));
          setBotToken(tg.botToken || "");
          setAllowedUserId(tg.allowedUserId || "");
          setTargetFolder(
            tg.targetFolder || localStorage.getItem("arunaki_active_folder") || ""
          );
        }
      }

      if (statusRes.ok) {
        let statusJson: any = null;
        try {
          statusJson = await statusRes.json();
        } catch {}
        const st = statusJson?.data?.telegram || statusJson?.telegram;
        if (st) {
          setStatus({
            connected: Boolean(st.connected),
            botUsername: st.botUsername || null,
            botFirstName: st.botFirstName || null,
            lastActive: st.lastActive || null,
            lastError: st.lastError || null,
          });
        }
      }
    } catch (err) {
      console.error("Failed to load messaging settings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigAndStatus();
    const interval = setInterval(fetchConfigAndStatus, 15000);
    return () => clearInterval(interval);
  }, [fetchConfigAndStatus]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    toast.success(`Copied to clipboard: ${text}`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleTestToken = async () => {
    if (!botToken.trim()) {
      toast.error("Please enter a Telegram Bot Token first.");
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);
      let res = await apiFetch(`${API_BASE}/messaging/test`, {
        method: "POST",
        body: JSON.stringify({ botToken: botToken.trim() }),
      });
      if (!res.ok) {
        res = await apiFetch("/messaging/test", {
          method: "POST",
          body: JSON.stringify({ botToken: botToken.trim() }),
        });
      }

      let result: any = null;
      try {
        const json = await res.json();
        result = json?.data || json;
      } catch {
        // Fallback for non-JSON or empty response
      }

      if (res.ok && result?.success) {
        setTestResult(result);
        toast.success(
          `Token verified! Connected to @${result.botUsername || "Telegram Bot"}`
        );
      } else {
        const errorMsg =
          result?.error ||
          (res.status === 401
            ? "Unauthorized: Invalid bot token."
            : `Failed to verify bot token (HTTP ${res.status}).`);
        setTestResult({
          success: false,
          error: errorMsg,
        });
        toast.error(errorMsg);
      }
    } catch (err: any) {
      const errorMsg = err?.message || "Failed to connect to verification service.";
      setTestResult({ success: false, error: errorMsg });
      toast.error(errorMsg);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    try {
      setSaving(true);
      const payload = {
        telegram: {
          enabled,
          botToken: botToken.trim(),
          allowedUserId: allowedUserId.trim(),
          targetFolder: targetFolder.trim(),
        },
      };

      let res = await apiFetch(`${API_BASE}/messaging/config`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        res = await apiFetch("/messaging/config", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        let errorMsg = `Failed to save (HTTP ${res.status})`;
        try {
          const json = await res.json();
          errorMsg = json?.error || json?.data?.message || json?.message || errorMsg;
        } catch {
          const text = await res.text().catch(() => "");
          if (text) errorMsg = `Failed to save: ${res.status} ${text}`;
        }
        throw new Error(errorMsg);
      }

      toast.success(
        enabled
          ? "Messaging gateway saved and connected."
          : "Messaging gateway saved (inactive)."
      );

      // Refresh status after save
      setTimeout(fetchConfigAndStatus, 1000);
    } catch (err: any) {
      toast.error(err?.message || "Failed to save configuration.");
    } finally {
      setSaving(false);
    }
  };

  const handleUseCurrentFolder = () => {
    const active = localStorage.getItem("arunaki_active_folder");
    if (active) {
      setTargetFolder(active);
      toast.info(`Target folder set to: ${active}`);
    } else {
      toast.error("No active folder currently loaded in workspace.");
    }
  };

  const handleBrowseFolder = async () => {
    try {
      const desktop = (globalThis as any).arunakiDesktop;
      if (desktop?.pickFolder) {
        const picked = await desktop.pickFolder();
        if (picked) {
          setTargetFolder(picked);
          toast.info(`Target folder set to: ${picked}`);
          return;
        }
      }
      handleUseCurrentFolder();
    } catch {
      handleUseCurrentFolder();
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-[var(--text-primary)] text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[var(--text-primary)]" />
            {t("messagingApps", "Messaging Apps")}
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {t("messagingSubtitle", "Control Arunaki remotely from Telegram. Forward WhatsApp messages, raw notes, or document tasks to your bot, and Arunaki executes them locally on this computer.")}
          </p>
        </div>

        {/* Single Setup Guide Action Button & Refresh (Monochrome) */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setGuideStep(1);
              setShowGuideModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-hover)] text-[var(--text-primary)] hover:bg-[var(--border-strong)] text-xs font-semibold transition-all cursor-pointer shadow-xs"
          >
            <BookOpen className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span>{t("setupGuide", "Setup Guide")}</span>
          </button>

          <button
            type="button"
            onClick={() => fetchConfigAndStatus()}
            disabled={loading}
            className="p-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
            title={t("refresh", "Refresh")}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Main Telegram Gateway Card (Monochrome) */}
      <div className="p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] space-y-6 shadow-xs">
        {/* Top bar with Channel Info & Status */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--bg-hover)] flex items-center justify-center border border-[var(--border-strong)] text-[var(--text-primary)]">
              <Send className="w-4 h-4 text-[var(--text-muted)]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-[var(--text-primary)]">
                  {t("telegramGateway", "Telegram BYOB Gateway")}
                </h4>
                {/* Live Status Badge (Monochrome) */}
                {enabled ? (
                  status.connected ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-strong)] shadow-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-primary)] animate-pulse" />
                      {t("connected", "Connected")} {status.botUsername ? `@${status.botUsername}` : ""}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--bg-hover)] text-[var(--text-muted)] border border-[var(--border-color)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
                      {status.lastError ? t("warning", "Connection Warning") : t("connecting", "Connecting...")}
                    </span>
                  )
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-[var(--bg-panel)] text-[var(--text-muted)] border border-[var(--border-color)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
                    {t("inactive", "Inactive")}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {t("telegramGatewayDesc", "Direct outward long-polling connection from your PC to Telegram. Free, private, and zero VPS hosting required.")}
              </p>
            </div>
          </div>

          {/* Master Enable/Disable Switch */}
          <button
            type="button"
            onClick={() => setEnabled(!enabled)}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-[var(--border-strong)] items-center p-0.5 transition-colors duration-200 ease-in-out focus:outline-none",
              enabled ? "bg-[var(--text-primary)]" : "bg-[var(--bg-panel)]"
            )}
            title={enabled ? "Disable Telegram Gateway" : "Enable Telegram Gateway"}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full shadow-sm ring-0 transition-transform duration-200 ease-in-out",
                enabled ? "translate-x-5 bg-[var(--bg-app)]" : "translate-x-0 bg-[var(--text-muted)]"
              )}
            />
          </button>
        </div>

        {/* Error Alert if connection error occurred */}
        {enabled && status.lastError && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2.5">
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Gateway Notice</p>
              <p className="text-[11px] opacity-90 mt-0.5 font-mono">{status.lastError}</p>
            </div>
          </div>
        )}

        {/* Configuration Form */}
        <form onSubmit={handleSave} className="space-y-4">
          {/* 1. Bot Token */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                {t("botTokenLabel", "Telegram Bot Token")}
              </label>
              <button
                type="button"
                onClick={() => {
                  setGuideStep(1);
                  setShowGuideModal(true);
                }}
                className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline cursor-pointer flex items-center gap-1"
              >
                <HelpCircle className="w-3 h-3" />
                {t("botTokenHelp", "Need a token? View guide")}
              </button>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showToken ? "text" : "password"}
                  value={botToken}
                  onChange={(e) => {
                    setBotToken(e.target.value);
                    setTestResult(null);
                  }}
                  placeholder={t("botTokenPlaceholder", "e.g. 1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ")}
                  className="w-full px-3.5 py-2 pr-10 text-xs font-mono rounded-xl bg-[var(--bg-panel)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--text-primary)] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              <button
                type="button"
                onClick={handleTestToken}
                disabled={testing || !botToken.trim()}
                className="px-3.5 py-2 text-xs font-medium rounded-xl border border-[var(--border-strong)] bg-[var(--bg-hover)] text-[var(--text-primary)] hover:bg-[var(--border-strong)] transition-colors disabled:opacity-50 cursor-pointer shrink-0 flex items-center gap-1.5"
              >
                {testing ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Testing...
                  </>
                ) : (
                  t("testToken", "Test Token")
                )}
              </button>
            </div>

            {/* Test result feedback banner (Monochrome) */}
            {testResult && (
              <div
                className={cn(
                  "p-2.5 rounded-lg text-xs flex items-center gap-2 mt-1.5",
                  testResult.success
                    ? "bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-strong)]"
                    : "bg-[var(--bg-panel)] text-[var(--text-muted)] border border-[var(--border-strong)]"
                )}
              >
                {testResult.success ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[var(--text-primary)]" />
                    <span>
                      {t("tokenValidConnected", "Token is valid! Connected to")} <b>@{testResult.botUsername}</b> ({testResult.botFirstName}).
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)]" />
                    <span>{testResult.error || t("failedVerifyToken", "Failed to verify token.")}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 2. Allowed User ID / Whitelist */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                {t("whitelistLabel", "Allowed Sender Whitelist (Security)")}
              </label>
              <button
                type="button"
                onClick={() => {
                  setGuideStep(3);
                  setShowGuideModal(true);
                }}
                className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline cursor-pointer flex items-center gap-1"
              >
                <HelpCircle className="w-3 h-3" />
                {t("whitelistHelp", "How to check my Telegram ID")}
              </button>
            </div>
            <input
              type="text"
              value={allowedUserId}
              onChange={(e) => setAllowedUserId(e.target.value)}
              placeholder={t("whitelistPlaceholder", "e.g. 123456789, @username (or * for all)")}
              className="w-full px-3.5 py-2 text-xs font-mono rounded-xl bg-[var(--bg-panel)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--text-primary)] transition-colors"
            />
            <p className="text-[11px] text-[var(--text-muted)] flex items-center gap-1 leading-relaxed">
              <Info className="w-3 h-3 shrink-0 text-[var(--text-muted)]" />
              {t("whitelistDesc", "Protects your computer. Only Telegram accounts registered in this whitelist can execute document instructions.")}
            </p>
          </div>

          {/* 3. Target Workspace Folder */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                {t("targetFolderLabel", "Target Project Folder")}
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleBrowseFolder}
                  className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline cursor-pointer font-medium"
                >
                  Browse...
                </button>
                <span className="text-[var(--border-strong)]">|</span>
                <button
                  type="button"
                  onClick={handleUseCurrentFolder}
                  className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline cursor-pointer font-medium"
                >
                  {t("useActiveFolder", "Use Active Workspace Folder")}
                </button>
              </div>
            </div>
            <input
              type="text"
              value={targetFolder}
              onChange={(e) => setTargetFolder(e.target.value)}
              placeholder="e.g. E:\JS\Arunika or C:\Users\Name\Documents"
              className="w-full px-3.5 py-2 text-xs font-mono rounded-xl bg-[var(--bg-panel)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--text-primary)] transition-colors"
            />
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              {t("targetFolderDesc", "The directory on this computer where Arunaki will read, modify, and create document files when receiving instructions from Telegram.")}
            </p>
          </div>

          {/* Submit Action */}
          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--text-primary)] text-[var(--bg-app)] hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  {t("saving", "Saving...")}
                </>
              ) : (
                t("saveChanges", "Save Changes")
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Interactive Setup Wizard Modal (Monochrome) */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-xl w-full bg-[var(--bg-panel)] rounded-2xl border border-[var(--border-strong)] shadow-2xl p-6 space-y-5 select-none relative animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-[var(--border-color)] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-strong)] flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-[var(--text-muted)]" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[var(--text-primary)]">
                    {t("guideModalTitle", "Telegram Bot Setup Guide")}
                  </h4>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {t("guideModalSubtitle", "Connect your Telegram bot in 4 simple steps (takes 2-3 minutes)")}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Stepper Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-app)] rounded-xl border border-[var(--border-color)]">
              {[
                { step: 1, label: t("step1Title", "1. Create Bot") },
                { step: 2, label: t("step2Title", "2. Copy Token") },
                { step: 3, label: t("step3Title", "3. Whitelist ID") },
                { step: 4, label: t("step4Title", "4. Ready") },
              ].map((s) => (
                <button
                  key={s.step}
                  type="button"
                  onClick={() => setGuideStep(s.step)}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer text-center",
                    guideStep === s.step
                      ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xs border border-[var(--border-strong)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Step Body Content */}
            <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] min-h-[220px] flex flex-col justify-between">
              {guideStep === 1 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      {t("step1Badge", "Step 1 of 4")}
                    </span>
                    <a
                      href="https://t.me/BotFather"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline inline-flex items-center gap-1 font-semibold"
                    >
                      {t("step1Link", "Open @BotFather on Telegram")} <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <h5 className="text-sm font-bold text-[var(--text-primary)]">
                    {t("step1Heading", "Create a New Bot via @BotFather")}
                  </h5>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    {t("step1Desc1", "1. Open Telegram on your phone or desktop, and search for the official bot creator: ")}
                    <b className="text-[var(--text-primary)]">@BotFather</b> {t("step1Desc1Or", "(or click the link above).")}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    {t("step1Desc2", "2. Send the command: ")}{" "}
                    <span className="inline-flex items-center gap-1 font-mono bg-[var(--bg-panel)] px-2 py-0.5 rounded text-[var(--text-primary)] border border-[var(--border-strong)]">
                      /newbot
                      <button
                        type="button"
                        onClick={() => handleCopy("/newbot", "newbot")}
                        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                        title={t("copyCommand", "Copy command")}
                      >
                        {copiedCode === "newbot" ? <Check className="w-3 h-3 text-[var(--text-primary)]" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </span>
                  </p>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    {t("step1Desc3", "3. Give your bot any display name (e.g. My Document Assistant), then enter a username ending in bot (e.g. arunaki_work_bot).")}
                  </p>
                </div>
              )}

              {guideStep === 2 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      {t("step2Badge", "Step 2 of 4")}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {t("step2Sub", "API Token")}
                    </span>
                  </div>
                  <h5 className="text-sm font-bold text-[var(--text-primary)]">
                    {t("step2Heading", "Copy the HTTP API Token")}
                  </h5>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    {t("step2Desc1", "After you specify a username, @BotFather will reply with your bot token:")}
                  </p>
                  <div className="p-3 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-strong)] font-mono text-[11px] text-[var(--text-muted)] space-y-1">
                    <p className="text-[10px] text-[var(--text-primary)] font-sans font-semibold">
                      {t("step2Example", "Example message from BotFather:")}
                    </p>
                    <p className="text-[10px] opacity-75">
                      {t("step2UseToken", "Use this token to access the HTTP API:")}
                    </p>
                    <p className="text-[var(--text-primary)] font-bold bg-[var(--bg-hover)] p-1 rounded border border-[var(--border-strong)]">
                      7821938210:AAEtvL2_xPQrstUVwXyZ1234
                    </p>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    {t("step2Desc2", "Copy the entire token string and paste it into the Telegram Bot Token field on the settings page.")}
                  </p>
                </div>
              )}

              {guideStep === 3 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      {t("step3Badge", "Step 3 of 4")}
                    </span>
                    <a
                      href="https://t.me/userinfobot"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline inline-flex items-center gap-1 font-semibold"
                    >
                      {t("step3Link", "Open @userinfobot on Telegram")} <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <h5 className="text-sm font-bold text-[var(--text-primary)]">
                    {t("step3Heading", "Whitelist Your Telegram Account (Security)")}
                  </h5>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    {t("step3DescPrefix", "To make sure only you can control Arunaki on your PC:")}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    {t("step3Desc1", "1. Open @userinfobot on Telegram (click the link above).")}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    {t("step3Desc2", "2. Send any message or click /start. The bot will reply with your numeric User ID (e.g. 123456789).")}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    {t("step3Desc3", "3. Copy this number and paste it into the Allowed Sender Whitelist field.")}
                  </p>
                </div>
              )}

              {guideStep === 4 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      {t("step4Badge", "Final Step")}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] font-semibold">
                      {t("step4Sub", "Ready to Use!")}
                    </span>
                  </div>
                  <h5 className="text-sm font-bold text-[var(--text-primary)]">
                    {t("step4Heading", "Save & Start Messaging")}
                  </h5>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    {t("step4Desc1", "1. Make sure the toggle switch is ON, then click Save Changes.")}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    {t("step4Desc2", "2. Open your new bot on Telegram from your phone, and send /start.")}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    {t("step4Desc3", "3. Forward any WhatsApp note or type a document instruction, such as:")}
                    <br />
                    <span className="font-mono text-[11px] text-[var(--text-primary)] bg-[var(--bg-panel)] px-2 py-1 rounded inline-block mt-1 border border-[var(--border-strong)]">
                      {t("step4Example", '"rekap catatan penjualan ini ke file rekap.xlsx"')}
                    </span>
                  </p>
                  <p className="text-[11px] text-[var(--text-primary)] font-semibold flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-[var(--text-primary)] shrink-0" />
                    <span>{t("step4Success", "Arunaki on your PC will automatically process the document and reply back to your phone.")}</span>
                  </p>
                </div>
              )}

              {/* Navigation Controls */}
              <div className="flex items-center justify-between pt-3 border-t border-[var(--border-color)] mt-3">
                {guideStep > 1 ? (
                  <button
                    type="button"
                    onClick={() => setGuideStep(guideStep - 1)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--bg-hover)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> {t("previous", "Previous")}
                  </button>
                ) : (
                  <div />
                )}

                {guideStep < 4 ? (
                  <button
                    type="button"
                    onClick={() => setGuideStep(guideStep + 1)}
                    className="px-4 py-1.5 rounded-lg bg-[var(--text-primary)] text-[var(--bg-app)] text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1"
                  >
                    {t("next", "Next")} <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowGuideModal(false)}
                    className="px-4 py-1.5 rounded-lg bg-[var(--text-primary)] text-[var(--bg-app)] text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    {t("doneClose", "Done & Close Guide")}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
