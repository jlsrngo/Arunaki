import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { API_BASE, apiFetch, directoryQuery } from "../../../lib/api";
import { toast } from "sonner";
import { useI18n } from "../../../lib/i18n";
import { Provider, ProviderFormData, FormTestResult } from "../types";
import { PROVIDER_TYPES, DEFAULT_MODELS, formatToastError } from "../constants";

export function getSelectedModels(modelStr: string): string[] {
  if (!modelStr) return [];
  return modelStr.split(",").map((s) => s.trim()).filter(Boolean);
}

const CLI_PROVIDER_IDS = [
  "claude-code",
  "claude-cli",
  "claude",
  "opencode",
  "opencode-zen",
  "codex",
  "codex-cli",
  "9router",
  "gemini",
  "gemini-cli",
  "antigravity",
  "antigravity-local",
  "kiro",
  "kiro-cli",
  "local-cli",
];

export const isCliProvider = (p: Provider): boolean => {
  if (typeof p.isCli === "boolean") return p.isCli;
  if (p.category === "cli") return true;
  if (p.category === "cloud") return false;
  if (CLI_PROVIDER_IDS.includes(p.id)) return true;
  if (p.id.endsWith("-cli") || p.id.includes("local-cli")) return true;
  if (
    p.baseUrl &&
    (p.baseUrl.includes(":20188") ||
      p.baseUrl.includes(":20189") ||
      p.baseUrl.includes("localhost:20188") ||
      p.baseUrl.includes("127.0.0.1:20188"))
  ) {
    return true;
  }
  if (
    (p.id === "gemini" || p.id === "gemini-cli") &&
    (p.apiKey === "antigravity-active" ||
      p.apiKey === "gemini-local-session" ||
      p.name?.toLowerCase().includes("antigravity") ||
      p.name?.toLowerCase().includes("gemini cli"))
  ) {
    return true;
  }
  if (
    p.name?.toLowerCase().includes("(chatgpt subscription)") ||
    p.name?.toLowerCase().includes("(aws codewhisperer)") ||
    p.name?.toLowerCase().includes("(local subscription)") ||
    p.name?.toLowerCase().includes("(local cli)") ||
    p.name?.toLowerCase().includes("(local account)")
  ) {
    return true;
  }
  return false;
};

export interface UseModelProvidersOptions {
  providers: Provider[];
  availableCatalogModels?: Record<string, string[]>;
  loading: boolean;
  onRefresh: () => void;
  onUpdateProviders?: (updater: (prev: Provider[]) => Provider[]) => void;
}

export function useModelProviders({
  providers,
  availableCatalogModels,
  onRefresh,
  onUpdateProviders,
}: UseModelProvidersOptions) {
  const { t } = useI18n();
  const [internalProviders, setInternalProviders] = useState<Provider[]>(providers);

  useEffect(() => {
    setInternalProviders(providers);
  }, [providers]);

  const cloudProviders = useMemo(() => {
    return internalProviders.filter((p) => !isCliProvider(p));
  }, [internalProviders]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [isTestingForm, setIsTestingForm] = useState(false);
  const [formTestResult, setFormTestResult] = useState<FormTestResult | null>(null);
  const [isFetchingFormModels, setIsFetchingFormModels] = useState(false);
  const [isAddingFormModel, setIsAddingFormModel] = useState(false);
  const [formNewModelInput, setFormNewModelInput] = useState("");
  const [testResults, setTestResults] = useState<Record<string, FormTestResult>>({});

  // Custom Models per Provider Map (persisted in localStorage)
  const [customModelsMap, setCustomModelsMap] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem("arunaki_custom_provider_models");
      if (!saved) return {};
      const parsed = JSON.parse(saved);
      const cleaned: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (Array.isArray(v)) {
          cleaned[k] = v.filter(Boolean);
        }
      }
      return cleaned;
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem("arunaki_custom_provider_models", JSON.stringify(customModelsMap));
  }, [customModelsMap]);

  const [form, setForm] = useState<ProviderFormData>({
    name: "",
    type: "9router",
    baseUrl: "http://localhost:20128/v1",
    apiKey: "",
    model: "cx/gpt-5.6-terra",
    headerPrefix: "",
    headerTitle: "",
  });

  const [formAvailableModels, setFormAvailableModels] = useState<string[]>(DEFAULT_MODELS["9router"] || []);
  const [providerToDelete, setProviderToDelete] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setForm({
      name: "",
      type: "9router",
      baseUrl: "http://localhost:20128/v1",
      apiKey: "",
      model: "cx/gpt-5.6-terra",
      headerPrefix: "",
      headerTitle: "",
    });
    setFormAvailableModels(DEFAULT_MODELS["9router"] || []);
    setIsAddingFormModel(false);
    setFormNewModelInput("");
    setFormTestResult(null);
    setShowAddForm(false);
    setEditingId(null);
  }, []);

  const handleToggleModelSelection = (m: string) => {
    const current = getSelectedModels(form.model);
    let updated: string[];
    if (current.includes(m)) {
      if (current.length <= 1) {
        toast.info("At least 1 model must remain selected in the routing pool.");
        return;
      }
      updated = current.filter((id) => id !== m);
    } else {
      updated = [...current, m];
    }
    const modelStr = updated.join(", ");
    setForm((f) => ({ ...f, model: modelStr }));
    if (editingId) {
      localStorage.setItem("arunaki_provider_models_" + editingId, modelStr);
      if (updated[0]) {
        localStorage.setItem("arunaki_active_model", updated[0]);
      }
    }
  };

  const handleReorderModels = (newOrder: string[]) => {
    const modelStr = newOrder.join(", ");
    setForm((f) => ({ ...f, model: modelStr }));
    if (editingId) {
      localStorage.setItem("arunaki_provider_models_" + editingId, modelStr);
      if (newOrder[0]) {
        localStorage.setItem("arunaki_active_model", newOrder[0]);
      }
    }
  };

  const handleTypeChange = (type: string) => {
    const pt = PROVIDER_TYPES.find((p) => p.value === type);
    const defaults = DEFAULT_MODELS[type] || DEFAULT_MODELS["openai-compatible"] || [];
    const defaultModel = defaults.slice(0, 2).join(", ") || "";
    setForm((f) => ({
      ...f,
      type,
      baseUrl: type === "openai-compatible" ? "" : (pt?.defaultUrl ?? ""),
      model: defaultModel,
      name: pt?.label || f.name,
    }));
    setFormAvailableModels(defaults);
    setFormTestResult(null);
  };

  const internalProvidersRef = useRef<Provider[]>(internalProviders);
  internalProvidersRef.current = internalProviders;
  const cloudProvidersRef = useRef<Provider[]>(cloudProviders);
  cloudProvidersRef.current = cloudProviders;

  const handleEdit = useCallback((p: Provider) => {
    setEditingId(p.id);
    const savedSelected = localStorage.getItem("arunaki_provider_models_" + p.id) || p.model;
    const cleanKey = p.apiKey?.includes("•") ? "" : p.apiKey;
    setForm({
      name: p.name,
      type: p.type,
      baseUrl: p.baseUrl,
      apiKey: cleanKey || "",
      model: savedSelected,
      headerPrefix: p.headerPrefix || "",
      headerTitle: p.headerTitle || "",
    });

    const defaults = DEFAULT_MODELS[p.type] || DEFAULT_MODELS[p.id] || DEFAULT_MODELS["openai-compatible"] || [];
    const custom = customModelsMap[p.id] || [];
    const catalogForProvider = availableCatalogModels?.[p.id] || [];
    const existingModels = getSelectedModels(savedSelected);
    const combined = Array.from(new Set([...existingModels, ...catalogForProvider, ...custom, ...defaults]));
    setFormAvailableModels(combined);
    setIsAddingFormModel(false);
    setFormNewModelInput("");
    setFormTestResult(null);
    setShowAddForm(true);
  }, [availableCatalogModels, customModelsMap]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let providerId = editingId;
      const cleanApiKey = form.apiKey?.trim();
      const sanitizedModelList = form.model
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const cleanModelStr = sanitizedModelList.join(", ") || formAvailableModels[0] || "deepseek-v4-flash";
      const payload = {
        ...form,
        model: cleanModelStr,
        apiKey: cleanApiKey && !cleanApiKey.includes("•") ? cleanApiKey : undefined,
      };
      if (editingId) {
        await apiFetch(`${API_BASE}/providers/${editingId}${directoryQuery()}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast.success("Provider connection updated successfully.");
      } else {
        const res = await apiFetch(`${API_BASE}/providers${directoryQuery()}`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        providerId = data.data?.id || null;
        toast.success("New provider added successfully.");
      }

      if (providerId) {
        localStorage.setItem("arunaki_provider_models_" + providerId, cleanModelStr);
        const primary = cleanModelStr.split(",").map((s) => s.trim()).filter(Boolean)[0];
        if (primary) {
          localStorage.setItem("arunaki_active_model", primary);
        }
        setCustomModelsMap((prev) => ({
          ...prev,
          [providerId!]: formAvailableModels,
        }));
      }

      resetForm();
      onRefresh();
    } catch {
      toast.error("Failed to save provider configuration.");
    }
  };

  const handleDelete = useCallback((id: string) => {
    setProviderToDelete(id);
  }, []);

  const executeDelete = async (id: string) => {
    setInternalProviders((prev) => prev.filter((p) => p.id !== id));
    if (onUpdateProviders) onUpdateProviders((prev) => prev.filter((p) => p.id !== id));
    try {
      await apiFetch(`${API_BASE}/providers/${id}${directoryQuery()}`, { method: "DELETE" });
      toast.success("Provider deleted successfully.");
    } catch {
      toast.error("Failed to delete provider.");
      onRefresh();
    }
  };

  const handleToggleActive = useCallback((provider: Provider) => {
    const isCurrentlyActive = Boolean(provider.active);
    const targetState = !isCurrentlyActive;

    // 1. INSTANT OPTIMISTIC UI: flip switch immediately (0ms delay)
    const updateFn = (prev: Provider[]) =>
      prev.map((p) => {
        if (p.id === provider.id) {
          return { ...p, active: targetState };
        }
        if (targetState && !isCliProvider(p)) {
          return { ...p, active: false };
        }
        return p;
      });

    setInternalProviders(updateFn);
    if (onUpdateProviders) onUpdateProviders(updateFn);

    if (isCurrentlyActive) {
      const cliTargets = ["claude-code", "gemini", "antigravity", "opencode", "codex", "9router", "kiro"];
      const lastCli = localStorage.getItem("arunaki_last_active_cli");
      const targetCli = (lastCli && cliTargets.includes(lastCli))
        ? lastCli
        : (internalProvidersRef.current.find((p) => cliTargets.includes(p.id))?.id || "antigravity");

      localStorage.setItem("arunaki_active_provider", targetCli);

      const cliDefaultModels: Record<string, string> = {
        "claude-code": localStorage.getItem("arunaki_cli_model_claude") || "claude-3.7-sonnet",
        gemini: localStorage.getItem("arunaki_cli_model_antigravity") || "gemini-3.8-flash",
        antigravity: localStorage.getItem("arunaki_cli_model_antigravity") || "gemini-3.8-flash",
        "gemini-cli": localStorage.getItem("arunaki_cli_model_antigravity") || "gemini-3.8-flash",
        codex: "o3-mini",
        opencode: "opencode/big-pickle",
        "9router": "cx/gpt-5.6-terra",
        kiro: localStorage.getItem("arunaki_cli_model_kiro") || "kiro/auto",
      };
      const nextModel = cliDefaultModels[targetCli] || "gemini-3.8-flash";
      localStorage.setItem("arunaki_active_model", nextModel);
      window.dispatchEvent(
        new CustomEvent("arunaki:provider-change", {
          detail: { providerId: targetCli, model: nextModel },
        })
      );

      const cliNames: Record<string, string> = {
        "claude-code": "Claude Code CLI",
        codex: "OpenAI Codex CLI",
        gemini: "Google Antigravity",
        opencode: "OpenCode Interpreter",
        "9router": "9Router Gateway",
      };
      const friendlyName = cliNames[targetCli] || targetCli;

      toast.success(
        `${t("provider", "Provider")} ${provider.name || provider.id} ${t("providerTurnedOff", "turned OFF")}`,
        {
          description: `${t("chatRoutingDivertedDesc", "Chat routing automatically diverted to CLI")} (${friendlyName}).`,
        }
      );

      void Promise.all([
        apiFetch(`${API_BASE}/providers/${provider.id}/state${directoryQuery()}`, {
          method: "PUT",
          body: JSON.stringify({ active: false }),
        }),
        apiFetch(`${API_BASE}/providers/${targetCli}/state${directoryQuery()}`, {
          method: "PUT",
          body: JSON.stringify({ active: true }),
        }),
      ]).catch(() => {
        toast.error(t("failedToChangeProviderStatus", "Failed to update provider status."));
        onRefresh();
      });
    } else {
      localStorage.setItem("arunaki_active_provider", provider.id);
      const pool = localStorage.getItem("arunaki_provider_models_" + provider.id) || provider.model;
      const primary = pool ? pool.split(",").map((s) => s.trim()).filter(Boolean)[0] : "";
      if (primary) {
        localStorage.setItem("arunaki_active_model", primary);
      }
      window.dispatchEvent(
        new CustomEvent("arunaki:provider-change", {
          detail: { providerId: provider.id, model: primary || "" },
        })
      );

      toast.success(
        `${t("provider", "Provider")} ${provider.name || provider.id} ${t("providerTurnedOnPrimary", "turned ON (Primary Active)")}`,
        {
          description: `${t("chatRoutingNowUsing", "Chat routing is now using")} ${provider.name || provider.id}.`,
        }
      );

      void apiFetch(`${API_BASE}/providers/${provider.id}/state${directoryQuery()}`, {
        method: "PUT",
        body: JSON.stringify({ active: true }),
      }).catch(() => {
        toast.error(t("failedToChangeProviderStatus", "Failed to update provider status."));
        onRefresh();
      });
    }
  }, [onRefresh, onUpdateProviders, t]);

  const handleMoveProviderPriority = useCallback((index: number, direction: "up" | "down") => {
    const list = [...cloudProvidersRef.current];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    const currentP = list[index];
    const targetP = list[targetIdx];

    const reorderedCloud = [...list];
    reorderedCloud[index] = targetP;
    reorderedCloud[targetIdx] = currentP;

    const updatedWithPriority = reorderedCloud.map((p, idx) => ({
      ...p,
      priority: idx + 1,
    }));

    const updateFn = (prev: Provider[]) => {
      const nonCloud = prev.filter((p) => isCliProvider(p));
      return [...updatedWithPriority, ...nonCloud];
    };

    setInternalProviders(updateFn);
    if (onUpdateProviders) onUpdateProviders(updateFn);

    toast.success("Routing priority updated.");

    void Promise.all([
      apiFetch(`${API_BASE}/providers/${currentP.id}/state${directoryQuery()}`, {
        method: "PUT",
        body: JSON.stringify({ priority: targetIdx + 1 }),
      }),
      apiFetch(`${API_BASE}/providers/${targetP.id}/state${directoryQuery()}`, {
        method: "PUT",
        body: JSON.stringify({ priority: index + 1 }),
      }),
    ]).catch(() => {
      toast.error("Failed to persist provider priority.");
      onRefresh();
    });
  }, [onRefresh, onUpdateProviders]);

  const handleFetchModelsInForm = async () => {
    if (!form.baseUrl) {
      toast.error("Please enter a valid Base URL / Endpoint first.");
      return;
    }
    setIsFetchingFormModels(true);
    try {
      const res = await apiFetch(`${API_BASE}/providers/fetch-models${directoryQuery()}`, {
        method: "POST",
        body: JSON.stringify({
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
        }),
      });
      const data = await res.json();
      const rawFetchedModels: string[] = data.data?.models || [];
      const fetchedModels = rawFetchedModels.filter(Boolean);

      if (fetchedModels.length === 0) {
        toast.info("No supported models discovered from endpoint. Keeping default catalog.");
        return;
      }

      const providerKey = editingId || form.type;
      setFormAvailableModels(fetchedModels);
      setCustomModelsMap((prev) => ({
        ...prev,
        [providerKey]: fetchedModels,
      }));

      const existingSelected = getSelectedModels(form.model);
      const prunedSelected = existingSelected.filter((m) => fetchedModels.includes(m));
      const finalSelected = prunedSelected.length > 0 ? prunedSelected : fetchedModels.slice(0, 5);
      const newModelStr = finalSelected.join(", ");
      setForm((f) => ({ ...f, model: newModelStr }));

      if (editingId) {
        localStorage.setItem("arunaki_provider_models_" + editingId, newModelStr);
        if (finalSelected[0]) {
          localStorage.setItem("arunaki_active_model", finalSelected[0]);
        }
      }

      const freeCount = fetchedModels.filter((m) => m.endsWith(":free")).length;
      const prunedCount = existingSelected.length - prunedSelected.length;
      if (prunedCount > 0) {
        toast.success(`Discovered ${fetchedModels.length} models (${freeCount} free)! Pruned ${prunedCount} discontinued models.`);
      } else {
        toast.success(`Discovered ${fetchedModels.length} live models (${freeCount} free) from endpoint!`);
      }
    } catch (err: any) {
      toast.error(`Sync models failed: ${err.message}`);
    } finally {
      setIsFetchingFormModels(false);
    }
  };

  const handleAddCustomModelSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = formNewModelInput.trim();
    if (!clean) return;

    setFormAvailableModels((prev) => Array.from(new Set([clean, ...prev])));
    setForm((f) => ({ ...f, model: clean }));
    setIsAddingFormModel(false);
    setFormNewModelInput("");
    toast.success(`Model "${clean}" added to selection.`);
  };

  const handleTestConnection = useCallback(async (id: string) => {
    setTestingId(id);
    const startMs = Date.now();
    try {
      const provider = internalProvidersRef.current.find((p) => p.id === id);
      const selectedModels = provider?.model
        ? provider.model.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
      const primaryModel =
        selectedModels[0] ||
        (id === "kenari"
          ? localStorage.getItem("arunaki_active_model") || "agnes-2-5-flash:free"
          : "");
      const modelQuery = primaryModel ? `&model=${encodeURIComponent(primaryModel)}` : "";
      const res = await apiFetch(`${API_BASE}/providers/${id}/test${directoryQuery()}${modelQuery}`, { method: "POST" });
      const data = await res.json();
      const elapsed = Date.now() - startMs;
      const isOk = data.data?.success;
      const reply = data.data?.reply || "";
      const prompt = data.data?.prompt || "Hello, connection test.";

      setTestResults((prev) => ({
        ...prev,
        [id]: {
          success: !!isOk,
          status: data.data?.status || (isOk ? 200 : 500),
          error: data.data?.error,
          prompt: prompt,
          reply: reply,
          timeMs: elapsed,
        },
      }));

      if (isOk) {
        toast.success(`Connected (${elapsed}ms)`, {
          description: reply ? `"${reply.slice(0, 50)}"` : undefined,
        });
      } else {
        toast.error("Connection Test Failed", {
          description: formatToastError(data.data?.error),
        });
      }
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [id]: { success: false, error: err.message },
      }));
      toast.error("Connection Test Failed", {
        description: formatToastError(err.message),
      });
    } finally {
      setTestingId(null);
    }
  }, []);

  const handleTestFormConnection = async () => {
    setIsTestingForm(true);
    const startMs = Date.now();
    try {
      const res = await apiFetch(`${API_BASE}/providers/test${directoryQuery()}`, {
        method: "POST",
        body: JSON.stringify({
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
          model: form.model ? form.model.split(",")[0].trim() : "",
        }),
      });
      const data = await res.json();
      const elapsed = Date.now() - startMs;
      const isOk = data.data?.success;
      const reply = data.data?.reply || "";
      const prompt = data.data?.prompt || "Hello, connection test.";

      const result: FormTestResult = {
        success: !!isOk,
        status: data.data?.status || (isOk ? 200 : 500),
        error: data.data?.error,
        prompt: prompt,
        reply: reply,
        model: data.data?.model,
        timeMs: elapsed,
      };

      setFormTestResult(result);

      if (isOk) {
        toast.success(`Ping Successful! (${elapsed}ms)`, {
          description: reply ? `"${reply.slice(0, 50)}"` : undefined,
        });
      } else {
        toast.error("Ping Failed", {
          description: formatToastError(data.data?.error),
        });
      }
    } catch (err: any) {
      setFormTestResult({ success: false, error: err.message });
      toast.error("Ping Error", {
        description: formatToastError(err.message),
      });
    } finally {
      setIsTestingForm(false);
    }
  };

  return {
    cloudProviders,
    internalProviders,
    showAddForm,
    setShowAddForm,
    editingId,
    testingId,
    isTestingForm,
    formTestResult,
    setFormTestResult,
    isFetchingFormModels,
    isAddingFormModel,
    setIsAddingFormModel,
    formNewModelInput,
    setFormNewModelInput,
    testResults,
    customModelsMap,
    form,
    setForm,
    formAvailableModels,
    setFormAvailableModels,
    providerToDelete,
    setProviderToDelete,
    resetForm,
    handleToggleModelSelection,
    handleReorderModels,
    handleTypeChange,
    handleEdit,
    handleSave,
    handleDelete,
    executeDelete,
    handleToggleActive,
    handleMoveProviderPriority,
    handleFetchModelsInForm,
    handleAddCustomModelSubmit,
    handleTestConnection,
    handleTestFormConnection,
  };
}

