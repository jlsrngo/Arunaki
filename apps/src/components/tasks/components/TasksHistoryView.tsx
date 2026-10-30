import { useState } from "react";
import {
  ArrowLeft,
  History,
  CheckCircle2,
  Calendar,
  Search,
  ExternalLink,
  RotateCcw,
  Trash2,
  FileSpreadsheet,
  FileText,
  CheckSquare,
  AlertCircle,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { TaskItem, PRIORITY_CONFIGS } from "../taskTypes";

interface TasksHistoryViewProps {
  tasks: TaskItem[];
  onBackToBoard: () => void;
  onRestoreTask: (taskId: string) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onSyncGoogleCalendar: (task: TaskItem) => void;
  onOpenFileInWorkstation: (fileName: string) => void;
  isIndonesian: boolean;
  t: (key: any, fallback?: string) => any;
}

export function TasksHistoryView({
  tasks,
  onBackToBoard,
  onRestoreTask,
  onDeleteTask,
  onSyncGoogleCalendar,
  onOpenFileInWorkstation,
  isIndonesian,
  t,
}: TasksHistoryViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const completedTasks = tasks.filter((task) => task.columnId === "done");
  const [selectedTaskId, setSelectedTaskId] = useState<string>(() => {
    return completedTasks[0]?.id || "";
  });

  const filteredHistory = completedTasks.filter((task) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      task.title.toLowerCase().includes(q) ||
      (task.description && task.description.toLowerCase().includes(q)) ||
      (task.attachedFile && task.attachedFile.toLowerCase().includes(q)) ||
      (task.targetDate && task.targetDate.includes(q))
    );
  });

  const selectedTask =
    filteredHistory.find((t) => t.id === selectedTaskId) ||
    filteredHistory[0] ||
    null;

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--bg-main)] text-[var(--text-primary)] p-4 sm:p-6 overflow-hidden select-none">
      {/* 1. Full Page Header Toolbar */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)] gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToBoard}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] text-white text-xs font-medium cursor-pointer transition-colors shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{isIndonesian ? "Kembali ke Papan Agenda" : "Back to Agenda Board"}</span>
          </button>

          <div className="flex items-center gap-2 pl-2 border-l border-[var(--border-color)]">
            <div className="w-7 h-7 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-color)] flex items-center justify-center">
              <History className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white tracking-wide">
                {isIndonesian ? "Riwayat & Arsip Agenda Selesai" : "Completed Agendas & Archive"}
              </h1>
              <span className="text-[10px] text-[var(--text-muted)] font-mono">
                {completedTasks.length} {isIndonesian ? "agenda telah diselesaikan" : "agendas completed"}
              </span>
            </div>
          </div>
        </div>

        {/* Search in History */}
        <div className="relative w-48 sm:w-64">
          <Search className="w-3.5 h-3.5 text-white/50 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder={isIndonesian ? "Cari riwayat agenda..." : "Search completed agendas..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-xs text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
          />
        </div>
      </div>

      {/* 2. Full Page Master-Detail View */}
      {completedTasks.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <div className="w-12 h-12 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] flex items-center justify-center mb-3">
            <History className="w-6 h-6 text-white/30" />
          </div>
          <h3 className="text-sm font-medium text-white mb-1">
            {isIndonesian ? "Belum Ada Agenda yang Selesai" : "No Completed Agendas Yet"}
          </h3>
          <p className="text-xs text-[var(--text-muted)] max-w-sm mb-4">
            {isIndonesian
              ? "Ketika Anda menyelesaikan agenda di papan kerja, riwayat dan dokumentasinya akan tersimpan rapi secara permanen di sini."
              : "When you mark agendas as completed on the board, their records and attachments will be preserved here."}
          </p>
          <button
            type="button"
            onClick={onBackToBoard}
            className="px-3 py-1.5 rounded-lg bg-[#cf6613] hover:bg-[#b8550f] text-white text-xs font-medium cursor-pointer transition-colors"
          >
            {isIndonesian ? "Buka Papan Agenda" : "Go to Agenda Board"}
          </button>
        </div>
      ) : (
        <div className="flex-1 flex gap-4 pt-4 overflow-hidden min-h-0">
          {/* Left Column: List of completed tasks */}
          <div className="w-full sm:w-80 md:w-96 flex flex-col h-full bg-[var(--bg-panel)] rounded-xl border border-[var(--border-color)] overflow-hidden shadow-sm shrink-0">
            <div className="px-3.5 py-2.5 border-b border-[var(--border-color)] bg-[var(--bg-card)]/40 flex items-center justify-between text-xs font-semibold text-white">
              <span>{isIndonesian ? "Daftar Riwayat" : "Archive List"}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-[var(--bg-panel)] text-[var(--text-muted)] border border-[var(--border-color)]">
                {filteredHistory.length}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 space-y-2 custom-scrollbar">
              {filteredHistory.length === 0 ? (
                <div className="py-8 text-center text-xs text-[var(--text-muted)]">
                  {isIndonesian ? "Tidak ditemukan riwayat yang cocok" : "No matching completed tasks"}
                </div>
              ) : (
                filteredHistory.map((task) => {
                  const isSelected = selectedTask?.id === task.id;
                  const priority = PRIORITY_CONFIGS.find((p) => p.id === task.priority);

                  return (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTaskId(task.id)}
                      className={cn(
                        "p-3 rounded-lg border transition-all cursor-pointer text-left relative",
                        isSelected
                          ? "bg-[var(--bg-hover)] border-white/30 shadow-md"
                          : "bg-[var(--bg-card)] border-[var(--border-color)] hover:border-[var(--border-strong)]"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <CheckCircle2 className="w-4 h-4 text-white shrink-0 mt-0.5" />
                          <h4 className="text-xs font-medium text-white line-clamp-1 truncate">
                            {task.title}
                          </h4>
                        </div>
                        {priority && (
                          <div className={cn("w-1.5 h-1.5 rounded-full shrink-0 mt-1.5", priority.dot)} />
                        )}
                      </div>

                      {task.description && (
                        <p className="text-[11px] text-[var(--text-muted)] mt-1.5 line-clamp-1 pl-6">
                          {task.description}
                        </p>
                      )}

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border-color)]/50 text-[10px] text-[var(--text-muted)] pl-6">
                        <span className="font-mono">{task.targetDate || "No date"}</span>
                        {task.attachedFile && (
                          <span className="truncate max-w-[120px] text-[var(--text-secondary)]">
                            {task.attachedFile}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Full Detail Inspection View */}
          <div className="flex-1 flex flex-col h-full bg-[var(--bg-panel)] rounded-xl border border-[var(--border-color)] overflow-hidden shadow-sm">
            {selectedTask ? (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                {/* Detail Header */}
                <div className="px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-card)]/50 flex items-start justify-between gap-4 shrink-0">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-white/10 text-white border border-white/20">
                        <CheckCircle2 className="w-3 h-3 text-white" />
                        {isIndonesian ? "Selesai" : "Completed"}
                      </span>
                      {selectedTask.priority === "high" && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#cf6613]/20 text-[#cf6613] border border-[#cf6613]/40">
                          {isIndonesian ? "Mendesak / Kritis" : "High Urgency"}
                        </span>
                      )}
                      <span className="text-xs font-mono text-[var(--text-muted)]">
                        {selectedTask.targetDate} {selectedTask.reminderTime ? `• ${selectedTask.reminderTime} WIB` : ""}
                      </span>
                    </div>
                    <h2 className="text-base font-semibold text-white tracking-wide">
                      {selectedTask.title}
                    </h2>
                  </div>

                  {/* Actions: Restore & Delete */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onSyncGoogleCalendar(selectedTask)}
                      title={t("openInGoogleCalendar", isIndonesian ? "Buka di Google Calendar" : "Open in Google Calendar")}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] text-xs text-white transition-colors cursor-pointer"
                    >
                      <Calendar className="w-3.5 h-3.5 text-[#cf6613]" />
                      <span className="hidden md:inline">Google Calendar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onRestoreTask(selectedTask.id)}
                      title={isIndonesian ? "Kembalikan ke Papan Kerja Hari Ini" : "Restore to Today Board"}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-medium text-white transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{isIndonesian ? "Pulihkan ke Papan" : "Restore to Board"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteTask(selectedTask.id)}
                      title={isIndonesian ? "Hapus permanen agenda ini" : "Delete permanently"}
                      className="p-1.5 rounded-lg hover:bg-rose-500/20 text-[var(--text-muted)] hover:text-rose-400 border border-transparent hover:border-rose-500/30 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Detail Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                  {/* Work Instructions & Operational Notes */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                      {isIndonesian ? "Instruksi Kerja & Catatan Operasional" : "Work Instructions & Notes"}
                    </label>
                    <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap font-sans">
                      {selectedTask.description || (isIndonesian ? "Tidak ada catatan tambahan." : "No additional instructions provided.")}
                    </div>
                  </div>

                  {/* Attached Project Document */}
                  {selectedTask.attachedFile && (
                    <div className="space-y-2">
                      <label className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                        {isIndonesian ? "Dokumen Proyek Terkait" : "Linked Project Document"}
                      </label>
                      <div
                        onClick={() => onOpenFileInWorkstation(selectedTask.attachedFile)}
                        className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-[var(--border-strong)] transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          {selectedTask.attachedFile.endsWith(".xlsx") || selectedTask.attachedFile.endsWith(".csv") ? (
                            <FileSpreadsheet className="w-4 h-4 text-white" />
                          ) : (
                            <FileText className="w-4 h-4 text-white" />
                          )}
                          <span className="text-xs text-white font-medium truncate">
                            {selectedTask.attachedFile}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-[var(--text-muted)] group-hover:text-white">
                          <span>{isIndonesian ? "Buka di Workstation" : "Open in Workstation"}</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Actionable Subtasks Checklist */}
                  {selectedTask.subtasks && selectedTask.subtasks.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                          {isIndonesian ? "Daftar Rincian Subtugas" : "Subtasks Checklist"}
                        </label>
                        <span className="text-[10px] font-mono text-[var(--text-muted)]">
                          {selectedTask.subtasks.filter((s) => s.completed).length} / {selectedTask.subtasks.length}
                        </span>
                      </div>
                      <div className="space-y-1.5 p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]">
                        {selectedTask.subtasks.map((st) => (
                          <div key={st.id} className="flex items-center gap-2 py-1 text-xs text-white">
                            <CheckSquare className="w-3.5 h-3.5 text-white shrink-0" />
                            <span className={cn(st.completed && "line-through text-[var(--text-muted)]")}>
                              {st.title}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-xs text-[var(--text-muted)] p-8">
                <AlertCircle className="w-8 h-8 text-white/20 mb-2" />
                <p>{isIndonesian ? "Pilih agenda di sebelah kiri untuk melihat rincian detail" : "Select an agenda from the left to inspect full details"}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
