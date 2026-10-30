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
          localStorage.setItem(poolKey, fallbackDefaults.join(", "));
        } else {
          const currentList = currentPoolStr.split(",").map((s) => s.trim()).filter(Boolean);
          const valid = currentList.filter((m) => liveModels.includes(m));
          const updated = valid.length > 0 ? valid : fallbackDefaults;
          localStorage.setItem(poolKey, updated.join(", "));
        }
      } catch { /* single provider fail — skip, don't break loop */ }
    }

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
  try {
    const kiroPool = localStorage.getItem("arunaki_provider_models_kiro");
    if (kiroPool && !kiroPool.split(",").some((m) => m.trim().startsWith("kiro/"))) {
      localStorage.removeItem("arunaki_provider_models_kiro");
    }
  } catch {}

  if (!localStorage.getItem("arunaki_active_provider")) {
    localStorage.setItem("arunaki_active_provider", "kenari");
  }
  if (!localStorage.getItem("arunaki_active_model")) {
    localStorage.setItem("arunaki_active_model", (DEFAULT_MODELS.kenari || [])[0] || "nemotron-3-super-120b-a12b:free");
  }
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
        position="bottom-left" 
        offset="28px"
        visibleToasts={1}
        toastOptions={{
          style: {
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            borderColor: 'var(--border-strong)',
            borderRadius: '9999px',
            padding: '4px 10px',
            minHeight: '26px',
            height: '26px',
            width: 'fit-content',
            maxWidth: '260px',
          },
          className: '!border !px-2.5 !py-1 !text-[10.5px] !rounded-full !w-fit !max-w-[260px] !min-h-0 !h-[26px] !flex !items-center !gap-1.5 !whitespace-nowrap !overflow-hidden !',
          classNames: {
            title: '!text-[var(--text-primary)] !font-medium !text-[10.5px] !leading-none !truncate !whitespace-nowrap',
            description: '!hidden',
            icon: '!text-[var(--text-primary)] !w-3 !h-3 !shrink-0 !m-0',
            toast: '!bg-[var(--bg-card)] !border-[var(--border-strong)] !text-[var(--text-primary)] !rounded-full !px-2.5 !py-1 !h-[26px] !min-h-0 !w-fit !max-w-[260px]',
          },
          duration: 2000,
        }}
      />
      <ErrorBoundary fullScreen fallbackTitle="Workstation encountered an unexpected error">
        <RouterComponent>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={null} />
              <Route path="/workspace" element={<Navigate to="/" replace />} />
              <Route path="/tasks" element={null} />
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
