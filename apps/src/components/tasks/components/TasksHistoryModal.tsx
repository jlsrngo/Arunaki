import { useState } from "react";
import {
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Button, Input, Badge } from "../../ui";

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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent onClose={onClose} className="max-w-2xl p-0 gap-0 max-h-[85vh] overflow-hidden">
        {/* Modal Header */}
        <DialogHeader className="px-5 py-3.5 bg-[var(--bg-card)]/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--bg-hover)] border border-[var(--border-color)] flex items-center justify-center">
              <History className="w-4 h-4 text-[var(--text-primary)]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle>
                  {t("agendaHistory", "Riwayat & Arsip Agenda Operasional")}
                </DialogTitle>
                <Badge variant="secondary" className="rounded-full font-mono">
                  {completedTasks.length} {isIndonesian ? "Selesai" : "Completed"}
                </Badge>
              </div>
              <DialogDescription className="text-[11px]">
                {isIndonesian ? "Log riwayat agenda lampau, subtask yang diselesaikan, dan rincian catatan." : "Historical log of past tasks, completed checklists, and notes."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Search Header */}
        <div className="p-3 border-b border-[var(--border-color)] bg-[var(--bg-card)]/20">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              type="text"
              placeholder={isIndonesian ? "Cari riwayat agenda berdasarkan judul, tanggal, atau dokumen..." : "Search agenda history by title, date, or document..."}
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              className="pl-9 pr-3 bg-[var(--bg-card)]"
            />
          </div>
        </div>

        {/* History Item List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filteredHistory.length === 0 ? (
            <div className="py-12 text-center text-[var(--text-muted)] space-y-1">
              <History className="w-8 h-8 mx-auto text-[var(--text-dim)] mb-2" />
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
                          <CheckCircle2 className="w-4 h-4 text-[var(--text-primary)]" />
                        ) : (
                          <Clock className="w-4 h-4 text-[#cf6613]" />
                        )}
                      </div>
                      <div>
                        <h4 className={cn("text-xs font-medium text-[var(--text-primary)]", isDone && "line-through text-[var(--text-secondary)]")}>
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onSyncGoogleCalendar(hTask)}
                        title={t("openInGoogleCalendar", "Sinkron ke Google Calendar")}
                      >
                        <Calendar className="w-3.5 h-3.5 text-[#cf6613]" />
                      </Button>

                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          onEditTask(hTask);
                          onClose();
                        }}
                        title={isIndonesian ? "Edit atau tinjau agenda" : "Edit or inspect task"}
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>{isIndonesian ? "Detail" : "Details"}</span>
                      </Button>
                    </div>
                  </div>

                  {/* Subtasks snippet */}
                  {totalSt > 0 && (
                    <div className="pl-6 pt-1 text-[11px] space-y-1">
                      <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] font-mono">
                        <CheckSquare className="w-3 h-3" />
                        <span>Subtask Checklist ({doneSt}/{totalSt} {isIndonesian ? "selesai" : "done"}):</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {hTask.subtasks.map((st) => (
                          <span
                            key={st.id}
                            className={cn(
                              "px-2 py-0.5 rounded text-[10px] border",
                              st.completed
                                ? "bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-strong)] line-through"
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
                      {hTask.columnId} • {isIndonesian ? "Prioritas" : "Priority"}: {hTask.priority}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <DialogFooter className="px-5 py-3 bg-[var(--bg-card)]/50">
          <Button variant="secondary" onClick={onClose}>
            {t("taskCancelBtn", "Tutup")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
