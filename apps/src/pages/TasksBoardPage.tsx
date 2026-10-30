import { memo, useState, useCallback, useMemo } from "react";
import {
  useTasksBoard,
  DEFAULT_COLUMNS,
  TasksBoardHeader,
  TasksBoardColumn,
  TaskModal,
  TasksHistoryView,
  TaskItem,
  TaskViewMode,
  openExternalUrl,
} from "../components/tasks";

// The 4 active Kanban columns (hoisted out of render)
const ACTIVE_COLUMNS = DEFAULT_COLUMNS.filter((c) => c.id !== "done");

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
    handleCompleteTask,
    handleRestoreTask,
    handleToggleSubtask,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleOpenFileInWorkstation,
    isIndonesian,
    t,
  } = useTasksBoard();

  // Filter tasks based on search query
  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tasks.filter((task) => {
      if (task.columnId === "done") return false; // Done tasks live in full-page History
      if (!q) return true;
      return (
        task.title.toLowerCase().includes(q) ||
        (task.description && task.description.toLowerCase().includes(q)) ||
        (task.attachedFile && task.attachedFile.toLowerCase().includes(q))
      );
    });
  }, [tasks, searchQuery]);

  const handleSaveModal = useCallback(
    async (
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
    },
    [editingTask, tasks, saveTasks, setIsModalOpen]
  );

  const handleBackToBoard = useCallback(() => {
    setActiveView("board");
  }, []);

  const handleOpenHistory = useCallback(() => {
    setActiveView("history");
  }, []);

  const handleViewModeChange = useCallback(
    (mode: TaskViewMode) => {
      if (mode === "history") {
        setActiveView("history");
      } else {
        setViewMode(mode);
      }
    },
    [setViewMode]
  );

  const handleAddTodayTask = useCallback(() => {
    openNewTaskModal("today");
  }, [openNewTaskModal]);

  const handleSendTelegram = useCallback(
    (task: TaskItem) => {
      void sendTelegramReminder(task, true);
    },
    [sendTelegramReminder]
  );

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
  }, [setIsModalOpen]);

  // Switch to full page history if selected
  if (activeView === "history") {
    return (
      <TasksHistoryView
        tasks={tasks}
        onBackToBoard={handleBackToBoard}
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
        onViewModeChange={handleViewModeChange}
        isLoading={isLoading}
        onRefresh={loadTasks}
        onOpenHistory={handleOpenHistory}
        onAddNewTask={handleAddTodayTask}
        isIndonesian={isIndonesian}
        t={t}
      />

      {/* 2. Interactive Kanban Columns Grid - Full Height Stretching */}
      <div className="flex-1 min-h-0 flex gap-4 overflow-x-auto pt-4 pb-2 custom-scrollbar">
        {ACTIVE_COLUMNS.map((col) => {
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
              onSendTelegram={handleSendTelegram}
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
          onClose={handleCloseModal}
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
