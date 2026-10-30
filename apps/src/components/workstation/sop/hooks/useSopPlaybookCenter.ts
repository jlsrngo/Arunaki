import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { apiFetch } from "../../../../lib/api";
import {
  SopPlaybookDef,
  EditablePlaybookStep,
  ReconcileAuditResult,
  ExecutiveKpiResult,
  SopCenterMode,
  ReconcileAuditMode,
  DEFAULT_PLAYBOOK_STEPS,
} from "../sopTypes";

interface UseSopPlaybookCenterParams {
  mode: SopCenterMode;
  playbookId?: string;
  initialContent?: string;
  activeFolder?: string;
  onCloseCurrentTab?: () => void;
}

export function useSopPlaybookCenter({
  mode,
  playbookId,
  initialContent,
  activeFolder,
  onCloseCurrentTab,
}: UseSopPlaybookCenterParams) {
  const parsedInitial = useMemo<SopPlaybookDef | null>(() => {
    if (!initialContent) return null;
    try {
      return JSON.parse(initialContent) as SopPlaybookDef;
    } catch {
      return null;
    }
  }, [initialContent]);

  const [playbook, setPlaybook] = useState<SopPlaybookDef | null>(parsedInitial);
  const [isEditing, setIsEditing] = useState<boolean>(mode === "new-playbook");
  const [executing, setExecuting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Editable form state
  const [title, setTitle] = useState(parsedInitial?.title || "");
  const [category, setCategory] = useState(parsedInitial?.category || "Finance & Sales");
  const [description, setDescription] = useState(parsedInitial?.description || "");
  const [steps, setSteps] = useState<EditablePlaybookStep[]>(
    parsedInitial?.steps && parsedInitial.steps.length > 0
      ? parsedInitial.steps.map((s) => ({
          title: s.title,
          description: s.description || "",
          target_file: s.target_file,
        }))
      : DEFAULT_PLAYBOOK_STEPS
  );

  // 3-Way Reconciliation State
  const [auditMode, setAuditMode] = useState<ReconcileAuditMode>("cash_and_bank");
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<ReconcileAuditResult | null>(null);

  // Executive Synthesis State
  const [execPeriod, setExecPeriod] = useState("October 2026");
  const [synthesizing, setSynthesizing] = useState(false);
  const [execKpi, setExecKpi] = useState<ExecutiveKpiResult | null>(null);
  const [dispatchingTg, setDispatchingTg] = useState(false);

  const playbookRef = useRef<SopPlaybookDef | null>(playbook);
  playbookRef.current = playbook;
  const isEditingRef = useRef<boolean>(isEditing);
  isEditingRef.current = isEditing;

  // Sync when initialContent or playbookId changes
  useEffect(() => {
    if (mode === "new-playbook") {
      setIsEditing(true);
      setPlaybook(null);
      setTitle("");
      setCategory("Finance & Sales");
      setDescription("");
      setSteps(DEFAULT_PLAYBOOK_STEPS);
      return;
    }

    if (initialContent) {
      try {
        const pb = JSON.parse(initialContent) as SopPlaybookDef;
        setPlaybook(pb);
        setIsEditing(false);
        setTitle(pb.title);
        setCategory(pb.category || "Operations");
        setDescription(pb.description || "");
        setSteps(
          pb.steps.map((s) => ({
            title: s.title,
            description: s.description || "",
            target_file: s.target_file,
          }))
        );
      } catch {
        setPlaybook(null);
      }
    } else {
      setPlaybook(null);
    }
  }, [mode, playbookId, initialContent]);

  const handleGenerateFromFolder = useCallback(async () => {
    if (!activeFolder) {
      toast.error("Please open a project folder first.");
      return;
    }
    try {
      setGenerating(true);
      toast.info("Scanning workspace documents to generate Playbooks...");
      const response = await apiFetch("/api/sop/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_dir: activeFolder }),
      });
      if (response.ok) {
        const data = await response.json();
        window.dispatchEvent(new CustomEvent("arunaki:playbooks-updated"));
        if (data && Array.isArray(data.playbooks) && data.playbooks.length > 0) {
          const first = data.playbooks[0] as SopPlaybookDef;
          setPlaybook(first);
          setIsEditing(false);
          setTitle(first.title);
          setCategory(first.category);
          setDescription(first.description);
          setSteps(
            first.steps.map((s) => ({
              title: s.title,
              description: s.description,
              target_file: s.target_file,
            }))
          );
          toast.success(
            `Generated ${data.playbooks.length} playbook(s) from your folder.`
          );
        }
      } else {
        toast.error("Failed to generate playbooks from folder.");
      }
    } catch (err: any) {
      toast.error(`Generation error: ${err?.message || "Unknown error"}`);
    } finally {
      setGenerating(false);
    }
  }, [activeFolder]);

  const handleStartNewPlaybook = useCallback(() => {
    setPlaybook(null);
    setIsEditing(true);
    setTitle("");
    setCategory("Finance & Sales");
    setDescription("");
    setSteps(DEFAULT_PLAYBOOK_STEPS);
  }, []);

  const persistPlaybookStepsOrder = useCallback(
    async (pb: SopPlaybookDef, reorderedSteps: EditablePlaybookStep[]) => {
      if (!activeFolder) return;
      try {
        const response = await apiFetch("/api/sop/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace_dir: activeFolder,
            id: pb.id,
            title: pb.title,
            category: pb.category,
            description: pb.description,
            steps: reorderedSteps,
          }),
        });
        if (response.ok) {
          const data = await response.json();
          if (data?.playbook) {
            setPlaybook(data.playbook);
          }
          window.dispatchEvent(new CustomEvent("arunaki:playbooks-updated"));
        }
      } catch {
        // ignore transient error
      }
    },
    [activeFolder]
  );

  const handleReorderSteps = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
      setSteps((prev) => {
        if (fromIndex >= prev.length || toIndex >= prev.length) return prev;
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        const currentPlaybook = playbookRef.current;
        if (!isEditingRef.current && currentPlaybook) {
          const updatedPb: SopPlaybookDef = {
            ...currentPlaybook,
            steps: next.map((s, idx) => ({
              step_index: idx + 1,
              title: s.title,
              description: s.description,
              target_file: s.target_file,
              app:
                s.target_file.toLowerCase().endsWith(".xlsx") ||
                s.target_file.toLowerCase().endsWith(".csv")
                  ? "gridcraft"
                  : "wordcraft",
            })),
          };
          setPlaybook(updatedPb);
          void persistPlaybookStepsOrder(updatedPb, next);
        }
        return next;
      });
    },
    [persistPlaybookStepsOrder]
  );

  const handleSavePlaybook = useCallback(async () => {
    if (!activeFolder) {
      toast.error("Please open a project folder first.");
      return;
    }
    if (!title.trim()) {
      toast.error("Please enter a Playbook title.");
      return;
    }
    const validSteps = steps.filter((s) => s.title.trim() && s.target_file.trim());
    if (validSteps.length === 0) {
      toast.error("Please add at least one valid workflow step.");
      return;
    }

    try {
      setSaving(true);
      const response = await apiFetch("/api/sop/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_dir: activeFolder,
          id: playbook?.id || undefined,
          title: title.trim(),
          category: category.trim() || "Operations",
          description:
            description.trim() || "Custom workflow configured for this workspace.",
          steps: validSteps,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data?.playbook) {
          setPlaybook(data.playbook);
          setIsEditing(false);
        }
        window.dispatchEvent(new CustomEvent("arunaki:playbooks-updated"));
        toast.success("Playbook saved to workspace.");
      } else {
        toast.error("Failed to save playbook.");
      }
    } catch (err: any) {
      toast.error(`Save error: ${err?.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  }, [activeFolder, title, category, description, steps, playbook]);

  const handleDeletePlaybook = useCallback(async () => {
    if (!activeFolder || !playbook) return;
    try {
      const response = await apiFetch("/api/sop/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_dir: activeFolder,
          playbook_id: playbook.id,
          id: playbook.id,
        }),
      });
      if (response.ok) {
        window.dispatchEvent(new CustomEvent("arunaki:playbooks-updated"));
        toast.success(`Removed playbook: ${playbook.title}`);
        onCloseCurrentTab?.();
      }
    } catch {
      toast.error("Failed to delete playbook.");
    }
  }, [activeFolder, playbook, onCloseCurrentTab]);

  const handleRunPlaybookWithLLM = useCallback(async () => {
    if (!activeFolder || !playbook) {
      toast.error("Please open a project folder first.");
      return;
    }
    setExecuting(true);
    try {
      const orderedSteps = playbook.steps
        .map(
          (s, idx) =>
            `${idx + 1}. ${s.title} (Target file: \`${s.target_file}\`) — ${s.description}`
        )
        .join("\n");

      const llmPrompt = [
        `Execute Playbook: **${playbook.title}**`,
        `Follow these exact steps in order using your document tools on the active workspace files:`,
        orderedSteps,
        `Read the actual source file content, write the real extracted data/calculations into the target spreadsheet or Word document (do not use placeholder text), and open the resulting updated document in the Center Panel.`,
      ].join("\n\n");

      window.dispatchEvent(
        new CustomEvent("arunaki:run-playbook-llm", {
          detail: {
            prompt: llmPrompt,
            playbookTitle: playbook.title,
          },
        })
      );
      toast.info(`Sent "${playbook.title}" to Arunaki AI Agent...`);
    } finally {
      setTimeout(() => setExecuting(false), 1200);
    }
  }, [activeFolder, playbook]);

  const handleCancelEditing = useCallback(() => {
    if (!playbook) return;
    setIsEditing(false);
    setTitle(playbook.title);
    setCategory(playbook.category);
    setDescription(playbook.description);
    setSteps(
      playbook.steps.map((s) => ({
        title: s.title,
        description: s.description,
        target_file: s.target_file,
      }))
    );
  }, [playbook]);

  const handleStartEditing = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleAddStep = useCallback(() => {
    setSteps((prev) => [
      ...prev,
      {
        title: `Step ${prev.length + 1}`,
        description: "Process target document in workspace",
        target_file: "summary_report.docx",
      },
    ]);
  }, []);

  const handleRemoveStep = useCallback((idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleUpdateStepField = useCallback(
    (idx: number, field: keyof EditablePlaybookStep, value: string) => {
      setSteps((prev) =>
        prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
      );
    },
    []
  );

  const handleRunReconciliation = useCallback(async () => {
    if (!activeFolder) {
      toast.error("Please open a project folder first.");
      return;
    }
    try {
      setAuditing(true);
      toast.info("Running 3-Way Reconciliation & Anomaly Guard...");
      const response = await apiFetch("/api/reconcile/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: auditMode,
          workspace_dir: activeFolder,
          session_id: "reconcile_center_exec",
          period: "October 28, 2026",
        }),
      });
      if (response.ok) {
        const res: ReconcileAuditResult = await response.json();
        if (res && res.status === "success") {
          setAuditResult(res);
          if (res.audit_status === "BALANCED") {
            toast.success("3-Way Reconciliation Passed: Zero variance detected.");
          } else {
            toast.warning(
              `Discrepancy Detected: ${res.anomalies_count} anomaly finding(s) flagged.`
            );
          }
        }
      }
    } catch (err: any) {
      toast.error(`Audit error: ${err?.message || "Unknown error"}`);
    } finally {
      setAuditing(false);
    }
  }, [activeFolder, auditMode]);

  const handleSynthesizeExecutive = useCallback(async () => {
    if (!activeFolder) {
      toast.error("Please open a project folder first.");
      return;
    }
    try {
      setSynthesizing(true);
      toast.info("Synthesizing Executive Memo (WordCraft) & Slide Deck (DeckCraft)...");
      const response = await apiFetch("/api/executive/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_dir: activeFolder,
          session_id: "executive_center_exec",
          period: execPeriod,
          prepared_by: "Arunaki Document Agent",
        }),
      });
      if (response.ok) {
        const res = await response.json();
        if (res && res.status === "success" && res.kpi) {
          setExecKpi(res.kpi);
          toast.success("Executive Summary & Presentation Deck generated.");
        }
      }
    } catch (err: any) {
      toast.error(`Synthesis error: ${err?.message || "Unknown error"}`);
    } finally {
      setSynthesizing(false);
    }
  }, [activeFolder, execPeriod]);

  const handleDispatchTelegram = useCallback(
    async (
      kind: "report" | "alert",
      reportTitle: string,
      filePath?: string,
      details?: string
    ) => {
      if (!activeFolder) return;
      try {
        setDispatchingTg(true);
        const response = await apiFetch("/api/telegram/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            workspace_dir: activeFolder,
            title: reportTitle,
            file_path: filePath,
            details,
            severity: kind === "alert" ? "HIGH" : "INFO",
          }),
        });
        if (response.ok) {
          const res = await response.json();
          toast.success(`Telegram Dispatch OK (${res?.dispatch_id || "Queued"})`);
        }
      } catch (err: any) {
        toast.error(`Telegram dispatch error: ${err?.message || "Unknown error"}`);
      } finally {
        setDispatchingTg(false);
      }
    },
    [activeFolder]
  );

  return {
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
  };
}
