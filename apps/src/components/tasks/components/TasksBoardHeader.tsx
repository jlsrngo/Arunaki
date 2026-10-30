import { memo } from "react";
import { Kanban, Search, RefreshCw, History, Plus } from "lucide-react";
import { cn } from "../../../lib/utils";
import { TaskViewMode } from "../taskTypes";
import { Button, Input, Badge } from "../../ui";

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
  isIndonesian: boolean;
  t: (key: any, fallback?: string) => any;
}

export const TasksBoardHeader = memo(function TasksBoardHeader({
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
  isIndonesian,
  t,
}: TasksBoardHeaderProps) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[var(--border-color)]">
      {/* Left side: Icon + Title + Count Badge + Folder Path */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-color)] flex items-center justify-center shrink-0">
          <Kanban className="w-4 h-4 text-[var(--text-primary)]" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-[var(--text-primary)] tracking-wide whitespace-nowrap">
              {t("tasksBoardTitle", isIndonesian ? "Agenda Operasional" : "Operational Agenda")}
            </h1>
            <Badge variant="secondary" className="rounded-full font-mono shrink-0">
              {totalTasks} {t("tasksCount", isIndonesian ? "Agenda" : "Tasks")}
            </Badge>
          </div>
          <p className="text-[11px] text-[var(--text-muted)] font-mono truncate max-w-[240px] sm:max-w-[340px]">
            {activeFolder || t("noActiveFolder", isIndonesian ? "Folder Lokal Belum Terpilih" : "No Local Folder Selected")}
          </p>
        </div>
      </div>

      {/* Right side: Search + Tab Pills + Action Buttons */}
      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap min-w-0 justify-end">
        {/* Search Input */}
        <div className="relative w-36 sm:w-44 md:w-52 shrink-0">
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            type="text"
            placeholder={t("taskSearchPlaceholder", isIndonesian ? "Cari agenda..." : "Search agenda...")}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 pr-3 py-1.5 rounded-lg bg-[var(--bg-card)]"
          />
        </div>

        {/* View Mode Filters: Compact Segmented Control */}
        <div className="flex items-center p-0.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] text-xs shrink-0">
          <button
            type="button"
            onClick={() => onViewModeChange("all")}
            className={cn(
              "px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer",
              viewMode === "all"
                ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            )}
          >
            {t("viewModeAll", isIndonesian ? "Semua" : "All")}
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("active")}
            className={cn(
              "px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer",
              viewMode === "active"
                ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            )}
          >
            {t("viewModeActive", isIndonesian ? "Aktif" : "Active")}
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("history")}
            className={cn(
              "px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer",
              viewMode === "history"
                ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            )}
          >
            {t("viewModeHistory", isIndonesian ? "Selesai" : "Completed")}
          </button>
        </div>

        {/* Refresh Button */}
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={onRefresh}
          disabled={isLoading}
          title={t("taskRefreshBoard", isIndonesian ? "Muat ulang agenda" : "Refresh board")}
          className="shrink-0"
        >
          <RefreshCw className={cn("w-3.5 h-3.5 text-[var(--text-secondary)]", isLoading && "animate-spin")} />
        </Button>

        {/* History Archive Modal Button */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onOpenHistory}
          title={t("agendaHistory", isIndonesian ? "Riwayat & Arsip Agenda" : "Agenda History & Archive")}
          className="shrink-0"
        >
          <History className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
          <span className="hidden sm:inline">{t("agendaHistory", isIndonesian ? "Riwayat" : "History")}</span>
        </Button>

        {/* Add Agenda Button */}
        <Button
          type="button"
          variant="brand"
          size="sm"
          onClick={onAddNewTask}
          className="shrink-0 whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t("createNewTask", isIndonesian ? "Tambah Agenda" : "New Agenda")}</span>
        </Button>
      </div>
    </div>
  );
});
