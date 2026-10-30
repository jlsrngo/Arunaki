import { Terminal, RefreshCw, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";
import type {
  ClaudeCliStatus,
  OpenCodeStatus,
  CliProviderDescriptor,
  AntigravityStatus,
  NineRouterStatus,
  CodexStatus,
  KiroStatus,
  DiscoveredCliItem,
  LocalCliData,
  QuotaBucket,
  QuotaReport,
  ModelMeta,
  CliProviderId,
  SettingsCliConnectionsTabProps,
} from "./cli/types";
import { describeModel } from "./cli/modelDescribe";
import { MultiProviderAuthModal } from "./cli/MultiProviderAuthModal";
import { FALLBACK_CLI_REGISTRY } from "./cli/registry";
import { useCliConnections } from "./cli/hooks/useCliConnections";
import { CliProviderCard } from "./cli/components/CliProviderCard";

export type {
  ClaudeCliStatus,
  OpenCodeStatus,
  CliProviderDescriptor,
  AntigravityStatus,
  NineRouterStatus,
  CodexStatus,
  KiroStatus,
  DiscoveredCliItem,
  LocalCliData,
  QuotaBucket,
  QuotaReport,
  ModelMeta,
  CliProviderId,
  SettingsCliConnectionsTabProps,
};
export { describeModel, FALLBACK_CLI_REGISTRY };

export function SettingsCliConnectionsTab({
  providers,
  onRefresh,
}: SettingsCliConnectionsTabProps) {
  const {
    isEn,
    data,
    loading,
    isLoggingOutAntigravity,
    showAntigravityLoginModal,
    setShowAntigravityLoginModal,
    activeAuthModalTarget,
    setActiveAuthModalTarget,
    isSigningInCli,
    testingPingTarget,
    pingResults,
    refreshingTarget,
    signingOutTarget,
    oauthPendingTarget,
    quota,
    quotaLoading,
    injectingTarget,
    refreshErrors,
    customInput,
    setCustomInput,
    openDropdownId,
    setOpenDropdownId,
    connectingTarget,
    selectedModels,
    expandedCards,
    modelsAreLive,
    cardState,
    modelsFor,
    fetchStatus,
    fetchQuota,
    toggleCard,
    handleRefreshCred,
    handleOpenCodeSignOut,
    handleSignOut,
    handleInjectCli,
    handleLaunchClaudeTerminal,
    handleLaunchCodexTerminal,
    handleLaunchOpenCodeTerminal,
    handleLaunch9Router,
    handleBrowserSignIn,
    handleAntigravityCliLogin,
    handleAntigravityLogout,
    handleToggleConnection,
    handleTestPing,
    handleSelectModel,
  } = useCliConnections({ providers, onRefresh });

  const registryList =
    data.registry && data.registry.length > 0 ? data.registry : FALLBACK_CLI_REGISTRY;

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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          <span>{isEn ? "Scan All Agents" : "Pindai Semua Agen"}</span>
        </button>
      </div>

      {/* Every card below comes from the engine registry */}
      <div className="space-y-2 w-full">
        {registryList.map((descriptor) => {
          const id = descriptor.id as CliProviderId;
          const state = cardState[id] ?? {
            installed: false,
            signedIn: false,
            active: false,
          };
          const expanded = Boolean(expandedCards[id]);
          const busy = connectingTarget === id;

          return (
            <CliProviderCard
              key={descriptor.id}
              descriptor={descriptor}
              state={state}
              isEn={isEn}
              loading={loading}
              expanded={expanded}
              busy={busy}
              data={data}
              ping={pingResults[id]}
              testingPingTarget={testingPingTarget}
              refreshErrors={refreshErrors}
              refreshingTarget={refreshingTarget}
              injectingTarget={injectingTarget}
              oauthPendingTarget={oauthPendingTarget}
              signingOutTarget={signingOutTarget}
              isSigningInCli={isSigningInCli}
              isLoggingOutAntigravity={isLoggingOutAntigravity}
              quota={quota}
              quotaLoading={quotaLoading}
              models={modelsFor(id)}
              isModelLive={Boolean(modelsAreLive[id])}
              selectedModel={selectedModels[id]}
              isDropdownOpen={openDropdownId === id}
              customInputValue={customInput[id] || ""}
              onToggleConnection={handleToggleConnection}
              onTestPing={handleTestPing}
              onToggleExpand={toggleCard}
              onRefreshQuota={() => fetchQuota(true)}
              onRefreshCred={handleRefreshCred}
              onInjectCli={handleInjectCli}
              onBrowserSignIn={handleBrowserSignIn}
              onSignOut={handleSignOut}
              onOpenCodeSignOut={handleOpenCodeSignOut}
              onAntigravityCliLogin={handleAntigravityCliLogin}
              onAntigravityLogout={handleAntigravityLogout}
              onOpenAuthModal={(target) => setActiveAuthModalTarget(target)}
              onToggleDropdown={() => setOpenDropdownId(openDropdownId === id ? null : id)}
              onSelectModel={handleSelectModel}
              onCustomInputChange={(val) => setCustomInput((prev) => ({ ...prev, [id]: val }))}
            />
          );
        })}

        {(data.discovered ?? []).some((x) => x.hasToken) && (
          <div className="px-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] flex items-center justify-center flex-wrap gap-3">
            <div className="flex items-center justify-center flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
              <Sparkles className="w-4 h-4 text-[var(--text-primary)] shrink-0" />
              <span className="font-semibold text-[var(--text-primary)]">Discovered Local Caches:</span>
              {(data.discovered ?? [])
                .filter((x) => x.hasToken)
                .map((x) => (
                  <span
                    key={x.provider}
                    className="inline-flex items-center gap-1 text-[var(--text-primary)] font-medium"
                  >
                    {x.displayName || x.provider} &middot; OK
                  </span>
                ))}
            </div>
            <button
              type="button"
              onClick={() => handleRefreshCred("all")}
              disabled={refreshingTarget === "all"}
              className="px-2.5 py-1 bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)] text-[11px] rounded-lg transition-all cursor-pointer font-medium flex items-center gap-1.5 shrink-0"
              title="Refresh all harvested credentials"
            >
              <RefreshCw
                className={cn(
                  "w-3 h-3",
                  refreshingTarget === "all" && "animate-spin text-[var(--text-muted)]"
                )}
              />
              <span>{refreshingTarget === "all" ? "Refreshing..." : "Refresh All"}</span>
            </button>
          </div>
        )}
      </div>

      {/* Multi-Provider Auth Modal */}
      <MultiProviderAuthModal
        target={activeAuthModalTarget || (showAntigravityLoginModal ? "antigravity" : null)}
        data={data}
        isEn={isEn}
        isSigningInCli={isSigningInCli}
        onClose={() => {
          setActiveAuthModalTarget(null);
          setShowAntigravityLoginModal(false);
        }}
        onLaunchClaudeTerminal={handleLaunchClaudeTerminal}
        onLaunchCodexTerminal={handleLaunchCodexTerminal}
        onLaunchOpenCodeTerminal={handleLaunchOpenCodeTerminal}
        onLaunch9Router={handleLaunch9Router}
        onAntigravityCliLogin={handleAntigravityCliLogin}
      />
    </div>
  );
}
