import { memo } from "react";
import {
  Check,
  X,
  Loader2,
  Wifi,
  Globe,
  ChevronDown,
  RefreshCw,
  SlidersHorizontal,
  LogOut,
  LogIn,
  AlertTriangle,
} from "lucide-react";
import { cn } from "../../../../lib/utils";
import { useTheme } from "../../../../lib/theme";
import { CliModelDropdown } from "./CliModelDropdown";
import { CliQuotaView } from "./CliQuotaView";
import type {
  CliProviderDescriptor,
  CliProviderId,
  LocalCliData,
  QuotaReport,
} from "../types";

const NEO_CLI_COLORS: Record<string, string> = {
  opencode: "bg-[#EFF6FF]", // Soft Sky Blue
  antigravity: "bg-[#FEFCE8]", // Soft Yellow
  kiro: "bg-[#FFF7ED]", // Soft Orange
  nineRouter: "bg-[#FAF5FF]", // Soft Purple
  router9: "bg-[#FAF5FF]", // Soft Purple
  "9router": "bg-[#FAF5FF]", // Soft Purple
  claude: "bg-[#FFF1F2]", // Soft Rose
  codex: "bg-[#ECFDF5]", // Soft Mint
};

interface CliProviderCardProps {
  descriptor: CliProviderDescriptor;
  state: { installed: boolean; signedIn: boolean; email?: string; active: boolean; version?: string };
  isEn: boolean;
  loading: boolean;
  expanded: boolean;
  busy: boolean;
  data: LocalCliData;
  ping?: { success: boolean; timeMs: number; message?: string };
  testingPingTarget: string | null;
  refreshErrors: Record<string, string>;
  refreshingTarget: string | null;
  injectingTarget: string | null;
  oauthPendingTarget: string | null;
  signingOutTarget: string | null;
  isSigningInCli: boolean;
  isLoggingOutAntigravity: boolean;
  quota: QuotaReport[];
  quotaLoading: boolean;
  models: string[];
  isModelLive?: boolean;
  selectedModel?: string;
  isDropdownOpen: boolean;
  customInputValue: string;
  onToggleConnection: (id: CliProviderId, isActive: boolean, name: string) => void;
  onTestPing: (id: CliProviderId, name: string) => void;
  onToggleExpand: (id: string) => void;
  onRefreshQuota: () => void;
  onRefreshCred: (target: "claude" | "codex") => void;
  onInjectCli: (target: "claude" | "codex") => void;
  onBrowserSignIn: (target: CliProviderId) => void;
  onSignOut: (target: string) => void;
  onOpenCodeSignOut: () => void;
  onAntigravityCliLogin: () => void;
  onAntigravityLogout: () => void;
  onOpenAuthModal: (target: CliProviderId) => void;
  onToggleDropdown: () => void;
  onSelectModel: (
    targetKey: string,
    modelName: string,
    activeId: string,
    isActive: boolean,
    friendlyName: string
  ) => void;
  onCustomInputChange: (val: string) => void;
}

export const CliProviderCard = memo(function CliProviderCard({
  descriptor: d,
  state,
  isEn,
  loading,
  expanded,
  busy,
  data,
  ping,
  testingPingTarget,
  refreshErrors,
  refreshingTarget,
  injectingTarget,
  oauthPendingTarget,
  signingOutTarget,
  isSigningInCli,
  isLoggingOutAntigravity,
  quota,
  quotaLoading,
  models,
  isModelLive,
  selectedModel,
  isDropdownOpen,
  customInputValue,
  onToggleConnection,
  onTestPing,
  onToggleExpand,
  onRefreshQuota,
  onRefreshCred,
  onInjectCli,
  onBrowserSignIn,
  onSignOut,
  onOpenCodeSignOut,
  onAntigravityCliLogin,
  onAntigravityLogout,
  onOpenAuthModal,
  onToggleDropdown,
  onSelectModel,
  onCustomInputChange,
}: CliProviderCardProps) {
  const { isNeobrutalism } = useTheme();
  const id = d.id as CliProviderId;
  const ownsOwnCredential = id === "opencode" || id === "antigravity";
  const discovered = data.discovered?.find((x) => x.provider === id);
  const codexPlan = id === "codex" ? data.codex?.plan : undefined;
  const tokenExpiresAt = id === "codex" ? data.codex?.expiresAt : id === "kiro" ? data.kiro?.expiresAt : null;
  const neoCardBg = NEO_CLI_COLORS[id] || "bg-[#FFFDFB]";

  const dot = state.signedIn
    ? "bg-[var(--text-primary)]"
    : state.installed
    ? "bg-amber-400"
    : loading
    ? "bg-[#cf6613] animate-pulse"
    : "bg-[var(--text-dim)]";

  const renderSetupSteps = () => {
    if (state.signedIn) return null;
    const steps: { text: string; href?: string }[] = [];
    if (d.requiresCli && !state.installed) {
      steps.push({
        text: d.installSizeMb
          ? isEn
            ? `Install ${d.name} (${d.installSizeMb} MB)`
            : `Pasang ${d.name} (${d.installSizeMb} MB)`
          : isEn
          ? `Install ${d.name}`
          : `Pasang ${d.name}`,
        href: d.installUrl,
      });
    }
    if (d.loginMode === "terminal" && d.loginCommand) {
      steps.push({
        text: isEn
          ? `Sign in by running ${d.loginCommand} in the terminal`
          : `Masuk dengan menjalankan ${d.loginCommand} di terminal`,
      });
    }
    if (d.credentialPath || d.credentialTarget) {
      steps.push({
        text: d.credentialTarget
          ? isEn
            ? `Arunaki reads the token from Windows Credential Manager (${d.credentialTarget})`
            : `Arunaki membaca token dari Windows Credential Manager (${d.credentialTarget})`
          : isEn
          ? `Arunaki reads the token from ${d.credentialPath} automatically`
          : `Arunaki membaca token dari ${d.credentialPath} secara otomatis`,
      });
    }
    if (!steps.length) return null;
    return (
      <ol className="space-y-0.5 text-[10px] text-[var(--text-muted)]">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="text-[var(--text-dim)]">{i + 1}.</span>
            <span className="flex items-center gap-1 flex-wrap">
              <span>{s.text}</span>
              {s.href && (
                <a
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-2"
                >
                  {isEn ? "open" : "buka"}
                </a>
              )}
            </span>
          </li>
        ))}
      </ol>
    );
  };

  return (
    <div
      className={cn(
        "rounded-2xl border transition-all duration-200",
        isNeobrutalism
          ? `${neoCardBg} border-2 border-[#141413] shadow-[3px_3px_0px_#141413]`
          : state.active
          ? "bg-[var(--bg-panel)] border-[var(--border-strong)]"
          : "bg-[var(--bg-card)] border-[var(--border-color)]"
      )}
    >
      <div className="px-4 py-3 flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleConnection(id, state.active, d.name);
          }}
          disabled={busy}
          title={
            state.active
              ? isEn
                ? "Click to Disconnect"
                : "Klik untuk Putuskan"
              : isEn
              ? "Click to Connect"
              : "Klik untuk Hubungkan"
          }
          className={cn(
            "w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer group/circle",
            isNeobrutalism
              ? state.active
                ? "border-2 border-[#141413] bg-[#CCFF00] shadow-[1px_1px_0px_#141413]"
                : "border-2 border-[#141413] bg-[#FFFDFB] hover:bg-[#CCFF00]"
              : state.active
              ? "border-[var(--text-primary)] bg-[var(--text-primary)] hover:opacity-90"
              : "border-[var(--border-strong)] hover:border-[var(--text-primary)] bg-transparent"
          )}
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-muted)]" />
          ) : state.active ? (
            <>
              <Check className="w-3.5 h-3.5 text-[var(--bg-app)] stroke-[3] group-hover/circle:hidden" />
              <X className="w-3.5 h-3.5 text-[var(--bg-app)] stroke-[3] hidden group-hover/circle:inline" />
            </>
          ) : (
            <span className="w-2 h-2 rounded-full bg-[var(--text-dim)] group-hover/circle:bg-[var(--text-primary)] transition-colors" />
          )}
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-[var(--text-primary)]">{d.name}</span>
            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dot)} />
            <span className="text-[11px] text-[var(--text-muted)] truncate max-w-[220px]">
              {state.signedIn
                ? isEn
                  ? "Connected"
                  : "Terhubung"
                : !d.requiresCli
                ? isEn
                  ? "Sign-in needed"
                  : "Perlu login"
                : state.installed
                ? isEn
                  ? "Sign-in needed"
                  : "Perlu login"
                : loading
                ? isEn
                  ? "Checking status..."
                  : "Memeriksa status..."
                : isEn
                ? "Not installed"
                : "Belum terpasang"}
            </span>
            {refreshErrors[id] && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#cf6613] text-white border border-[#cf6613]"
                title={refreshErrors[id]}
              >
                <AlertTriangle className="w-2.5 h-2.5" />
                Refresh failed
              </span>
            )}
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
            {d.vendor}
            {state.email ? ` • ${state.email}` : ""}
            {state.version ? ` • ${d.loginMode === "none" ? "" : d.name + " "}${state.version}` : ""}
          </p>
          {!state.signedIn && d.entitlement && (
            <p className="text-[10px] text-amber-500/90 mt-0.5 flex items-center gap-1 flex-wrap">
              <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
              <span>{isEn ? d.entitlement.notice : d.entitlement.noticeId}</span>
              <a
                href={d.entitlement.url}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-2"
              >
                {isEn ? "See plans" : "Lihat paket"}
              </a>
            </p>
          )}
          {d.note && (
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
              {isEn ? d.note.text : d.note.textId}
            </p>
          )}
        </div>
      </div>

      {/* Action Bar */}
      <div className="px-4 pb-3 flex items-center gap-1.5 flex-wrap">
        <CliModelDropdown
          targetKey={id}
          presetModels={models}
          activeId={id}
          isActive={state.active}
          friendlyName={d.name}
          isLive={isModelLive}
          isEn={isEn}
          selectedModel={selectedModel}
          isOpen={isDropdownOpen}
          customInputValue={customInputValue}
          onToggleDropdown={onToggleDropdown}
          onSelectModel={onSelectModel}
          onCustomInputChange={onCustomInputChange}
        />

        <button
          type="button"
          onClick={() => onTestPing(id, d.name)}
          disabled={testingPingTarget === id}
          className={cn(
            "px-2.5 py-1 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5 border",
            isNeobrutalism
              ? "bg-[#FFFDFB] text-[#141413] border-2 border-[#141413] shadow-[2px_2px_0px_#141413] hover:bg-[#CCFF00]"
              : ping
              ? ping.success
                ? "bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-strong)]"
                : "bg-[var(--bg-app)] text-[var(--text-muted)] border-[var(--border-color)]"
              : "bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border-[var(--border-color)]"
          )}
          title={isEn ? "Test Ping connection & latency" : "Uji koneksi ping & latensi"}
        >
          {testingPingTarget === id ? (
            <Loader2 className="w-3 h-3 animate-spin text-[var(--text-muted)]" />
          ) : (
            <Wifi className="w-3 h-3 text-[var(--text-muted)]" />
          )}
          <span>
            {testingPingTarget === id
              ? isEn
                ? "Testing..."
                : "Menguji..."
              : isEn
              ? "Test Ping"
              : "Uji Ping"}
          </span>
          {ping && !testingPingTarget && (
            <span
              className={ping.success ? "text-[var(--text-primary)] font-medium" : "text-amber-500"}
              title={ping.success ? undefined : isEn ? "Last check failed" : "Pemeriksaan terakhir gagal"}
            >
              {ping.timeMs}ms
            </span>
          )}
        </button>

        {d.docsUrl && (
          <button
            type="button"
            onClick={() => window.open(d.docsUrl, "_blank")}
            className={cn(
              "px-2.5 py-1 text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5 border",
              isNeobrutalism
                ? "bg-[#FFFDFB] text-[#141413] border-2 border-[#141413] shadow-[2px_2px_0px_#141413] hover:bg-[#CCFF00]"
                : "bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border-[var(--border-color)]"
            )}
            title={isEn ? "Open the vendor page" : "Buka halaman vendor"}
          >
            <Globe className="w-3 h-3" />
            Docs
          </button>
        )}

        <button
          type="button"
          onClick={() => onToggleExpand(id)}
          className={cn(
            "p-1.5 rounded-lg transition-colors cursor-pointer",
            isNeobrutalism
              ? "text-[#141413] hover:bg-[#141413]/10"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          )}
          title={
            expanded
              ? isEn
                ? "Collapse"
                : "Ciutkan"
              : isEn
              ? "Expand for limits & setup"
              : "Buka untuk kuota & panduan"
          }
        >
          <ChevronDown className={cn("w-4 h-4 transition-transform", expanded && "rotate-180")} />
        </button>

        <div className="flex-1" />

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleConnection(id, state.active, d.name);
          }}
          disabled={busy}
          className={cn(
            "px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 select-none group",
            isNeobrutalism
              ? state.active
                ? "bg-[#CCFF00] text-[#141413] border-2 border-[#141413] shadow-[2px_2px_0px_#141413] hover:brightness-95"
                : "bg-[#FFFDFB] text-[#141413] border-2 border-[#141413] shadow-[2px_2px_0px_#141413] hover:bg-[#CCFF00]"
              : state.active
              ? "bg-[var(--text-primary)] hover:opacity-90 text-[var(--bg-app)] border border-[var(--text-primary)]"
              : "bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-strong)]"
          )}
        >
          {busy ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{isEn ? "Connecting..." : "Menghubungkan..."}</span>
            </>
          ) : state.active ? (
            <>
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>{isEn ? "Connected" : "Terhubung"}</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-dim)]" />
              <span>{isEn ? "Connect" : "Hubungkan"}</span>
            </>
          )}
        </button>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-4 pb-3 pt-2 border-t border-[var(--border-color)] space-y-3">
          {renderSetupSteps()}

          {(codexPlan || tokenExpiresAt) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--text-muted)]">
              {codexPlan && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1",
                    codexPlan === "free" ? "text-amber-500" : "text-[var(--text-secondary)] font-medium"
                  )}
                >
                  {isEn ? "Plan" : "Paket"}: {codexPlan}
                </span>
              )}
              {tokenExpiresAt && (
                <span>
                  {isEn ? "Token expires" : "Token berakhir"}:{" "}
                  {new Date(tokenExpiresAt).toLocaleDateString()}
                </span>
              )}
            </div>
          )}

          {d.quota !== "none" && (
            <CliQuotaView
              provider={d.quota}
              quota={quota}
              quotaLoading={quotaLoading}
              isEn={isEn}
              onRefreshQuota={onRefreshQuota}
            />
          )}

          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            {discovered?.hasToken && d.id !== "nineRouter" && !ownsOwnCredential && (
              <button
                type="button"
                onClick={() => onRefreshCred(id as "claude" | "codex")}
                disabled={refreshingTarget === id}
                className="px-2 py-1 bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)] text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1"
                title={isEn ? "Refresh the harvested OAuth token" : "Perbarui token OAuth"}
              >
                <RefreshCw className={cn("w-3 h-3", refreshingTarget === id && "animate-spin")} />
                {refreshingTarget === id
                  ? isEn
                    ? "Refreshing..."
                    : "Memperbarui..."
                  : isEn
                  ? "Refresh token"
                  : "Perbarui token"}
              </button>
            )}

            {d.supportsAutoConfigure && (
              <button
                type="button"
                onClick={() => onInjectCli(id as "claude" | "codex")}
                disabled={injectingTarget === id}
                className="px-2 py-1 bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)] text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1"
              >
                {injectingTarget === id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <SlidersHorizontal className="w-3 h-3" />
                )}
                Auto-Configure CLI
              </button>
            )}

            {d.supportsBrowserLogin && (!state.signedIn || Boolean(refreshErrors[id])) && (
              <button
                type="button"
                onClick={() => onBrowserSignIn(id)}
                disabled={oauthPendingTarget === id}
                className="px-2.5 py-1 bg-[var(--text-primary)] hover:opacity-90 text-[var(--bg-app)] border border-[var(--text-primary)] text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5 disabled:opacity-60"
              >
                {oauthPendingTarget === id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Globe className="w-3 h-3" />
                )}
                {oauthPendingTarget === id
                  ? isEn
                    ? "Waiting for browser..."
                    : "Menunggu browser..."
                  : refreshErrors[id]
                  ? isEn
                    ? "Re-authenticate via browser"
                    : "Masuk ulang via browser"
                  : isEn
                  ? "Sign in with browser"
                  : "Masuk via browser"}
              </button>
            )}

            {state.signedIn && (discovered?.hasToken || d.id === "kiro") && !ownsOwnCredential && (
              <button
                type="button"
                onClick={() => onSignOut(id)}
                disabled={signingOutTarget === id}
                className="px-2 py-1 bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)] rounded text-[10px] font-medium flex items-center gap-1 disabled:opacity-50 cursor-pointer"
              >
                {signingOutTarget === id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <LogOut className="w-3 h-3" />
                )}
                {signingOutTarget === id
                  ? isEn
                    ? "Signing out..."
                    : "Keluar..."
                  : isEn
                  ? "Sign out"
                  : "Keluar"}
              </button>
            )}

            {id === "opencode" && state.signedIn && (
              <button
                type="button"
                onClick={onOpenCodeSignOut}
                disabled={signingOutTarget === id}
                className="px-2 py-1 bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)] rounded text-[10px] font-medium flex items-center gap-1 disabled:opacity-50 cursor-pointer"
              >
                {signingOutTarget === id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <LogOut className="w-3 h-3" />
                )}
                {signingOutTarget === id
                  ? isEn
                    ? "Signing out..."
                    : "Keluar..."
                  : isEn
                  ? "Sign out"
                  : "Keluar"}
              </button>
            )}

            {d.loginMode === "terminal" && !state.signedIn && d.id === "antigravity" && (
              <button
                type="button"
                onClick={onAntigravityCliLogin}
                disabled={isSigningInCli}
                className="px-2 py-1 bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)] text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1"
              >
                {isSigningInCli ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <LogIn className="w-3 h-3" />
                )}
                {isEn ? "Open sign-in terminal" : "Buka terminal login"}
              </button>
            )}

            {state.signedIn && d.id === "antigravity" && (
              <button
                type="button"
                onClick={onAntigravityLogout}
                disabled={isLoggingOutAntigravity}
                className="px-2 py-1 bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)] text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1 disabled:opacity-60"
              >
                {isLoggingOutAntigravity ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <LogOut className="w-3 h-3" />
                )}
                {isLoggingOutAntigravity
                  ? isEn
                    ? "Signing out..."
                    : "Keluar..."
                  : isEn
                  ? "Sign out"
                  : "Keluar"}
              </button>
            )}

            {d.loginMode === "terminal" && d.id !== "antigravity" && (
              <button
                type="button"
                onClick={() => onOpenAuthModal(id)}
                className="px-2 py-1 bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-color)] text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1"
              >
                <SlidersHorizontal className="w-3 h-3" />
                {isEn ? "Auth Method" : "Metode Masuk"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

