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
  columnId: "overdue" | "today" | "inprogress" | "upcoming" | "done" | "tomorrow";
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
  titleId: "colOverdue" | "colToday" | "colInProgress" | "colUpcoming" | "colDone" | "colTomorrow";
  defaultTitle: string;
  titleEn: string;
}

export type TaskViewMode = "all" | "active" | "history";

export const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: "overdue", titleId: "colOverdue", defaultTitle: "Terlewatkan", titleEn: "Overdue" },
  { id: "today", titleId: "colToday", defaultTitle: "Hari Ini", titleEn: "Today" },
  { id: "inprogress", titleId: "colInProgress", defaultTitle: "Sedang Dikerjakan", titleEn: "In Progress" },
  { id: "upcoming", titleId: "colUpcoming", defaultTitle: "Akan Datang", titleEn: "Incoming" },
];

export const TIME_PRESETS = [
  { time: "08:00", label: "08:00 WIB", badge: "Pagi", badgeEn: "Morning" },
  { time: "09:00", label: "09:00 WIB", badge: "Mulai Jam Kerja", badgeEn: "Office Start" },
  { time: "10:00", label: "10:00 WIB", badge: "Pertengahan Pagi", badgeEn: "Mid-Morning" },
  { time: "11:30", label: "11:30 WIB", badge: "Menjelang Siang", badgeEn: "Before Noon" },
  { time: "13:00", label: "13:00 WIB", badge: "Siang", badgeEn: "Afternoon" },
  { time: "14:30", label: "14:30 WIB", badge: "Rekap Sore", badgeEn: "Recap" },
  { time: "16:00", label: "16:00 WIB", badge: "Review", badgeEn: "Review" },
  { time: "17:00", label: "17:00 WIB", badge: "Akhir Jam Kerja", badgeEn: "End of Day" },
];

export const PRIORITY_CONFIGS = [
  { id: "low" as const, title: "Normal", titleEn: "Normal", badge: "Standar", badgeEn: "Standard", dot: "bg-[var(--text-muted)]" },
  { id: "medium" as const, title: "Prioritas Menengah", titleEn: "Medium Priority", badge: "Menengah", badgeEn: "Elevated", dot: "bg-[var(--text-primary)]" },
  { id: "high" as const, title: "Mendesak / Kritis", titleEn: "Urgent / Critical", badge: "Tinggi", badgeEn: "High Urgency", dot: "bg-[#cf6613]" },
];

export function getTodayString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTomorrowString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getYesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Automatically rolls over tasks whose target date has arrived or passed.
 * Specifically:
 * - Migrates legacy 'tomorrow' to 'today' (if <= today) or 'upcoming' (if > today).
 * - Promotes 'upcoming' to 'today' when targetDate <= today.
 * - Detects overdue tasks in 'today' whose targetDate < today -> shifts to 'overdue'.
 * - Returns whether any task was modified along with the updated tasks array.
 */
export function reconcileTasksRollover(tasks: TaskItem[]): { updated: TaskItem[]; hasChanges: boolean } {
  const today = getTodayString();
  let hasChanges = false;

  const updated = tasks.map((task) => {
    // 1. Backward-compatibility: Migrate legacy 'tomorrow' column
    if ((task.columnId as any) === "tomorrow") {
      hasChanges = true;
      const targetCol: TaskItem["columnId"] = task.targetDate && task.targetDate <= today ? "today" : "upcoming";
      return {
        ...task,
        columnId: targetCol,
        updatedAt: new Date().toISOString(),
      };
    }

    // 2. Promotion: If in 'upcoming' and targetDate has arrived (<= today) -> promote to 'today'
    if (task.columnId === "upcoming" && task.targetDate && task.targetDate <= today) {
      hasChanges = true;
      return {
        ...task,
        columnId: "today" as const,
        updatedAt: new Date().toISOString(),
      };
    }

    // 3. Overdue detection:
    // a) If in 'today' and targetDate is strictly before today -> shift to 'overdue'
    // b) If in 'today' and targetDate is today, but reminderTime is set and current time has passed it -> shift to 'overdue'
    if (task.columnId === "today" && task.targetDate) {
      if (task.targetDate < today) {
        hasChanges = true;
        return {
          ...task,
          columnId: "overdue" as const,
          updatedAt: new Date().toISOString(),
        };
      }
      if (task.targetDate === today && task.reminderTime) {
        const [hours, minutes] = task.reminderTime.split(":").map(Number);
        const taskMinutes = (hours || 0) * 60 + (minutes || 0);
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        if (nowMinutes > taskMinutes) {
          hasChanges = true;
          return {
            ...task,
            columnId: "overdue" as const,
            updatedAt: new Date().toISOString(),
          };
        }
      }
    }

    return task;
  });

  return { updated, hasChanges };
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

