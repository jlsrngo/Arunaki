import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { API_BASE, apiFetch } from "../../../lib/api";

export interface PosConnectionStatus {
  connected: boolean;
  store?: string;
  operator?: {
    nama: string;
    kode: string;
    level: string;
  };
  permissions?: Record<string, string>;
  message?: string;
}

const STORAGE_KEY = "arunaki_pos_config";

export function useAppConnections() {
  const [hostUrl, setHostUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [showApiKey, setShowApiKey] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [status, setStatus] = useState<PosConnectionStatus>({
    connected: false,
  });

  const [autoDetecting, setAutoDetecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [guideInitialStep, setGuideInitialStep] = useState(1);

  // Load saved config on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.hostUrl) setHostUrl(parsed.hostUrl);
        if (parsed.apiKey) setApiKey(parsed.apiKey);
        if (parsed.username) setUsername(parsed.username);
        if (parsed.password) setPassword(parsed.password);
        if (parsed.status) setStatus(parsed.status);
      } else {
        apiFetch(`${API_BASE}/desktop/pos-config`)
          .then(async (res) => {
            if (res.ok) {
              const json = await res.json();
              if (json?.data) {
                if (json.data.hostUrl) setHostUrl(json.data.hostUrl);
                if (json.data.apiKey) setApiKey(json.data.apiKey);
                if (json.data.username) setUsername(json.data.username);
                if (json.data.password) setPassword(json.data.password);
                if (json.data.status) setStatus(json.data.status);
              }
            }
          })
          .catch(() => {});
      }
    } catch (e) {
      console.warn("Failed to read ArunakiZen config from localStorage:", e);
    }
  }, []);

  const handleAutoDetect = useCallback(async () => {
    setAutoDetecting(true);
    let detectedUrl: string | null = null;

    try {
      try {
        const probeRes = await apiFetch(`${API_BASE}/desktop/pos-detect`);
        if (probeRes.ok) {
          const json = await probeRes.json();
          if (json?.data?.hostUrl) {
            detectedUrl = json.data.hostUrl;
          }
        }
      } catch {}

      if (!detectedUrl) {
        const portsToProbe = [8000, 3000, 8080, 5000, 80, 8088];
        for (const port of portsToProbe) {
          try {
            const probeUrl = `http://127.0.0.1:${port}/api/pos/v1/ping`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 600);
            const pingRes = await fetch(probeUrl, {
              method: "GET",
              signal: controller.signal,
            }).catch(() => null);
            clearTimeout(timeoutId);

            if (pingRes && (pingRes.ok || pingRes.status === 401 || pingRes.status === 403)) {
              detectedUrl = `http://127.0.0.1:${port}`;
              break;
            }
          } catch {}
        }
      }

      if (detectedUrl) {
        setHostUrl(detectedUrl);
        toast.success(`ArunakiZen server auto-detected at ${detectedUrl}!`);
      } else {
        setHostUrl("http://127.0.0.1:8000");
        toast.info("Auto-detect default: http://127.0.0.1:8000");
      }
    } finally {
      setAutoDetecting(false);
    }
  }, []);

  const handleTestConnection = useCallback(async () => {
    if (!hostUrl.trim()) {
      toast.error("Please enter or auto-detect Host URL first.");
      return;
    }

    setTesting(true);
    try {
      const payload = {
        hostUrl: hostUrl.trim(),
        apiKey: apiKey.trim(),
        username: username.trim(),
        password: password.trim(),
      };

      const res = await apiFetch(`${API_BASE}/desktop/pos-test`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      let json: any = null;
      try {
        json = await res.json();
      } catch {}

      if (res.ok && json?.data?.connected) {
        const st: PosConnectionStatus = {
          connected: true,
          store: json.data.store || "ArunakiZen Central Store",
          operator: json.data.operator || {
            nama: username || "Administrator",
            kode: "OP-01",
            level: "admin",
          },
          permissions: json.data.permissions || {
            canReadInventory: "true",
            canReadSales: "true",
            canCreateDraftDraft: "true",
          },
          message: "Handshake verified successfully.",
        };
        setStatus(st);
        toast.success("Connected to ArunakiZen Server!", {
          description: `Store: ${st.store} (${st.operator?.nama})`,
        });
      } else {
        const errMessage = json?.data?.message || json?.error || "Connection failed. Please check Host URL & credentials.";
        setStatus({
          connected: false,
          message: errMessage,
        });
        toast.error("Handshake Failed", { description: errMessage });
      }
    } catch (err: any) {
      const msg = err?.message || "Failed to reach Arunaki desktop bridge.";
      setStatus({ connected: false, message: msg });
      toast.error("Connection Test Error", { description: msg });
    } finally {
      setTesting(false);
    }
  }, [hostUrl, apiKey, username, password]);

  const handleSave = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      setSaving(true);

      const config = {
        hostUrl: hostUrl.trim(),
        apiKey: apiKey.trim(),
        username: username.trim(),
        password: password.trim(),
        status,
      };

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));

        await apiFetch(`${API_BASE}/desktop/pos-config`, {
          method: "POST",
          body: JSON.stringify(config),
        }).catch(() => {});

        toast.success("ArunakiZen connection settings saved.");
      } catch (err: any) {
        toast.error("Failed to save configuration:", { description: err?.message });
      } finally {
        setSaving(false);
      }
    },
    [hostUrl, apiKey, username, password, status]
  );

  return {
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
  };
}

