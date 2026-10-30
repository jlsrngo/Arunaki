import { memo } from "react";
import {
  ClipboardCheck,
  Clock,
  Pencil,
  Trash2,
  Play,
  RotateCw,
  Check,
  X,
  Plus,
  Wand2,
  GripVertical,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { cn } from "../../../../lib/utils";
import { Button, Input, Textarea, Card, Badge } from "../../../ui";
import { SopPlaybookDef, EditablePlaybookStep } from "../sopTypes";

interface SopPlaybookStudioViewProps {
  activeFolder?: string;
  playbook: SopPlaybookDef | null;
  isEditing: boolean;
  executing: boolean;
  generating: boolean;
  saving: boolean;
  draggedIdx: number | null;
  dragOverIdx: number | null;
  onSetDraggedIdx: (idx: number | null) => void;
  onSetDragOverIdx: (idx: number | null) => void;
  title: string;
  onTitleChange: (val: string) => void;
  category: string;
  onCategoryChange: (val: string) => void;
  description: string;
  onDescriptionChange: (val: string) => void;
  steps: EditablePlaybookStep[];
  onGenerateFromFolder: () => void;
  onStartNewPlaybook: () => void;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onSavePlaybook: () => void;
  onDeletePlaybook: () => void;
  onRunPlaybookWithLLM: () => void;
  onAddStep: () => void;
  onRemoveStep: (idx: number) => void;
  onUpdateStepField: (idx: number, field: keyof EditablePlaybookStep, value: string) => void;
  onReorderSteps: (fromIdx: number, toIdx: number) => void;
  onOpenFileTab?: (path: string) => void;
}

export const SopPlaybookStudioView = memo(function SopPlaybookStudioView({
  activeFolder,
  playbook,
  isEditing,
  executing,
  generating,
  saving,
  draggedIdx,
  dragOverIdx,
  onSetDraggedIdx,
  onSetDragOverIdx,
  title,
  onTitleChange,
  category,
  onCategoryChange,
  description,
  onDescriptionChange,
  steps,
  onGenerateFromFolder,
  onStartNewPlaybook,
  onStartEditing,
  onCancelEditing,
  onSavePlaybook,
  onDeletePlaybook,
  onRunPlaybookWithLLM,
  onAddStep,
  onRemoveStep,
  onUpdateStepField,
  onReorderSteps,
  onOpenFileTab,
}: SopPlaybookStudioViewProps) {
  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[var(--bg-app)]">
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Top Studio Toolbar (Icon-only Generate & Add buttons) */}
        <Card className="p-4 bg-[var(--bg-panel)] flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-[var(--text-primary)]">
              Playbook Studio
            </h3>
            <p className="text-[11px] text-[var(--text-muted)] truncate">
              Generate workflows from your active folder documents or build a custom SOP routine.
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              type="button"
              variant="brand"
              size="icon"
              disabled={!activeFolder || generating}
              onClick={onGenerateFromFolder}
              title="Generate Playbooks from Folder"
            >
              {generating ? (
                <RotateCw className="w-4 h-4 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4" />
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!activeFolder}
              onClick={onStartNewPlaybook}
              title="Add New Playbook"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </Card>

        {/* Selected Playbook Header Card */}
        {(isEditing || playbook) && (
          <Card className="p-5 bg-[var(--bg-panel)] space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-[#cf6613] flex items-center justify-center shrink-0 mt-0.5">
                  <ClipboardCheck className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline">
                      {isEditing ? category || "Operations" : playbook?.category || "Operations"}
                    </Badge>
                    <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {playbook?.estimated_minutes || 2}m estimated
                    </span>
                  </div>
                  <h2 className="text-base font-semibold text-[var(--text-primary)] leading-snug">
                    {isEditing
                      ? title || "New Custom Playbook"
                      : playbook?.title || "Playbook"}
                  </h2>
                </div>
              </div>

              {/* Icon-Only Action Toolbar (Edit, Delete, Run with AI Agent) */}
              <div className="flex items-center gap-1.5 shrink-0">
                {!isEditing && playbook && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={onStartEditing}
                      title="Edit Playbook"
                    >
                      <Pencil className="w-3.5 h-3.5 text-[#cf6613]" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost-destructive"
                      size="icon"
                      onClick={onDeletePlaybook}
                      title="Delete Playbook"
                      className="border border-[var(--border-strong)]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="brand"
                      size="icon"
                      disabled={executing}
                      onClick={onRunPlaybookWithLLM}
                      title="Run Playbook with Arunaki AI Agent"
                    >
                      {executing ? (
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current" />
                      )}
                    </Button>
                  </>
                )}
                {isEditing && (
                  <>
                    <Button
                      type="button"
                      variant="brand"
                      size="icon"
                      disabled={saving}
                      onClick={onSavePlaybook}
                      title="Save Playbook"
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                    {playbook && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={onCancelEditing}
                        title="Cancel Editing"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>

            {!isEditing && playbook?.description && (
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed pt-2 border-t border-[var(--border-color)]">
                {playbook.description}
              </p>
            )}
          </Card>
        )}

        {/* EDIT / CREATE MODE IN CENTER PANEL (WITH DRAG & DROP REORDERING) */}
        {isEditing ? (
          <Card className="p-5 bg-[var(--bg-panel)] space-y-4">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] border-b border-[var(--border-color)] pb-2.5">
              Playbook Configuration & Steps
            </h3>

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                  Playbook Title
                </label>
                <Input
                  type="text"
                  value={title}
                  onChange={(e) => onTitleChange(e.target.value)}
                  placeholder="e.g. Sync LAPORAN-HARIAN.txt to REKAP 10-2026.xlsx"
                  className="bg-[var(--bg-app)]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                  Category
                </label>
                <Input
                  type="text"
                  value={category}
                  onChange={(e) => onCategoryChange(e.target.value)}
                  placeholder="e.g. Finance & Sales"
                  className="bg-[var(--bg-app)]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Description
              </label>
              <Textarea
                rows={2}
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                placeholder="Describe what documents this playbook reads and updates..."
                className="bg-[var(--bg-app)] resize-none"
              />
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-semibold text-[var(--text-primary)]">
                    Execution Pipeline Steps ({steps.length})
                  </label>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Drag any step card up or down to reorder the execution sequence.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="brand"
                  size="icon"
                  onClick={onAddStep}
                  title="Add Step"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-3">
                {steps.map((st, idx) => (
                  <div
                    key={idx}
                    draggable
                    onDragStart={() => onSetDraggedIdx(idx)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      onSetDragOverIdx(idx);
                    }}
                    onDragEnd={() => {
                      onSetDraggedIdx(null);
                      onSetDragOverIdx(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedIdx !== null && draggedIdx !== idx) {
                        onReorderSteps(draggedIdx, idx);
                      }
                      onSetDraggedIdx(null);
                      onSetDragOverIdx(null);
                    }}
                    className={cn(
                      "p-4 rounded-lg bg-[var(--bg-app)] border space-y-3 transition-all",
                      dragOverIdx === idx
                        ? "border-[#cf6613] bg-[var(--bg-hover)]/40"
                        : "border-[var(--border-color)]"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-2 cursor-grab active:cursor-grabbing">
                        <GripVertical className="w-4 h-4 text-[var(--text-muted)] hover:text-[var(--text-primary)]" />
                        <span className="w-5 h-5 rounded-full bg-[#cf6613] text-white text-[11px] font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        Step {idx + 1}
                      </span>
                      {steps.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost-destructive"
                          size="icon-sm"
                          onClick={() => onRemoveStep(idx)}
                          title="Remove Step"
                          className="border border-[var(--border-strong)]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] text-[var(--text-muted)]">
                          Step Title
                        </label>
                        <Input
                          type="text"
                          value={st.title}
                          onChange={(e) => onUpdateStepField(idx, "title", e.target.value)}
                          placeholder="e.g. Read & Parse LAPORAN-HARIAN.txt"
                          className="bg-[var(--bg-panel)]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-[var(--text-muted)]">
                          Target File in Folder
                        </label>
                        <Input
                          type="text"
                          value={st.target_file}
                          onChange={(e) =>
                            onUpdateStepField(idx, "target_file", e.target.value)
                          }
                          placeholder="e.g. REKAP 10-2026.xlsx"
                          className="bg-[var(--bg-panel)] font-mono text-[#cf6613]"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] text-[var(--text-muted)]">
                        Step Instructions / Details
                      </label>
                      <Input
                        type="text"
                        value={st.description}
                        onChange={(e) =>
                          onUpdateStepField(idx, "description", e.target.value)
                        }
                        placeholder="What should Arunaki do in this step?"
                        className="bg-[var(--bg-panel)]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ) : (
          /* VIEW MODE: DRAGGABLE STEP PIPELINE IN CENTER PANEL */
          playbook && (
            <Card className="p-5 bg-[var(--bg-panel)] space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Execution Pipeline ({playbook.steps.length} Steps)
                </h3>
                <span className="text-xs text-[var(--text-muted)]">
                  Drag steps to reorder · Click target file to open
                </span>
              </div>

              <div className="space-y-3">
                {playbook.steps.map((st, idx) => (
                  <div
                    key={`${st.step_index}-${st.title}`}
                    draggable
                    onDragStart={() => onSetDraggedIdx(idx)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      onSetDragOverIdx(idx);
                    }}
                    onDragEnd={() => {
                      onSetDraggedIdx(null);
                      onSetDragOverIdx(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedIdx !== null && draggedIdx !== idx) {
                        onReorderSteps(draggedIdx, idx);
                      }
                      onSetDraggedIdx(null);
                      onSetDragOverIdx(null);
                    }}
                    className={cn(
                      "p-4 rounded-xl bg-[var(--bg-app)] border flex items-start justify-between gap-4 transition-all cursor-grab active:cursor-grabbing",
                      dragOverIdx === idx
                        ? "border-[#cf6613] bg-[var(--bg-hover)]/40"
                        : "border-[var(--border-color)] hover:border-[var(--border-strong)]"
                    )}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <GripVertical className="w-4 h-4 text-[var(--text-muted)] shrink-0 mt-1" />
                      <div className="w-6 h-6 rounded-full bg-[#cf6613] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </div>
                      <div className="space-y-1 min-w-0">
                        <div className="text-sm font-semibold text-[var(--text-primary)]">
                          {st.title}
                        </div>
                        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                          {st.description}
                        </p>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenFileTab?.(st.target_file);
                      }}
                      className="font-mono text-[#cf6613] shrink-0"
                      title="Open target file in Center Panel"
                    >
                      {st.app === "gridcraft" ? (
                        <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>{st.target_file}</span>
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )
        )}
      </div>
    </div>
  );
});

