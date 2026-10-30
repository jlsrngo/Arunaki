import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { apiFetch } from "../../../lib/api";
import { useI18n } from "../../../lib/i18n";
import { sendDesktopNotification } from "../../../lib/notifications";
import {
  TaskItem,
  TaskViewMode,
  getTodayString,
  getTomorrowString,
  reconcileTasksRollover,
  buildGoogleCalendarUrl,
  openExternalUrl,
} from "../taskTypes";

export function useTasksBoard() {
  const { t, language } = useI18n();
  const isIndonesian = language === "id";

  const [activeFolder, setActiveFolder] = useState<string>(() => {
    return localStorage.getItem("arunaki_active_folder") || "";
  });

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [projectFiles, setProjectFiles] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<TaskViewMode>("all");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [initialColumn, setInitialColumn] = useState<TaskItem["columnId"]>("today");

  const [isSendingTelegram, setIsSendingTelegram] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  const tasksRef = useRef<TaskItem[]>([]);
  tasksRef.current = tasks;

  // Sync active folder
  useEffect(() => {
    const handleFolderChange = (e: any) => {
      const folder = e?.detail?.folder || localStorage.getItem("arunaki_active_folder") || "";
      setActiveFolder(folder);
    };
    window.addEventListener("arunaki-folder-change", handleFolderChange);
    return () => window.removeEventListener("arunaki-folder-change", handleFolderChange);
  }, []);

  // Save tasks to disk (.arunaki/tasks.json)
  const saveTasks = useCallback(async (newTasks: TaskItem[]) => {
    setTasks(newTasks);

    if (activeFolder) {
      localStorage.setItem(`arunaki_tasks_${activeFolder}`, JSON.stringify(newTasks));
    }

    if (!activeFolder) {
      localStorage.setItem("arunaki_offline_tasks", JSON.stringify(newTasks));
      return;
    }

    try {
      const payloadStr = JSON.stringify(newTasks, null, 2);
      await apiFetch("/api/desktop/write-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: ".arunaki/tasks.json",
          directory: activeFolder,
          content: payloadStr,
        }),
      });
    } catch (err) {
      console.error("[TasksBoard] Failed to save tasks to disk:", err);
    }
  }, [activeFolder]);

  // Load project files for attachment suggestion
  const loadProjectFiles = useCallback(async () => {
    if (!activeFolder) {
      setProjectFiles([]);
      return;
    }
    try {
      const res = await apiFetch("/api/desktop/folder-tree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderPath: activeFolder }),
      });
      const data = await res.json();
      if (data?.files && Array.isArray(data.files)) {
        setProjectFiles(data.files);
      } else if (data?.tree?.children) {
        const fileNames: string[] = [];
        const traverse = (node: any) => {
          if (node.type === "file") {
            fileNames.push(node.name);
          }
          if (node.children) {
            node.children.forEach(traverse);
          }
        };
        traverse(data.tree);
        setProjectFiles(fileNames);
      }
    } catch {
      setProjectFiles([]);
    }
  }, [activeFolder]);

  // Load tasks from .arunaki/tasks.json with automatic day rollover
  const loadTasks = useCallback(async () => {
    if (!activeFolder) {
      const savedOffline = localStorage.getItem("arunaki_offline_tasks");
      if (savedOffline) {
        try {
          const parsed = JSON.parse(savedOffline);
          if (Array.isArray(parsed)) {
            const { updated, hasChanges } = reconcileTasksRollover(parsed);
            setTasks(updated);
            if (hasChanges) {
              localStorage.setItem("arunaki_offline_tasks", JSON.stringify(updated));
            }
          }
        } catch {
          setTasks([]);
        }
      }
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiFetch("/api/desktop/read-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: ".arunaki/tasks.json",
          directory: activeFolder,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.content === "string") {
          try {
            const parsed = JSON.parse(data.content);
            if (Array.isArray(parsed)) {
              const { updated, hasChanges } = reconcileTasksRollover(parsed);
              setTasks(updated);
              if (hasChanges) {
                void saveTasks(updated);
              }
              return;
            }
          } catch {
            // Ignore parse errors
          }
        }
      }

      // Fallback: Read from localStorage if file doesn't exist
      const local = localStorage.getItem(`arunaki_tasks_${activeFolder}`);
      if (local) {
        try {
          const parsed = JSON.parse(local);
          if (Array.isArray(parsed)) {
            const { updated, hasChanges } = reconcileTasksRollover(parsed);
            setTasks(updated);
            if (hasChanges) {
              void saveTasks(updated);
            }
            return;
          }
        } catch {
          setTasks([]);
        }
      } else {
        setTasks([]);
      }
    } catch (err) {
      console.warn("[TasksBoard] Failed to read tasks file:", err);
      setTasks([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeFolder, saveTasks]);

  // 1-Click Sync to Google Calendar
  const syncToGoogleCalendar = useCallback((task: TaskItem) => {
    try {
      const gcalUrl = task.gcalUrl || buildGoogleCalendarUrl(task);
      openExternalUrl(gcalUrl);
      toast.success(isIndonesian ? `Membuka Google Calendar untuk '${task.title}'` : `Opening Google Calendar for '${task.title}'`);
    } catch (err: any) {
      toast.error(`Gagal menghubungkan ke Google Calendar: ${err.message || err}`);
    }
  }, [isIndonesian]);

  // Dispatch professional reminder to Telegram
  const sendTelegramReminder = useCallback(async (task: TaskItem, isManual = false) => {
    setIsSendingTelegram(task.id);
    const toastId = isManual ? toast.loading(`${isIndonesian ? "Mengirim agenda" : "Dispatching agenda"} '${task.title}'...`) : null;

    try {
      const dateLabel = task.targetDate === getTodayString()
        ? t("taskToday", "Today")
        : task.targetDate === getTomorrowString()
        ? t("taskTomorrow", "Tomorrow")
        : task.targetDate;

      const priorityLabel = task.priority === "high"
        ? t("taskPriorityHigh", "High Urgency")
        : task.priority === "medium"
        ? t("taskPriorityMedium", "Medium Priority")
        : t("taskPriorityNormal", "Normal");

      const subtaskLines = (task.subtasks || [])
        .map((st) => `  ${st.completed ? "✓" : "○"} ${st.title}`)
        .join("\n");

      const messageDetails = [
        `*${isIndonesian ? "Waktu Pelaksanaan" : "Scheduled Time"}:* ${dateLabel}${task.reminderTime ? ` (${task.reminderTime} WIB)` : ""}`,
        `*${isIndonesian ? "Tingkat Prioritas" : "Priority Level"}:* ${priorityLabel}`,
        task.attachedFile ? `*${isIndonesian ? "Dokumen Terkait" : "Attached Document"}:* \`${task.attachedFile}\`` : "",
        task.description ? `*${isIndonesian ? "Instruksi Kerja" : "Work Instructions"}:*\n${task.description}` : "",
        subtaskLines ? `*${isIndonesian ? "Daftar Subtugas" : "Subtasks"}:*\n${subtaskLines}` : "",
      ].filter(Boolean).join("\n\n");

      const alertTitle = isIndonesian
        ? `Agenda Operasional: ${task.title}`
        : `Operational Agenda: ${task.title}`;

      const res = await apiFetch("/api/telegram/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directory: activeFolder,
          workspace_dir: activeFolder,
          type: "alert",
          kind: "alert",
          severity: task.priority === "high" ? "HIGH" : "NORMAL",
          title: alertTitle,
          details: messageDetails,
          content: messageDetails,
          summary_markdown: messageDetails,
        }),
      });

      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resJson?.error || `HTTP ${res.status}`);
      }

      const delivered = resJson?.delivered_live ?? resJson?.record?.delivered_live ?? true;
      const deliveryStatus = resJson?.delivery_status || resJson?.record?.delivery_status || "";

      if (delivered === false) {
        console.warn("[TasksBoard] Telegram not delivered live:", deliveryStatus);
        if (isManual && toastId) {
          toast.error(
            isIndonesian
              ? `Gagal terkirim ke Telegram: ${deliveryStatus}. Pastikan Anda sudah klik Start di bot Telegram dan mengisi ID numerik di Settings.`
              : `Telegram dispatch notice: ${deliveryStatus}. Ensure you started the bot and entered your numeric ID.`,
            { id: toastId, duration: 6000 }
          );
        }
        return;
      }

      const nowIso = new Date().toISOString();
      const updated = tasksRef.current.map((tItem) =>
        tItem.id === task.id ? { ...tItem, notifiedAt: nowIso } : tItem
      );
      await saveTasks(updated);

      if (isManual && toastId) {
        toast.success(
          isIndonesian
            ? `Pemberitahuan agenda '${task.title}' terkirim ke Telegram HP!`
            : `Agenda reminder '${task.title}' dispatched to Telegram!`,
          { id: toastId }
        );
      }
    } catch (err: any) {
      console.warn("[TasksBoard] Telegram dispatch error:", err);
      if (isManual && toastId) {
        toast.error(`Telegram alert error: ${err?.message || err}. Pastikan Bot Token sudah disetting di Settings.`, { id: toastId });
      }
    } finally {
      setIsSendingTelegram(null);
    }
  }, [activeFolder, isIndonesian, saveTasks, t]);

  // Background Reminder Worker & Date Rollover (Runs every 20 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const currentTasks = tasksRef.current;

      // 1. Check Date Rollover (e.g. crossing midnight while app is open)
      const { updated, hasChanges } = reconcileTasksRollover(currentTasks);
      if (hasChanges) {
        void saveTasks(updated);
      }

      // 2. Check Telegram Reminders
      for (const task of updated) {
        if (!task.telegramReminderEnabled) continue;
        if (task.columnId === "done") continue;
        if (task.notifiedAt) continue;

        if (task.targetDate && task.reminderTime) {
          const [hours, minutes] = task.reminderTime.split(":").map(Number);
          const taskDate = new Date(`${task.targetDate}T${String(hours || 0).padStart(2, "0")}:${String(minutes || 0).padStart(2, "0")}:00`);

          if (!isNaN(taskDate.getTime()) && now >= taskDate) {
            const dateLabel = task.targetDate === getTodayString()
              ? t("taskToday", "Today")
              : task.targetDate === getTomorrowString()
              ? t("taskTomorrow", "Tomorrow")
              : task.targetDate;

            void sendDesktopNotification(
              t("tasksBoardTitle", "Operational Agenda & Task Board"),
              `${task.title} (${dateLabel}${task.reminderTime ? ` — ${task.reminderTime}` : ""})`
            );
            void sendTelegramReminder(task, false);
          }
        }
      }
    }, 20000);

    return () => clearInterval(interval);
  }, [saveTasks, sendTelegramReminder, t]);

  // Initial load
  useEffect(() => {
    void loadTasks();
    void loadProjectFiles();
  }, [loadTasks, loadProjectFiles]);

  // Live event listener
  useEffect(() => {
    const handleReload = () => {
      void loadTasks();
    };
    const handleEngineEvent = (e: any) => {
      if (e?.detail?.type === "tasks.updated") {
        void loadTasks();
      }
    };
    window.addEventListener("arunaki-tasks-updated", handleReload);
    window.addEventListener("arunaki-event", handleEngineEvent);
    return () => {
      window.removeEventListener("arunaki-tasks-updated", handleReload);
      window.removeEventListener("arunaki-event", handleEngineEvent);
    };
  }, [loadTasks]);

  // Actions
  const openNewTaskModal = (col: TaskItem["columnId"] = "today") => {
    setEditingTask(null);
    setInitialColumn(col);
    setIsModalOpen(true);
  };

  const openEditTaskModal = (task: TaskItem) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleDeleteTask = async (id: string) => {
    const updated = tasks.filter((t) => t.id !== id);
    await saveTasks(updated);
    toast.success(isIndonesian ? "Agenda dihapus" : "Task deleted");
  };

  const handleCompleteTask = async (id: string) => {
    const updated = tasks.map((t) =>
      t.id === id
        ? { ...t, columnId: "done" as const, updatedAt: new Date().toISOString() }
        : t
    );
    await saveTasks(updated);
    toast.success(
      isIndonesian
        ? "Agenda selesai dan disimpan ke Riwayat!"
        : "Task completed and archived to History!"
    );
  };

  const handleRestoreTask = async (id: string) => {
    const updated = tasks.map((t) =>
      t.id === id
        ? { ...t, columnId: "today" as const, targetDate: getTodayString(), updatedAt: new Date().toISOString() }
        : t
    );
    await saveTasks(updated);
    toast.success(
      isIndonesian
        ? "Agenda dipulihkan kembali ke papan Hari Ini"
        : "Task restored back to Today board"
    );
  };

  const handleToggleSubtask = async (taskId: string, subtaskId: string) => {
    const updated = tasks.map((t) => {
      if (t.id === taskId) {
        const subtasks = (t.subtasks || []).map((st) =>
          st.id === subtaskId ? { ...st, completed: !st.completed } : st
        );
        return { ...t, subtasks };
      }
      return t;
    });
    await saveTasks(updated);
  };

  const handleDragStart = (taskId: string) => {
    setDraggedTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (targetColumn: TaskItem["columnId"]) => {
    if (!draggedTaskId) return;
    const curToday = getTodayString();
    const curTomorrow = getTomorrowString();

    const updated = tasks.map((t) => {
      if (t.id === draggedTaskId) {
        let newDate = t.targetDate;
        if (targetColumn === "today") {
          newDate = curToday;
        } else if (targetColumn === "upcoming") {
          if (!t.targetDate || t.targetDate <= curToday) {
            newDate = curTomorrow;
          }
        }
        return {
          ...t,
          columnId: targetColumn,
          targetDate: newDate,
          updatedAt: new Date().toISOString(),
        };
      }
      return t;
    });
    setDraggedTaskId(null);
    await saveTasks(updated);
  };

  const handleOpenFileInWorkstation = (fileName: string) => {
    window.dispatchEvent(
      new CustomEvent("arunaki-open-file", {
        detail: { filePath: fileName },
      })
    );
  };

  return {
    activeFolder,
    tasks,
    isLoading,
    searchQuery,
    setSearchQuery,
    viewMode,
    setViewMode,
    projectFiles,
    isModalOpen,
    setIsModalOpen,
    isHistoryModalOpen,
    setIsHistoryModalOpen,
    editingTask,
    initialColumn,
    isSendingTelegram,
    draggedTaskId,
    loadTasks,
    saveTasks,
    syncToGoogleCalendar,
    sendTelegramReminder,
    openNewTaskModal,
    openEditTaskModal,
    handleDeleteTask,
    handleCompleteTask,
    handleRestoreTask,
    handleToggleSubtask,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleOpenFileInWorkstation,
    isIndonesian,
    t,
  };
}
