import { memo } from "react";
import {
  Calendar,
  Send,
  Clock,
  AlertTriangle,
  Bell,
  BellRing,
  FileSpreadsheet,
  FileText,
  ExternalLink,
  CheckSquare,
  Square,
  CheckCircle2,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { TaskItem, getTodayString } from "../taskTypes";
import { Card, Badge, Button } from "../../ui";

interface TaskCardProps {
  task: TaskItem;
  draggedTaskId: string | null;
  isSendingTelegram: string | null;
  onDragStart: (id: string) => void;
  onEdit: (task: TaskItem) => void;
  onSyncGoogleCalendar: (task: TaskItem) => void;
  onSendTelegram: (task: TaskItem) => void;
  onOpenFileInWorkstation: (fileName: string) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onCompleteTask?: (id: string) => void;
  isIndonesian: boolean;
  t: (key: any, fallback?: string) => any;
}

export const TaskCard = memo(function TaskCard({
  task,
  draggedTaskId,
  isSendingTelegram,
  onDragStart,
  onEdit,
  onSyncGoogleCalendar,
  onSendTelegram,
  onOpenFileInWorkstation,
  onToggleSubtask,
  onCompleteTask,
  isIndonesian,
  t,
}: TaskCardProps) {
  const totalSubtasks = task.subtasks?.length || 0;
  const completedSubtasks = task.subtasks?.filter((s) => s.completed).length || 0;
  const isOverdue =
    task.columnId === "overdue" ||
    (task.targetDate &&
      task.targetDate < getTodayString() &&
      task.columnId !== "done");

  return (
    <Card
      draggable
      onDragStart={() => onDragStart(task.id)}
      onClick={() => onEdit(task)}
      className={cn(
        "group p-3.5 rounded-lg hover:border-[var(--border-strong)] transition-all cursor-pointer relative space-y-2.5",
        task.columnId === "overdue" && "border-l-2 border-l-rose-500",
        task.columnId === "inprogress" && "border-l-2 border-l-sky-400",
        task.columnId === "upcoming" && "border-l-2 border-l-purple-400/60",
        task.priority === "high" && task.columnId !== "overdue" && "border-l-2 border-l-[#cf6613]",
        draggedTaskId === task.id && "opacity-40"
      )}
    >
      {/* Title and Action Buttons */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xs font-medium text-[var(--text-primary)] leading-snug line-clamp-2">
          {task.title}
        </h3>
        <div className="flex items-center gap-1 shrink-0">
          {/* Quick Complete Button */}
          {onCompleteTask && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={(e) => {
                e.stopPropagation();
                onCompleteTask(task.id);
              }}
              title={isIndonesian ? "Tandai Selesai & Simpan ke Riwayat" : "Mark Complete & Archive to History"}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]" />
            </Button>
          )}

          {/* Google Calendar Quick Sync */}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              onSyncGoogleCalendar(task);
            }}
            title={t("openInGoogleCalendar", isIndonesian ? "Sinkron ke Google Calendar" : "Sync to Google Calendar")}
          >
            <Calendar className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
          </Button>

          {/* Telegram Dispatch */}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              onSendTelegram(task);
            }}
            disabled={isSendingTelegram === task.id}
            title={isIndonesian ? "Kirim pemberitahuan agenda ke Telegram sekarang" : "Send agenda notification to Telegram now"}
          >
            <Send className={cn("w-3.5 h-3.5", isSendingTelegram === task.id && "animate-pulse text-[#cf6613]")} />
          </Button>
        </div>
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
            onOpenFileInWorkstation(task.attachedFile);
          }}
          title={isIndonesian ? `Buka ${task.attachedFile} di Workstation` : `Open ${task.attachedFile} in Workstation`}
          className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--bg-hover)] text-[10.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)] truncate transition-colors cursor-pointer"
        >
          {task.attachedFile.endsWith(".xlsx") || task.attachedFile.endsWith(".csv") ? (
            <FileSpreadsheet className="w-3 h-3 text-[var(--text-primary)] shrink-0" />
          ) : (
            <FileText className="w-3 h-3 text-[var(--text-primary)] shrink-0" />
          )}
          <span className="truncate">{task.attachedFile}</span>
          <ExternalLink className="w-2.5 h-2.5 text-[var(--text-muted)] ml-auto shrink-0" />
        </div>
      )}

      {/* Subtasks Progress */}
      {totalSubtasks > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
            <span>{t("taskSubtasks", isIndonesian ? "Daftar Rincian Subtugas / Checklist" : "Actionable Subtasks Checklist")}</span>
            <span className="font-mono">{completedSubtasks}/{totalSubtasks}</span>
          </div>
          <div className="w-full h-1 bg-[var(--bg-hover)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--text-primary)] transition-all duration-300"
              style={{ width: `${(completedSubtasks / totalSubtasks) * 100}%` }}
            />
          </div>
          <div className="space-y-1 pt-0.5">
            {task.subtasks.slice(0, 3).map((st) => (
              <div
                key={st.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSubtask(task.id, st.id);
                }}
                className="flex items-center gap-1.5 text-[10.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                {st.completed ? (
                  <CheckSquare className="w-3 h-3 text-[var(--text-primary)] shrink-0" />
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

      {/* Footer Badges & Status Indicators */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-color)]/60 text-[10.5px]">
        {/* Left: Scheduled Time, Overdue Alert & Telegram Bell */}
        <div className="flex items-center gap-1.5 min-w-0">
          {task.reminderTime ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)] font-mono whitespace-nowrap">
              <Clock className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
              {task.reminderTime}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] whitespace-nowrap">
              <Calendar className="w-3 h-3 shrink-0" />
              {task.targetDate}
            </span>
          )}

          {isOverdue && (
            <Badge variant="danger" className="px-1.5 py-0.5 rounded text-[9.5px] font-medium whitespace-nowrap">
              <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
              <span>{isIndonesian ? "Terlewat" : "Overdue"}</span>
            </Badge>
          )}

          {task.telegramReminderEnabled && (
            <span
              title={
                task.notifiedAt
                  ? (isIndonesian ? "Pemberitahuan Telegram sudah terkirim" : "Telegram notification delivered")
                  : (isIndonesian ? "Pengingat Telegram aktif" : "Telegram reminder active")
              }
              className={cn(
                "inline-flex items-center p-0.5 rounded shrink-0",
                task.notifiedAt ? "text-[var(--text-secondary)]" : "text-[#cf6613]"
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

        {/* Right: Priority Indicator (Compact, Single-Line, No Wrap) */}
        <div className="flex items-center gap-1 shrink-0">
          {task.priority === "high" && (
            <Badge variant="brand" className="px-1.5 py-0.5 rounded text-[9.5px] uppercase tracking-wider whitespace-nowrap">
              {isIndonesian ? "Mendesak" : "Urgent"}
            </Badge>
          )}

          {task.priority === "medium" && (
            <Badge variant="outline" className="px-1.5 py-0.5 rounded text-[9.5px] font-medium whitespace-nowrap">
              {isIndonesian ? "Menengah" : "Medium"}
            </Badge>
          )}
        </div>
      </div>
    </Card>
  );
});
