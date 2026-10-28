import { memo, useState, useEffect } from "react";
import {
  ClipboardCheck,
  Play,
  RotateCw,
  Clock,
  FileSpreadsheet,
  FileText,
  Presentation,
  Send,
  Plus,
  Pencil,
  Trash2,
  Wand2,
  GripVertical,
  ShieldCheck,
  ShieldAlert,
  Scale,
  AlertTriangle,
  Check,
  X,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { apiFetch } from "../../../lib/api";
import { toast } from "sonner";
import type {
  SopPlaybookDef,
  ReconcileAuditResult,
  ExecutiveKpiResult,
} from "./SopPlaybookPanel";

interface SopPlaybookCenterViewProps {
  mode: "playbook" | "new-playbook" | "reconcile" | "executive";
  playbookId?: string;
  initialContent?: string;
  activeFolder?: string;
  onOpenFileTab?: (path: string) => void;
  onCloseCurrentTab?: () => void;
}

export const SopPlaybookCenterView = memo(function SopPlaybookCenterView({
  mode,
  playbookId,
  initialContent,
  activeFolder,
  onOpenFileTab,
  onCloseCurrentTab,
}: SopPlaybookCenterViewProps) {
  const parsedInitial: SopPlaybookDef | null = (() => {
    if (!initialContent) return null;
    try {
      return JSON.parse(initialContent) as SopPlaybookDef;
    } catch {
      return null;
    }
  })();

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
  const [steps, setSteps] = useState<
    Array<{ title: string; description: string; target_file: string }>
  >(
    parsedInitial?.steps && parsedInitial.steps.length > 0
      ? parsedInitial.steps.map((s) => ({
          title: s.title,
          description: s.description || "",
          target_file: s.target_file,
        }))
      : [
          {
            title: "Read & Parse Source Document",
            description: "Extract daily records or notes from source file.",
            target_file: "LAPORAN-HARIAN.txt",
          },
          {
            title: "Recap Data into Spreadsheet",
            description: "Update columns and recalculate totals in GridCraft.",
            target_file: "recap_summary.xlsx",
          },
        ]
  );

  // 3-Way Reconciliation State
  const [auditMode, setAuditMode] = useState<"cash_and_bank" | "procurement_three_way">(
    "cash_and_bank"
  );
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<ReconcileAuditResult | null>(null);

  // Executive Synthesis State
  const [execPeriod, setExecPeriod] = useState("October 2026");
  const [synthesizing, setSynthesizing] = useState(false);
  const [execKpi, setExecKpi] = useState<ExecutiveKpiResult | null>(null);
  const [dispatchingTg, setDispatchingTg] = useState(false);

  // Sync when initialContent or playbookId changes
  useEffect(() => {
    if (mode === "new-playbook") {
      setIsEditing(true);
      setPlaybook(null);
      setTitle("");
      setCategory("Finance & Sales");
      setDescription("");
      setSteps([
        {
          title: "Read & Parse Source Document",
          description: "Extract daily records or notes from source file.",
          target_file: "LAPORAN-HARIAN.txt",
        },
        {
          title: "Recap Data into Spreadsheet",
          description: "Update columns and recalculate totals in GridCraft.",
          target_file: "recap_summary.xlsx",
        },
      ]);
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

  const handleGenerateFromFolder = async () => {
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
  };

  const handleStartNewPlaybook = () => {
    setPlaybook(null);
    setIsEditing(true);
    setTitle("");
    setCategory("Finance & Sales");
    setDescription("");
    setSteps([
      {
        title: "Read & Parse Source Document",
        description: "Extract daily records or notes from source file.",
        target_file: "LAPORAN-HARIAN.txt",
      },
      {
        title: "Recap Data into Spreadsheet",
        description: "Update columns and recalculate totals in GridCraft.",
        target_file: "recap_summary.xlsx",
      },
    ]);
  };

  const persistPlaybookStepsOrder = async (
    pb: SopPlaybookDef,
    reorderedSteps: Array<{ title: string; description: string; target_file: string }>
  ) => {
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
  };

  const handleReorderSteps = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    setSteps((prev) => {
      if (fromIndex >= prev.length || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      if (!isEditing && playbook) {
        const updatedPb: SopPlaybookDef = {
          ...playbook,
          steps: next.map((s, idx) => ({
            step_index: idx + 1,
            title: s.title,
            description: s.description,
            target_file: s.target_file,
            app: s.target_file.toLowerCase().endsWith(".xlsx") ||
              s.target_file.toLowerCase().endsWith(".csv")
              ? "gridcraft"
              : "wordcraft",
          })),
        };
        setPlaybook(updatedPb);
        persistPlaybookStepsOrder(updatedPb, next);
      }
      return next;
    });
  };

  const handleSavePlaybook = async () => {
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
  };

  const handleDeletePlaybook = async () => {
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
  };

  // Directly connected to the real Arunaki LLM Chat Agent!
  const handleRunPlaybookWithLLM = async () => {
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
  };

  const handleRunReconciliation = async () => {
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
  };

  const handleSynthesizeExecutive = async () => {
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
  };

  const handleDispatchTelegram = async (
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
  };

  // ============================================================================
  // 1. 3-WAY RECONCILIATION AUDIT VIEW (CENTER PANEL)
  // ============================================================================
  if (mode === "reconcile") {
    return (
      <div className="flex-1 overflow-y-auto p-6 bg-[var(--bg-app)]">
        <div className="max-w-3xl mx-auto space-y-5">
          <div className="p-5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#cf6613] flex items-center justify-center shrink-0">
                  <Scale className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">
                    3-Way Reconciliation & Anomaly Guard
                  </h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    Cross-check 3 operational data sources in your active folder to detect variances and anomalies.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={auditing}
                onClick={handleRunReconciliation}
                title="Run 3-Way Audit"
                className="w-9 h-9 rounded-lg bg-[#cf6613] hover:bg-[#b8580f] text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
              >
                {auditing ? (
                  <RotateCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 fill-current" />
                )}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--border-color)]">
              <button
                type="button"
                onClick={() => setAuditMode("cash_and_bank")}
                className={cn(
                  "p-3 rounded-lg border text-left transition-all cursor-pointer",
                  auditMode === "cash_and_bank"
                    ? "bg-[var(--bg-hover)] border-[#cf6613] text-white"
                    : "bg-[var(--bg-app)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-white"
                )}
              >
                <div className="text-xs font-semibold text-white mb-0.5">
                  POS vs Bank vs Cash Ledger
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  Reconcile daily register sales, bank settlements, and Excel cash recaps.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setAuditMode("procurement_three_way")}
                className={cn(
                  "p-3 rounded-lg border text-left transition-all cursor-pointer",
                  auditMode === "procurement_three_way"
                    ? "bg-[var(--bg-hover)] border-[#cf6613] text-white"
                    : "bg-[var(--bg-app)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-white"
                )}
              >
                <div className="text-xs font-semibold text-white mb-0.5">
                  PO vs Goods Receipt vs Supplier Invoice
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  Verify purchase orders against receiving logs and supplier billing.
                </div>
              </button>
            </div>
          </div>

          {auditResult && (
            <div className="p-5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <div className="flex items-center gap-2">
                  {auditResult.audit_status === "BALANCED" ? (
                    <ShieldCheck className="w-5 h-5 text-white" />
                  ) : (
                    <ShieldAlert className="w-5 h-5 text-rose-500" />
                  )}
                  <span
                    className={cn(
                      "text-sm font-bold",
                      auditResult.audit_status === "BALANCED"
                        ? "text-white"
                        : "text-rose-400"
                    )}
                  >
                    {auditResult.audit_status === "BALANCED"
                      ? "Audit Balanced (Zero Variance)"
                      : `${auditResult.anomalies_count} Discrepancy Finding(s) Detected`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {onOpenFileTab && (
                    <button
                      type="button"
                      onClick={() => onOpenFileTab("reconciliation_discrepancy_memo.docx")}
                      className="px-3 py-1.5 rounded border border-[var(--border-strong)] bg-[var(--bg-app)] hover:bg-[var(--bg-hover)] text-xs text-white flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-[#cf6613]" />
                      <span>Open Audit Memo (.docx)</span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={dispatchingTg}
                    onClick={() =>
                      handleDispatchTelegram(
                        "alert",
                        `3-Way Audit Alert (${auditResult.period})`,
                        "reconciliation_discrepancy_memo.docx",
                        `Anomalies: ${auditResult.anomalies_count} | Variance: Rp ${auditResult.totals.absolute_variance.toLocaleString("id-ID")}`
                      )
                    }
                    className="px-3 py-1.5 rounded border border-[var(--border-strong)] bg-[var(--bg-app)] hover:bg-[var(--bg-hover)] text-xs text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5 text-[#cf6613]" />
                    <span>Send Alert to Telegram</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)]">
                  <div className="text-[11px] text-[var(--text-muted)]">
                    {auditResult.labels.source_a}
                  </div>
                  <div className="text-sm font-mono font-bold text-white mt-1">
                    Rp {auditResult.totals.source_a.toLocaleString("id-ID")}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)]">
                  <div className="text-[11px] text-[var(--text-muted)]">
                    {auditResult.labels.source_b}
                  </div>
                  <div className="text-sm font-mono font-bold text-white mt-1">
                    Rp {auditResult.totals.source_b.toLocaleString("id-ID")}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)]">
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Absolute Variance
                  </div>
                  <div
                    className={cn(
                      "text-sm font-mono font-bold mt-1",
                      auditResult.totals.absolute_variance > 0
                        ? "text-rose-400"
                        : "text-white"
                    )}
                  >
                    Rp {auditResult.totals.absolute_variance.toLocaleString("id-ID")}
                  </div>
                </div>
              </div>

              {auditResult.anomalies.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-white">Detected Anomalies</h4>
                  {auditResult.anomalies.map((anom, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-[var(--bg-app)] border border-rose-500/40 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                          {anom.title}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-600 text-white">
                          {anom.severity}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-muted)]">{anom.description}</p>
                      <p className="text-[11px] text-[#cf6613] font-medium">
                        Action: {anom.recommendation}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // 2. EXECUTIVE BRIEF SYNTHESIS VIEW (CENTER PANEL)
  // ============================================================================
  if (mode === "executive") {
    return (
      <div className="flex-1 overflow-y-auto p-6 bg-[var(--bg-app)]">
        <div className="max-w-3xl mx-auto space-y-5">
          <div className="p-5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#cf6613] flex items-center justify-center shrink-0">
                  <Presentation className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Executive Multi-Format Synthesis
                  </h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    Synthesize spreadsheets and reports into an A4 Executive Memo (.docx) and Board Slide Deck (.pptx).
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={execPeriod}
                  onChange={(e) => setExecPeriod(e.target.value)}
                  className="h-9 px-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)] text-xs text-white focus:outline-none focus:border-[#cf6613]"
                  placeholder="Reporting Period"
                />
                <button
                  type="button"
                  disabled={synthesizing}
                  onClick={handleSynthesizeExecutive}
                  title="Generate Brief & Deck"
                  className="w-9 h-9 rounded-lg bg-[#cf6613] hover:bg-[#b8580f] text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
                >
                  {synthesizing ? (
                    <RotateCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 fill-current" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {execKpi && (
            <div className="p-5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <span className="text-sm font-semibold text-white">
                  Executive KPI Snapshot — {execKpi.period}
                </span>
                <div className="flex items-center gap-2">
                  {onOpenFileTab && (
                    <>
                      <button
                        type="button"
                        onClick={() => onOpenFileTab("executive_summary_memo.docx")}
                        className="px-3 py-1.5 rounded border border-[var(--border-strong)] bg-[var(--bg-app)] hover:bg-[var(--bg-hover)] text-xs text-white flex items-center gap-1.5 cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5 text-[#cf6613]" />
                        <span>Open Memo (.docx)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenFileTab("executive_presentation_deck.pptx")}
                        className="px-3 py-1.5 rounded border border-[var(--border-strong)] bg-[var(--bg-app)] hover:bg-[var(--bg-hover)] text-xs text-white flex items-center gap-1.5 cursor-pointer"
                      >
                        <Presentation className="w-3.5 h-3.5 text-[#cf6613]" />
                        <span>Open Slides (.pptx)</span>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    disabled={dispatchingTg}
                    onClick={() =>
                      handleDispatchTelegram(
                        "report",
                        `Executive Brief (${execKpi.period})`,
                        "executive_summary_memo.docx",
                        `Net Income: Rp ${execKpi.net_operating_income.toLocaleString("id-ID")} (${execKpi.operating_margin_pct.toFixed(1)}%)`
                      )
                    }
                    className="px-3 py-1.5 rounded border border-[var(--border-strong)] bg-[var(--bg-app)] hover:bg-[var(--bg-hover)] text-xs text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5 text-[#cf6613]" />
                    <span>Send to Telegram</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)]">
                  <div className="text-[11px] text-[var(--text-muted)]">Gross Revenue</div>
                  <div className="text-sm font-mono font-bold text-white mt-1">
                    Rp {execKpi.gross_revenue.toLocaleString("id-ID")}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)]">
                  <div className="text-[11px] text-[var(--text-muted)]">Operating Expenses</div>
                  <div className="text-sm font-mono font-bold text-white mt-1">
                    Rp {execKpi.operating_expenses.toLocaleString("id-ID")}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)]">
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Net Operating Income ({execKpi.operating_margin_pct.toFixed(1)}%)
                  </div>
                  <div className="text-sm font-mono font-bold text-white mt-1">
                    Rp {execKpi.net_operating_income.toLocaleString("id-ID")}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // 3. PLAYBOOK STUDIO: TOP ACTION BAR + VIEW / RUN / EDIT IN CENTER PANEL
  // ============================================================================
  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[var(--bg-app)]">
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Top Studio Toolbar (Icon-only Generate & Add buttons) */}
        <div className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-white">Playbook Studio</h3>
            <p className="text-[11px] text-[var(--text-muted)] truncate">
              Generate workflows from your active folder documents or build a custom SOP routine.
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={!activeFolder || generating}
              onClick={handleGenerateFromFolder}
              title="Generate Playbooks from Folder"
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer",
                !activeFolder
                  ? "bg-[var(--bg-hover)] text-[var(--text-muted)] cursor-not-allowed"
                  : "bg-[#cf6613] hover:bg-[#b8580f] text-white"
              )}
            >
              {generating ? (
                <RotateCw className="w-4 h-4 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              disabled={!activeFolder}
              onClick={handleStartNewPlaybook}
              title="Add New Playbook"
              className={cn(
                "w-8 h-8 rounded-lg border flex items-center justify-center transition-all cursor-pointer",
                !activeFolder
                  ? "bg-[var(--bg-hover)] text-[var(--text-muted)] border-[var(--border-color)] cursor-not-allowed"
                  : "bg-[var(--bg-app)] hover:bg-[var(--bg-hover)] text-white border-[var(--border-strong)]"
              )}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Selected Playbook Header Card */}
        {(isEditing || playbook) && (
          <div className="p-5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-[#cf6613] flex items-center justify-center shrink-0 mt-0.5">
                  <ClipboardCheck className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-[var(--bg-hover)] text-white border border-[var(--border-strong)]">
                      {isEditing ? category || "Operations" : playbook?.category || "Operations"}
                    </span>
                    <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {playbook?.estimated_minutes || 2}m estimated
                    </span>
                  </div>
                  <h2 className="text-base font-semibold text-white leading-snug">
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
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      title="Edit Playbook"
                      className="w-8 h-8 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-app)] hover:bg-[var(--bg-hover)] text-white flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5 text-[#cf6613]" />
                    </button>
                    <button
                      type="button"
                      onClick={handleDeletePlaybook}
                      title="Delete Playbook"
                      className="w-8 h-8 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-app)] hover:bg-rose-600 hover:border-rose-500 text-white flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={executing}
                      onClick={handleRunPlaybookWithLLM}
                      title="Run Playbook with Arunaki AI Agent"
                      className="w-8 h-8 rounded-lg bg-[#cf6613] hover:bg-[#b8580f] text-white flex items-center justify-center transition-colors cursor-pointer"
                    >
                      {executing ? (
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current" />
                      )}
                    </button>
                  </>
                )}
                {isEditing && (
                  <>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleSavePlaybook}
                      title="Save Playbook"
                      className="w-8 h-8 rounded-lg bg-[#cf6613] hover:bg-[#b8580f] text-white flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    {playbook && (
                      <button
                        type="button"
                        onClick={() => {
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
                        }}
                        title="Cancel Editing"
                        className="w-8 h-8 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-app)] hover:bg-[var(--bg-hover)] text-white flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
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
          </div>
        )}

        {/* EDIT / CREATE MODE IN CENTER PANEL (WITH DRAG & DROP REORDERING) */}
        {isEditing ? (
          <div className="p-5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] space-y-4">
            <h3 className="text-sm font-semibold text-white border-b border-[var(--border-color)] pb-2.5">
              Playbook Configuration & Steps
            </h3>

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                  Playbook Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Sync LAPORAN-HARIAN.txt to REKAP 10-2026.xlsx"
                  className="w-full h-9 px-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)] text-xs text-white focus:outline-none focus:border-[#cf6613]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                  Category
                </label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Finance & Sales"
                  className="w-full h-9 px-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)] text-xs text-white focus:outline-none focus:border-[#cf6613]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Description
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what documents this playbook reads and updates..."
                className="w-full p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)] text-xs text-white focus:outline-none focus:border-[#cf6613] resize-none"
              />
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-semibold text-white">
                    Execution Pipeline Steps ({steps.length})
                  </label>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Drag any step card up or down to reorder the execution sequence.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSteps((prev) => [
                      ...prev,
                      {
                        title: `Step ${prev.length + 1}`,
                        description: "Process target document in workspace",
                        target_file: "summary_report.docx",
                      },
                    ])
                  }
                  title="Add Step"
                  className="w-8 h-8 rounded-lg bg-[#cf6613] hover:bg-[#b8580f] text-white flex items-center justify-center cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                {steps.map((st, idx) => (
                  <div
                    key={idx}
                    draggable
                    onDragStart={() => setDraggedIdx(idx)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverIdx(idx);
                    }}
                    onDragEnd={() => {
                      setDraggedIdx(null);
                      setDragOverIdx(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedIdx !== null && draggedIdx !== idx) {
                        handleReorderSteps(draggedIdx, idx);
                      }
                      setDraggedIdx(null);
                      setDragOverIdx(null);
                    }}
                    className={cn(
                      "p-4 rounded-lg bg-[var(--bg-app)] border space-y-3 transition-all",
                      dragOverIdx === idx
                        ? "border-[#cf6613] bg-[var(--bg-hover)]/40"
                        : "border-[var(--border-color)]"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white flex items-center gap-2 cursor-grab active:cursor-grabbing">
                        <GripVertical className="w-4 h-4 text-[var(--text-muted)] hover:text-white" />
                        <span className="w-5 h-5 rounded-full bg-[#cf6613] text-white text-[11px] font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        Step {idx + 1}
                      </span>
                      {steps.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setSteps((prev) => prev.filter((_, i) => i !== idx))
                          }
                          title="Remove Step"
                          className="w-7 h-7 rounded border border-[var(--border-strong)] text-white/80 hover:text-white hover:bg-rose-600 hover:border-rose-500 flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] text-[var(--text-muted)]">
                          Step Title
                        </label>
                        <input
                          type="text"
                          value={st.title}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSteps((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, title: val } : item
                              )
                            );
                          }}
                          placeholder="e.g. Read & Parse LAPORAN-HARIAN.txt"
                          className="w-full h-8 px-2.5 rounded bg-[var(--bg-panel)] border border-[var(--border-color)] text-xs text-white focus:outline-none focus:border-[#cf6613]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-[var(--text-muted)]">
                          Target File in Folder
                        </label>
                        <input
                          type="text"
                          value={st.target_file}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSteps((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, target_file: val } : item
                              )
                            );
                          }}
                          placeholder="e.g. REKAP 10-2026.xlsx"
                          className="w-full h-8 px-2.5 rounded bg-[var(--bg-panel)] border border-[var(--border-color)] text-xs font-mono text-[#cf6613] focus:outline-none focus:border-[#cf6613]"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] text-[var(--text-muted)]">
                        Step Instructions / Details
                      </label>
                      <input
                        type="text"
                        value={st.description}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSteps((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, description: val } : item
                            )
                          );
                        }}
                        placeholder="What should Arunaki do in this step?"
                        className="w-full h-8 px-2.5 rounded bg-[var(--bg-panel)] border border-[var(--border-color)] text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[#cf6613]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* VIEW MODE: DRAGGABLE STEP PIPELINE IN CENTER PANEL */
          playbook && (
            <div className="p-5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <h3 className="text-sm font-semibold text-white">
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
                    onDragStart={() => setDraggedIdx(idx)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverIdx(idx);
                    }}
                    onDragEnd={() => {
                      setDraggedIdx(null);
                      setDragOverIdx(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedIdx !== null && draggedIdx !== idx) {
                        handleReorderSteps(draggedIdx, idx);
                      }
                      setDraggedIdx(null);
                      setDragOverIdx(null);
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
                        <div className="text-sm font-semibold text-white">
                          {st.title}
                        </div>
                        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                          {st.description}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenFileTab?.(st.target_file);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] text-xs font-mono text-[#cf6613] flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                      title="Open target file in Center Panel"
                    >
                      {st.app === "gridcraft" ? (
                        <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>{st.target_file}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
});
