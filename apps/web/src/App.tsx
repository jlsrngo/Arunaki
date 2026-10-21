import { BrowserRouter, HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { AppLayout } from "./components/layout/AppLayout";
import { useTheme, getSystemTheme } from "./lib/theme";
import { DEFAULT_MODELS } from "./components/settings/constants";
import { API_BASE, apiFetch, directoryQuery } from "./lib/api";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
    },
  },
});
const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:';
const RouterComponent = isFileProtocol ? HashRouter : BrowserRouter;

// Auto-refresh model catalog from API on app launch (fire-and-forget, non-blocking).
// Dead/discontinued models automatically disappear, while preserving the user's curated active routing pool (never bloated with all 80+ models).
async function refreshModelCatalog() {
  try {
    const res = await apiFetch(`${API_BASE}/providers${directoryQuery()}`);
    const data = await res.json();
    const providers: Array<{ id?: string; baseUrl?: string; apiKey?: string; model?: string }> =
      data?.data || data || [];

    for (const p of providers) {
      if (!p.id || !p.baseUrl) continue;
      // The local bridge answers /models with every provider it fronts, not just this one, so syncing
      // a bridge-routed provider against it would hand Kiro Claude's and OpenCode's models. Those
      // providers are refreshed by their own Connect, which asks the account instead.
      if (/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(p.baseUrl)) continue;
      try {
        const modelsRes = await apiFetch(`${API_BASE}/providers/fetch-models${directoryQuery()}`, {
          method: "POST",
          body: JSON.stringify({ baseUrl: p.baseUrl, apiKey: p.apiKey, providerId: p.id }),
        });
        const modelsData = await modelsRes.json();
        const liveModels: string[] = (modelsData?.data?.models || []).filter(Boolean);
        if (liveModels.length === 0) continue;

        const poolKey = `arunaki_provider_models_${p.id}`;
        const currentPoolStr = localStorage.getItem(poolKey);
        const defaultList = DEFAULT_MODELS[p.id] || DEFAULT_MODELS["openai-compatible"] || [];
        const curatedDefaults = defaultList.filter((m) => liveModels.includes(m));
        const fallbackDefaults = curatedDefaults.length > 0 ? curatedDefaults : liveModels.slice(0, 5);

        if (!currentPoolStr) {
          // Initialize new pool with curated defaults (max 5)
          localStorage.setItem(poolKey, fallbackDefaults.join(", "));
        } else {
          const currentList = currentPoolStr.split(",").map((s) => s.trim()).filter(Boolean);
          // Keep user's active choices, but remove discontinued models that no longer exist in live API catalog
          const valid = currentList.filter((m) => liveModels.includes(m));
          const updated = valid.length > 0 ? valid : fallbackDefaults;
          localStorage.setItem(poolKey, updated.join(", "));
        }
      } catch { /* single provider fail — skip, don't break loop */ }
    }

    // Validate active model still exists in its provider's pool
    const activeProvider = localStorage.getItem("arunaki_active_provider") || "kenari";
    const activeModel = localStorage.getItem("arunaki_active_model");
    const pool = localStorage.getItem(`arunaki_provider_models_${activeProvider}`);
    if (pool) {
      const poolList = pool.split(",").map((s) => s.trim()).filter(Boolean);
      if (!activeModel || !poolList.includes(activeModel.trim())) {
        if (poolList[0]) localStorage.setItem("arunaki_active_model", poolList[0]);
      }
    }
  } catch { /* offline or API unavailable — keep cached localStorage values */ }
}

if (typeof window !== "undefined") {
  // A build that let "Sync from API" overwrite Kiro's config with the shared bridge's catalogue also
  // wrote those ids into this browser's storage, and nothing ever cleaned them up: Kiro's pool read
  // "gemini-3.8-flash, claude-sonnet-5-5, ..." and the chat then asked Kiro for Gemini models. The
  // model ids the bridge routes to Kiro all carry the kiro/ prefix, so a pool with none of them is
  // not a Kiro pool whatever else it holds. Dropped on sight rather than migrated.
  try {
    const kiroPool = localStorage.getItem("arunaki_provider_models_kiro");
    if (kiroPool && !kiroPool.split(",").some((m) => m.trim().startsWith("kiro/"))) {
      localStorage.removeItem("arunaki_provider_models_kiro");
    }
  } catch {}

  // Ensure default provider is set
  if (!localStorage.getItem("arunaki_active_provider")) {
    localStorage.setItem("arunaki_active_provider", "kenari");
  }
  // Ensure default active model for first-time users
  if (!localStorage.getItem("arunaki_active_model")) {
    localStorage.setItem("arunaki_active_model", (DEFAULT_MODELS.kenari || [])[0] || "nemotron-3-super-120b-a12b:free");
  }
  // Defer catalog refresh until after initial UI hydration so launch stays fast and responsive
  setTimeout(() => {
    refreshModelCatalog();
  }, 3000);
}

export default function App() {
  const { theme } = useTheme();
  const effectiveTheme = theme === 'system' ? getSystemTheme() : theme;

  return (
    <QueryClientProvider client={queryClient}>
      <Toaster 
        theme={effectiveTheme as 'light' | 'dark'} 
        position="top-center" 
        offset="52px"
        visibleToasts={1}
        toastOptions={{
          className: 'dark:!bg-[#1C1C1F]/90 dark:!text-[#F4F4F5] dark:!border-[#323232] !bg-white/90 !text-[#111827] !border-[#E5E7EB] !rounded-full !shadow-none !px-4 !py-2 !text-[11px] !font-medium tracking-wide backdrop-blur-md flex items-center gap-2 justify-center border',
          duration: 3000,
        }}
      />
      <ErrorBoundary fullScreen fallbackTitle="Workstation encountered an unexpected error">
        <RouterComponent>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={null} />
              <Route path="/workspace" element={<Navigate to="/" replace />} />
              <Route path="/knowledge" element={null} />
              <Route path="/history" element={null} />
              <Route path="/settings" element={null} />
            </Route>
          </Routes>
        </RouterComponent>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
