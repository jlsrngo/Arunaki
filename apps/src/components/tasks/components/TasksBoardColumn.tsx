import { memo } from "react";
import { Plus } from "lucide-react";
import { TaskItem, ColumnConfig } from "../taskTypes";
import { TaskCard } from "./TaskCard";
import { Button, Badge } from "../../ui";

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
  onCompleteTask?: (id: string) => void;
  onSyncGoogleCalendar: (task: TaskItem) => void;
  onSendTelegram: (task: TaskItem) => void;
  onOpenFileInWorkstation: (fileName: string) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  isIndonesian: boolean;
  t: (key: any, fallback?: string) => any;
}

export const TasksBoardColumn = memo(function TasksBoardColumn({
  column,
  tasks,
  draggedTaskId,
  isSendingTelegram,
  onDragStart,
  onDragOver,
  onDrop,
  onAddNewTask,
  onEditTask,
  onCompleteTask,
  onSyncGoogleCalendar,
  onSendTelegram,
  onOpenFileInWorkstation,
  onToggleSubtask,
  isIndonesian,
  t,
}: TasksBoardColumnProps) {
  // Dot styling per column for clean visual hierarchy
  const columnDot =
    column.id === "overdue"
      ? "bg-rose-500"
      : column.id === "today"
      ? "bg-[var(--text-primary)]"
      : column.id === "inprogress"
      ? "bg-sky-400"
      : column.id === "upcoming"
      ? "bg-purple-400"
      : "bg-[var(--text-muted)]";

  return (
    <div
      onDragOver={onDragOver}
      onDrop={() => onDrop(column.id)}
      className="flex flex-col flex-1 min-w-[260px] h-full min-h-0 bg-[var(--bg-panel)] rounded-xl border border-[var(--border-color)] overflow-hidden"
    >
      {/* Column Header */}
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-[var(--border-color)] bg-[var(--bg-card)]/40 shrink-0">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${columnDot}`} />
          <h2 className="text-xs font-semibold text-[var(--text-primary)] tracking-wide">
            {t(column.titleId, isIndonesian ? column.defaultTitle : column.titleEn)}
          </h2>
          <Badge variant="outline" className="rounded-full font-mono px-1.5 py-0">
            {tasks.length}
          </Badge>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => onAddNewTask(column.id)}
          title={isIndonesian ? `Tambah agenda di ${t(column.titleId, column.defaultTitle)}` : `Add task in ${t(column.titleId, column.titleEn)}`}
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Task List / Drag Container */}
      <div className="flex-1 min-h-0 p-2.5 overflow-y-auto space-y-2.5 custom-scrollbar">
        {tasks.length === 0 ? (
          <div className="h-36 flex flex-col items-center justify-center text-center p-4 border border-dashed border-[var(--border-color)]/70 rounded-lg text-[var(--text-muted)]">
            <p className="text-xs">{t("taskNoTasksScheduled", isIndonesian ? "Belum ada agenda di kolom ini" : "No tasks scheduled in this column")}</p>
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => onAddNewTask(column.id)}
              className="mt-2 text-[11px] text-[#cf6613]"
            >
              {t("taskCreateFirst", isIndonesian ? "+ Tambah Agenda" : "+ Add Task")}
            </Button>
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
              onCompleteTask={onCompleteTask}
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
});
