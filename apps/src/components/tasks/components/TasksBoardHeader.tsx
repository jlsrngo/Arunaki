import { Kanban, Search, RefreshCw, History, Plus } from "lucide-react";
import { cn } from "../../../lib/utils";
import { TaskViewMode } from "../taskTypes";

interface TasksBoardHeaderProps {
  totalTasks: number;
  activeFolder: string;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  viewMode: TaskViewMode;
  onViewModeChange: (mode: TaskViewMode) => void;
  isLoading: boolean;
  onRefresh: () => void;
  onOpenHistory: () => void;
  onAddNewTask: () => void;
  t: (key: any, fallback?: string) => any;
}

export function TasksBoardHeader({
  totalTasks,
  activeFolder,
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  isLoading,
  onRefresh,
  onOpenHistory,
  onAddNewTask,
  t,
}: TasksBoardHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--border-color)]">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-color)] flex items-center justify-center">
          <Kanban className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-white tracking-wide">
              {t("tasksBoardTitle", "Agenda Operasional & Papan Tugas")}
            </h1>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-color)]">
              {totalTasks} {t("tasksCount", "Agenda")}
            </span>
          </div>
          <p className="text-[11px] text-[var(--text-muted)] font-mono truncate max-w-[280px] sm:max-w-[420px]">
            {activeFolder || t("noActiveFolder", "Folder Lokal Belum Terpilih")}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
        {/* Search Input */}
        <div className="relative flex-1 sm:w-56">
          <Search className="w-3.5 h-3.5 text-white/50 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder={t("taskSearchPlaceholder", "Cari agenda operasional...")}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-xs text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
          />
        </div>

        {/* View Mode Filters */}
        <div className="flex items-center p-0.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] text-xs">
          <button
            type="button"
            onClick={() => onViewModeChange("all")}
            className={cn(
              "px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer",
              viewMode === "all"
                ? "bg-[var(--bg-hover)] text-white"
                : "text-[var(--text-muted)] hover:text-white"
            )}
          >
            {t("viewModeAll", "Semua Kolom")}
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("active")}
            className={cn(
              "px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer",
              viewMode === "active"
                ? "bg-[var(--bg-hover)] text-white"
                : "text-[var(--text-muted)] hover:text-white"
            )}
          >
            {t("viewModeActive", "Agenda Aktif")}
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("history")}
            className={cn(
              "px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer",
              viewMode === "history"
                ? "bg-[var(--bg-hover)] text-white"
                : "text-[var(--text-muted)] hover:text-white"
            )}
          >
            {t("viewModeHistory", "Riwayat Selesai")}
          </button>
        </div>

        {/* Refresh Button */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          title={t("refreshTasks", "Muat ulang agenda")}
          className="p-2 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-white border border-[var(--border-color)] transition-colors cursor-pointer"
        >
          <RefreshCw className={cn("w-3.5 h-3.5 text-white/80", isLoading && "animate-spin")} />
        </button>

        {/* History Archive Modal Button */}
        <button
          type="button"
          onClick={onOpenHistory}
          title={t("agendaHistory", "Riwayat & Arsip Agenda")}
          className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-white border border-[var(--border-color)] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <History className="w-3.5 h-3.5 text-white/80" />
          <span className="hidden md:inline">{t("agendaHistory", "Riwayat Agenda")}</span>
        </button>

        {/* Add Agenda Button */}
        <button
          type="button"
          onClick={onAddNewTask}
          className="px-3 py-1.5 rounded-lg bg-[#cf6613] hover:bg-[#b8550f] text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t("taskAddToday", "Tambah Agenda")}</span>
        </button>
      </div>
    </div>
  );
}
