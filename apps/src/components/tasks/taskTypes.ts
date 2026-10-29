import { apiFetch } from "../../lib/api";

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  columnId: "today" | "tomorrow" | "inprogress" | "done";
  targetDate: string; // YYYY-MM-DD
  reminderTime: string; // HH:mm (e.g. "14:30")
  reminderDateTime: string; // ISO format or YYYY-MM-DDTHH:mm
  telegramReminderEnabled: boolean;
  notifiedAt: string | null;
  priority: "low" | "medium" | "high";
  attachedFile: string;
  subtasks: Subtask[];
  gcalUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ColumnConfig {
  id: TaskItem["columnId"];
  titleId: "colToday" | "colTomorrow" | "colInProgress" | "colDone";
  defaultTitle: string;
}

export type TaskViewMode = "all" | "active" | "history";

export const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: "today", titleId: "colToday", defaultTitle: "Hari Ini" },
  { id: "tomorrow", titleId: "colTomorrow", defaultTitle: "Besok" },
  { id: "inprogress", titleId: "colInProgress", defaultTitle: "Sedang Dikerjakan" },
  { id: "done", titleId: "colDone", defaultTitle: "Selesai" },
];

export const TIME_PRESETS = [
  { time: "08:00", label: "08:00 WIB", badge: "Pagi" },
  { time: "09:00", label: "09:00 WIB", badge: "Mulai Jam Kerja" },
  { time: "10:00", label: "10:00 WIB", badge: "Pertengahan Pagi" },
  { time: "11:30", label: "11:30 WIB", badge: "Menjelang Siang" },
  { time: "13:00", label: "13:00 WIB", badge: "Siang" },
  { time: "14:30", label: "14:30 WIB", badge: "Rekap Sore" },
  { time: "16:00", label: "16:00 WIB", badge: "Review" },
  { time: "17:00", label: "17:00 WIB", badge: "Akhir Jam Kerja" },
];

export const PRIORITY_CONFIGS = [
  { id: "low" as const, title: "Normal", badge: "Rendah / Standar", dot: "bg-white/40" },
  { id: "medium" as const, title: "Penting", badge: "Menengah", dot: "bg-white" },
  { id: "high" as const, title: "Mendesak / Kritis", badge: "Tinggi", dot: "bg-[#cf6613]" },
];

export function getTodayString(): string {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

export function getTomorrowString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

/**
 * Builds standard Google Calendar URL with WIB UTC+7 conversion,
 * instructions, checklist, and project attachment references.
 */
export function buildGoogleCalendarUrl(task: {
  title: string;
  targetDate?: string;
  reminderTime?: string;
  description?: string;
  attachedFile?: string;
  priority?: string;
  subtasks?: Subtask[];
}): string {
  const targetDate = task.targetDate || getTodayString();
  const timeStr = task.reminderTime || "09:00";
  const [h, m] = timeStr.split(":").map(Number);
  const dateParts = targetDate.split("-").map(Number);

  // UTC calculation: WIB is UTC+7
  const year = dateParts[0] || new Date().getFullYear();
  const month = (dateParts[1] || 1) - 1;
  const day = dateParts[2] || 1;
  const startHour = (h || 9) - 7;
  const startMin = m || 0;

  const startDate = new Date(Date.UTC(year, month, day, startHour, startMin, 0));
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour duration

  const fmtIso = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, "");
  const startStr = fmtIso(startDate);
  const endStr = fmtIso(endDate);

  const subtaskLines = (task.subtasks || []).map((s) => `${s.completed ? "✓" : "○"} ${s.title}`).join("\n");
  const details = [
    task.description ? `Instruksi / Catatan Kerja:\n${task.description}` : "",
    task.attachedFile ? `Dokumen Proyek Terkait: ${task.attachedFile}` : "",
    subtaskLines ? `Checklist Subtugas:\n${subtaskLines}` : "",
    `Tingkat Prioritas: ${(task.priority || "medium").toUpperCase()}`,
    `Dikelola oleh Arunaki Autonomous Document Assistant`
  ].filter(Boolean).join("\n\n");

  const title = task.title ? `[Arunaki] ${task.title}` : "[Arunaki] Agenda Operasional";

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startStr}/${endStr}&details=${encodeURIComponent(details)}&ctz=Asia/Jakarta`;
}

/**
 * Opens external URL in user's default desktop browser via native engine endpoint
 * with fallback to window.open.
 */
export async function openExternalUrl(url: string): Promise<void> {
  try {
    await apiFetch("/api/desktop/open-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
  } catch {
    window.open(url, "_blank");
  }
}

