import { useState, useEffect } from "react";
import { Cpu, User, Sliders, MessageSquare, Terminal } from "lucide-react";
import { cn } from "../lib/utils";
import { API_BASE, apiFetch, directoryQuery } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { ModelProviderSettings, Provider } from "../components/settings/ModelProviderSettings";
import { SettingsCliConnectionsTab } from "../components/settings/SettingsCliConnectionsTab";
import { SettingsAccountTab } from "../components/settings/SettingsAccountTab";
import { SettingsAutomationTab } from "../components/settings/SettingsAutomationTab";
import { SettingsMessagingTab } from "../components/settings/SettingsMessagingTab";

export function SettingsPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState("models");

  const tabs = [
    { id: "models", label: t("modelRouting", "Model Providers"), icon: Cpu },
    { id: "cli", label: t("cliConnections", "Connection CLI"), icon: Terminal },
    { id: "integrations", label: t("desktopAutomation", "Office Automation"), icon: Sliders },
    { id: "messaging", label: t("messagingApps", "Messaging Apps"), icon: MessageSquare },
    { id: "account", label: t("accountLicense", "Account & License"), icon: User },
  ];
  const [providers, setProviders] = useState<Provider[]>([]);
  const [availableCatalogModels, setAvailableCatalogModels] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  const fetchProviders = async () => {
    try {
      // 1. Fetch user-configured providers from /api/providers and catalog models from /api/model
      const [providersRes, modelRes] = await Promise.all([
        apiFetch(`${API_BASE}/providers${directoryQuery()}`),
        apiFetch(`${API_BASE}/model${directoryQuery()}`),
      ]);

      const mJson = modelRes.ok ? await modelRes.json() : { data: [] };
      const rawModels: any[] = mJson.data || [];

      // Build a catalog lookup of all discovered models per provider ID
      const catalogMap: Record<string, string[]> = {};
      for (const m of rawModels) {
        if (m.providerID) {
          catalogMap[m.providerID] = catalogMap[m.providerID] || [];
          catalogMap[m.providerID].push(m.id);
        }
      }
      setAvailableCatalogModels(catalogMap);

      if (providersRes.ok) {
        const pJson = await providersRes.json();
        const rawProviders: any[] = pJson.data || [];

        if (rawProviders.length > 0) {
          const savedActiveId = localStorage.getItem("arunaki_active_provider");
          const CLI_PROVIDER_IDS = ["claude-code", "codex", "gemini", "opencode", "9router"];
          const isCliActive = savedActiveId && CLI_PROVIDER_IDS.includes(savedActiveId);

          const activeId = isCliActive
            ? null
            : (savedActiveId && rawProviders.some((p: any) => p.id === savedActiveId)
                ? savedActiveId
                : (rawProviders.find((p: any) => p.active)?.id || null));

          const mapped: Provider[] = rawProviders.map((p: any, idx: number) => {
            const savedSelected = localStorage.getItem("arunaki_provider_models_" + p.id);
            const associatedModels = rawModels.filter((m: any) => m.providerID === p.id);
            let modelNames = "";
            if (savedSelected && savedSelected.trim()) {
              modelNames = savedSelected.trim();
            } else if (p.model && p.model.trim()) {
              modelNames = p.model.trim();
            } else {
              const defaults = catalogMap[p.id] || associatedModels.map((m: any) => m.id);
              modelNames = defaults.slice(0, 3).join(", ") || "default";
            }

            const rawKey = p.apiKey || "";
            const isMasked = rawKey.includes("•") || rawKey.includes("****");
            const cleanKey = isMasked ? "" : rawKey;
            const isActive = p.id === activeId;

            return {
              id: p.id,
              name: p.name || p.id,
              type: p.type || "openai-compatible",
              baseUrl: p.baseUrl || "",
              apiKey: cleanKey,
              model: modelNames,
              active: isActive,
              priority: p.priority ?? idx + 1,
            };
          });

          setProviders(mapped);
          return;
        }
      }

      setProviders([]);
    } catch (err) {
      console.error("Failed to fetch providers:", err);
      setProviders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-primary)] overflow-y-auto select-none p-6 transition-colors duration-150">
      <div className="max-w-5xl w-full mx-auto flex-1 flex flex-col min-h-0">
        {/* Header Title */}
        <div className="mb-4">
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            {t("settingsTitle", "Workstation System Settings")}
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {t("settingsSubtitle", "Configure model routing, desktop office automation behavior, and user account licensing.")}
          </p>
        </div>

        {/* Tab Navigation Pill Bar (Monochrome) */}
        <div className="flex items-center gap-2 border-b border-[var(--border-color)] pb-3 mb-6 overflow-x-auto shrink-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer border whitespace-nowrap h-10 select-none",
                  isActive
                    ? "bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-strong)] shadow-xs font-semibold"
                    : "bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border-transparent"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Main Settings Panel Content */}
        <div className="flex-1 w-full bg-[var(--bg-panel)] rounded-2xl border border-[var(--border-color)] p-6 overflow-y-auto min-h-0 transition-colors duration-150">
          {activeTab === "models" && (
            <ModelProviderSettings
              providers={providers}
              availableCatalogModels={availableCatalogModels}
              loading={loading}
              onRefresh={fetchProviders}
            />
          )}

          {activeTab === "cli" && (
            <SettingsCliConnectionsTab
              providers={providers}
              onRefresh={fetchProviders}
            />
          )}

          {activeTab === "integrations" && <SettingsAutomationTab />}
          {activeTab === "messaging" && <SettingsMessagingTab />}

          {activeTab === "account" && <SettingsAccountTab />}
        </div>
      </div>
    </div>
  );
}
