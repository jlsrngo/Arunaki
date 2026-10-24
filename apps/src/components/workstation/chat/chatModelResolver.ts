/**
 * Model resolution, provider mapping, and retired model tracking for workstation chat.
 */

export const RETIRED_MODELS_STORAGE_KEY = "arunaki_retired_models";
export const RETIREMENT_TTL_MS = 60 * 60 * 1000; // 1 hour TTL: models can be revived or retried

export function isModelValidForProvider(providerId: string, modelId: string): boolean {
  if (!modelId) return false;
  const clean = modelId.trim().toLowerCase();
  if (providerId === "antigravity" || providerId === "gemini" || providerId === "gemini-cli") {
    return (clean.startsWith("gemini") || clean.startsWith("claude")) && !clean.endsWith(":free");
  }
  if (providerId === "claude-code") {
    return clean.startsWith("claude") && !clean.endsWith(":free");
  }
  if (providerId === "codex") {
    return (
      clean.startsWith("o1") ||
      clean.startsWith("o3") ||
      clean.startsWith("gpt-4") ||
      clean.startsWith("gpt-5") ||
      clean.startsWith("gpt-6")
    ) && !clean.endsWith(":free");
  }
  if (providerId === "opencode") {
    return (
      clean.includes("opencode") ||
      clean.includes("groq") ||
      clean.includes("gpt-oss") ||
      clean.includes("qwen") ||
      clean.includes("pickle") ||
      clean.includes("nemotron") ||
      clean.includes("9router") ||
      clean.includes("combomaut")
    );
  }
  if (providerId === "kenari") {
    return !clean.startsWith("gemini") && !clean.startsWith("claude");
  }
  if (providerId === "kiro") {
    return clean.startsWith("kiro/");
  }
  return true;
}

export function getFallbackModelForProvider(providerId: string): string {
  if (providerId === "antigravity" || providerId === "gemini" || providerId === "gemini-cli") {
    return localStorage.getItem("arunaki_cli_model_antigravity") || "gemini-3.8-flash";
  }
  if (providerId === "claude-code" || providerId === "claude") {
    return localStorage.getItem("arunaki_cli_model_claude") || "claude-3.7-sonnet";
  }
  if (providerId === "codex") {
    return localStorage.getItem("arunaki_cli_model_codex") || "o3-mini";
  }
  if (providerId === "opencode") {
    return localStorage.getItem("arunaki_cli_model_opencode") || "groq/openai/gpt-oss-120b";
  }
  if (providerId === "9router" || providerId === "nineRouter") {
    return localStorage.getItem("arunaki_cli_model_nineRouter") || "cx/gpt-5.6-terra";
  }
  if (providerId === "kiro") {
    return localStorage.getItem("arunaki_cli_model_kiro") || "kiro/auto";
  }
  if (providerId === "kenari") {
    return "mimo-v2-5:free";
  }
  return "default";
}

export function resolveActiveSingleModel(): { providerID: string; id: string } {
  let p = localStorage.getItem("arunaki_active_provider") || "kenari";

  // Migrate legacy raw gemini to antigravity local bridge if no cloud API key
  if (p === "gemini" || p === "gemini-cli") {
    const geminiKey = localStorage.getItem("arunaki_gemini_api_key");
    if (!geminiKey || geminiKey === "antigravity-active") {
      p = "antigravity";
    }
  }

  const specific =
    localStorage.getItem(`arunaki_provider_model_${p}`) ||
    (p === "antigravity" || p === "gemini" || p === "gemini-cli"
      ? localStorage.getItem("arunaki_cli_model_antigravity")
      : p === "claude-code"
      ? localStorage.getItem("arunaki_cli_model_claude")
      : p === "kiro"
      ? localStorage.getItem("arunaki_cli_model_kiro")
      : null) ||
    localStorage.getItem("arunaki_active_model");

  if (specific && specific.trim()) {
    const trimmed = specific.trim();
    const firstModel = trimmed.includes(",") ? trimmed.split(",")[0].trim() : trimmed;
    if (firstModel && isModelValidForProvider(p, firstModel)) {
      localStorage.setItem("arunaki_active_model", firstModel);
      return { providerID: p, id: firstModel };
    }
  }

  const pool = localStorage.getItem(`arunaki_provider_models_${p}`);
  if (pool && pool.trim()) {
    const list = pool
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const valid = list.find((m) => isModelValidForProvider(p, m));
    if (valid) {
      localStorage.setItem("arunaki_active_model", valid);
      return { providerID: p, id: valid };
    }
  }

  const fallback = getFallbackModelForProvider(p);
  localStorage.setItem("arunaki_active_model", fallback);
  return {
    providerID: p,
    id: fallback,
  };
}

export function getProviderDefaultModels(providerId: string): string[] {
  if (providerId === "kiro") {
    return ["kiro/auto", "kiro/claude-sonnet-4.5", "kiro/claude-haiku-4.5", "kiro/deepseek-3.2", "kiro/qwen3-coder-next"];
  }
  if (providerId === "antigravity" || providerId === "gemini" || providerId === "gemini-cli") {
    return ["gemini-3.8-flash", "gemini-2.5-pro", "gemini-2.5-flash", "claude-sonnet-4-6"];
  }
  if (providerId === "claude-code" || providerId === "claude") {
    return ["claude-3-7-sonnet", "claude-3-5-sonnet", "claude-3-5-haiku"];
  }
  if (providerId === "codex") {
    return ["o3-mini", "o1", "gpt-4o", "gpt-5.6-terra"];
  }
  if (providerId === "opencode") {
    return ["groq/openai/gpt-oss-120b", "groq/qwen/qwen3.8-27b", "opencode/big-pickle", "9router/ComboMaut"];
  }
  if (providerId === "9router" || providerId === "nineRouter") {
    return ["cx/gpt-5.6-terra", "cx/gpt-5.5", "deepseek-r1", "9router/ComboMaut"];
  }
  if (providerId === "kenari") {
    return ["mimo-v2-5:free", "nemotron-3-super-120b-a12b:free", "glm-4-7-flash:free", "agnes-2-0-flash:free"];
  }
  return [];
}

export function loadRetiredModelsFromStorage(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(RETIRED_MODELS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    const now = Date.now();
    const active = new Set<string>();
    const cleanedRecord: Record<string, number> = {};

    if (Array.isArray(parsed)) {
      localStorage.removeItem(RETIRED_MODELS_STORAGE_KEY);
      return new Set();
    } else if (typeof parsed === "object" && parsed !== null) {
      for (const [id, ts] of Object.entries(parsed)) {
        if (typeof ts === "number" && now - ts < RETIREMENT_TTL_MS) {
          active.add(id);
          cleanedRecord[id] = ts;
        }
      }
      localStorage.setItem(RETIRED_MODELS_STORAGE_KEY, JSON.stringify(cleanedRecord));
    }
    return active;
  } catch {
    return new Set();
  }
}

export function saveRetiredModelToStorage(modelId: string) {
  if (typeof window === "undefined" || !modelId) return;
  try {
    const raw = localStorage.getItem(RETIRED_MODELS_STORAGE_KEY);
    let record: Record<string, number> = {};
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          record = parsed;
        }
      } catch {}
    }
    record[modelId] = Date.now();
    localStorage.setItem(RETIRED_MODELS_STORAGE_KEY, JSON.stringify(record));
  } catch {}
}

export function removeRetiredModelFromStorage(modelId: string) {
  if (typeof window === "undefined" || !modelId) return;
  try {
    const raw = localStorage.getItem(RETIRED_MODELS_STORAGE_KEY);
    if (!raw) return;
    const record = JSON.parse(raw);
    if (typeof record === "object" && record !== null && !Array.isArray(record)) {
      delete record[modelId];
      localStorage.setItem(RETIRED_MODELS_STORAGE_KEY, JSON.stringify(record));
    }
  } catch {}
}
