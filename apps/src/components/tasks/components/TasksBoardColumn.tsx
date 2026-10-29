import { Plus } from "lucide-react";
import { TaskItem, ColumnConfig } from "../taskTypes";
import { TaskCard } from "./TaskCard";

interface TasksBoardColumnProps {
  column: ColumnConfig;
  tasks: TaskItem[];
  draggedTaskId: string | null;
  isSendingTelegram: string | null;
  onDragStart: (id: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (colId: TaskItem["columnId"]) => void;
  onAddNewTask: (colId: TaskItem["columnId"]) => void;
  onEditTask: (task: TaskItem) => void;
  onSyncGoogleCalendar: (task: TaskItem) => void;
  onSendTelegram: (task: TaskItem) => void;
  onOpenFileInWorkstation: (fileName: string) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  isIndonesian: boolean;
  t: (key: any, fallback?: string) => any;
}

export function TasksBoardColumn({
  column,
  tasks,
  draggedTaskId,
  isSendingTelegram,
  onDragStart,
  onDragOver,
  onDrop,
  onAddNewTask,
  onEditTask,
  onSyncGoogleCalendar,
  onSendTelegram,
  onOpenFileInWorkstation,
  onToggleSubtask,
  isIndonesian,
  t,
}: TasksBoardColumnProps) {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={() => onDrop(column.id)}
      className="flex flex-col flex-1 min-w-[280px] max-w-[340px] bg-[var(--bg-panel)] rounded-xl border border-[var(--border-color)] overflow-hidden shadow-sm flex-shrink-0"
    >
      {/* Column Header */}
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-[var(--border-color)] bg-[var(--bg-card)]/40">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold text-white tracking-wide">
            {t(column.titleId, column.defaultTitle)}
          </h2>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-[var(--bg-panel)] text-[var(--text-muted)] border border-[var(--border-color)]">
            {tasks.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onAddNewTask(column.id)}
          title={`Tambah agenda di ${column.defaultTitle}`}
          className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-white transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Task List / Drag Container */}
      <div className="flex-1 p-2.5 overflow-y-auto space-y-2.5 min-h-[460px]">
        {tasks.length === 0 ? (
          <div className="h-36 flex flex-col items-center justify-center text-center p-4 border border-dashed border-[var(--border-color)]/70 rounded-lg text-[var(--text-muted)]">
            <p className="text-xs">{t("noTasksInSection", "Belum ada agenda di kolom ini")}</p>
            <button
              type="button"
              onClick={() => onAddNewTask(column.id)}
              className="mt-2 text-[11px] text-[#cf6613] hover:underline cursor-pointer"
            >
              {t("taskCreateFirst", "+ Tambah Agenda")}
            </button>
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              draggedTaskId={draggedTaskId}
              isSendingTelegram={isSendingTelegram}
              onDragStart={onDragStart}
              onEdit={onEditTask}
              onSyncGoogleCalendar={onSyncGoogleCalendar}
              onSendTelegram={onSendTelegram}
              onOpenFileInWorkstation={onOpenFileInWorkstation}
              onToggleSubtask={onToggleSubtask}
              isIndonesian={isIndonesian}
              t={t}
            />
          ))
        )}
      </div>
    </div>
  );
}
