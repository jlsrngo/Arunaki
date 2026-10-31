import { memo } from "react";
import {
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
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useTheme } from "../../lib/theme";
import { TelegramSetupGuideModal } from "./TelegramSetupGuideModal";
import { Button, Input, Card } from "../ui";
import { useMessagingSettings } from "./hooks/useMessagingSettings";

export const SettingsMessagingTab = memo(function SettingsMessagingTab() {
  const { isNeobrutalism } = useTheme();
  const {
    enabled,
    setEnabled,
    botToken,
    setBotToken,
    allowedUserId,
    setAllowedUserId,
    targetFolder,
    setTargetFolder,
    showToken,
    setShowToken,
    showGuideModal,
    setShowGuideModal,
    guideInitialStep,
    setGuideInitialStep,
    status,
    loading,
    testing,
    saving,
    testResult,
    fetchConfigAndStatus,
    handleTestToken,
    handleSave,
    handleUseCurrentFolder,
    handleBrowseFolder,
  } = useMessagingSettings();

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header & Status Card */}
      <Card
        className={cn(
          "p-5 transition-all",
          isNeobrutalism
            ? "bg-[#F0F9FF] border-2 border-[#141413] shadow-[4px_4px_0px_#141413] rounded-2xl"
            : "bg-[var(--bg-card)] border-[var(--border-color)]"
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center border transition-colors",
                isNeobrutalism
                  ? "bg-[#0EA5E9] text-white border-2 border-[#141413] shadow-[2px_2px_0px_#141413]"
                  : status.connected
                  ? "bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-strong)]"
                  : "bg-[var(--bg-panel)] text-[var(--text-muted)] border-[var(--border-color)]"
              )}
            >
              <Send className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3
                  className={cn(
                    "font-semibold text-sm",
                    isNeobrutalism ? "text-[#141413] font-bold" : "text-[var(--text-primary)]"
                  )}
                >
                  Telegram Bot Gateway
                </h3>
                <span
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full font-medium border",
                    isNeobrutalism
                      ? status.connected
                        ? "bg-[#CCFF00] text-[#141413] border-2 border-[#141413] font-bold"
                        : "bg-[#FFFDFB] text-[#141413] border-2 border-[#141413] font-semibold"
                      : status.connected
                      ? "bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-strong)]"
                      : "bg-[var(--bg-panel)] text-[var(--text-muted)] border-[var(--border-color)]"
                  )}
                >
                  {status.connected ? "Active & Connected" : "Disconnected"}
                </span>
              </div>
              <p
                className={cn(
                  "text-xs mt-0.5",
                  isNeobrutalism ? "text-[#141413]/80" : "text-[var(--text-muted)]"
                )}
              >
                {status.connected && status.botUsername
                  ? `Connected as @${status.botUsername} (${status.botFirstName || "Arunaki Bot"})`
                  : "Allow Arunaki to send notifications and receive task commands via Telegram."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setGuideInitialStep(1);
                setShowGuideModal(true);
              }}
              className={cn(
                "h-8 text-xs font-medium gap-1.5",
                isNeobrutalism
                  ? "bg-[#FFFDFB] text-[#141413] border-2 border-[#141413] shadow-[2px_2px_0px_#141413] hover:bg-[#F3EBE4]"
                  : "border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Setup Guide
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={fetchConfigAndStatus}
              disabled={loading}
              className={cn(
                "h-8 text-xs font-medium gap-1.5",
                isNeobrutalism
                  ? "bg-[#FFFDFB] text-[#141413] border-2 border-[#141413] shadow-[2px_2px_0px_#141413] hover:bg-[#F3EBE4]"
                  : "border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {status.lastError && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-xs text-red-400">
            <XCircle className="w-4 h-4 shrink-0" />
            <span>Connection issue: {status.lastError}</span>
          </div>
        )}
      </Card>

      {/* Configuration Form */}
      <Card
        className={cn(
          "p-5 space-y-5 transition-all",
          isNeobrutalism
            ? "bg-[#FAF5FF] border-2 border-[#141413] shadow-[4px_4px_0px_#141413] rounded-2xl"
            : "bg-[var(--bg-card)] border-[var(--border-color)]"
        )}
      >
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-color)]">
          <div>
            <h4
              className={cn(
                "text-sm font-semibold",
                isNeobrutalism ? "text-[#141413] font-bold" : "text-[var(--text-primary)]"
              )}
            >
              Enable Telegram Bot Bridge
            </h4>
            <p
              className={cn(
                "text-xs mt-0.5",
                isNeobrutalism ? "text-[#141413]/80" : "text-[var(--text-muted)]"
              )}
            >
              Turn on to let Arunaki poll Telegram for incoming chat instructions and send progress updates.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full items-center p-0.5 transition-colors duration-200 ease-in-out focus:outline-none",
              isNeobrutalism
                ? enabled
                  ? "bg-[#CCFF00] border-2 border-[#141413] shadow-[2px_2px_0px_#141413]"
                  : "bg-[#EAE0D7] border-2 border-[#141413]"
                : enabled
                ? "bg-[var(--text-primary)] border-2 border-transparent"
                : "bg-[var(--border-strong)] border-2 border-transparent"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full ring-0 transition-transform duration-200 ease-in-out",
                isNeobrutalism
                  ? enabled
                    ? "translate-x-5 bg-[#141413]"
                    : "translate-x-0 bg-[#141413]"
                  : enabled
                  ? "translate-x-5 bg-[var(--bg-app)] shadow"
                  : "translate-x-0 bg-[var(--bg-app)] shadow"
              )}
            />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Bot Token Field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-[var(--text-secondary)] flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                Telegram Bot Token
                <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setGuideInitialStep(2);
                  setShowGuideModal(true);
                }}
                className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <HelpCircle className="w-3 h-3" />
                How to get token?
              </button>
            </div>
            <div className="relative">
              <Input
                type={showToken ? "text" : "password"}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz..."
                className="font-mono text-xs pr-20"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 transition-colors cursor-pointer"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Test Token Button */}
          <div className="flex items-center justify-between pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTestToken}
              disabled={testing || !botToken.trim()}
              className="text-xs"
            >
              {testing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Testing Token...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-[var(--text-secondary)]" />
                  Test Bot Token
                </>
              )}
            </Button>

            {testResult && (
              <div
                className={cn(
                  "text-xs flex items-center gap-1.5",
                  testResult.success ? "text-[var(--text-primary)] font-medium" : "text-rose-500"
                )}
              >
                {testResult.success ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Verified: @{testResult.botUsername}
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5" />
                    Failed: {testResult.error}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Allowed User ID Field */}
          <div className="space-y-1.5 pt-2 border-t border-[var(--border-color)]">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-[var(--text-secondary)] flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                Allowed Telegram User ID (Whitelist)
                <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setGuideInitialStep(3);
                  setShowGuideModal(true);
                }}
                className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <HelpCircle className="w-3 h-3" />
                Find my User ID
              </button>
            </div>
            <Input
              type="text"
              value={allowedUserId}
              onChange={(e) => setAllowedUserId(e.target.value)}
              placeholder="e.g. 123456789 (Use @userinfobot to check)"
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-[var(--text-muted)]">
              CRITICAL SECURITY: Only messages sent by this Telegram User ID will be executed. All messages from other accounts are rejected.
            </p>
          </div>

          {/* Target Project Folder Field */}
          <div className="space-y-1.5 pt-2 border-t border-[var(--border-color)]">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-[var(--text-secondary)] flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                Target Workspace Folder
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleUseCurrentFolder}
                className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] h-auto p-0"
              >
                Use Active Folder
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={targetFolder}
                onChange={(e) => setTargetFolder(e.target.value)}
                placeholder="E:\Work\Documents"
                className="font-mono text-xs flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleBrowseFolder}
                className="text-xs shrink-0"
              >
                Browse...
              </Button>
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              All files, spreadsheets, and documents edited via Telegram will be bound strictly to this folder.
            </p>
          </div>

          {/* Save Button */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-[var(--border-color)]">
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={saving}
              className="px-5 font-semibold text-xs"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Configuration"
              )}
            </Button>
          </div>
        </form>
      </Card>

      {/* Info notice */}
      <div className="p-3.5 bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] flex items-start gap-3 text-xs text-[var(--text-muted)]">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-[var(--text-secondary)]" />
        <div className="space-y-1">
          <p className="font-medium text-[var(--text-primary)]">
            Autonomous Document Execution via Mobile Chat
          </p>
          <p className="leading-relaxed">
            Send instructions like <code className="bg-[var(--bg-panel)] px-1 py-0.5 rounded text-[var(--text-primary)]">"Rekap invoice.pdf ke excel"</code> directly to your Telegram bot. Arunaki reads, formats, and creates documents directly in your active workstation folder.
          </p>
        </div>
      </div>

      {/* Interactive Setup Guide Modal */}
      <TelegramSetupGuideModal
        isOpen={showGuideModal}
        onClose={() => setShowGuideModal(false)}
        initialStep={guideInitialStep}
      />
    </div>
  );
});
