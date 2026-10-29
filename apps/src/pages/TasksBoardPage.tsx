import { memo } from "react";
import {
  useTasksBoard,
  DEFAULT_COLUMNS,
  TasksBoardHeader,
  TasksBoardColumn,
  TaskModal,
  TasksHistoryModal,
  TaskItem,
  openExternalUrl,
} from "../components/tasks";

/**
 * TasksBoardPage
 *
 * Clean, modular orchestrator for the Operational Agenda & Task Board.
 * Follows React best practices with separated state, hooks, and presentation subcomponents.
 */
export const TasksBoardPage = memo(function TasksBoardPage() {
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
    isHistoryModalOpen,
    setIsHistoryModalOpen,
    editingTask,
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

  // Filter tasks based on search query and viewMode tab
  const filteredTasks = tasks.filter((task) => {
    if (viewMode === "active" && task.columnId === "done") return false;
    if (viewMode === "history" && task.columnId !== "done") return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      task.title.toLowerCase().includes(q) ||
      (task.description && task.description.toLowerCase().includes(q)) ||
      (task.attachedFile && task.attachedFile.toLowerCase().includes(q))
    );
  });

  const columnsToRender =
    viewMode === "active"
      ? DEFAULT_COLUMNS.filter((c) => c.id !== "done")
      : viewMode === "history"
      ? DEFAULT_COLUMNS.filter((c) => c.id === "done")
      : DEFAULT_COLUMNS;

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

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--bg-main)] text-[var(--text-primary)] p-4 sm:p-6 overflow-hidden select-none">
      {/* 1. Header Toolbar */}
      <TasksBoardHeader
        totalTasks={tasks.length}
        activeFolder={activeFolder}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isLoading={isLoading}
        onRefresh={loadTasks}
        onOpenHistory={() => setIsHistoryModalOpen(true)}
        onAddNewTask={() => openNewTaskModal("today")}
        t={t}
      />

      {/* 2. Interactive Kanban Columns Grid */}
      <div className="flex-1 flex gap-4 overflow-x-auto pt-4 pb-2 items-start custom-scrollbar">
        {columnsToRender.map((col) => {
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
          editingTask={editingTask}
          projectFiles={projectFiles}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveModal}
          onDelete={handleDeleteTask}
          isIndonesian={isIndonesian}
          t={t}
        />
      )}

      {/* 4. History & Archive Log Modal */}
      {isHistoryModalOpen && (
        <TasksHistoryModal
          isOpen={isHistoryModalOpen}
          tasks={tasks}
          onClose={() => setIsHistoryModalOpen(false)}
          onSyncGoogleCalendar={syncToGoogleCalendar}
          onEditTask={openEditTaskModal}
          isIndonesian={isIndonesian}
          t={t}
        />
      )}
    </div>
  );
});

export default TasksBoardPage;
