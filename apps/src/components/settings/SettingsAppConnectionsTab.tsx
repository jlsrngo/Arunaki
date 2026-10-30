import { useState, useEffect, useCallback, memo } from "react";
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
  HelpCircle,
} from "lucide-react";
import { ArunakiZenSetupGuideModal } from "./ArunakiZenSetupGuideModal";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";
import { API_BASE, apiFetch } from "../../lib/api";

interface PosConnectionStatus {
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

export const SettingsAppConnectionsTab = memo(function SettingsAppConnectionsTab() {
  const { t } = useI18n();

  // All React Hooks declared unconditionally at top level
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
        // Query backend engine pos-config if available
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

  // Auto Detect ArunakiZen Port
  const handleAutoDetect = useCallback(async () => {
    setAutoDetecting(true);
    let detectedUrl: string | null = null;

    try {
      // 1. Try querying backend engine endpoint if available
      try {
        const res = await apiFetch(`${API_BASE}/pos/status`);
        if (res.ok) {
          const json = await res.json();
          if (json?.data?.url) {
            detectedUrl = json.data.url;
            if (json?.data?.apiKey && !apiKey) setApiKey(json.data.apiKey);
          }
        }
      } catch {}

      // 2. Direct probe hunting ports 5000 - 5010
      if (!detectedUrl) {
        const ports = [5000, 5001, 5002, 5003, 5004, 5005];
        for (const port of ports) {
          const candidate = `http://127.0.0.1:${port}`;
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 600);
            const res = await fetch(`${candidate}/api/health`, {
              signal: controller.signal,
            }).catch(() => null);
            clearTimeout(timeoutId);
            if (res && (res.ok || res.status === 401)) {
              detectedUrl = candidate;
              break;
            }
          } catch {}
        }
      }

      if (detectedUrl) {
        setHostUrl(detectedUrl);
        toast.success(`${t("posToastPortDetected", "ArunakiZen detected at:")} ${detectedUrl}`);
      } else {
        toast.info(t("posToastPortNotFound", "No active local ArunakiZen server detected. Start ArunakiZen or enter your server Host URL manually."));
      }
    } finally {
      setAutoDetecting(false);
    }
  }, [t]);

  // Handshake connection test
  const handleTestConnection = useCallback(async () => {
    const cleanHost = hostUrl.trim().replace(/\/+$/, "");
    const cleanKey = apiKey.trim();
    const cleanUser = username.trim();

    if (!cleanHost || !cleanKey || !cleanUser || !password) {
      toast.error(t("posFillRequired", "Please fill in Host URL, API Key, Operator Username, and Password."));
      return;
    }

    setTesting(true);
    try {
      // Handshake endpoint in ArunakiZen is /api/external/auth/handshake (or /external/auth/handshake)
      let res: Response | null = null;
      let data: any = null;

      try {
        res = await fetch(`${cleanHost}/api/external/auth/handshake`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cleanKey}`,
          },
          body: JSON.stringify({
            username: cleanUser,
            password: password,
            api_key: cleanKey,
          }),
        });
        if (res.ok) {
          data = await res.json();
        }
      } catch (e) {
        // Fallback without /api prefix
        try {
          res = await fetch(`${cleanHost}/external/auth/handshake`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${cleanKey}`,
            },
            body: JSON.stringify({
              username: cleanUser,
              password: password,
              api_key: cleanKey,
            }),
          });
          if (res.ok) {
            data = await res.json();
          }
        } catch {}
      }

      if (!res || !res.ok || !data?.success) {
        const errorMsg = data?.error || data?.message || (res ? `HTTP ${res.status}` : t("posConnectionFailed", "Connection failed or ArunakiZen server not reachable"));
        throw new Error(errorMsg);
      }

      const newStatus: PosConnectionStatus = {
        connected: true,
        store: data.store || "ArunakiZen Store",
        operator: data.operator || { nama: cleanUser, kode: "KS", level: "KS" },
        permissions: data.permissions || {},
        message: data.message,
      };

      setStatus(newStatus);

      // Persist verified config
      const verifiedPayload = {
        hostUrl: cleanHost,
        apiKey: cleanKey,
        username: cleanUser,
        password: password,
        status: newStatus,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(verifiedPayload));
      apiFetch(`${API_BASE}/desktop/pos-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(verifiedPayload),
      }).catch(() => {});

      toast.success(
        `${t("posHandshakeSuccess", "Successfully connected to ArunakiZen as operator")} '${newStatus.operator?.nama}' (${newStatus.store})`
      );
    } catch (err: any) {
      setStatus({ connected: false });
      toast.error(`${t("posHandshakeFailed", "Connection handshake failed")}: ${err.message}`);
    } finally {
      setTesting(false);
    }
  }, [hostUrl, apiKey, username, password, t]);

  // Save Settings
  const handleSaveConfig = useCallback(() => {
    setSaving(true);
    try {
      const cleanHost = hostUrl.trim().replace(/\/+$/, "");
      const cleanKey = apiKey.trim();
      const cleanUser = username.trim();

      const configPayload = {
        hostUrl: cleanHost,
        apiKey: cleanKey,
        username: cleanUser,
        password: password,
        status: status,
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(configPayload));
      apiFetch(`${API_BASE}/desktop/pos-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configPayload),
      }).catch(() => {});

      toast.success(t("posConfigSavedSuccess", "ArunakiZen configuration saved successfully."));
    } catch (err: any) {
      toast.error(`${t("posToastSaveFailed", "Failed to save configuration")}: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }, [hostUrl, apiKey, username, password, status, t]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Tab Description */}
      <div className="flex items-start justify-between pb-4 border-b border-[var(--border-color)]">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Store className="w-4 h-4 text-[var(--text-primary)]" />
            <span>{t("arunakiZenTitle", "Engine Kasir ArunakiZen")}</span>
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1 max-w-2xl leading-relaxed">
            {t("arunakiZenDesc", "Engine kasir dan sistem retail ArunakiZen offline-first. Memungkinkan Agen Arunaki mengecek stok fisik barang secara real-time, membuat faktur penjualan resmi (R43), dan memantau status kas shift kasir.")}
          </p>
        </div>

        {/* Top Actions: Setup Guide & Connection Status */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setGuideInitialStep(1);
              setShowGuideModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-[var(--border-strong)] bg-[var(--bg-hover)] text-[var(--text-primary)] hover:bg-[var(--border-strong)] text-xs font-semibold transition-all cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span>{t("posSetupGuide", "Setup Guide")}</span>
          </button>

          <div
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border select-none shrink-0 transition-all",
              status.connected
                ? "bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-strong)]"
                : "bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border-color)]"
            )}
          >
          {status.connected ? (
            <>
              <span className="w-2 h-2 rounded-full bg-[var(--text-primary)] animate-pulse" />
              <span>{t("posStatusConnected", "Connected")}</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-[var(--text-muted)]" />
              <span>{t("posStatusDisconnected", "Not connected")}</span>
            </>
          )}
        </div>
        </div>
      </div>

      {/* Main Connection Form Card */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 space-y-4">
        {/* 1. Host URL Server ArunakiZen */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-[var(--text-primary)]">
              {t("posHostUrlLabel", "Host URL Server ArunakiZen")}
            </label>
            <button
              type="button"
              onClick={() => {
                setGuideInitialStep(1);
                setShowGuideModal(true);
              }}
              className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline cursor-pointer flex items-center gap-1"
            >
              <HelpCircle className="w-3 h-3" />
              <span>{t("needPortHelp", "How to detect port? View guide")}</span>
            </button>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={hostUrl}
                onChange={(e) => setHostUrl(e.target.value)}
                placeholder="http://<host-or-ip>:<port>"
                className="w-full h-9 px-3 text-xs bg-[var(--bg-app)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] font-mono focus:border-[var(--border-strong)] focus:outline-none transition-colors"
              />
            </div>
            <button
              type="button"
              onClick={handleAutoDetect}
              disabled={autoDetecting}
              className="h-9 px-3.5 bg-[var(--bg-hover)] hover:bg-[var(--border-color)] text-[var(--text-primary)] text-xs font-medium rounded-lg border border-[var(--border-color)] transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", autoDetecting && "animate-spin")} />
              <span>{autoDetecting ? t("posAutoDetecting", "Mendeteksi...") : t("posAutoDetect", "Deteksi Otomatis")}</span>
            </button>
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">
            {t("posHostUrlHelp", "Port dinamis otomatis dipilih pada rentang 5000-5100")}
          </p>
        </div>

        {/* 2. Integration API Key */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-[var(--text-primary)]">
              {t("posApiKeyLabel", "API Key Integrasi (Bearer Token)")}
            </label>
            <button
              type="button"
              onClick={() => {
                setGuideInitialStep(2);
                setShowGuideModal(true);
              }}
              className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline cursor-pointer flex items-center gap-1"
            >
              <HelpCircle className="w-3 h-3" />
              <span>{t("needApiKeyHelp", "Where to get token? View guide")}</span>
            </button>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--text-muted)]">
              <Key className="w-3.5 h-3.5" />
            </div>
            <input
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Ar-••••••••••••••••••••••••••••••••"
              className="w-full h-9 pl-9 pr-10 text-xs bg-[var(--bg-app)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] font-mono tracking-wider focus:border-[var(--border-strong)] focus:outline-none transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">
            {t("posApiKeyHelp", "Diambil dari Pengaturan ArunakiZen > Integrasi & API Key")}
          </p>
        </div>

        {/* 3. Operator Kasir Credentials (Dual-Layer) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[var(--text-primary)]">
                {t("posOperatorUserLabel", "Kode / Username Operator Kasir")}
              </label>
              <button
                type="button"
                onClick={() => {
                  setGuideInitialStep(3);
                  setShowGuideModal(true);
                }}
                className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline cursor-pointer flex items-center gap-1"
              >
                <HelpCircle className="w-3 h-3" />
                <span>{t("needCashierHelp", "Need operator ID? View guide")}</span>
              </button>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--text-muted)]">
                <User className="w-3.5 h-3.5" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("posOperatorUserPlaceholder", "e.g. CASHIER01")}
                className="w-full h-9 pl-9 pr-3 text-xs bg-[var(--bg-app)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] font-semibold focus:border-[var(--border-strong)] focus:outline-none transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
              {t("posOperatorPassLabel", "Kata Sandi Operator Kasir")}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--text-muted)]">
                <Lock className="w-3.5 h-3.5" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("posOperatorPassPlaceholder", "Cashier password...")}
                className="w-full h-9 pl-9 pr-10 text-xs bg-[var(--bg-app)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
          {t("posOperatorHelp", "Seluruh transaksi penjualan dan pemotongan stok wajib terikat ke identitas operator kasir sah.")}
        </p>

        {/* 4. Live Connected Information Card (When Handshake is Verified) */}
        {status.connected && (
          <div className="p-3.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-hover)] space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)] flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                <span>{t("posConnectedStore", "Toko Terhubung")}:</span>
              </span>
              <strong className="text-[var(--text-primary)] font-semibold">{status.store || "ArunakiZen Store"}</strong>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)] flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                <span>{t("posOperatorActive", "Operator Aktif")}:</span>
              </span>
              <span className="text-[var(--text-primary)] font-medium">
                {status.operator?.nama} ({status.operator?.kode}) — Level: {status.operator?.level}
              </span>
            </div>

            {status.permissions && Object.keys(status.permissions).length > 0 && (
              <div className="pt-1.5 border-t border-[var(--border-color)] flex items-center justify-between text-[11px]">
                <span className="text-[var(--text-muted)] flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{t("posAccessPermissions", "Hak Akses Diberikan")}:</span>
                </span>
                <span className="text-[var(--text-secondary)] font-mono text-[10px]">
                  R43 Penjualan, Cek Stok, Terima Piutang
                </span>
              </div>
            )}
          </div>
        )}

        {/* 5. Action Buttons (Handshake & Save) */}
        <div className="pt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing}
            className="flex-1 h-9 px-4 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-hover)] hover:bg-[var(--border-strong)] text-[var(--text-primary)] text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Wifi className={cn("w-3.5 h-3.5", testing && "animate-pulse")} />
            <span>{testing ? t("posTesting", "Menghubungkan...") : t("posTestHandshake", "Uji Koneksi (Handshake)")}</span>
          </button>

          <button
            type="button"
            onClick={handleSaveConfig}
            disabled={saving}
            className="flex-1 h-9 px-4 rounded-lg bg-[var(--text-primary)] text-[var(--bg-card)] hover:opacity-90 text-xs font-semibold transition-opacity flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5 text-[var(--bg-card)]" />
            <span>{saving ? t("posSaving", "Menyimpan...") : t("posSaveConfig", "Simpan Pengaturan")}</span>
          </button>
        </div>
      </div>
      {/* Interactive Setup Wizard Modal */}
      <ArunakiZenSetupGuideModal
        isOpen={showGuideModal}
        initialStep={guideInitialStep}
        hostUrl={hostUrl}
        onClose={() => setShowGuideModal(false)}
      />
    </div>
  );
});
