import { memo, useState } from "react";
import { toast } from "sonner";
import {
  useTasksBoard,
  DEFAULT_COLUMNS,
  TasksBoardHeader,
  TasksBoardColumn,
  TaskModal,
  TasksHistoryView,
  TaskItem,
  getTodayString,
  openExternalUrl,
} from "../components/tasks";

/**
 * TasksBoardPage
 *
 * Clean, modular orchestrator for the Operational Agenda & Task Board.
 * Features 4 active columns (Terlewatkan, Hari Ini, Sedang Dikerjakan, Akan Datang)
 * and a full-page master-detail Inspection View for completed task history.
 */
export const TasksBoardPage = memo(function TasksBoardPage() {
  const [activeView, setActiveView] = useState<"board" | "history">("board");

  const {
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
    handleToggleSubtask,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleOpenFileInWorkstation,
    isIndonesian,
    t,
  } = useTasksBoard();

  // Quick complete a task from the board and move it directly to History
  const handleCompleteTask = async (taskId: string) => {
    const updated = tasks.map((taskItem) =>
      taskItem.id === taskId
        ? {
            ...taskItem,
            columnId: "done" as const,
            updatedAt: new Date().toISOString(),
          }
        : taskItem
    );
    await saveTasks(updated);
    toast.success(
      isIndonesian
        ? "Agenda berhasil ditandai selesai & disimpan ke Riwayat"
        : "Task marked as completed & saved to Archive"
    );
  };

  // Restore task from full-page History back to the active board
  const handleRestoreTask = async (taskId: string) => {
    const targetTask = tasks.find((tItem) => tItem.id === taskId);
    if (!targetTask) return;
    const curToday = getTodayString();
    const destColumn =
      targetTask.targetDate && targetTask.targetDate > curToday
        ? ("upcoming" as const)
        : ("today" as const);

    const updated = tasks.map((tItem) =>
      tItem.id === taskId
        ? {
            ...tItem,
            columnId: destColumn,
            updatedAt: new Date().toISOString(),
          }
        : tItem
    );
    await saveTasks(updated);
    toast.success(
      isIndonesian
        ? `Agenda dipulihkan ke kolom ${destColumn === "upcoming" ? "Akan Datang" : "Hari Ini"}`
        : "Task restored to active board"
    );
  };

  // Filter tasks based on search query
  const filteredTasks = tasks.filter((task) => {
    if (task.columnId === "done") return false; // Done tasks live in full-page History

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      task.title.toLowerCase().includes(q) ||
      (task.description && task.description.toLowerCase().includes(q)) ||
      (task.attachedFile && task.attachedFile.toLowerCase().includes(q))
    );
  });

  // The 4 active Kanban columns
  const activeColumns = DEFAULT_COLUMNS.filter((c) => c.id !== "done");

  const handleSaveModal = async (
    taskData: Omit<TaskItem, "id" | "createdAt" | "updatedAt">,
    autoOpenGCal: boolean
  ) => {
    const nowIso = new Date().toISOString();

    if (editingTask) {
      const updated = tasks.map((tItem) =>
        tItem.id === editingTask.id
          ? { ...tItem, ...taskData, updatedAt: nowIso }
          : tItem
      );
      await saveTasks(updated);
    } else {
      const newTask: TaskItem = {
        ...taskData,
        id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await saveTasks([newTask, ...tasks]);
    }

    if (autoOpenGCal && taskData.gcalUrl) {
      void openExternalUrl(taskData.gcalUrl);
    }

    setIsModalOpen(false);
  };

  // Switch to full page history if selected
  if (activeView === "history") {
    return (
      <TasksHistoryView
        tasks={tasks}
        onBackToBoard={() => setActiveView("board")}
        onRestoreTask={handleRestoreTask}
        onDeleteTask={handleDeleteTask}
        onSyncGoogleCalendar={syncToGoogleCalendar}
        onOpenFileInWorkstation={handleOpenFileInWorkstation}
        isIndonesian={isIndonesian}
        t={t}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--bg-main)] text-[var(--text-primary)] p-4 sm:p-6 overflow-hidden select-none">
      {/* 1. Header Toolbar */}
      <TasksBoardHeader
        totalTasks={tasks.length}
        activeFolder={activeFolder}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        viewMode={viewMode}
        onViewModeChange={(mode) => {
          if (mode === "history") {
            setActiveView("history");
          } else {
            setViewMode(mode);
          }
        }}
        isLoading={isLoading}
        onRefresh={loadTasks}
        onOpenHistory={() => setActiveView("history")}
        onAddNewTask={() => openNewTaskModal("today")}
        isIndonesian={isIndonesian}
        t={t}
      />

      {/* 2. Interactive Kanban Columns Grid - Full Height Stretching */}
      <div className="flex-1 min-h-0 flex gap-4 overflow-x-auto pt-4 pb-2 custom-scrollbar">
        {activeColumns.map((col) => {
          const colTasks = filteredTasks.filter((task) => task.columnId === col.id);
          return (
            <TasksBoardColumn
              key={col.id}
              column={col}
              tasks={colTasks}
              draggedTaskId={draggedTaskId}
              isSendingTelegram={isSendingTelegram}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onAddNewTask={openNewTaskModal}
              onEditTask={openEditTaskModal}
              onCompleteTask={handleCompleteTask}
              onSyncGoogleCalendar={syncToGoogleCalendar}
              onSendTelegram={(task) => sendTelegramReminder(task, true)}
              onOpenFileInWorkstation={handleOpenFileInWorkstation}
              onToggleSubtask={handleToggleSubtask}
              isIndonesian={isIndonesian}
              t={t}
            />
          );
        })}
      </div>

      {/* 3. Task Creation & Edit Modal */}
      {isModalOpen && (
        <TaskModal
          isOpen={isModalOpen}
          initialColumn={initialColumn}
          editingTask={editingTask}
          projectFiles={projectFiles}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveModal}
          onDelete={handleDeleteTask}
          isIndonesian={isIndonesian}
          t={t}
        />
      )}
    </div>
  );
});

export default TasksBoardPage;
