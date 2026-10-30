import { memo } from "react";
import { SopCenterMode } from "./sopTypes";
import { useSopPlaybookCenter } from "./hooks/useSopPlaybookCenter";
import { SopReconcileAuditView } from "./components/SopReconcileAuditView";
import { SopExecutiveSynthesisView } from "./components/SopExecutiveSynthesisView";
import { SopPlaybookStudioView } from "./components/SopPlaybookStudioView";

interface SopPlaybookCenterViewProps {
  mode: SopCenterMode;
  playbookId?: string;
  initialContent?: string;
  activeFolder?: string;
  onOpenFileTab?: (path: string) => void;
  onCloseCurrentTab?: () => void;
}

/**
 * SopPlaybookCenterView
 *
 * Clean, modular orchestrator for SOP Playbooks, 3-Way Reconciliation Audit,
 * and Executive Multi-Format Synthesis in the Center Panel Workstation.
 */
export const SopPlaybookCenterView = memo(function SopPlaybookCenterView({
  mode,
  playbookId,
  initialContent,
  activeFolder,
  onOpenFileTab,
  onCloseCurrentTab,
}: SopPlaybookCenterViewProps) {
  const {
    playbook,
    isEditing,
    executing,
    generating,
    saving,
    draggedIdx,
    setDraggedIdx,
    dragOverIdx,
    setDragOverIdx,
    title,
    setTitle,
    category,
    setCategory,
    description,
    setDescription,
    steps,
    auditMode,
    setAuditMode,
    auditing,
    auditResult,
    execPeriod,
    setExecPeriod,
    synthesizing,
    execKpi,
    dispatchingTg,
    handleGenerateFromFolder,
    handleStartNewPlaybook,
    handleReorderSteps,
    handleSavePlaybook,
    handleDeletePlaybook,
    handleRunPlaybookWithLLM,
    handleCancelEditing,
    handleStartEditing,
    handleAddStep,
    handleRemoveStep,
    handleUpdateStepField,
    handleRunReconciliation,
    handleSynthesizeExecutive,
    handleDispatchTelegram,
  } = useSopPlaybookCenter({
    mode,
    playbookId,
    initialContent,
    activeFolder,
    onCloseCurrentTab,
  });

  if (mode === "reconcile") {
    return (
      <SopReconcileAuditView
        auditMode={auditMode}
        onSelectAuditMode={setAuditMode}
        auditing={auditing}
        onRunReconciliation={handleRunReconciliation}
        auditResult={auditResult}
        dispatchingTg={dispatchingTg}
        onDispatchTelegram={handleDispatchTelegram}
        onOpenFileTab={onOpenFileTab}
      />
    );
  }

  if (mode === "executive") {
    return (
      <SopExecutiveSynthesisView
        execPeriod={execPeriod}
        onExecPeriodChange={setExecPeriod}
        synthesizing={synthesizing}
        onSynthesizeExecutive={handleSynthesizeExecutive}
        execKpi={execKpi}
        dispatchingTg={dispatchingTg}
        onDispatchTelegram={handleDispatchTelegram}
        onOpenFileTab={onOpenFileTab}
      />
    );
  }

  return (
    <SopPlaybookStudioView
      activeFolder={activeFolder}
      playbook={playbook}
      isEditing={isEditing}
      executing={executing}
      generating={generating}
      saving={saving}
      draggedIdx={draggedIdx}
      dragOverIdx={dragOverIdx}
      onSetDraggedIdx={setDraggedIdx}
      onSetDragOverIdx={setDragOverIdx}
      title={title}
      onTitleChange={setTitle}
      category={category}
      onCategoryChange={setCategory}
      description={description}
      onDescriptionChange={setDescription}
      steps={steps}
      onGenerateFromFolder={handleGenerateFromFolder}
      onStartNewPlaybook={handleStartNewPlaybook}
      onStartEditing={handleStartEditing}
      onCancelEditing={handleCancelEditing}
      onSavePlaybook={handleSavePlaybook}
      onDeletePlaybook={handleDeletePlaybook}
      onRunPlaybookWithLLM={handleRunPlaybookWithLLM}
      onAddStep={handleAddStep}
      onRemoveStep={handleRemoveStep}
      onUpdateStepField={handleUpdateStepField}
      onReorderSteps={handleReorderSteps}
      onOpenFileTab={onOpenFileTab}
    />
  );
});
