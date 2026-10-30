import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { API_BASE, apiFetch } from "../../../lib/api";

export interface TelegramStatus {
  connected: boolean;
  botUsername?: string | null;
  botFirstName?: string | null;
  lastActive?: number | null;
  lastError?: string | null;
}

export interface TelegramTestResult {
  success: boolean;
  botUsername?: string;
  botFirstName?: string;
  error?: string;
}

export function useMessagingSettings() {
  const [enabled, setEnabled] = useState(false);
  const [botToken, setBotToken] = useState("");
  const [allowedUserId, setAllowedUserId] = useState("");
  const [targetFolder, setTargetFolder] = useState("");
  const [showToken, setShowToken] = useState(false);

  const [showGuideModal, setShowGuideModal] = useState(false);
  const [guideInitialStep, setGuideInitialStep] = useState(1);

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
  const [testResult, setTestResult] = useState<TelegramTestResult | null>(null);

  const fetchConfigAndStatus = useCallback(async () => {
    try {
      setLoading(true);
      let [configRes, statusRes] = await Promise.all([
        apiFetch(`${API_BASE}/messaging/config`),
        apiFetch(`${API_BASE}/messaging/status`),
      ]);

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
      } catch {}

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
      toast.info("Folder picker is available in the desktop application.");
    } catch {
      toast.error("Failed to open folder picker.");
    }
  };

  return {
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
  };
}
