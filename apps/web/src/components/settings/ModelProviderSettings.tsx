import { useState, useEffect } from "react";
import { Plus, Loader2, Cpu, Info } from "lucide-react";
import { API_BASE, apiFetch, directoryQuery } from "../../lib/api";
import { toast } from "sonner";
import { useI18n } from "../../lib/i18n";
import { ProviderCard } from "./ProviderCard";
import { ProviderForm } from "./ProviderForm";
import { Provider, ProviderFormData, FormTestResult } from "./types";
import { PROVIDER_TYPES, DEFAULT_MODELS, formatToastError } from "./constants";

export type { Provider };

interface ModelProviderSettingsProps {
  providers: Provider[];
  availableCatalogModels?: Record<string, string[]>;
  loading: boolean;
  onRefresh: () => void;
}

export function ModelProviderSettings({
  providers,
  availableCatalogModels,
  loading,
  onRefresh,
}: ModelProviderSettingsProps) {
  const { t } = useI18n();
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

  const resetForm = () => {
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
  };

  const getSelectedModels = (modelStr: string): string[] => {
    if (!modelStr) return [];
    return modelStr.split(",").map((s) => s.trim()).filter(Boolean);
  };

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

  const handleEdit = (p: Provider) => {
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
  };

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

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this provider configuration?")) return;
    try {
      await apiFetch(`${API_BASE}/providers/${id}${directoryQuery()}`, { method: "DELETE" });
      toast.success("Provider deleted successfully.");
      onRefresh();
    } catch {
      toast.error("Failed to delete provider.");
    }
  };

  const handleToggleActive = async (provider: Provider) => {
    try {
      localStorage.setItem("arunaki_active_provider", provider.id);
      const pool = localStorage.getItem("arunaki_provider_models_" + provider.id) || provider.model;
      const primary = pool ? pool.split(",").map((s) => s.trim()).filter(Boolean)[0] : "";
      if (primary) {
        localStorage.setItem("arunaki_active_model", primary);
      }
      await apiFetch(`${API_BASE}/providers/${provider.id}/state${directoryQuery()}`, {
        method: "PUT",
        body: JSON.stringify({ active: true }),
      }).catch(() => {});
      toast.success(`Provider ${provider.name || provider.id} set as primary active`);
      onRefresh();
    } catch {
      toast.error("Failed to update provider status.");
    }
  };

  const handleMoveProviderPriority = async (index: number, direction: "up" | "down") => {
    const list = [...providers];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    const currentP = list[index];
    const targetP = list[targetIdx];

    try {
      // Swap priorities
      await Promise.all([
        apiFetch(`${API_BASE}/providers/${currentP.id}/state${directoryQuery()}`, {
          method: "PUT",
          body: JSON.stringify({ priority: targetP.priority ?? targetIdx }),
        }),
        apiFetch(`${API_BASE}/providers/${targetP.id}/state${directoryQuery()}`, {
          method: "PUT",
          body: JSON.stringify({ priority: currentP.priority ?? index }),
        }),
      ]);
      toast.success("Routing priority updated.");
      onRefresh();
    } catch {
      toast.error("Failed to update provider priority.");
    }
  };

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
      // Overwrite available models with fresh fetched catalog from live endpoint
      setFormAvailableModels(fetchedModels);
      setCustomModelsMap((prev) => ({
        ...prev,
        [providerKey]: fetchedModels,
      }));

      // Prune dead / discontinued models from user's current selection
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

  const handleTestConnection = async (id: string) => {
    setTestingId(id);
    const startMs = Date.now();
    try {
      const provider = providers.find((p) => p.id === id);
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
  };

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

  return (
    <div className="space-y-6 w-full">
      {/* Top Description & Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-[var(--text-primary)] text-base flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[var(--text-primary)]" />
            {t("modelRoutingCatalogTitle")}
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {t("modelRoutingCatalogSubtitle")}
          </p>
        </div>

        {!showAddForm && (
          <button
            onClick={() => {
              resetForm();
              setShowAddForm(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-[var(--text-primary)] text-[var(--bg-app)] hover:opacity-90 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t("addProvider")}</span>
          </button>
        )}
      </div>

      {/* Info Banner */}
      <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] flex items-start gap-3 text-xs text-[var(--text-muted)] leading-relaxed">
        <Info className="w-4 h-4 text-[var(--text-muted)] shrink-0 mt-0.5" />
        <div>
          <strong className="text-[var(--text-primary)] font-semibold">{t("automaticFallbackTitle")}:</strong> {t("automaticFallbackDesc")}
        </div>
      </div>

      {/* Form (Add or Edit) */}
      {showAddForm && (
        <ProviderForm
          form={form}
          setForm={setForm}
          formAvailableModels={formAvailableModels}
          providerTypes={PROVIDER_TYPES}
          isEditing={!!editingId}
          isTestingForm={isTestingForm}
          testResult={formTestResult}
          isFetchingFormModels={isFetchingFormModels}
          isAddingFormModel={isAddingFormModel}
          setIsAddingFormModel={setIsAddingFormModel}
          formNewModelInput={formNewModelInput}
          setFormNewModelInput={setFormNewModelInput}
          onTypeChange={handleTypeChange}
          onToggleModelSelection={handleToggleModelSelection}
          onReorderModels={handleReorderModels}
          onFetchModels={handleFetchModelsInForm}
          onAddCustomModelSubmit={handleAddCustomModelSubmit}
          onTestConnection={handleTestFormConnection}
          onSubmit={handleSave}
          onCancel={resetForm}
        />
      )}

      {/* List of Configured Providers */}
      {loading ? (
        <div className="py-12 flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin text-[var(--text-primary)]" />
          <span>{t("loadingProviders")}</span>
        </div>
      ) : providers.length === 0 ? (
        <div className="p-8 text-center bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] space-y-3">
          <Cpu className="w-8 h-8 text-[var(--text-muted)] mx-auto opacity-50" />
          <p className="text-xs text-[var(--text-muted)]">{t("noProvidersConfigured")}</p>
          <button
            onClick={() => {
              resetForm();
              setShowAddForm(true);
            }}
            className="px-4 py-2 bg-[var(--text-primary)] text-[var(--bg-app)] rounded-xl text-xs font-semibold cursor-pointer"
          >
            {t("addFirstProvider")}
          </button>
        </div>
      ) : (
        <div className="space-y-3 w-full">
          {providers.map((p, idx) => (
            <ProviderCard
              key={p.id}
              provider={p}
              index={idx}
              totalProviders={providers.length}
              testResult={testResults[p.id]}
              isTesting={testingId === p.id}
              onToggleActive={handleToggleActive}
              onMovePriority={handleMoveProviderPriority}
              onTestConnection={handleTestConnection}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
