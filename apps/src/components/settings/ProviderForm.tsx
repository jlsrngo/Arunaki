import React, { useState, useMemo } from "react";
import { Plus, Check, CheckCheck, Loader2, Wifi, Bot, Settings2, RefreshCw, Search, ArrowUp, ArrowDown, X, Sparkles, GripVertical, ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "../../lib/utils";
import { toast } from "sonner";
import { useI18n } from "../../lib/i18n";

export interface ProviderFormData {
  name: string;
  type: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  headerPrefix?: string;
  headerTitle?: string;
}

export interface FormTestResult {
  success: boolean;
  status?: number;
  error?: string;
  prompt?: string;
  reply?: string;
  model?: string;
  timeMs?: number;
}

interface ProviderFormProps {
  form: ProviderFormData;
  setForm: React.Dispatch<React.SetStateAction<ProviderFormData>>;
  formAvailableModels: string[];
  providerTypes: Array<{ value: string; label: string; defaultUrl: string }>;
  isEditing: boolean;
  isTestingForm: boolean;
  testResult: FormTestResult | null;
  isFetchingFormModels: boolean;
  isAddingFormModel: boolean;
  setIsAddingFormModel: (val: boolean) => void;
  formNewModelInput: string;
  setFormNewModelInput: (val: string) => void;
  onTypeChange: (type: string) => void;
  onToggleModelSelection: (model: string) => void;
  onReorderModels: (newOrder: string[]) => void;
  onFetchModels: () => void;
  onAddCustomModelSubmit: (e: React.FormEvent) => void;
  onTestConnection: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

import { isFreeModel, getModelFamily } from "./providerModelUtils";
export { isFreeModel, getModelFamily };


export function ProviderForm({
  form,
  setForm,
  formAvailableModels,
  providerTypes,
  isEditing,
  isTestingForm,
  testResult,
  isFetchingFormModels,
  isAddingFormModel,
  setIsAddingFormModel,
  formNewModelInput,
  setFormNewModelInput,
  onTypeChange,
  onToggleModelSelection,
  onReorderModels,
  onFetchModels,
  onAddCustomModelSubmit,
  onTestConnection,
  onSubmit,
  onCancel,
}: ProviderFormProps) {
  const { t } = useI18n();
  const [modelSearch, setModelSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const getSelectedModels = (modelStr: string): string[] => {
    if (!modelStr) return [];
    return modelStr.split(",").map((s) => s.trim()).filter(Boolean);
  };

  const selectedModels = useMemo(() => getSelectedModels(form.model), [form.model]);

  // Compute counts for quick filtering
  const freeCount = useMemo(
    () => formAvailableModels.filter(isFreeModel).length,
    [formAvailableModels]
  );

  const availableFamilies = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of formAvailableModels) {
      const fam = getModelFamily(m);
      counts[fam] = (counts[fam] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([family, count]) => ({ family, count }))
      .sort((a, b) => b.count - a.count);
  }, [formAvailableModels]);

  // Filter available models via category and search query
  const filteredModels = useMemo(() => {
    let list = formAvailableModels;

    if (selectedCategory === "free") {
      list = list.filter(isFreeModel);
    } else if (selectedCategory === "selected") {
      list = list.filter((m) => selectedModels.includes(m));
    } else if (selectedCategory !== "all") {
      list = list.filter((m) => getModelFamily(m).toLowerCase() === selectedCategory.toLowerCase());
    }

    if (modelSearch.trim()) {
      const q = modelSearch.toLowerCase().trim();
      list = list.filter((m) => m.toLowerCase().includes(q));
    }

    return list;
  }, [formAvailableModels, selectedCategory, modelSearch, selectedModels]);

  const handleSelectAllFree = () => {
    const freeModels = formAvailableModels.filter(isFreeModel);
    if (freeModels.length === 0) {
      toast.info("No free models found in current list.");
      return;
    }
    // Only retain existing models that are still valid in formAvailableModels
    const validCurrent = selectedModels.filter((m) => formAvailableModels.includes(m));
    const combined = Array.from(new Set([...validCurrent, ...freeModels]));
    onReorderModels(combined);
    toast.success(`Selected all ${freeModels.length} free models in routing pool!`);
  };

  const moveModelPriority = (index: number, direction: "up" | "down") => {
    const list = [...selectedModels];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const temp = list[index];
    list[index] = list[targetIdx];
    list[targetIdx] = temp;
    onReorderModels(list);
  };

  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.setData("text/plain", String(index));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const sourceIdx = draggedIdx !== null ? draggedIdx : Number(e.dataTransfer.getData("text/plain"));
    if (sourceIdx === dropIndex || isNaN(sourceIdx)) {
      setDraggedIdx(null);
      return;
    }
    const list = [...selectedModels];
    const [movedItem] = list.splice(sourceIdx, 1);
    list.splice(dropIndex, 0, movedItem);
    onReorderModels(list);
    setDraggedIdx(null);
  };

  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const typeDropdownRef = React.useRef<HTMLDivElement>(null);

  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target as Node)) {
        setIsTypeDropdownOpen(false);
      }
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedCategoryLabel = useMemo(() => {
    if (selectedCategory === "all") return `All Models (${formAvailableModels.length})`;
    if (selectedCategory === "free") return `Free Models (${freeCount})`;
    if (selectedCategory === "selected") return `Selected (${selectedModels.length})`;
    const fam = availableFamilies.find((f) => f.family.toLowerCase() === selectedCategory.toLowerCase());
    return fam ? `${fam.family} (${fam.count})` : selectedCategory;
  }, [selectedCategory, formAvailableModels.length, freeCount, selectedModels.length, availableFamilies]);

  const selectedTypeObj = providerTypes.find((pt) => pt.value === form.type);
  const selectedTypeLabel = selectedTypeObj ? selectedTypeObj.label : form.type;

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        "p-6 bg-[var(--bg-card)] text-[var(--text-primary)] rounded-2xl space-y-5 border w-full",
        isEditing ? "border-[var(--border-strong)]" : "border-[var(--border-color)]"
      )}
    >
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)]">
        <div>
          <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-[var(--text-primary)]" />
            {isEditing ? `${t("configureProvider")}: ${form.name}` : t("addNewProviderConnection")}
          </h4>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 font-mono">{form.baseUrl || t("noEndpointSpecified")}</p>
        </div>
        <span className="text-xs text-[var(--text-muted)] font-medium">
          {isEditing ? t("selectActiveModels") : t("endpointCredentials")}
        </span>
      </div>

      {!isEditing && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Custom Scrollable Provider Type Dropdown (Shows ~4-5 items with scrollbar and Other at the end) */}
            <div className="relative" ref={typeDropdownRef}>
              <label className="block text-[11px] text-[var(--text-muted)] mb-1 font-medium">{t("providerType")}</label>
              <button
                type="button"
                onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--border-strong)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors flex items-center justify-between cursor-pointer"
              >
                <span className="truncate">{selectedTypeLabel}</span>
                <ChevronDown className={cn("w-3.5 h-3.5 text-[var(--text-muted)] transition-transform duration-150 shrink-0 ml-1", isTypeDropdownOpen && "rotate-180")} />
              </button>

              {isTypeDropdownOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-full max-h-48 overflow-y-auto rounded-xl bg-[var(--bg-card)] border border-[var(--border-strong)] shadow-2xl p-1.5 space-y-0.5 z-50 animate-in fade-in duration-100">
                  {providerTypes.map((pt, ptIdx) => {
                    const isSelected = form.type === pt.value;
                    const isOther = pt.value === "openai-compatible";
                    return (
                      <React.Fragment key={pt.value}>
                        {isOther && ptIdx > 0 && (
                          <div className="my-1 border-t border-[var(--border-color)]" />
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            onTypeChange(pt.value);
                            setIsTypeDropdownOpen(false);
                          }}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors",
                            isSelected
                              ? "bg-[var(--bg-hover)] text-[var(--text-primary)] font-semibold"
                              : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                          )}
                        >
                          <span className="truncate">{pt.label}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-[var(--text-primary)] shrink-0 ml-1" />}
                        </button>
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-muted)] mb-1 font-medium">{t("displayName")}</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Kenari Cloud / Local 9Router / OpenRouter"
                className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] text-[var(--text-muted)] mb-1 font-medium">{t("baseUrlEndpoint")}</label>
              <input
                type="text"
                value={form.baseUrl}
                onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                placeholder="https://api.your-custom-endpoint.com/v1"
                className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-muted)] mb-1 font-medium">{t("apiKeyToken")}</label>
              <input
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                placeholder={t("apiKeyPlaceholder")}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
              />
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE MODEL ROUTING PRIORITY (DRAGGABLE & RE-ORDERABLE LIST) */}
      {selectedModels.length > 0 && (
        <div className="p-4 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-color)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              {t("activeModelRoutingPriority")} ({selectedModels.length} {t("selectedCount")})
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              {t("dragDotsOrArrows")}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {selectedModels.map((m, idx) => (
              <div
                key={m}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={() => setDraggedIdx(null)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--bg-hover)] border border-[var(--border-strong)] rounded-xl text-xs font-mono text-[var(--text-primary)] shadow-xs transition-all select-none cursor-grab active:cursor-grabbing",
                  draggedIdx === idx && "opacity-40 border-dashed scale-95"
                )}
                title="Drag to reorder model priority"
              >
                {/* 6-Dot Grip Handle */}
                <GripVertical className="w-3.5 h-3.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0 cursor-grab active:cursor-grabbing" />
                <span className="text-[10px] font-bold text-[var(--text-muted)]">#{idx + 1}</span>
                <span className="font-semibold truncate max-w-[180px]">{m}</span>
                <span className="text-[9px] px-1.5 py-0.5 bg-[var(--bg-app)] rounded text-[var(--text-muted)] border border-[var(--border-color)]">
                  {idx === 0 ? t("primary") : `${t("fallback")} ${idx}`}
                </span>

                {/* Priority controls */}
                <div className="flex items-center gap-0.5 ml-1 border-l border-[var(--border-color)] pl-1">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveModelPriority(idx, "up")}
                    className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
                    title="Move higher priority"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === selectedModels.length - 1}
                    onClick={() => moveModelPriority(idx, "down")}
                    className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
                    title="Move lower priority"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                  {selectedModels.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onToggleModelSelection(m)}
                      className="p-1 text-[var(--text-muted)] hover:text-red-400 cursor-pointer"
                      title="Remove from pool"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* INTEGRATED AVAILABLE MODELS SELECTOR WITH SEARCH & CATEGORY FILTERS */}
      <div className="pt-2 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            {t("availableModels")} ({filteredModels.length} of {formAvailableModels.length})
          </span>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end">
            {/* Category / Family Filter Custom Dropdown (Reasoning Effort styled) */}
            <div className="relative shrink-0" ref={categoryDropdownRef}>
              <button
                type="button"
                onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                className="bg-[var(--bg-input)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] hover:border-[var(--border-strong)] rounded-lg px-2.5 py-1 text-xs text-[var(--text-primary)] font-medium flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
                title={t("filterModels")}
              >
                <SlidersHorizontal className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                <span className="truncate max-w-[130px] sm:max-w-[160px] text-left">{selectedCategoryLabel}</span>
                <ChevronDown
                  className={cn(
                    "w-3 h-3 text-[var(--text-muted)] transition-transform duration-150 shrink-0 ml-0.5",
                    isCategoryDropdownOpen && "rotate-180"
                  )}
                />
              </button>

              {isCategoryDropdownOpen && (
                <div className="absolute right-0 sm:left-0 top-full mt-1.5 w-56 max-h-64 overflow-y-auto rounded-xl bg-[var(--bg-card)] border border-[var(--border-strong)] shadow-2xl p-1.5 space-y-0.5 z-50 animate-in fade-in duration-100 scrollbar-thin">
                  <div className="px-2 py-1 text-[10px] font-semibold text-[var(--text-muted)] border-b border-[var(--border-color)] mb-1">
                    {t("filterModels")}
                  </div>

                  {/* Top quick options */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory("all");
                      setIsCategoryDropdownOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors",
                      selectedCategory === "all"
                        ? "bg-[var(--bg-hover)] text-[var(--text-primary)] font-bold"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                    )}
                  >
                    <span>{t("allModels")}</span>
                    <span className="text-[10px] font-mono opacity-60">({formAvailableModels.length})</span>
                    {selectedCategory === "all" && (
                      <Check className="w-3 h-3 text-[var(--text-primary)] shrink-0 ml-1 stroke-[2.5]" />
                    )}
                  </button>

                  {freeCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory("free");
                        setIsCategoryDropdownOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors",
                        selectedCategory === "free"
                          ? "bg-[var(--bg-hover)] text-[var(--text-primary)] font-bold"
                          : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                      )}
                    >
                      <span>{t("freeModelsOnly")}</span>
                      <span className="text-[10px] font-mono opacity-60">({freeCount})</span>
                      {selectedCategory === "free" && (
                        <Check className="w-3 h-3 text-[var(--text-primary)] shrink-0 ml-1 stroke-[2.5]" />
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory("selected");
                      setIsCategoryDropdownOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors",
                      selectedCategory === "selected"
                        ? "bg-[var(--bg-hover)] text-[var(--text-primary)] font-bold"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                    )}
                  >
                    <span>{t("selectedInPool")}</span>
                    <span className="text-[10px] font-mono opacity-60">({selectedModels.length})</span>
                    {selectedCategory === "selected" && (
                      <Check className="w-3 h-3 text-[var(--text-primary)] shrink-0 ml-1 stroke-[2.5]" />
                    )}
                  </button>

                  {/* Families section */}
                  {availableFamilies.length > 0 && (
                    <>
                      <div className="my-1 border-t border-[var(--border-color)]" />
                      <div className="px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
                        {t("modelFamilies")}
                      </div>
                      {availableFamilies.map(({ family, count }) => {
                        const isSelected = selectedCategory.toLowerCase() === family.toLowerCase();
                        return (
                          <button
                            key={family}
                            type="button"
                            onClick={() => {
                              setSelectedCategory(family);
                              setIsCategoryDropdownOpen(false);
                            }}
                            className={cn(
                              "w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors",
                              isSelected
                                ? "bg-[var(--bg-hover)] text-[var(--text-primary)] font-bold"
                                : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                            )}
                          >
                            <span>{family}</span>
                            <span className="text-[10px] font-mono opacity-60">({count})</span>
                            {isSelected && (
                              <Check className="w-3 h-3 text-[var(--text-primary)] shrink-0 ml-1 stroke-[2.5]" />
                            )}
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>

            {freeCount > 0 && (
              <button
                type="button"
                onClick={handleSelectAllFree}
                className="px-2.5 py-1 bg-[var(--bg-hover)] hover:opacity-80 text-[var(--text-primary)] border border-[var(--border-strong)] text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 font-medium shrink-0"
                title="Add all available free models to routing pool"
              >
                <CheckCheck className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span>{t("selectAllFree")}</span>
              </button>
            )}

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3 h-3 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={t("searchModels")}
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                className="w-32 sm:w-40 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg pl-7 pr-6 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
              />
              {modelSearch && (
                <button
                  type="button"
                  onClick={() => setModelSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onFetchModels}
              disabled={isFetchingFormModels}
              className="px-2.5 py-1 bg-[var(--bg-hover)] hover:opacity-80 text-[var(--text-primary)] border border-[var(--border-strong)] text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 font-medium shrink-0"
              title="Fetch all available models automatically from API endpoint"
            >
              <RefreshCw className={cn("w-3 h-3 text-[var(--text-muted)]", isFetchingFormModels && "animate-spin")} />
              <span>{isFetchingFormModels ? t("syncing") : t("syncFromApi")}</span>
            </button>
          </div>
        </div>

        {/* Model Grid */}
        <div className="max-h-[260px] overflow-y-auto pr-1 space-y-2">
          {filteredModels.length === 0 ? (
            <div className="p-6 text-center text-xs text-[var(--text-muted)] bg-[var(--bg-input)] rounded-xl border border-[var(--border-color)] space-y-3">
              <p>
                {formAvailableModels.length === 0
                  ? "No models configured for this endpoint yet. Click 'Sync from API' or add your model name below."
                  : `No models match current filter "${selectedCategory}" or keyword "${modelSearch}". Try another filter or reset to All.`}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory("all");
                  setModelSearch("");
                }}
                className="px-3 py-1.5 bg-[var(--bg-hover)] border border-[var(--border-strong)] text-[var(--text-primary)] text-xs rounded-xl cursor-pointer inline-flex items-center gap-1"
              >
                {t("resetFilters")}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {filteredModels.map((m) => {
                const isSelected = selectedModels.includes(m);
                const isPrimary = selectedModels[0] === m;
                const priorityIdx = selectedModels.indexOf(m);
                const isFree = isFreeModel(m);
                const family = getModelFamily(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onToggleModelSelection(m)}
                    className={cn(
                      "p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer group",
                      isSelected
                        ? "bg-[var(--bg-hover)] border-[var(--border-strong)] text-[var(--text-primary)] shadow-xs"
                        : "bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                    )}
                  >
                    <div className="truncate pr-2 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-xs truncate font-semibold">{m}</span>
                        {isFree && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--bg-app)] text-[var(--text-primary)] border border-[var(--border-strong)] font-mono">
                            FREE
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] px-1.5 py-0.2 bg-[var(--bg-app)] border border-[var(--border-color)] rounded text-[var(--text-dim)] font-mono">
                          {family}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {isPrimary
                            ? `● ${t("primaryActive")}`
                            : isSelected
                            ? `✓ ${t("fallback")} #${priorityIdx}`
                            : t("clickToSelect")}
                        </span>
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-[var(--text-primary)] shrink-0 stroke-[2.5]" />}
                  </button>
                );
              })}

              {isAddingFormModel ? (
                <div className="flex items-center gap-1.5 bg-[var(--bg-input)] p-2 rounded-xl border border-[var(--border-strong)]">
                  <input
                    type="text"
                    value={formNewModelInput}
                    onChange={(e) => setFormNewModelInput(e.target.value)}
                    placeholder="e.g. gpt-5-pro"
                    autoFocus
                    className="w-full bg-transparent text-xs text-[var(--text-primary)] px-1 focus:outline-none placeholder-[var(--text-dim)] font-mono"
                  />
                  <button
                    type="button"
                    onClick={onAddCustomModelSubmit}
                    className="px-2.5 py-1 bg-[var(--text-primary)] text-[var(--bg-app)] text-xs font-bold rounded-lg cursor-pointer shrink-0"
                  >
                    {t("add")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingFormModel(false)}
                    className="px-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingFormModel(true);
                    setFormNewModelInput("");
                  }}
                  className="p-3 rounded-xl border border-dashed border-[var(--border-strong)] hover:border-[var(--text-muted)] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center gap-1.5 text-xs transition-colors cursor-pointer bg-[var(--bg-input)]/50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t("customModel")}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* FOOTER ACTIONS & TEST CONNECTION STATUS */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-4 border-t border-[var(--border-color)]">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={onTestConnection}
            disabled={isTestingForm}
            className="px-4 py-2 bg-[var(--bg-hover)] hover:opacity-80 text-[var(--text-primary)] text-xs rounded-xl font-medium cursor-pointer flex items-center gap-2 border border-[var(--border-strong)] transition-colors shadow-xs"
          >
            {isTestingForm ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-primary)]" />
            ) : (
              <Wifi className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            )}
            <span>{isTestingForm ? t("testingPing") : t("testConnection")}</span>
          </button>

          {/* Inline Test Result Feedback */}
          {testResult && (
            <div
              className={cn(
                "px-3 py-1.5 rounded-xl border text-xs flex items-center gap-2 font-mono animate-in fade-in duration-100",
                testResult.success
                  ? "bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-strong)]"
                  : "bg-red-500/10 text-red-400 border-red-500/20"
              )}
            >
              <span
                className={cn("w-2 h-2 rounded-full", testResult.success ? "bg-[var(--text-primary)]" : "bg-red-400")}
              />
              <span className="font-semibold">
                {testResult.success
                  ? `✓ Connected (${testResult.timeMs}ms)`
                  : `✕ Failed: ${testResult.error || `HTTP ${testResult.status}`}`}
              </span>
              {testResult.reply && (
                <span className="text-[10px] text-[var(--text-muted)] truncate max-w-[200px]">
                  — Reply: "{testResult.reply}"
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2.5 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs rounded-xl font-medium border border-[var(--border-color)] transition-colors cursor-pointer"
          >
            {t("cancel")}
          </button>
          <button
            type="submit"
            className="px-6 py-2 bg-[var(--text-primary)] text-[var(--bg-app)] hover:opacity-90 text-xs rounded-xl font-semibold transition-all cursor-pointer shadow-xs"
          >
            {t("saveProvider")}
          </button>
        </div>
      </div>
    </form>
  );
}
