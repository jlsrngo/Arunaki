import { useState, useEffect, useRef, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Kanban,
  Plus,
  Clock,
  Calendar,
  Send,
  Paperclip,
  CheckSquare,
  Square,
  Trash2,
  Bell,
  BellRing,
  ExternalLink,
  X,
  FileSpreadsheet,
  FileText,
  Search,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import { apiFetch } from "../lib/api";
import { sendDesktopNotification } from "../lib/notifications";

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
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_COLUMNS: { id: TaskItem["columnId"]; titleId: string; defaultTitle: string }[] = [
  { id: "today", titleId: "colToday", defaultTitle: "Hari Ini" },
  { id: "tomorrow", titleId: "colTomorrow", defaultTitle: "Besok" },
  { id: "inprogress", titleId: "colInProgress", defaultTitle: "Sedang Dikerjakan" },
  { id: "done", titleId: "colDone", defaultTitle: "Selesai" },
];

function getTodayString(): string {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

function getTomorrowString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

export const TasksBoardPage = memo(function TasksBoardPage() {
  const navigate = useNavigate();

  const [activeFolder, setActiveFolder] = useState<string>(() => {
    return localStorage.getItem("arunaki_active_folder") || "";
  });

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [projectFiles, setProjectFiles] = useState<string[]>([]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [modalTitle, setModalTitle] = useState("");
  const [modalDescription, setModalDescription] = useState("");
  const [modalColumn, setModalColumn] = useState<TaskItem["columnId"]>("today");
  const [modalDate, setModalDate] = useState(getTodayString());
  const [modalTime, setModalTime] = useState("09:00");
  const [modalTelegram, setModalTelegram] = useState(true);
  const [modalPriority, setModalPriority] = useState<TaskItem["priority"]>("medium");
  const [modalFile, setModalFile] = useState("");
  const [modalSubtasks, setModalSubtasks] = useState<Subtask[]>([]);
  const [newSubtaskInput, setNewSubtaskInput] = useState("");

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
        setProjectFiles(data.files.map((f: any) => f.path || f.name).filter(Boolean));
      }
    } catch {
      // ignore
    }
  }, [activeFolder]);

  // Load tasks from .arunaki/tasks.json or localStorage fallback
  const loadTasks = useCallback(async () => {
    setIsLoading(true);
    if (!activeFolder) {
      // LocalStorage fallback when no workspace opened
      try {
        const raw = localStorage.getItem("arunaki_offline_tasks");
        if (raw) {
          const parsed = JSON.parse(raw);
          setTasks(Array.isArray(parsed) ? parsed : []);
        } else {
          setTasks([]);
        }
      } catch {
        setTasks([]);
      }
      setIsLoading(false);
      return;
    }

    try {
      const res = await apiFetch("/api/desktop/read-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: ".arunaki/tasks.json",
          directory: activeFolder,
        }),
      });

      const data = await res.json();
      if (data?.content) {
        let contentStr = data.content;
        if (contentStr.startsWith("data:") && contentStr.includes("base64,")) {
          contentStr = atob(contentStr.split("base64,")[1] || "");
        }
        const parsed = JSON.parse(contentStr);
        if (Array.isArray(parsed)) {
          setTasks(parsed);
        } else if (parsed?.tasks && Array.isArray(parsed.tasks)) {
          setTasks(parsed.tasks);
        } else {
          setTasks([]);
        }
      } else {
        // Init empty tasks file if not present
        setTasks([]);
      }
    } catch {
      // File not found or read error, fallback to empty
      setTasks([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeFolder]);

  useEffect(() => {
    loadTasks();
    loadProjectFiles();
  }, [loadTasks, loadProjectFiles]);

  // Save tasks to disk and localStorage
  const saveTasks = useCallback(async (newTasks: TaskItem[]) => {
    setTasks(newTasks);
    tasksRef.current = newTasks;

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

  // Dispatch reminder to Telegram
  const sendTelegramReminder = useCallback(async (task: TaskItem, isManual = false) => {
    setIsSendingTelegram(task.id);
    const toastId = isManual ? toast.loading(`Mengirim pengingat '${task.title}' ke Telegram...`) : null;

    try {
      const dateLabel = task.targetDate === getTodayString()
        ? "Hari Ini"
        : task.targetDate === getTomorrowString()
        ? "Besok"
        : task.targetDate;

      const subtaskLines = (task.subtasks || [])
        .map((st) => `  ${st.completed ? "✓" : "○"} ${st.title}`)
        .join("\n");

      const messageDetails = [
        `*Jadwal:* ${dateLabel}${task.reminderTime ? ` jam ${task.reminderTime} WIB` : ""}`,
        task.priority === "high" ? `*Prioritas:* Mendesak (High)` : "",
        task.attachedFile ? `*File Terkait:* \`${task.attachedFile}\`` : "",
        task.description ? `*Catatan:*\n${task.description}` : "",
        subtaskLines ? `*Daftar Subtask:*\n${subtaskLines}` : "",
      ].filter(Boolean).join("\n\n");

      const res = await apiFetch("/api/telegram/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "alert",
          title: `PENGINGAT KERJAAN ADMIN: ${task.title}`,
          details: messageDetails,
          severity: task.priority === "high" ? "HIGH" : "INFO",
          workspace_dir: activeFolder || ".",
        }),
      });

      const data = await res.json();
      if (data?.error) {
        throw new Error(data.error?.message || "Gagal mengirim ke Telegram");
      }

      // Mark task as notified
      const updated = tasksRef.current.map((t) =>
        t.id === task.id ? { ...t, notifiedAt: new Date().toISOString() } : t
      );
      await saveTasks(updated);

      if (isManual && toastId) {
        toast.success(`Pengingat '${task.title}' terkirim ke Telegram HP!`, { id: toastId });
      }
    } catch (err: any) {
      console.warn("[TasksBoard] Telegram dispatch error:", err);
      if (isManual && toastId) {
        toast.error(`Telegram alert error: ${err?.message || err}. Pastikan Bot Token sudah disetting di Settings.`, { id: toastId });
      }
    } finally {
      setIsSendingTelegram(null);
    }
  }, [activeFolder, saveTasks]);

  // Background Reminder Worker (Runs every 20 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const currentTasks = tasksRef.current;

      for (const task of currentTasks) {
        if (!task.telegramReminderEnabled) continue;
        if (task.columnId === "done") continue;
        if (task.notifiedAt) continue; // Already sent

        if (task.targetDate && task.reminderTime) {
          const [hours, minutes] = task.reminderTime.split(":").map(Number);
          const taskDate = new Date(`${task.targetDate}T${String(hours || 0).padStart(2, "0")}:${String(minutes || 0).padStart(2, "0")}:00`);

          if (!isNaN(taskDate.getTime()) && now >= taskDate) {
            // Trigger Desktop Toast & Telegram Dispatch
            void sendDesktopNotification(
              "Pengingat Kerjaan Admin — Arunaki",
              `${task.title}${task.reminderTime ? ` (Jadwal: ${task.reminderTime})` : ""}`
            );
            void sendTelegramReminder(task, false);
          }
        }
      }
    }, 20000);

    return () => clearInterval(interval);
  }, [sendTelegramReminder]);

  // Modal Open Handler
  const openNewTaskModal = (col: TaskItem["columnId"] = "today") => {
    setEditingTask(null);
    setModalTitle("");
    setModalDescription("");
    setModalColumn(col);
    setModalDate(col === "tomorrow" ? getTomorrowString() : getTodayString());
    setModalTime("09:00");
    setModalTelegram(true);
    setModalPriority("medium");
    setModalFile("");
    setModalSubtasks([]);
    setNewSubtaskInput("");
    setIsModalOpen(true);
  };

  const openEditTaskModal = (task: TaskItem) => {
    setEditingTask(task);
    setModalTitle(task.title);
    setModalDescription(task.description || "");
    setModalColumn(task.columnId);
    setModalDate(task.targetDate || getTodayString());
    setModalTime(task.reminderTime || "09:00");
    setModalTelegram(Boolean(task.telegramReminderEnabled));
    setModalPriority(task.priority || "medium");
    setModalFile(task.attachedFile || "");
    setModalSubtasks(task.subtasks || []);
    setNewSubtaskInput("");
    setIsModalOpen(true);
  };

  const handleSaveModal = async () => {
    if (!modalTitle.trim()) {
      toast.error("Judul tugas wajib diisi");
      return;
    }

    const nowIso = new Date().toISOString();
    const reminderDateTime = `${modalDate}T${modalTime}:00`;

    if (editingTask) {
      // Update existing
      const updated = tasks.map((t) => {
        if (t.id === editingTask.id) {
          return {
            ...t,
            title: modalTitle.trim(),
            description: modalDescription.trim(),
            columnId: modalColumn,
            targetDate: modalDate,
            reminderTime: modalTime,
            reminderDateTime,
            telegramReminderEnabled: modalTelegram,
            priority: modalPriority,
            attachedFile: modalFile,
            subtasks: modalSubtasks,
            updatedAt: nowIso,
          };
        }
        return t;
      });
      await saveTasks(updated);
      toast.success("Tugas berhasil diperbarui");
    } else {
      // Create new
      const newTask: TaskItem = {
        id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        title: modalTitle.trim(),
        description: modalDescription.trim(),
        columnId: modalColumn,
        targetDate: modalDate,
        reminderTime: modalTime,
        reminderDateTime,
        telegramReminderEnabled: modalTelegram,
        notifiedAt: null,
        priority: modalPriority,
        attachedFile: modalFile,
        subtasks: modalSubtasks,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await saveTasks([newTask, ...tasks]);
      toast.success("Tugas baru ditambahkan ke papan");
    }

    setIsModalOpen(false);
  };

  const handleDeleteTask = async (id: string) => {
    const updated = tasks.filter((t) => t.id !== id);
    await saveTasks(updated);
    toast.success("Tugas dihapus");
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

  // Drag and Drop Handlers
  const handleDragStart = (taskId: string) => {
    setDraggedTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (targetColumn: TaskItem["columnId"]) => {
    if (!draggedTaskId) return;
    const updated = tasks.map((t) => {
      if (t.id === draggedTaskId) {
        return {
          ...t,
          columnId: targetColumn,
          targetDate: targetColumn === "tomorrow" ? getTomorrowString() : targetColumn === "today" ? getTodayString() : t.targetDate,
          updatedAt: new Date().toISOString(),
        };
      }
      return t;
    });
    setDraggedTaskId(null);
    await saveTasks(updated);
  };

  // Open Document in Center Panel Workstation
  const handleOpenFileInWorkstation = (filename: string) => {
    if (!filename) return;
    const query = new URLSearchParams();
    if (activeFolder) query.set("folder", activeFolder);
    query.set("openFile", filename);
    navigate(`/?${query.toString()}`);
  };

  const filteredTasks = tasks.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      (t.attachedFile && t.attachedFile.toLowerCase().includes(q))
    );
  });

  return (
    <div className="w-full h-full flex flex-col bg-[var(--bg-app)] text-[var(--text-primary)] select-none overflow-hidden">
      {/* 1. Header Toolbar */}
      <div className="h-14 px-6 border-b border-[var(--border-color)] bg-[var(--bg-header)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-color)] flex items-center justify-center">
            <Kanban className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white flex items-center gap-2">
              Agenda & Papan Tugas Admin
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-color)] font-mono">
                {tasks.length} Tugas
              </span>
            </h1>
            <p className="text-[11px] text-[var(--text-muted)] truncate max-w-[420px]">
              {activeFolder ? activeFolder : "Buka folder proyek untuk sinkronisasi otomatis (.arunaki/tasks.json)"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Search box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari tugas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-44 h-8 pl-8 pr-3 text-xs bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-lg text-white focus:outline-none focus:border-[var(--border-strong)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          <button
            type="button"
            onClick={loadTasks}
            disabled={isLoading}
            title="Refresh Papan"
            className="h-8 w-8 flex items-center justify-center rounded-lg bg-[var(--bg-panel)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-white transition-colors cursor-pointer"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
          </button>

          <button
            type="button"
            onClick={() => openNewTaskModal("today")}
            className="h-8 px-3 rounded-lg bg-[#cf6613] hover:bg-[#b8550f] text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 text-white" />
            <span>Tambah Kerja Hari Ini</span>
          </button>
        </div>
      </div>

      {/* 2. Kanban Board Grid */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 flex gap-5">
        {DEFAULT_COLUMNS.map((col) => {
          const colTasks = filteredTasks.filter((t) => t.columnId === col.id);

          return (
            <div
              key={col.id}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(col.id)}
              className="w-80 shrink-0 flex flex-col rounded-xl bg-[var(--bg-panel)] border border-[var(--border-color)] overflow-hidden shadow-sm"
            >
              {/* Column Header */}
              <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-header)]/60">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-semibold text-white">{col.defaultTitle}</h2>
                  <span className="text-[10.5px] font-mono px-2 py-0.5 rounded-full bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-color)]">
                    {colTasks.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => openNewTaskModal(col.id)}
                  title={`Tambah tugas di ${col.defaultTitle}`}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-white transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Column Card List */}
              <div className="flex-1 p-3 overflow-y-auto space-y-2.5 min-h-[140px]">
                {colTasks.length === 0 ? (
                  <div className="h-28 border border-dashed border-[var(--border-color)]/70 rounded-lg flex flex-col items-center justify-center text-[var(--text-muted)] text-[11px] gap-1 p-3 text-center">
                    <span>Belum ada kerjaan</span>
                    <button
                      type="button"
                      onClick={() => openNewTaskModal(col.id)}
                      className="text-[10px] text-[#cf6613] hover:underline cursor-pointer"
                    >
                      + Buat tugas
                    </button>
                  </div>
                ) : (
                  colTasks.map((task) => {
                    const completedSubtasks = (task.subtasks || []).filter((s) => s.completed).length;
                    const totalSubtasks = (task.subtasks || []).length;

                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={() => handleDragStart(task.id)}
                        onClick={() => openEditTaskModal(task)}
                        className={cn(
                          "group p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-[var(--border-strong)] transition-all cursor-pointer shadow-sm relative space-y-2.5",
                          task.priority === "high" && "border-l-2 border-l-[#cf6613]",
                          draggedTaskId === task.id && "opacity-40"
                        )}
                      >
                        {/* Title and Action */}
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-xs font-medium text-white leading-snug line-clamp-2">
                            {task.title}
                          </h3>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              sendTelegramReminder(task, true);
                            }}
                            disabled={isSendingTelegram === task.id}
                            title="Kirim notifikasi pengingat ke Telegram sekarang"
                            className="shrink-0 p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-white transition-colors"
                          >
                            <Send className={cn("w-3.5 h-3.5", isSendingTelegram === task.id && "animate-pulse text-[#cf6613]")} />
                          </button>
                        </div>

                        {/* Description Preview */}
                        {task.description && (
                          <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                            {task.description}
                          </p>
                        )}

                        {/* Attached File Quick Open */}
                        {task.attachedFile && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenFileInWorkstation(task.attachedFile);
                            }}
                            title={`Buka ${task.attachedFile} di Workstation`}
                            className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--bg-hover)] text-[10.5px] text-[var(--text-secondary)] hover:text-white border border-[var(--border-color)] truncate transition-colors cursor-pointer"
                          >
                            {task.attachedFile.endsWith(".xlsx") || task.attachedFile.endsWith(".csv") ? (
                              <FileSpreadsheet className="w-3 h-3 text-white shrink-0" />
                            ) : (
                              <FileText className="w-3 h-3 text-white shrink-0" />
                            )}
                            <span className="truncate">{task.attachedFile}</span>
                            <ExternalLink className="w-2.5 h-2.5 text-[var(--text-muted)] ml-auto shrink-0" />
                          </div>
                        )}

                        {/* Subtasks Progress */}
                        {totalSubtasks > 0 && (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                              <span>Checklist Subtask</span>
                              <span>{completedSubtasks}/{totalSubtasks}</span>
                            </div>
                            <div className="w-full h-1 bg-[var(--bg-hover)] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-white transition-all duration-300"
                                style={{ width: `${(completedSubtasks / totalSubtasks) * 100}%` }}
                              />
                            </div>
                            <div className="space-y-1 pt-0.5">
                              {task.subtasks.slice(0, 3).map((st) => (
                                <div
                                  key={st.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleSubtask(task.id, st.id);
                                  }}
                                  className="flex items-center gap-1.5 text-[10.5px] text-[var(--text-secondary)] hover:text-white"
                                >
                                  {st.completed ? (
                                    <CheckSquare className="w-3 h-3 text-white shrink-0" />
                                  ) : (
                                    <Square className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                                  )}
                                  <span className={cn("truncate", st.completed && "line-through text-[var(--text-muted)]")}>
                                    {st.title}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Footer Badges */}
                        <div className="flex items-center justify-between pt-1 border-t border-[var(--border-color)]/60 text-[10.5px] text-[var(--text-muted)]">
                          <div className="flex items-center gap-1.5">
                            {task.reminderTime ? (
                              <span className="flex items-center gap-1 text-[var(--text-secondary)] font-mono">
                                <Clock className="w-3 h-3 text-[var(--text-muted)]" />
                                {task.reminderTime}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[var(--text-muted)]">
                                <Calendar className="w-3 h-3" />
                                {task.targetDate}
                              </span>
                            )}

                            {task.telegramReminderEnabled && (
                              <span
                                title={task.notifiedAt ? "Notifikasi Telegram sudah terkirim" : "Pengingat Telegram aktif"}
                                className={cn(
                                  "p-0.5 rounded",
                                  task.notifiedAt ? "text-white" : "text-[#cf6613]"
                                )}
                              >
                                {task.notifiedAt ? (
                                  <BellRing className="w-3 h-3" />
                                ) : (
                                  <Bell className="w-3 h-3" />
                                )}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            {task.priority === "high" && (
                              <span className="px-1.5 py-0.5 rounded text-[9.5px] font-medium bg-[#cf6613]/15 text-[#cf6613] border border-[#cf6613]/30">
                                Mendesak
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Task Creation & Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-[var(--bg-panel)] border border-[var(--border-strong)] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-header)]">
              <div className="flex items-center gap-2">
                <Kanban className="w-4 h-4 text-white" />
                <h3 className="text-sm font-semibold text-white">
                  {editingTask ? "Edit Kerjaan Admin" : "Catat Kerjaan Baru"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-md text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* Judul Tugas */}
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  Judul Tugas <span className="text-[#cf6613]">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Misal: Rekap faktur pajak supplier PT Makmur..."
                  value={modalTitle}
                  onChange={(e) => setModalTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-white focus:outline-none focus:border-[var(--border-strong)] text-xs placeholder:text-[var(--text-muted)]"
                />
              </div>

              {/* Target Kolom & Tanggal Cepat */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                    Kolom Papan
                  </label>
                  <select
                    value={modalColumn}
                    onChange={(e) => setModalColumn(e.target.value as any)}
                    className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-white focus:outline-none focus:border-[var(--border-strong)] text-xs"
                  >
                    <option value="today">Hari Ini</option>
                    <option value="tomorrow">Besok</option>
                    <option value="inprogress">Sedang Dikerjakan</option>
                    <option value="done">Selesai</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                    Tanggal Target
                  </label>
                  <input
                    type="date"
                    value={modalDate}
                    onChange={(e) => setModalDate(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-white focus:outline-none focus:border-[var(--border-strong)] text-xs"
                  >
                  </input>
                </div>
              </div>

              {/* Jam Pengingat & Prioritas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    Jam Pengingat (WIB)
                  </label>
                  <input
                    type="time"
                    value={modalTime}
                    onChange={(e) => setModalTime(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-white focus:outline-none focus:border-[var(--border-strong)] text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                    Tingkat Prioritas
                  </label>
                  <select
                    value={modalPriority}
                    onChange={(e) => setModalPriority(e.target.value as any)}
                    className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-white focus:outline-none focus:border-[var(--border-strong)] text-xs"
                  >
                    <option value="low">Normal</option>
                    <option value="medium">Penting (Medium)</option>
                    <option value="high">Mendesak (High Alert)</option>
                  </select>
                </div>
              </div>

              {/* Telegram Reminder Toggle Card */}
              <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-md bg-[var(--bg-hover)] border border-[var(--border-color)] flex items-center justify-center">
                    <Send className="w-3.5 h-3.5 text-[#cf6613]" />
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-white">Ingatkan ke Telegram HP</h4>
                    <p className="text-[10.5px] text-[var(--text-muted)]">
                      Bot otomatis mengirim pesan reminder saat jam tugas tiba
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={modalTelegram}
                  onChange={(e) => setModalTelegram(e.target.checked)}
                  className="w-4 h-4 accent-[#cf6613] cursor-pointer"
                />
              </div>

              {/* File Dokumen Terkait */}
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  Hubungkan dengan Dokumen Proyek (Opsional)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Contoh: laporan_keuangan.xlsx atau nota.pdf..."
                    value={modalFile}
                    onChange={(e) => setModalFile(e.target.value)}
                    className="flex-1 px-3 py-2 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-white focus:outline-none focus:border-[var(--border-strong)] text-xs font-mono placeholder:text-[var(--text-muted)]"
                  />
                  {projectFiles.length > 0 && (
                    <select
                      onChange={(e) => {
                        if (e.target.value) setModalFile(e.target.value);
                      }}
                      className="px-2 py-2 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-white text-xs max-w-[140px]"
                    >
                      <option value="">Pilih file...</option>
                      {projectFiles.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Catatan / Instruksi */}
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  Catatan / Instruksi Kerja
                </label>
                <textarea
                  rows={2}
                  placeholder="Instruksi singkat atau catatan khusus untuk tugas ini..."
                  value={modalDescription}
                  onChange={(e) => setModalDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-white focus:outline-none focus:border-[var(--border-strong)] text-xs placeholder:text-[var(--text-muted)] resize-none"
                />
              </div>

              {/* Subtask Checklist */}
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  Daftar Subtask / Checklist Kerja
                </label>
                <div className="space-y-1.5 mb-2">
                  {modalSubtasks.map((st) => (
                    <div
                      key={st.id}
                      className="flex items-center gap-2 p-1.5 rounded bg-[var(--bg-card)] border border-[var(--border-color)] text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setModalSubtasks(
                            modalSubtasks.map((s) => (s.id === st.id ? { ...s, completed: !s.completed } : s))
                          );
                        }}
                        className="text-[var(--text-muted)] hover:text-white"
                      >
                        {st.completed ? (
                          <CheckSquare className="w-3.5 h-3.5 text-white" />
                        ) : (
                          <Square className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <span className={cn("flex-1 text-white", st.completed && "line-through text-[var(--text-muted)]")}>
                        {st.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setModalSubtasks(modalSubtasks.filter((s) => s.id !== st.id));
                        }}
                        className="p-1 text-[var(--text-muted)] hover:text-rose-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Tambah item subtask (Enter)..."
                    value={newSubtaskInput}
                    onChange={(e) => setNewSubtaskInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newSubtaskInput.trim()) {
                        e.preventDefault();
                        setModalSubtasks([
                          ...modalSubtasks,
                          {
                            id: `st_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                            title: newSubtaskInput.trim(),
                            completed: false,
                          },
                        ]);
                        setNewSubtaskInput("");
                      }
                    }}
                    className="flex-1 px-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-white text-xs placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newSubtaskInput.trim()) {
                        setModalSubtasks([
                          ...modalSubtasks,
                          {
                            id: `st_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                            title: newSubtaskInput.trim(),
                            completed: false,
                          },
                        ]);
                        setNewSubtaskInput("");
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[var(--bg-hover)] text-white text-xs font-medium border border-[var(--border-color)] hover:border-[var(--border-strong)] transition-colors cursor-pointer"
                  >
                    Tambah
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 border-t border-[var(--border-color)] bg-[var(--bg-header)] flex items-center justify-between">
              {editingTask ? (
                <button
                  type="button"
                  onClick={() => {
                    handleDeleteTask(editingTask.id);
                    setIsModalOpen(false);
                  }}
                  className="px-3 py-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-white text-xs font-medium border border-[var(--border-color)] transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveModal}
                  className="px-4 py-1.5 rounded-lg bg-[#cf6613] hover:bg-[#b8550f] text-white text-xs font-medium transition-colors cursor-pointer shadow-sm"
                >
                  {editingTask ? "Simpan Perubahan" : "Buat Tugas"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

