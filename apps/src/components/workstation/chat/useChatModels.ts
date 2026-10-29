import { useState, useCallback, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE, apiFetch } from "../../../lib/api";
import {
  resolveActiveSingleModel,
  getProviderDefaultModels,
  loadRetiredModelsFromStorage,
  saveRetiredModelToStorage,
  removeRetiredModelFromStorage,
} from "./chatModelResolver";

export interface ProviderModelItem {
  id: string;
  name: string;
  isRetired: boolean;
}

export function useChatModels() {
  const queryClient = useQueryClient();

  const [reasoningEffort, setReasoningEffortState] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("arunaki_reasoning_effort");
      if (saved) return saved;
      return "low";
    }
    return "low";
  });

  const setReasoningEffort = useCallback((val: string) => {
    setReasoningEffortState(val);
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("arunaki_reasoning_effort", val);
      }
    } catch {}
  }, []);

  const modelsQuery = useQuery({
    queryKey: ["engine-models"],
    queryFn: async () => {
      const folder =
        typeof window !== "undefined"
          ? localStorage.getItem("arunaki_active_folder") || ""
          : "";
      const res = await apiFetch(
        `${API_BASE}/model${folder ? `?directory=${encodeURIComponent(folder)}` : ""}`
      );
      if (!res.ok) return [] as any[];
      const json = await res.json().catch(() => ({}));
      return (json.data ?? []) as any[];
    },
    staleTime: 60_000,
  });

  const tiersFor = useCallback(
    (providerID: string, modelID: string) => {
      const match = modelsQuery.data?.find(
        (m: any) => m?.providerID === providerID && m?.id === modelID
      );
      const ids: string[] = Array.isArray(match?.variants)
        ? match.variants.map((v: any) => String(v?.id ?? "")).filter(Boolean)
        : [];
      return ids;
    },
    [modelsQuery.data]
  );

  const [modelTick, setModelTick] = useState(0);

  const activeModel = useMemo(() => {
    const active = resolveActiveSingleModel();
    const list = modelsQuery.data;
    if (!list?.length) return active;
    const known = (id: string) =>
      list.some((m: any) => m?.providerID === active.providerID && m?.id === id);
    if (known(active.id)) return active;
    const family = active.id.replace(/-(?:low|medium|high|tiered)$/i, "");
    if (family !== active.id && known(family)) {
      try {
        localStorage.setItem("arunaki_active_model", family);
        localStorage.setItem(`arunaki_provider_model_${active.providerID}`, family);
      } catch {}
      return { providerID: active.providerID, id: family };
    }
    return active;
  }, [modelsQuery.data, modelTick]);

  const activeTiers = tiersFor(activeModel.providerID, activeModel.id);

  const [retiredModels, setRetiredModels] = useState<Set<string>>(() => {
    return loadRetiredModelsFromStorage();
  });

  const markModelRetired = useCallback((modelId: string) => {
    if (!modelId) return;
    saveRetiredModelToStorage(modelId);
    setRetiredModels((prev) => {
      const next = new Set(prev);
      next.add(modelId);
      return next;
    });
  }, []);

  const unmarkModelRetired = useCallback((modelId: string) => {
    if (!modelId) return;
    removeRetiredModelFromStorage(modelId);
    setRetiredModels((prev) => {
      if (!prev.has(modelId)) return prev;
      const next = new Set(prev);
      next.delete(modelId);
      return next;
    });
  }, []);

  const providerModels = useMemo<ProviderModelItem[]>(() => {
    const list = modelsQuery.data ?? [];
    const seen = new Set<string>();
    const merged: ProviderModelItem[] = [];

    const pushModel = (id: string, name?: string) => {
      const cleanId = id.trim();
      if (!cleanId || seen.has(cleanId)) return;
      seen.add(cleanId);
      merged.push({
        id: cleanId,
        name: (name || cleanId).trim(),
        isRetired: retiredModels.has(cleanId),
      });
    };

    for (const m of list) {
      if (m?.providerID === activeModel.providerID && m?.id) {
        pushModel(String(m.id), String(m.name ?? m.id));
      }
    }

    const pool =
      typeof window !== "undefined"
        ? localStorage.getItem(`arunaki_provider_models_${activeModel.providerID}`)
        : null;
    if (pool) {
      for (const s of pool.split(",")) {
        pushModel(s);
      }
    }

    for (const id of getProviderDefaultModels(activeModel.providerID)) {
      pushModel(id);
    }

    if (activeModel.id) {
      pushModel(activeModel.id);
    }

    return merged;
  }, [modelsQuery.data, activeModel.providerID, activeModel.id, retiredModels]);

  const setActiveModel = useCallback(
    (providerID: string, id: string) => {
      if (!id) return;
      unmarkModelRetired(id);
      try {
        localStorage.setItem("arunaki_active_provider", providerID);
        localStorage.setItem("arunaki_active_model", id);
        localStorage.setItem(`arunaki_provider_model_${providerID}`, id);
        localStorage.setItem(`arunaki_cli_model_${providerID}`, id);
      } catch {}
      setModelTick((n) => n + 1);
      queryClient.invalidateQueries({ queryKey: ["engine-models"] });
      window.dispatchEvent(
        new CustomEvent("arunaki:provider-change", {
          detail: { providerId: providerID, model: id },
        })
      );
    },
    [queryClient, unmarkModelRetired]
  );

  useEffect(() => {
    const handleProviderChange = () => {
      setModelTick((n) => n + 1);
      queryClient.invalidateQueries({ queryKey: ["engine-models"] });
    };

    window.addEventListener("arunaki:provider-change", handleProviderChange);
    window.addEventListener("storage", handleProviderChange);

    return () => {
      window.removeEventListener("arunaki:provider-change", handleProviderChange);
      window.removeEventListener("storage", handleProviderChange);
    };
  }, [queryClient]);

  return {
    reasoningEffort,
    setReasoningEffort,
    activeModel,
    setActiveModel,
    activeTiers,
    tiersFor,
    providerModels,
    retiredModels,
    markModelRetired,
    unmarkModelRetired,
  };
}
