import { memo } from "react";
import {
  Store,
  Wifi,
  Key,
  User,
  Lock,
  Eye,
  EyeOff,
  Check,
  RefreshCw,
  ShieldCheck,
  Building2,
  BookOpen,
} from "lucide-react";
import { ArunakiZenSetupGuideModal } from "./ArunakiZenSetupGuideModal";
import { cn } from "../../lib/utils";
import { useTheme } from "../../lib/theme";
import { Button, Input, Card } from "../ui";
import { useAppConnections } from "./hooks/useAppConnections";

export const SettingsAppConnectionsTab = memo(function SettingsAppConnectionsTab() {
  const { isNeobrutalism } = useTheme();
  const {
    hostUrl,
    setHostUrl,
    apiKey,
    setApiKey,
    username,
    setUsername,
    password,
    setPassword,
    showApiKey,
    setShowApiKey,
    showPassword,
    setShowPassword,
    status,
    autoDetecting,
    testing,
    saving,
    showGuideModal,
    setShowGuideModal,
    guideInitialStep,
    setGuideInitialStep,
    handleAutoDetect,
    handleTestConnection,
    handleSave,
  } = useAppConnections();

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header & Status Card */}
      <Card
        className={cn(
          "p-5 transition-all",
          isNeobrutalism
            ? "bg-[#ECFDF5] border-2 border-[#141413] shadow-[4px_4px_0px_#141413] rounded-2xl"
            : "bg-[var(--bg-card)] border-[var(--border-color)]"
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center border transition-colors",
                isNeobrutalism
                  ? "bg-[#10B981] text-white border-2 border-[#141413] shadow-[2px_2px_0px_#141413]"
                  : status.connected
                  ? "bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-strong)]"
                  : "bg-[var(--bg-panel)] text-[var(--text-muted)] border-[var(--border-color)]"
              )}
            >
              <Store className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3
                  className={cn(
                    "font-semibold text-sm",
                    isNeobrutalism ? "text-[#141413] font-bold" : "text-[var(--text-primary)]"
                  )}
                >
                  ArunakiZen Business & ERP Integration
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
                  {status.connected ? "Active & Linked" : "Standby / Unlinked"}
                </span>
              </div>
              <p
                className={cn(
                  "text-xs mt-0.5",
                  isNeobrutalism ? "text-[#141413]/80" : "text-[var(--text-muted)]"
                )}
              >
                {status.connected && status.store
                  ? `Linked to ${status.store} · Operator: ${status.operator?.nama || "Admin"}`
                  : "Allow Arunaki to query inventory, reconcile invoices, and sync business tables directly with ArunakiZen ERP."}
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
          </div>
        </div>

        {status.connected && (
          <div className="mt-4 pt-3 border-t border-[var(--border-color)] grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-[var(--bg-panel)] p-2.5 rounded-lg border border-[var(--border-color)] flex items-center gap-2.5">
              <Building2 className="w-4 h-4 text-[var(--text-muted)]" />
              <div className="min-w-0">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Store / Cabang</p>
                <p className="text-xs font-medium text-[var(--text-primary)] truncate">{status.store || "Central Store"}</p>
              </div>
            </div>

            <div className="bg-[var(--bg-panel)] p-2.5 rounded-lg border border-[var(--border-color)] flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[var(--text-muted)]" />
              <div className="min-w-0">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Operator Level</p>
                <p className="text-xs font-medium text-[var(--text-primary)] truncate">{status.operator?.level || "Admin"}</p>
              </div>
            </div>

            <div className="bg-[var(--bg-panel)] p-2.5 rounded-lg border border-[var(--border-color)] flex items-center gap-2.5">
              <Wifi className="w-4 h-4 text-[var(--text-muted)]" />
              <div className="min-w-0">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Access Scope</p>
                <p className="text-xs font-medium text-[var(--text-primary)] truncate">Read Sales & Inventory</p>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Configuration Form Card */}
      <Card
        className={cn(
          "p-5 space-y-4 transition-all",
          isNeobrutalism
            ? "bg-[#FFFDFB] border-2 border-[#141413] shadow-[4px_4px_0px_#141413] rounded-2xl"
            : "bg-[var(--bg-card)] border-[var(--border-color)]"
        )}
      >
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)]">
          <div>
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">
              API Connection & Credentials
            </h4>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Enter the local IP/port or domain of your ArunakiZen desktop/server instance.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAutoDetect}
            disabled={autoDetecting}
            className="text-xs gap-1.5"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", autoDetecting && "animate-spin")} />
            Auto-Detect Port
          </Button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Host URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)] flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              Host URL / Server Endpoint
              <span className="text-rose-500">*</span>
            </label>
            <Input
              type="text"
              value={hostUrl}
              onChange={(e) => setHostUrl(e.target.value)}
              placeholder="http://127.0.0.1:8000"
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-[var(--text-muted)]">
              Usually <code className="bg-[var(--bg-panel)] px-1 py-0.5 rounded">http://127.0.0.1:8000</code> or your store's LAN IP.
            </p>
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)] flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              API Key / Access Token
            </label>
            <div className="relative">
              <Input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="zen_live_xxxxxxxxxxxxxxxxxxxxxxxx"
                className="font-mono text-xs pr-10"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 transition-colors cursor-pointer"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Username & Password */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)] flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                Operator Username
              </label>
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)] flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                Operator Password / PIN
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="font-mono text-xs pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 flex items-center justify-between border-t border-[var(--border-color)]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={testing || !hostUrl.trim()}
              className="text-xs gap-1.5"
            >
              <Wifi className={cn("w-3.5 h-3.5", testing && "animate-spin")} />
              {testing ? "Testing Handshake..." : "Test Connection"}
            </Button>

            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={saving}
              className="px-5 font-semibold text-xs gap-1.5"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Save Configuration
                </>
              )}
            </Button>
          </div>
        </form>
      </Card>

      {/* Guide Modal */}
      <ArunakiZenSetupGuideModal
        isOpen={showGuideModal}
        onClose={() => setShowGuideModal(false)}
        initialStep={guideInitialStep}
        hostUrl={hostUrl}
      />
    </div>
  );
});
