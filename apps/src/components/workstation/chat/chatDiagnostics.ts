import { API_BASE, apiFetch } from "../../../lib/api";
import { sendDesktopNotification } from "../../../lib/notifications";
import { resolveActiveSingleModel } from "./chatModelResolver";
import { StepItem } from "../LiveExecutionBadge";

export interface ProviderDiagnostic {
  hasConfiguredProvider: boolean;
  activeProviderName: string;
  modelName?: string;
}

export interface CompletionNotificationOptions {
  toolsCount?: number;
  steps?: StepItem[];
  responseText?: string;
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
      const active = providers.find((p) => p.status === "active" || p.isActive) || providers[0];
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

export function buildSmartNotification(
  opts: number | CompletionNotificationOptions
): { title: string; body: string; shouldNotify: boolean } {
  let toolsCount = 0;
  let steps: StepItem[] = [];
  let responseText = "";

  if (typeof opts === "number") {
    toolsCount = opts;
  } else if (opts && typeof opts === "object") {
    toolsCount = opts.toolsCount ?? (opts.steps?.filter((s) => s.iconType === "tool").length || 0);
    steps = opts.steps || [];
    responseText = opts.responseText || "";
  }

  const toolSteps = steps.filter((s) => s.iconType === "tool" || s.toolName);

  if (toolSteps.length > 0) {
    // 1. Look for highest priority / decisive tool step
    const printStep = toolSteps.find((s) => /printed|printing|receipt|struk/i.test(s.label || s.toolName || ""));
    const editOrderStep = toolSteps.find((s) => /edited sales|editing sales|edit_sale_order/i.test(s.label || s.toolName || ""));
    const createOrderStep = toolSteps.find((s) => /created sales|creating sales|create_sale_order/i.test(s.label || s.toolName || ""));
    const voidOrderStep = toolSteps.find((s) => /void|cancel/i.test(s.label || s.toolName || ""));
    const drawerStep = toolSteps.find((s) => /drawer|laci/i.test(s.label || s.toolName || ""));
    const docStep = toolSteps.find((s) => /edited|writing|created|reading|explored/i.test(s.label || s.toolName || ""));

    const primary = printStep || editOrderStep || createOrderStep || voidOrderStep || drawerStep || docStep || toolSteps[toolSteps.length - 1];
    let label = (primary?.label || "Task completed").trim();
    label = label.replace(/\s+done$/i, "").trim();

    const otherCount = toolSteps.length - 1;
    const suffix = otherCount > 0 ? ` (+${otherCount} other task${otherCount > 1 ? "s" : ""})` : "";
    const body = `${label}${suffix}`;

    let title = "Arunaki Workstation";
    if (printStep) title = "Receipt Printed";
    else if (editOrderStep) title = "Sales Order Revised";
    else if (createOrderStep) title = "Sales Order Created";
    else if (voidOrderStep) title = "Sales Order Voided";
    else if (drawerStep) title = "Cash Drawer Kick";
    else if (docStep && /edited/i.test(label)) title = "Document Updated";
    else if (docStep && /created/i.test(label)) title = "Document Created";
    else if (toolSteps.length > 1) title = `${toolSteps.length} Tasks Completed`;
    else title = "Task Completed";

    return { title, body, shouldNotify: true };
  }

  if (toolsCount > 0) {
    const title = `${toolsCount} Task${toolsCount > 1 ? "s" : ""} Completed`;
    const body = `Executed ${toolsCount} task${toolsCount > 1 ? "s" : ""} successfully.`;
    return { title, body, shouldNotify: true };
  }

  // If there are no tool steps (casual conversation / text response)
  // Only trigger desktop OS notification if window is in the background (not focused)
  const isDocumentFocused =
    typeof document !== "undefined" &&
    typeof document.hasFocus === "function" &&
    document.hasFocus();
  if (isDocumentFocused) {
    return { title: "Arunaki Workstation", body: "", shouldNotify: false };
  }

  let cleanExcerpt = "";
  if (responseText) {
    const stripped = responseText
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/\[CANVAS\][\s\S]*?\[\/CANVAS\]/gi, "")
      .replace(/```[\s\S]*?```/gi, "")
      .replace(/[#*`_>~]/g, "")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .join(" ");

    cleanExcerpt = stripped.slice(0, 80).trim();
    if (stripped.length > 80) cleanExcerpt += "...";
  }

  const body = cleanExcerpt || "Response ready.";
  return { title: "Arunaki Workstation", body, shouldNotify: true };
}

export async function dispatchCompletionNotification(
  opts: number | CompletionNotificationOptions = 0
): Promise<void> {
  try {
    const isNotifEnabled =
      localStorage.getItem("arunaki_pref_desktop_notification") !== "false";
    if (!isNotifEnabled) return;

    const { title, body, shouldNotify } = buildSmartNotification(opts);
    if (!shouldNotify || !body) return;

    await sendDesktopNotification(title, body);
  } catch (err) {
    console.debug("[notification] Completion notification failed:", err);
  }
}
