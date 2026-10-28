import { API_BASE, apiFetch } from "../../../lib/api";
import { sendDesktopNotification } from "../../../lib/notifications";
import { resolveActiveSingleModel } from "./chatModelResolver";

export interface ProviderDiagnostic {
  hasConfiguredProvider: boolean;
  activeProviderName: string;
  modelName?: string;
}

const CLI_NAMES: Record<string, string> = {
  "claude-code": "Claude Code CLI",
  codex: "OpenAI Codex CLI",
  antigravity: "Google Antigravity CLI",
  "gemini-cli": "Google Antigravity CLI",
  gemini: "Google Antigravity CLI",
  opencode: "OpenCode Interpreter",
  "9router": "9Router Gateway",
};

export async function getActiveProviderDiagnostic(): Promise<ProviderDiagnostic> {
  const activeModel = resolveActiveSingleModel();
  try {
    const res = await apiFetch(`${API_BASE}/providers`);
    if (res.ok) {
      const json = await res.json();
      const providers: any[] = json.data || [];
      if (providers.length === 0) {
        return { hasConfiguredProvider: false, activeProviderName: "" };
      }
      const savedActiveId = localStorage.getItem("arunaki_active_provider");
      if (savedActiveId && CLI_NAMES[savedActiveId]) {
        return {
          hasConfiguredProvider: true,
          activeProviderName: CLI_NAMES[savedActiveId],
          modelName:
            activeModel.id ||
            localStorage.getItem("arunaki_active_model") ||
            "CLI Agent",
        };
      }

      const active =
        providers.find((p) => p.id === savedActiveId) ||
        providers.find((p) => p.id === "kenari" || p.apiKey) ||
        providers[0];

      return {
        hasConfiguredProvider: true,
        activeProviderName: active?.name || active?.id || "AI Provider",
        modelName: activeModel.id,
      };
    }
  } catch {}

  const fallbackId = localStorage.getItem("arunaki_active_provider");
  return {
    hasConfiguredProvider: !!fallbackId,
    activeProviderName:
      (fallbackId && CLI_NAMES[fallbackId]) ||
      (fallbackId === "kenari" ? "Kenari" : fallbackId || "AI Provider"),
    modelName: activeModel.id,
  };
}

export async function dispatchCompletionNotification(toolsCount = 0): Promise<void> {
  try {
    const isNotifEnabled =
      localStorage.getItem("arunaki_pref_desktop_notification") !== "false";
    if (!isNotifEnabled) return;

    const notifBody =
      toolsCount > 0
        ? `Executed ${toolsCount} document task${toolsCount > 1 ? "s" : ""} successfully.`
        : "Document response generated.";

    await sendDesktopNotification("Arunaki Workstation", notifBody);
  } catch (err) {
    console.debug("[notification] Completion notification failed:", err);
  }
}
