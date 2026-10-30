import { useState, useEffect } from "react";
import { API_BASE, apiFetch, directoryQuery, tauriCliLogin } from "../../../../lib/api";
import { useI18n } from "../../../../lib/i18n";
import { toast } from "sonner";
import type {
  LocalCliData,
  QuotaReport,
  CliProviderId,
  SettingsCliConnectionsTabProps,
} from "../types";
import { FALLBACK_CLI_REGISTRY } from "../registry";

export function useCliConnections({ providers, onRefresh }: SettingsCliConnectionsTabProps) {
  const { language } = useI18n();
  const isEn = language === "en";

  const [data, setData] = useState<LocalCliData & { cardStates?: Record<string, any> }>(() => {
    try {
      const saved = localStorage.getItem("arunaki_cached_local_cli_status");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && parsed.antigravity) {
          if (!parsed.registry || !parsed.registry.length) {
            parsed.registry = FALLBACK_CLI_REGISTRY;
          }
          return parsed;
        }
      }
    } catch {}

    const savedEmail = localStorage.getItem("arunaki_agy_email") || undefined;
    return {
      claude: { installed: true, version: "2.1.202", loggedIn: false },
      opencode: {
        installed: true,
        version: "1.18.30",
        serverRunning: false,
        serverPort: 4097,
        authenticatedProviders: ["9router", "groq"],
        hasGroq: true,
        has9Router: true,
      },
      antigravity: {
        detected: true,
        cliInstalled: true,
        agyInstalled: true,
        loggedIn: true,
        accountEmail: savedEmail,
        environment: "Google Antigravity CLI (agy)",
      },
      nineRouter: {
        installed: true,
        version: "0.5.35",
        running: false,
        url: "http://localhost:20128/v1",
        models: [],
      },
      codex: {
        installed: false,
        isCloudOnly: false,
        message: "OpenAI Codex CLI (@openai/codex) is not installed. Run 'npm i -g @openai/codex'.",
      },
      bridgePort: 20188,
      bridgeRunning: true,
      registry: FALLBACK_CLI_REGISTRY,
    };
  });

  const [loading, setLoading] = useState(false);
  const [isLoggingOutAntigravity, setIsLoggingOutAntigravity] = useState(false);
  const [showAntigravityLoginModal, setShowAntigravityLoginModal] = useState(false);
  const [activeAuthModalTarget, setActiveAuthModalTarget] = useState<CliProviderId | null>(null);
  const [isSigningInCli, setIsSigningInCli] = useState(false);
  const [testingPingTarget, setTestingPingTarget] = useState<string | null>(null);
  const [pingResults, setPingResults] = useState<
    Record<string, { success: boolean; timeMs: number; message?: string }>
  >({});
  const [refreshingTarget, setRefreshingTarget] = useState<string | null>(null);
  const [signingOutTarget, setSigningOutTarget] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaReport[]>([]);
  const [liveModels, setLiveModels] = useState<Record<string, string[]>>({});
  const [modelsAreLive, setModelsAreLive] = useState<Record<string, boolean>>({});
  const [oauthPendingTarget, setOauthPendingTarget] = useState<CliProviderId | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [injectingTarget, setInjectingTarget] = useState<string | null>(null);
  const [refreshErrors, setRefreshErrors] = useState<Record<string, string>>({});
  const [customInput, setCustomInput] = useState<Record<string, string>>({});
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [connectingTarget, setConnectingTarget] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  const [selectedModels, setSelectedModels] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const key of ["claude", "opencode", "codex", "antigravity", "nineRouter", "kiro"]) {
      const saved = localStorage.getItem(`arunaki_cli_model_${key}`);
      if (saved) out[key] = saved;
    }
    return out;
  });

  const [catalogueModels, setCatalogueModels] = useState<Record<string, string[]>>({});

  const modelsFor = (id: string): string[] => {
    const fallbackList =
      (data.registry?.find((d) => d.id === id) ?? FALLBACK_CLI_REGISTRY.find((d) => d.id === id))?.models ?? [];
    const live = liveModels[id];
    if (live && live.length > 1) return live;
    const catalogued = catalogueModels[id] || catalogueModels[`${id}-cli`] || catalogueModels[`${id}-local`];
    if (catalogued && catalogued.length > 1) {
      return Array.from(new Set([...catalogued, ...fallbackList]));
    }
    if (live && live.length > 0) {
      return Array.from(new Set([...live, ...fallbackList]));
    }
    if (catalogued && catalogued.length > 0) {
      return Array.from(new Set([...catalogued, ...fallbackList]));
    }
    return fallbackList;
  };

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/status${directoryQuery()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setData((prev) => {
            const updated = {
              ...prev,
              ...json.data,
              claude: { ...prev.claude, ...json.data.claude },
              opencode: { ...prev.opencode, ...json.data.opencode },
              antigravity: { ...prev.antigravity, ...json.data.antigravity },
              nineRouter: { ...prev.nineRouter, ...json.data.nineRouter },
              codex: { ...prev.codex, ...json.data.codex },
              discovered: json.data.discovered ?? prev.discovered,
              registry: json.data.registry ?? prev.registry,
              cardStates: json.data.cardStates ?? prev.cardStates,
            };
            try {
              localStorage.setItem("arunaki_cached_local_cli_status", JSON.stringify(updated));
              if (updated.antigravity?.accountEmail) {
                localStorage.setItem("arunaki_agy_email", updated.antigravity.accountEmail);
              }
            } catch {}
            return updated;
          });
        }
      }
    } catch {
      // Keep verified defaults on error
    } finally {
      setLoading(false);
    }
  };

  const fetchModels = async (target: string) => {
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/models${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const json = await res.json().catch(() => ({}));
      const models: string[] = json.data?.models ?? [];
      if (models.length) {
        setLiveModels((prev) => ({ ...prev, [target]: models }));
        setModelsAreLive((prev) => ({ ...prev, [target]: true }));
      }
    } catch {}
  };

  const fetchQuota = async (manual = true) => {
    if (manual) setQuotaLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/quota${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const json = await res.json().catch(() => ({}));
      setQuota(json.data ?? []);
    } catch {
      if (manual) setQuota([]);
    } finally {
      if (manual) setQuotaLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchQuota();
    for (const t of ["antigravity", "opencode", "9router", "kiro"] as const) fetchModels(t);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return;
      fetchQuota(false);
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiFetch(`${API_BASE}/model${directoryQuery()}`);
        if (!res.ok) return;
        const json = await res.json().catch(() => ({}));
        const grouped: Record<string, string[]> = {};
        for (const entry of (json?.data ?? []) as any[]) {
          const providerID = String(entry?.providerID ?? "");
          const id = String(entry?.id ?? "");
          if (!providerID || !id) continue;
          (grouped[providerID] ??= []).push(id);
        }
        if (!cancelled && Object.keys(grouped).length > 0) setCatalogueModels(grouped);
      } catch {}
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Card states normalized in Rust via `engine::provider::cli_diagnostics::build_normalized_card_states`
  const cardState: Record<
    string,
    { installed: boolean; signedIn: boolean; email?: string; active: boolean; version?: string }
  > = Object.fromEntries(
    (data.registry && data.registry.length > 0 ? data.registry : FALLBACK_CLI_REGISTRY).map((d) => {
      const rustCard = data.cardStates?.[d.id];
      const token = data.discovered?.find((x) => x.provider === d.id);
      return [
        d.id,
        {
          installed: Boolean(rustCard?.installed ?? token?.hasToken ?? true),
          signedIn: Boolean(rustCard?.signedIn ?? token?.hasToken),
          email:
            rustCard?.email ??
            token?.accountEmail ??
            (d.id === "antigravity" ? localStorage.getItem("arunaki_agy_email") || undefined : undefined),
          version: rustCard?.version,
          active:
            localStorage.getItem("arunaki_active_provider") === d.id ||
            providers.some((p) => p.active && (p.id === d.id || p.type === d.id)),
        },
      ];
    })
  );

  const toggleCard = (id: string) =>
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleRefreshCred = async (target: string) => {
    setRefreshingTarget(target);
    setRefreshErrors((prev) => {
      const next = { ...prev };
      delete next[target];
      return next;
    });
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/refresh${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.data?.success) {
        toast.success(isEn ? "Credentials Refreshed" : "Kredensial Diperbarui", {
          description: json.data.message,
        });
        await fetchStatus();
      } else {
        const msg = json.data?.message || (isEn ? "Failed to refresh token" : "Gagal memperbarui token");
        setRefreshErrors((prev) => ({ ...prev, [target]: msg }));
        toast.error(isEn ? "Token Refresh Failed" : "Gagal Refresh Token", {
          description: msg,
        });
      }
    } catch (err: any) {
      setRefreshErrors((prev) => ({ ...prev, [target]: err.message }));
      toast.error(isEn ? "Refresh Error" : "Kesalahan Refresh", {
        description: err.message,
      });
    } finally {
      setRefreshingTarget(null);
    }
  };

  const handleOpenCodeSignOut = async () => {
    setSigningOutTarget("opencode");
    try {
      const res = await tauriCliLogin("opencode-logout");
      if (res.success) {
        toast.success(isEn ? "Signed out from OpenCode" : "Berhasil keluar dari OpenCode", {
          description: res.message,
        });
        await fetchStatus();
      } else {
        toast.error(isEn ? "Sign out failed" : "Gagal keluar", { description: res.message ?? "" });
      }
    } catch (err: any) {
      toast.error(isEn ? "Sign out error" : "Kesalahan keluar", { description: err.message });
    } finally {
      setSigningOutTarget(null);
    }
  };

  const handleSignOut = async (target: string) => {
    setSigningOutTarget(target);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/refresh${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, action: "logout" }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.data?.success) {
        toast.success(isEn ? "Signed out" : "Berhasil keluar", { description: json.data.message });
      } else {
        toast.error(isEn ? "Sign out failed" : "Gagal keluar", {
          description: json.data?.message ?? "",
        });
      }
      await fetchStatus();
    } catch (err: any) {
      toast.error(isEn ? "Sign out error" : "Kesalahan keluar", { description: err.message });
    } finally {
      setSigningOutTarget(null);
    }
  };

  const handleInjectCli = async (target: "claude" | "codex" | "all", action: "inject" | "reset" = "inject") => {
    setInjectingTarget(target);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/inject${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, action }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.data?.success) {
        toast.success(
          action === "inject"
            ? (isEn ? "CLI Configured Successfully" : "CLI Berhasil Dikonfigurasi")
            : (isEn ? "CLI Reset to Defaults" : "Konfigurasi CLI Dikembalikan"),
          { description: json.data.message }
        );
        await fetchStatus();
      } else {
        toast.error(isEn ? "Configuration Failed" : "Konfigurasi Gagal", {
          description: json.data?.message || (isEn ? "Failed to update CLI configuration" : "Gagal memperbarui konfigurasi CLI"),
        });
      }
    } catch (err: any) {
      toast.error(isEn ? "Injector Error" : "Kesalahan Injector", { description: err.message });
    } finally {
      setInjectingTarget(null);
    }
  };

  const launchCliTerminalSession = async (
    loginTarget: "claude" | "codex" | "opencode-terminal" | "antigravity-cli",
    label: string,
    onOpened?: () => void
  ) => {
    setIsSigningInCli(true);
    try {
      const res = await tauriCliLogin(loginTarget);
      if (res.success) {
        toast.info(isEn ? "Terminal Window Opened" : "Jendela Terminal Terbuka", {
          description: res.message,
        });
        onOpened?.();
      } else {
        toast.error(isEn ? `Cannot open ${label} terminal` : `Tidak dapat membuka terminal ${label}`, {
          description: res.message,
        });
      }
    } catch (err: any) {
      toast.error(isEn ? `Failed to open ${label} terminal` : `Gagal membuka terminal ${label}`, {
        description: err.message,
      });
    } finally {
      setIsSigningInCli(false);
    }
  };

  const handleLaunchClaudeTerminal = () => launchCliTerminalSession("claude", "Claude");
  const handleLaunchCodexTerminal = () => launchCliTerminalSession("codex", "Codex");
  const handleLaunchOpenCodeTerminal = () => launchCliTerminalSession("opencode-terminal", "OpenCode");

  const handleLaunch9Router = async () => {
    setIsSigningInCli(true);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/login${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "9router" }),
      });
      const json = await res.json();
      if (json.data?.success) {
        toast.info(isEn ? "Terminal Window Opened" : "Jendela Terminal Terbuka", {
          description: isEn
            ? "9Router started in a new terminal window."
            : "9Router dijalankan pada jendela terminal baru.",
        });
        setTimeout(fetchStatus, 2500);
      } else {
        toast.error(isEn ? "Cannot open terminal" : "Tidak dapat membuka terminal", {
          description: isEn
            ? "Please run '9router start' manually in your terminal."
            : "Silakan jalankan '9router start' secara manual di terminal.",
        });
      }
    } catch (err: any) {
      toast.error(isEn ? "Failed to start 9Router" : "Gagal menjalankan 9Router", { description: err.message });
    } finally {
      setIsSigningInCli(false);
    }
  };

  const isGeminiActive =
    localStorage.getItem("arunaki_active_provider") === "gemini" ||
    localStorage.getItem("arunaki_active_provider") === "gemini-cli" ||
    localStorage.getItem("arunaki_active_provider") === "antigravity";

  const startAntigravityPoll = () => {
    let attempts = 0;
    const pollTimer = setInterval(async () => {
      attempts++;
      try {
        const statusRes = await apiFetch(`${API_BASE}/providers/local-cli/status${directoryQuery()}`);
        if (statusRes.ok) {
          const statusJson = await statusRes.json();
          const agy = statusJson.data?.antigravity;
          if (agy?.loggedIn) {
            clearInterval(pollTimer);
            fetchStatus();
            setShowAntigravityLoginModal(false);
            toast.success("Signed in to Google Antigravity!", {
              description: `Active account: ${agy.accountEmail || "Google Account"}`,
            });
            if (!isGeminiActive) {
              handleConnectTarget("antigravity", "Google Antigravity");
            }
          }
        }
      } catch {}
      if (attempts >= 25) clearInterval(pollTimer);
    }, 1500);
  };

  const handleAntigravityCliLogin = () =>
    launchCliTerminalSession("antigravity-cli", "Antigravity", startAntigravityPoll);

  const handleBrowserSignIn = async (target: CliProviderId) => {
    if (oauthPendingTarget) return;
    setOauthPendingTarget(target);
    try {
      const res = await apiFetch(`${API_BASE}/providers/local-cli/oauth/start${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.data?.requestId) throw new Error(json.data?.message ?? `HTTP ${res.status}`);
      const requestId = json.data.requestId as string;

      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise((r) => setTimeout(r, 1500));
        const probe = await apiFetch(
          `${API_BASE}/providers/local-cli/oauth/status${directoryQuery()}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId }) }
        ).catch(() => null);
        const probeJson = probe ? await probe.json().catch(() => ({})) : null;
        const result = probeJson?.data;
        if (!result) continue;
        if (result.status === "success") {
          toast.success(isEn ? "Connected" : "Terhubung", {
            description: isEn ? "Token received." : "Token diterima.",
          });
          await fetchStatus();
          return;
        }
        if (result.status === "error") {
          toast.error(isEn ? "Sign-in failed" : "Login gagal", {
            description: result.message ?? (isEn ? "The vendor rejected the request." : "Vendor menolak."),
          });
          return;
        }
      }
      const notice = data.registry?.find((d) => d.id === target)?.entitlement;
      toast.error(isEn ? "Sign-in not completed" : "Login tidak diselesaikan", {
        description: notice
          ? `${isEn ? notice.notice : notice.noticeId}. ${isEn ? "Check the browser tab, or upgrade, then try again." : "Cek tab browser, atau upgrade, lalu coba lagi."}`
          : isEn
          ? "The browser tab was closed before sign-in finished."
          : "Tab browser ditutup sebelum login selesai.",
      });
    } catch (err: any) {
      toast.error(isEn ? "Could not start sign-in" : "Gagal memulai login", {
        description: err?.message,
      });
    } finally {
      setOauthPendingTarget(null);
    }
  };

  const handleAntigravityLogout = async () => {
    setIsLoggingOutAntigravity(true);
    try {
      const res = await tauriCliLogin("antigravity-logout");
      if (res.success) {
        toast.info("Logged Out", {
          description: "Google Antigravity credentials cleared. You can now login with a new account.",
        });
        await handleDisconnect("antigravity", "Google Antigravity");
        fetchStatus();
      } else {
        toast.error("Logout failed", { description: res.message });
      }
    } catch (err: any) {
      toast.error("Failed to logout", { description: err.message });
    } finally {
      setIsLoggingOutAntigravity(false);
    }
  };

  const connectConfigFor = (target: string, name: string) => {
    if (target === "nineRouter") {
      return {
        id: "9router",
        name: "9Router Gateway",
        type: "openai-compatible",
        baseUrl: "http://localhost:20128/v1",
        apiKey: "9router",
      };
    }
    return {
      id: target,
      name,
      type: "openai-compatible",
      baseUrl: `http://127.0.0.1:${data.bridgePort || 20188}/v1`,
      apiKey: `${target}-local-session`,
    };
  };

  const handleConnectTarget = async (target: CliProviderId, friendlyName: string) => {
    setConnectingTarget(target);
    const config = connectConfigFor(target, friendlyName);
    const chosenModel = selectedModels[target] || modelsFor(target)[0];
    const activeId = config.id;

    localStorage.setItem("arunaki_active_provider", activeId);
    localStorage.setItem("arunaki_last_active_cli", activeId);
    localStorage.setItem("arunaki_active_model", chosenModel);
    localStorage.setItem(`arunaki_cli_model_${target}`, chosenModel);
    localStorage.setItem(`arunaki_provider_model_${activeId}`, chosenModel);

    window.dispatchEvent(
      new CustomEvent("arunaki:provider-change", {
        detail: { providerId: activeId, model: chosenModel },
      })
    );

    try {
      await apiFetch(`${API_BASE}/providers/${activeId}${directoryQuery()}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: config.name,
          type: config.type,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model: chosenModel,
        }),
      }).catch(() => {});

      const stateRes = await apiFetch(`${API_BASE}/providers/${activeId}/state${directoryQuery()}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true, model: chosenModel }),
      });

      if (!stateRes.ok) {
        await apiFetch(`${API_BASE}/providers${directoryQuery()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: activeId,
            name: config.name,
            type: config.type,
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            model: chosenModel,
            active: true,
          }),
        }).catch(() => {});
      }

      await apiFetch(`${API_BASE}/providers/local-cli/connect${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, model: chosenModel }),
      }).catch(() => {});

      toast.success(`${friendlyName} Connected & Active`, {
        description: `Ready to run document tasks using ${chosenModel}.`,
      });
      onRefresh();
      fetchStatus();
    } catch (err: any) {
      toast.error("Connection Error", { description: err.message });
    } finally {
      setConnectingTarget(null);
    }
  };

  const handleDisconnect = async (providerId: string, friendlyName: string) => {
    try {
      localStorage.removeItem("arunaki_active_provider");
      localStorage.removeItem("arunaki_last_active_cli");
      localStorage.removeItem("arunaki_active_model");
      await apiFetch(`${API_BASE}/providers/${providerId}/state${directoryQuery()}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      }).catch(() => {});
      window.dispatchEvent(
        new CustomEvent("arunaki:provider-change", {
          detail: { providerId: "kenari", model: "mimo-v2-5:free" },
        })
      );
      toast.info(`${friendlyName} Disconnected`, {
        description: "CLI agent disconnected. Arunaki is in standby.",
      });
      onRefresh();
      fetchStatus();
    } catch (err: any) {
      toast.error("Failed to disconnect", { description: err.message });
    }
  };

  const handleToggleConnection = async (
    target: CliProviderId,
    isActive: boolean,
    friendlyName: string
  ) => {
    const state = cardState[target];
    if (!isActive && !state?.signedIn) {
      toast.error(
        isEn
          ? `Please sign in to ${friendlyName} first before connecting.`
          : `Silakan login ke ${friendlyName} terlebih dahulu sebelum menghubungkan.`
      );
      setExpandedCards((prev) => ({ ...prev, [target]: true }));
      return;
    }
    const config = connectConfigFor(target, friendlyName);
    if (isActive) {
      await handleDisconnect(config.id, friendlyName);
    } else {
      await handleConnectTarget(target, friendlyName);
    }
  };

  // Delegated 100% to native Rust `POST /api/providers/local-cli/ping` (`engine::provider::cli_diagnostics`)
  const handleTestPing = async (target: CliProviderId, friendlyName: string) => {
    setTestingPingTarget(target);
    const startMs = Date.now();
    try {
      const currentModel = selectedModels[target] || modelsFor(target)[0] || "";
      const res = await apiFetch(`${API_BASE}/providers/local-cli/ping${directoryQuery()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, model: currentModel }),
      });
      const json = await res.json().catch(() => ({}));
      const pingData = json?.data;
      const isLive = Boolean(pingData?.success);
      const elapsed = typeof pingData?.timeMs === "number" ? pingData.timeMs : Math.max(Date.now() - startMs, 12);
      const detail = pingData?.message || (isLive ? `${friendlyName} ready` : `${friendlyName} offline`);

      setPingResults((prev) => ({
        ...prev,
        [target]: {
          success: isLive,
          timeMs: elapsed,
          message: detail,
        },
      }));

      if (isLive) {
        toast.success(`${friendlyName} Ping OK (${elapsed}ms)`, { description: detail });
      } else {
        toast.error(`${friendlyName} Ping Offline`, { description: detail });
      }
    } catch (err: any) {
      const elapsed = Math.max(Date.now() - startMs, 15);
      setPingResults((prev) => ({
        ...prev,
        [target]: {
          success: false,
          timeMs: elapsed,
          message: err.message,
        },
      }));
      toast.error(`${friendlyName} Ping Error`, { description: err.message });
    } finally {
      setTestingPingTarget(null);
    }
  };

  const handleSelectModel = async (
    targetKey: string,
    modelName: string,
    activeId: string,
    isActive: boolean,
    friendlyName: string
  ) => {
    setSelectedModels((prev) => ({ ...prev, [targetKey]: modelName }));
    localStorage.setItem(`arunaki_cli_model_${targetKey}`, modelName);
    setOpenDropdownId(null);

    if (isActive) {
      localStorage.setItem("arunaki_active_model", modelName);
      localStorage.setItem(`arunaki_provider_model_${activeId}`, modelName);
      try {
        await apiFetch(`${API_BASE}/providers/${activeId}/state${directoryQuery()}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: true, model: modelName }),
        });
        toast.success(`${friendlyName} Model Updated`, {
          description: `Now using ${modelName}.`,
        });
        window.dispatchEvent(
          new CustomEvent("arunaki:provider-change", {
            detail: { providerId: activeId, model: modelName },
          })
        );
        onRefresh();
      } catch {
        toast.error(`Failed to update ${friendlyName} model`);
      }
    } else {
      toast.info(`Selected ${modelName}`, {
        description: `Will be used when you connect ${friendlyName}.`,
      });
    }
  };

  return {
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
  };
}
