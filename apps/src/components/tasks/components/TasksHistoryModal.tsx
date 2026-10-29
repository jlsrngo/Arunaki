import { useState } from "react";
import {
  X,
  History,
  CheckCircle2,
  Calendar,
  Clock,
  Search,
  ExternalLink,
  CheckSquare,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { TaskItem } from "../taskTypes";

interface TasksHistoryModalProps {
  isOpen: boolean;
  tasks: TaskItem[];
  onClose: () => void;
  onSyncGoogleCalendar: (task: TaskItem) => void;
  onEditTask: (task: TaskItem) => void;
  isIndonesian: boolean;
  t: (key: any, fallback?: string) => any;
}

export function TasksHistoryModal({
  isOpen,
  tasks,
  onClose,
  onSyncGoogleCalendar,
  onEditTask,
  isIndonesian,
  t,
}: TasksHistoryModalProps) {
  const [historySearch, setHistorySearch] = useState("");

  if (!isOpen) return null;

  const completedTasks = tasks.filter((tItem) => tItem.columnId === "done");
  const filteredHistory = tasks.filter((tItem) => {
    if (!historySearch.trim()) return true;
    const q = historySearch.toLowerCase();
    return (
      tItem.title.toLowerCase().includes(q) ||
      (tItem.description && tItem.description.toLowerCase().includes(q)) ||
      (tItem.targetDate && tItem.targetDate.includes(q)) ||
      (tItem.attachedFile && tItem.attachedFile.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-color)] bg-[var(--bg-card)]/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--bg-hover)] border border-[var(--border-color)] flex items-center justify-center">
              <History className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white tracking-wide">
                  {t("agendaHistory", "Riwayat & Arsip Agenda Operasional")}
                </h3>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-[var(--bg-hover)] text-white border border-[var(--border-color)]">
                  {completedTasks.length} {isIndonesian ? "Selesai" : "Completed"}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                {isIndonesian ? "Log riwayat agenda lampau, subtask yang diselesaikan, dan rincian catatan." : "Historical log of past tasks, completed checklists, and notes."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Header */}
        <div className="p-3 border-b border-[var(--border-color)] bg-[var(--bg-card)]/20">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-white/50 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder={isIndonesian ? "Cari riwayat agenda berdasarkan judul, tanggal, atau dokumen..." : "Search agenda history by title, date, or document..."}
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-xs text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)]"
            />
          </div>
        </div>

        {/* History Item List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filteredHistory.length === 0 ? (
            <div className="py-12 text-center text-[var(--text-muted)] space-y-1">
              <History className="w-8 h-8 mx-auto text-white/20 mb-2" />
              <p className="text-xs">{isIndonesian ? "Tidak ada riwayat agenda yang cocok." : "No matching agenda history."}</p>
            </div>
          ) : (
            filteredHistory.map((hTask) => {
              const isDone = hTask.columnId === "done";
              const totalSt = hTask.subtasks?.length || 0;
              const doneSt = hTask.subtasks?.filter((s) => s.completed).length || 0;

              return (
                <div
                  key={hTask.id}
                  className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-[var(--border-strong)] transition-all space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5">
                        {isDone ? (
                          <CheckCircle2 className="w-4 h-4 text-white" />
                        ) : (
                          <Clock className="w-4 h-4 text-[#cf6613]" />
                        )}
                      </div>
                      <div>
                        <h4 className={cn("text-xs font-medium text-white", isDone && "line-through text-[var(--text-secondary)]")}>
                          {hTask.title}
                        </h4>
                        {hTask.description && (
                          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-2">
                            {hTask.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onSyncGoogleCalendar(hTask)}
                        title={t("openInGoogleCalendar", "Sinkron ke Google Calendar")}
                        className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-white transition-colors cursor-pointer"
                      >
                        <Calendar className="w-3.5 h-3.5 text-[#cf6613]" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onEditTask(hTask);
                          onClose();
                        }}
                        title={isIndonesian ? "Edit atau tinjau agenda" : "Edit or inspect task"}
                        className="px-2 py-1 rounded bg-[var(--bg-hover)] hover:bg-[var(--bg-panel)] text-white text-[10.5px] border border-[var(--border-color)] flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <ExternalLink className="w-3 h-3 text-white/70" />
                        <span>{isIndonesian ? "Detail" : "Details"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Subtasks snippet */}
                  {totalSt > 0 && (
                    <div className="pl-6 pt-1 text-[11px] space-y-1">
                      <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] font-mono">
                        <CheckSquare className="w-3 h-3" />
                        <span>Subtask Checklist ({doneSt}/{totalSt} selesai):</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {hTask.subtasks.map((st) => (
                          <span
                            key={st.id}
                            className={cn(
                              "px-2 py-0.5 rounded text-[10px] border",
                              st.completed
                                ? "bg-white/10 text-white border-white/20 line-through"
                                : "bg-[var(--bg-panel)] text-[var(--text-muted)] border-[var(--border-color)]"
                            )}
                          >
                            {st.completed ? "✓" : "○"} {st.title}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Metadata footer */}
                  <div className="flex items-center justify-between pt-1 border-t border-[var(--border-color)]/60 text-[10px] text-[var(--text-muted)]">
                    <span className="font-mono">
                      Target: {hTask.targetDate || "-"} • {hTask.reminderTime || "-"} WIB
                    </span>
                    <span className="uppercase font-mono tracking-wider">
                      {hTask.columnId} • Prioritas: {hTask.priority}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-[var(--border-color)] bg-[var(--bg-card)]/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[var(--bg-hover)] text-white text-xs font-medium hover:bg-[var(--border-color)] transition-colors cursor-pointer"
          >
            {t("taskCancelBtn", "Tutup")}
          </button>
        </div>
      </div>
    </div>
  );
}
