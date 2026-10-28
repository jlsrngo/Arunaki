import { memo, useState, useEffect, useCallback } from "react";
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
  Sparkles,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  Scale,
  AlertCircle,
  AlertTriangle,
  X,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { apiFetch } from "../../../lib/api";
import { useI18n } from "../../../lib/i18n";
import { toast } from "sonner";

export interface SopStepDef {
  step_index: number;
  title: string;
  description: string;
  target_file: string;
  app: string;
}

export interface SopPlaybookDef {
  id: string;
  title: string;
  category: string;
  description: string;
  estimated_minutes: number;
  steps: SopStepDef[];
}

export interface ReconcileAnomaly {
  code: string;
  severity: string;
  title: string;
  description: string;
  variance_amount: number;
  recommendation: string;
}

export interface ReconcileLineItem {
  reference_id: string;
  description: string;
  source_a: number;
  source_b: number;
  source_c: number;
  variance: number;
  status: string;
}

export interface ReconcileAuditResult {
  status: string;
  audit_status: "BALANCED" | "DISCREPANCY_DETECTED";
  mode: string;
  period: string;
  labels: {
    source_a: string;
    source_b: string;
    source_c: string;
  };
  totals: {
    source_a: number;
    source_b: number;
    source_c: number;
    net_variance: number;
    absolute_variance: number;
  };
  matched_count: number;
  mismatch_count: number;
  anomalies_count: number;
  anomalies: ReconcileAnomaly[];
  line_items: ReconcileLineItem[];
  deliverables: string[];
}

export interface ExecutiveKpiResult {
  period: string;
  prepared_by: string;
  gross_revenue: number;
  operating_expenses: number;
  net_operating_income: number;
  operating_margin_pct: number;
  accounts_payable_total: number;
  top_revenue_channel: string;
  top_cost_driver: string;
  audit_health_status: string;
  highlights: string[];
  recommendations: string[];
}

interface SopPlaybookPanelProps {
  activeFolder: string | null;
  onOpenFileTab?: (path: string) => void;
  refetchFiles?: () => void;
  onClose?: () => void;
  width?: string;
}

export const SopPlaybookPanel = memo(function SopPlaybookPanel({
  activeFolder,
  onOpenFileTab,
  refetchFiles,
  onClose,
  width = "var(--left-panel-width)",
}: SopPlaybookPanelProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<"playbooks" | "reconcile" | "executive">("playbooks");
  const [playbooks, setPlaybooks] = useState<SopPlaybookDef[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Manual / Editable Playbook Form State
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("Operations");
  const [newDesc, setNewDesc] = useState("");
  const [newSteps, setNewSteps] = useState<Array<{ title: string; description: string; target_file: string }>>([
    {
      title: "Read & Recap Source Data",
      description: "Update target spreadsheet or document in workspace.",
      target_file: "recap_summary.xlsx",
    },
  ]);

  // 3-Way Reconciliation State
  const [auditMode, setAuditMode] = useState<"cash_and_bank" | "procurement_three_way">("cash_and_bank");
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<ReconcileAuditResult | null>(null);

  // Executive Synthesis State
  const [execPeriod, setExecPeriod] = useState("October 2026");
  const [synthesizing, setSynthesizing] = useState(false);
  const [execKpi, setExecKpi] = useState<ExecutiveKpiResult | null>(null);
  const [dispatchingTg, setDispatchingTg] = useState(false);

  const fetchPlaybooks = useCallback(async () => {
    if (!activeFolder) {
      setPlaybooks([]);
      return;
    }
    try {
      setLoading(true);
      const response = await apiFetch("/api/sop/playbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_dir: activeFolder }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.playbooks)) {
          setPlaybooks(data.playbooks);
          if (data.playbooks.length > 0 && !expandedId) {
            setExpandedId(data.playbooks[0].id);
          }
        }
      }
    } catch {
      // Keep current list on transient error
    } finally {
      setLoading(false);
    }
  }, [activeFolder, expandedId]);

  useEffect(() => {
    fetchPlaybooks();
  }, [fetchPlaybooks]);

  const handleGenerateFromFolder = async () => {
    if (!activeFolder) {
      toast.error("Please open a project folder first.");
      return;
    }
    try {
      setGenerating(true);
      toast.info("Scanning workspace files to generate tailored SOP Playbooks...");
      const response = await apiFetch("/api/sop/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_dir: activeFolder }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.playbooks)) {
          setPlaybooks(data.playbooks);
          if (data.playbooks.length > 0) {
            setExpandedId(data.playbooks[0].id);
          }
          toast.success(`Generated ${data.playbooks.length} playbook(s) from your workspace files.`);
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
    setEditingId(null);
    setNewTitle("");
    setNewCategory("Operations");
    setNewDesc("");
    setNewSteps([
      {
        title: "Read & Recap Source Data",
        description: "Update target spreadsheet or document in workspace.",
        target_file: "recap_summary.xlsx",
      },
    ]);
    setShowCreateForm(true);
  };

  const handleStartEditPlaybook = (pb: SopPlaybookDef) => {
    setEditingId(pb.id);
    setNewTitle(pb.title);
    setNewCategory(pb.category || "Operations");
    setNewDesc(pb.description || "");
    setNewSteps(
      pb.steps && pb.steps.length > 0
        ? pb.steps.map((s) => ({
            title: s.title,
            description: s.description || "",
            target_file: s.target_file,
          }))
        : [
            {
              title: "Read & Recap Source Data",
              description: "Update target spreadsheet or document in workspace.",
              target_file: "recap_summary.xlsx",
            },
          ]
    );
    setShowCreateForm(true);
  };

  const handleSaveManualPlaybook = async () => {
    if (!activeFolder) {
      toast.error("Please open a project folder first.");
      return;
    }
    if (!newTitle.trim()) {
      toast.error("Please enter a Playbook title.");
      return;
    }
    try {
      const response = await apiFetch("/api/sop/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_dir: activeFolder,
          id: editingId || undefined,
          title: newTitle.trim(),
          category: newCategory.trim() || "Operations",
          description:
            newDesc.trim() || "Custom workflow configured for this workspace.",
          steps: newSteps.filter((s) => s.title.trim() && s.target_file.trim()),
        }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.playbooks)) {
          setPlaybooks(data.playbooks);
          if (data.playbook?.id) {
            setExpandedId(data.playbook.id);
          }
          const wasEditing = Boolean(editingId);
          setShowCreateForm(false);
          setEditingId(null);
          setNewTitle("");
          setNewDesc("");
          toast.success(
            wasEditing
              ? "Playbook changes saved to workspace."
              : "Custom SOP Playbook saved to workspace."
          );
        }
      } else {
        toast.error("Failed to save playbook.");
      }
    } catch (err: any) {
      toast.error(`Save error: ${err?.message || "Unknown error"}`);
    }
  };

  const handleDeletePlaybook = async (id: string, title: string) => {
    if (!activeFolder) return;
    try {
      const response = await apiFetch("/api/sop/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_dir: activeFolder, playbook_id: id, id }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.playbooks)) {
          setPlaybooks(data.playbooks);
          if (editingId === id) {
            setShowCreateForm(false);
            setEditingId(null);
          }
          toast.success(`Removed playbook: ${title}`);
        }
      }
    } catch {
      toast.error("Failed to delete playbook.");
    }
  };

  const handleRunPlaybook = async (playbook: SopPlaybookDef) => {
    if (!activeFolder) {
      toast.error("Please open a project folder first before running an SOP.");
      return;
    }

    try {
      setExecutingId(playbook.id);
      toast.info(`Executing SOP: ${playbook.title}...`);

      const payload = {
        playbook_id: playbook.id,
        workspace_dir: activeFolder,
        session_id: "sop_manual_exec",
        params: {
          cashier_name: "CANDANA",
          notes: "Executed via Admin Playbooks Panel",
        },
      };

      const response = await apiFetch("/api/sop/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const res = await response.json();
        if (res && res.status === "success") {
          toast.success(`SOP Completed: ${playbook.title}`);
          refetchFiles?.();

          if (playbook.steps && playbook.steps.length > 0 && onOpenFileTab) {
            const mainTarget = playbook.steps[playbook.steps.length - 1].target_file;
            setTimeout(() => {
              onOpenFileTab(mainTarget);
            }, 250);
          }
        } else {
          toast.error(res?.message || "Failed to execute SOP playbook");
        }
      } else {
        toast.error(`SOP failed with status ${response.status}`);
      }
    } catch (err: any) {
      toast.error(`Execution error: ${err?.message || "Unknown error"}`);
    } finally {
      setExecutingId(null);
    }
  };

  const handleRunReconciliation = async () => {
    if (!activeFolder) {
      toast.error("Please open a project folder first before running a 3-Way Audit.");
      return;
    }

    try {
      setAuditing(true);
      toast.info("Running 3-Way Reconciliation & Anomaly Guard...");

      const payload = {
        mode: auditMode,
        workspace_dir: activeFolder,
        session_id: "reconcile_manual_exec",
        period: "October 28, 2026",
      };

      const response = await apiFetch("/api/reconcile/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const res: ReconcileAuditResult = await response.json();
        if (res && res.status === "success") {
          setAuditResult(res);
          refetchFiles?.();
          if (res.audit_status === "BALANCED") {
            toast.success("3-Way Reconciliation Passed: Zero variance detected.");
          } else {
            toast.warning(
              `Discrepancy Detected: ${res.anomalies_count} anomaly finding(s) flagged.`
            );
          }
          if (onOpenFileTab) {
            setTimeout(() => {
              onOpenFileTab("reconciliation_discrepancy_memo.docx");
            }, 300);
          }
        } else {
          toast.error("Failed to complete reconciliation audit.");
        }
      } else {
        toast.error(`Audit failed with status ${response.status}`);
      }
    } catch (err: any) {
      toast.error(`Audit error: ${err?.message || "Unknown error"}`);
    } finally {
      setAuditing(false);
    }
  };

  const handleSynthesizeExecutive = async () => {
    if (!activeFolder) {
      toast.error("Please open a project folder first before synthesizing an Executive Brief.");
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
          session_id: "executive_manual_exec",
          period: execPeriod,
          prepared_by: "Arunaki Administration Manager",
        }),
      });

      if (response.ok) {
        const res = await response.json();
        if (res && res.status === "success" && res.kpi) {
          setExecKpi(res.kpi);
          refetchFiles?.();
          toast.success(
            "Executive Summary & Presentation Deck generated and opened in Center Panel."
          );
          if (onOpenFileTab) {
            setTimeout(() => {
              onOpenFileTab("executive_summary_memo.docx");
              onOpenFileTab("executive_presentation_deck.pptx");
            }, 250);
          }
        } else {
          toast.error("Failed to synthesize executive summary.");
        }
      } else {
        toast.error(`Synthesis failed with status ${response.status}`);
      }
    } catch (err: any) {
      toast.error(`Synthesis error: ${err?.message || "Unknown error"}`);
    } finally {
      setSynthesizing(false);
    }
  };

  const handleDispatchTelegram = async (
    kind: "report" | "alert",
    title: string,
    filePath?: string,
    details?: string
  ) => {
    if (!activeFolder) {
      toast.error("Please open a project folder first.");
      return;
    }
    try {
      setDispatchingTg(true);
      const response = await apiFetch("/api/telegram/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          workspace_dir: activeFolder,
          title,
          file_path: filePath,
          details,
          severity: kind === "alert" ? "HIGH" : "INFO",
        }),
      });
      if (response.ok) {
        const res = await response.json();
        if (res?.delivered_live) {
          toast.success(`Delivered to Telegram Bot (${res.dispatch_id})`);
        } else {
          toast.success(`Logged in Telegram Dispatch Queue (${res?.dispatch_id || "OK"})`);
        }
      } else {
        toast.error("Failed to dispatch Telegram notification.");
      }
    } catch (err: any) {
      toast.error(`Telegram dispatch error: ${err?.message || "Unknown error"}`);
    } finally {
      setDispatchingTg(false);
    }
  };

  return (
    <div
      style={{ width }}
      className="h-full bg-[var(--bg-panel)] border-r border-[var(--border-color)] flex flex-col shrink-0 select-none overflow-hidden"
    >
      {/* Header */}
      <div className="h-9 px-3 border-b border-[var(--border-color)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded bg-[#cf6613] flex items-center justify-center shrink-0">
            <ClipboardCheck className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-xs font-semibold tracking-wide text-white truncate">
            {t("sopPlaybooks", "Admin Playbooks")}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setShowGuide((v) => !v)}
            className={cn(
              "w-5 h-5 rounded flex items-center justify-center transition-colors cursor-pointer",
              showGuide
                ? "bg-[#cf6613] text-white"
                : "text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]"
            )}
            title="Playbook Guide"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("playbooks");
              if (showCreateForm && !editingId) {
                setShowCreateForm(false);
              } else {
                handleStartNewPlaybook();
              }
            }}
            className={cn(
              "w-5 h-5 rounded flex items-center justify-center transition-colors cursor-pointer",
              showCreateForm && !editingId
                ? "bg-[#cf6613] text-white"
                : "text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]"
            )}
            title="Add Custom Playbook"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={fetchPlaybooks}
            disabled={loading}
            className="w-5 h-5 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            title="Refresh"
          >
            <RotateCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-5 h-5 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              title="Close Panel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Mode Switcher Tabs: Playbooks | 3-Way Audit | Exec Brief */}
      <div className="grid grid-cols-3 p-1.5 gap-1 border-b border-[var(--border-color)] bg-[var(--bg-app)] shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab("playbooks")}
          className={cn(
            "py-1 px-1.5 rounded text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer truncate",
            activeTab === "playbooks"
              ? "bg-[var(--bg-hover)] text-white border border-[var(--border-strong)]"
              : "text-[var(--text-muted)] hover:text-white"
          )}
        >
          <ClipboardCheck className="w-3 h-3 shrink-0" />
          <span className="truncate">Playbooks</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("reconcile")}
          className={cn(
            "py-1 px-1.5 rounded text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer truncate",
            activeTab === "reconcile"
              ? "bg-[var(--bg-hover)] text-white border border-[var(--border-strong)]"
              : "text-[var(--text-muted)] hover:text-white"
          )}
        >
          <Scale className="w-3 h-3 shrink-0" />
          <span className="truncate">3-Way Audit</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("executive")}
          className={cn(
            "py-1 px-1.5 rounded text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer truncate",
            activeTab === "executive"
              ? "bg-[var(--bg-hover)] text-white border border-[var(--border-strong)]"
              : "text-[var(--text-muted)] hover:text-white"
          )}
        >
          <Presentation className="w-3 h-3 shrink-0" />
          <span className="truncate">Exec Brief</span>
        </button>
      </div>

      {activeTab === "playbooks" && (
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
          {/* Quick Action Buttons: Generate from Folder & Add Playbook */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={!activeFolder || generating}
              onClick={handleGenerateFromFolder}
              className={cn(
                "py-1.5 px-2 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                !activeFolder
                  ? "bg-[var(--bg-hover)] text-[var(--text-muted)] cursor-not-allowed"
                  : "bg-[#cf6613] hover:bg-[#b8580f] text-white"
              )}
              title="Scan files in active folder and build tailored SOP Playbooks"
            >
              {generating ? (
                <RotateCw className="w-3 h-3 animate-spin shrink-0" />
              ) : (
                <Sparkles className="w-3 h-3 shrink-0" />
              )}
              <span className="truncate">Auto-Generate</span>
            </button>
            <button
              type="button"
              disabled={!activeFolder}
              onClick={() => {
                if (showCreateForm && !editingId) {
                  setShowCreateForm(false);
                } else {
                  handleStartNewPlaybook();
                }
              }}
              className={cn(
                "py-1.5 px-2 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1 transition-all border cursor-pointer",
                !activeFolder
                  ? "bg-[var(--bg-hover)] text-[var(--text-muted)] border-[var(--border-color)] cursor-not-allowed"
                  : "bg-[var(--bg-app)] hover:bg-[var(--bg-hover)] text-white border-[var(--border-strong)]"
              )}
            >
              <Plus className="w-3 h-3 shrink-0" />
              <span className="truncate">New Playbook</span>
            </button>
          </div>

          {!activeFolder && (
            <div className="p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-app)] text-xs text-[var(--text-muted)] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-[#cf6613] shrink-0 mt-0.5" />
              <span>Open a project folder first to generate or create SOP Playbooks for your files.</span>
            </div>
          )}

          {/* Collapsible Guide / Empty State Onboarding */}
          {(showGuide || (activeFolder && playbooks.length === 0 && !showCreateForm)) && (
            <div className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-app)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-[#cf6613]" />
                  <span>How Admin Playbooks Work</span>
                </span>
                {showGuide && (
                  <button
                    type="button"
                    onClick={() => setShowGuide(false)}
                    className="text-[var(--text-muted)] hover:text-white cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                Playbooks automate multi-step document routines specific to your folder (no generic preset files).
              </p>
              <div className="space-y-1.5 text-[11px] text-[var(--text-secondary)]">
                <div className="p-2 rounded bg-[var(--bg-panel)] border border-[var(--border-color)]">
                  <strong className="text-white">1. Auto-Generate:</strong> Reads the actual content, table headers, and topics inside your documents (<code className="text-[#cf6613]">.xlsx</code>, <code className="text-[#cf6613]">.docx</code>, <code className="text-[#cf6613]">.pdf</code>, <code className="text-[#cf6613]">.csv</code>, <code className="text-[#cf6613]">.txt</code>) to build tailored SOP workflows.
                </div>
                <div className="p-2 rounded bg-[var(--bg-panel)] border border-[var(--border-color)]">
                  <strong className="text-white">2. Edit or Add Playbook:</strong> Click the <strong className="text-white">Edit (Pencil)</strong> icon on any generated playbook to customize its title, steps, or target files, or click <strong className="text-white">New Playbook</strong> to build one from scratch.
                </div>
                <div className="p-2 rounded bg-[var(--bg-panel)] border border-[var(--border-color)]">
                  <strong className="text-white">3. Run Playbook:</strong> Executes the steps in sequence and opens the resulting document in the Center Panel.
                </div>
              </div>
            </div>
          )}

          {/* Manual / Edit Playbook Form */}
          {showCreateForm && (
            <div className="p-2.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-app)] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">
                  {editingId ? "Edit Playbook" : "Create Custom Playbook"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setEditingId(null);
                  }}
                  className="text-[var(--text-muted)] hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-[var(--text-dim)] font-medium">Playbook Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Daily Report to Excel Recap"
                  className="w-full h-7 px-2 rounded bg-[var(--bg-panel)] border border-[var(--border-color)] text-xs text-white focus:outline-none focus:border-[var(--border-strong)]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-[var(--text-dim)] font-medium">Category</label>
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="e.g. Operations, Finance, HR"
                  className="w-full h-7 px-2 rounded bg-[var(--bg-panel)] border border-[var(--border-color)] text-xs text-white focus:outline-none focus:border-[var(--border-strong)]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-[var(--text-dim)] font-medium">Description</label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Short summary of what this SOP does"
                  className="w-full h-7 px-2 rounded bg-[var(--bg-panel)] border border-[var(--border-color)] text-xs text-white focus:outline-none focus:border-[var(--border-strong)]"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-[var(--text-dim)] font-medium">
                    Workflow Steps ({newSteps.length})
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setNewSteps((prev) => [
                        ...prev,
                        {
                          title: `Step ${prev.length + 1}`,
                          description: "Process target file",
                          target_file: "summary_report.docx",
                        },
                      ])
                    }
                    className="text-[10px] text-[#cf6613] hover:underline font-medium cursor-pointer"
                  >
                    + Add Step
                  </button>
                </div>

                {newSteps.map((st, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded bg-[var(--bg-panel)] border border-[var(--border-color)] space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-white">Step {idx + 1}</span>
                      {newSteps.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setNewSteps((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-[var(--text-muted)] hover:text-rose-500 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={st.title}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewSteps((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, title: val } : item))
                        );
                      }}
                      placeholder="Step title (e.g. Update Recap Table)"
                      className="w-full h-6 px-2 rounded bg-[var(--bg-app)] border border-[var(--border-color)] text-[11px] text-white focus:outline-none"
                    />
                    <input
                      type="text"
                      value={st.description}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewSteps((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, description: val } : item
                          )
                        );
                      }}
                      placeholder="Step instruction / description"
                      className="w-full h-6 px-2 rounded bg-[var(--bg-app)] border border-[var(--border-color)] text-[11px] text-[var(--text-secondary)] focus:outline-none"
                    />
                    <input
                      type="text"
                      value={st.target_file}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewSteps((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, target_file: val } : item
                          )
                        );
                      }}
                      placeholder="Target file (e.g. REKAP-2026.xlsx)"
                      className="w-full h-6 px-2 rounded bg-[var(--bg-app)] border border-[var(--border-color)] text-[11px] font-mono text-[#cf6613] focus:outline-none"
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={handleSaveManualPlaybook}
                  className="flex-1 py-1.5 px-3 rounded bg-[#cf6613] hover:bg-[#b8580f] text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  {editingId ? "Save Changes" : "Save Playbook"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setEditingId(null);
                  }}
                  className="py-1.5 px-3 rounded bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-white text-xs font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Playbook Cards List */}
          {playbooks.map((pb) => {
            const isExpanded = expandedId === pb.id;
            const isRunning = executingId === pb.id;

            return (
              <div
                key={pb.id}
                className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-app)] overflow-hidden transition-all duration-150"
              >
                <div
                  onClick={() => setExpandedId(isExpanded ? null : pb.id)}
                  className="p-2.5 flex items-start justify-between gap-2 cursor-pointer hover:bg-[var(--bg-hover)]/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-white border border-[var(--border-strong)]">
                        {pb.category}
                      </span>
                      <span className="text-[10px] text-[var(--text-dim)] flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {pb.estimated_minutes}m
                      </span>
                    </div>
                    <h4 className="text-xs font-semibold text-[var(--text-primary)] leading-snug">
                      {pb.title}
                    </h4>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 text-[var(--text-muted)]">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEditPlaybook(pb);
                      }}
                      className={cn(
                        "w-5 h-5 rounded flex items-center justify-center transition-colors cursor-pointer",
                        editingId === pb.id
                          ? "bg-[#cf6613] text-white"
                          : "text-[var(--text-dim)] hover:text-white hover:bg-[var(--bg-hover)]"
                      )}
                      title="Edit Playbook"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePlaybook(pb.id, pb.title);
                      }}
                      className="w-5 h-5 rounded flex items-center justify-center text-[var(--text-dim)] hover:text-rose-500 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                      title="Delete Playbook"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-2.5 pb-2.5 pt-1 border-t border-[var(--border-color)]/60 space-y-2.5">
                    <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                      {pb.description}
                    </p>

                    {/* Steps Chain */}
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold text-[var(--text-secondary)]">
                        Execution Pipeline ({pb.steps.length} Steps)
                      </div>
                      {pb.steps.map((st) => (
                        <div
                          key={st.step_index}
                          className="p-2 rounded bg-[var(--bg-panel)] border border-[var(--border-color)] flex items-start gap-2"
                        >
                          <div className="w-4 h-4 rounded-full bg-[var(--bg-hover)] border border-[var(--border-strong)] text-[10px] font-bold text-white flex items-center justify-center shrink-0 mt-0.5">
                            {st.step_index}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-medium text-[var(--text-primary)] truncate">
                              {st.title}
                            </div>
                            <div className="text-[10px] text-[var(--text-muted)] leading-snug mt-0.5">
                              {st.description}
                            </div>
                            <div className="mt-1 flex items-center gap-1 text-[10px] text-[#cf6613] font-mono truncate">
                              {st.app === "gridcraft" ? (
                                <FileSpreadsheet className="w-3 h-3 shrink-0" />
                              ) : (
                                <FileText className="w-3 h-3 shrink-0" />
                              )}
                              <span className="truncate">{st.target_file}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Execute Button */}
                    <button
                      type="button"
                      disabled={isRunning || !activeFolder}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRunPlaybook(pb);
                      }}
                      className={cn(
                        "w-full py-1.5 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer",
                        isRunning
                          ? "bg-[#cf6613]/80 text-white cursor-wait"
                          : !activeFolder
                          ? "bg-[var(--bg-hover)] text-[var(--text-muted)] cursor-not-allowed"
                          : "bg-[#cf6613] hover:bg-[#b8580f] text-white active:scale-[0.98]"
                      )}
                    >
                      {isRunning ? (
                        <>
                          <RotateCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Executing SOP...</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Run SOP Playbook</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeTab === "reconcile" && (
        <div className="flex-1 overflow-y-auto p-2.5 space-y-3">
          {!activeFolder && (
            <div className="p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-app)] text-xs text-[var(--text-muted)] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-[#cf6613] shrink-0 mt-0.5" />
              <span>Open an active workspace folder to run 3-Way Reconciliation.</span>
            </div>
          )}

          {/* Mode Selector */}
          <div className="p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-app)] space-y-2.5">
            <div className="text-[11px] font-semibold text-[var(--text-secondary)]">
              Reconciliation Audit Mode
            </div>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setAuditMode("cash_and_bank")}
                className={cn(
                  "w-full p-2 rounded border text-left transition-colors cursor-pointer",
                  auditMode === "cash_and_bank"
                    ? "bg-[var(--bg-hover)] border-[var(--border-strong)] text-white"
                    : "bg-[var(--bg-panel)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-white"
                )}
              >
                <div className="text-xs font-semibold">Cash & Bank 3-Way Match</div>
                <div className="text-[10px] text-[var(--text-dim)] mt-0.5">
                  Excel Cashbook ↔ POS Shift Register ↔ Bank Statement
                </div>
              </button>
              <button
                type="button"
                onClick={() => setAuditMode("procurement_three_way")}
                className={cn(
                  "w-full p-2 rounded border text-left transition-colors cursor-pointer",
                  auditMode === "procurement_three_way"
                    ? "bg-[var(--bg-hover)] border-[var(--border-strong)] text-white"
                    : "bg-[var(--bg-panel)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-white"
                )}
              >
                <div className="text-xs font-semibold">Procurement 3-Way Match</div>
                <div className="text-[10px] text-[var(--text-dim)] mt-0.5">
                  Purchase Order ↔ Goods Receipt ↔ Supplier Invoice
                </div>
              </button>
            </div>

            <button
              type="button"
              disabled={auditing || !activeFolder}
              onClick={handleRunReconciliation}
              className={cn(
                "w-full py-1.5 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer",
                auditing
                  ? "bg-[#cf6613]/80 text-white cursor-wait"
                  : !activeFolder
                  ? "bg-[var(--bg-hover)] text-[var(--text-muted)] cursor-not-allowed"
                  : "bg-[#cf6613] hover:bg-[#b8580f] text-white active:scale-[0.98]"
              )}
            >
              {auditing ? (
                <>
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Auditing Records...</span>
                </>
              ) : (
                <>
                  <Scale className="w-3.5 h-3.5" />
                  <span>Run 3-Way Reconciliation</span>
                </>
              )}
            </button>
          </div>

          {/* Manager Audit Alert Card */}
          {auditResult && (
            <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-app)] overflow-hidden space-y-2.5 p-2.5">
              {/* Status Banner */}
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border-color)]">
                <div className="flex items-center gap-1.5">
                  {auditResult.audit_status === "BALANCED" ? (
                    <ShieldCheck className="w-4 h-4 text-white shrink-0" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
                  )}
                  <span className="text-xs font-bold text-white">
                    {auditResult.audit_status === "BALANCED"
                      ? "Audit Balanced"
                      : "Discrepancy Detected"}
                  </span>
                </div>
                <span
                  className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded",
                    auditResult.audit_status === "BALANCED"
                      ? "bg-[var(--bg-hover)] text-white border border-[var(--border-strong)]"
                      : "bg-rose-600 text-white"
                  )}
                >
                  {auditResult.anomalies_count} Alert(s)
                </span>
              </div>

              {/* Totals Summary */}
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div className="p-1.5 rounded bg-[var(--bg-panel)] border border-[var(--border-color)]">
                  <div className="text-[10px] text-[var(--text-dim)] truncate">
                    {auditResult.labels.source_a}
                  </div>
                  <div className="font-mono font-semibold text-white">
                    ${auditResult.totals.source_a.toFixed(2)}
                  </div>
                </div>
                <div className="p-1.5 rounded bg-[var(--bg-panel)] border border-[var(--border-color)]">
                  <div className="text-[10px] text-[var(--text-dim)] truncate">
                    {auditResult.labels.source_c}
                  </div>
                  <div className="font-mono font-semibold text-white">
                    ${auditResult.totals.source_c.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="p-2 rounded bg-[var(--bg-panel)] border border-[var(--border-color)] flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">Total Absolute Variance:</span>
                <span
                  className={cn(
                    "font-mono font-bold",
                    auditResult.totals.absolute_variance > 0.01 ? "text-rose-500" : "text-white"
                  )}
                >
                  ${auditResult.totals.absolute_variance.toFixed(2)}
                </span>
              </div>

              {/* Detected Anomalies Breakdown */}
              {auditResult.anomalies.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-[var(--text-secondary)]">
                    Manager Anomaly Findings
                  </div>
                  {auditResult.anomalies.map((anom, idx) => (
                    <div
                      key={`${anom.code}-${idx}`}
                      className="p-2 rounded bg-[var(--bg-panel)] border border-[var(--border-color)] space-y-1 text-[11px]"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-white flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />
                          <span>{anom.title}</span>
                        </span>
                        <span
                          className={cn(
                            "text-[9px] font-bold px-1 py-0.2 rounded shrink-0",
                            anom.severity === "HIGH"
                              ? "bg-rose-600 text-white"
                              : "bg-[#cf6613] text-white"
                          )}
                        >
                          {anom.severity}
                        </span>
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)] leading-snug">
                        {anom.description}
                      </p>
                      <div className="text-[10px] text-white pt-1 border-t border-[var(--border-color)]">
                        <span className="font-semibold text-[#cf6613]">Recommendation: </span>
                        {anom.recommendation}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Deliverable Quick Links */}
              <div className="pt-1 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onOpenFileTab?.("reconciliation_audit_report.xlsx")}
                  className="flex-1 py-1 px-2 rounded bg-[var(--bg-hover)] hover:bg-[var(--border-strong)] text-white text-[10px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-3 h-3" />
                  <span>Audit Sheet</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenFileTab?.("reconciliation_discrepancy_memo.docx")}
                  className="flex-1 py-1 px-2 rounded bg-[var(--bg-hover)] hover:bg-[var(--border-strong)] text-white text-[10px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <FileText className="w-3 h-3" />
                  <span>Audit Memo</span>
                </button>
                <button
                  type="button"
                  disabled={dispatchingTg}
                  onClick={() =>
                    handleDispatchTelegram(
                      "alert",
                      `3-Way Audit: ${auditResult.audit_status}`,
                      "reconciliation_discrepancy_memo.docx",
                      `Total Absolute Variance: $${auditResult.totals.absolute_variance.toFixed(2)} (${auditResult.anomalies_count} anomaly findings)`
                    )
                  }
                  className="py-1 px-2 rounded bg-[#cf6613] hover:bg-[#b8580f] text-white text-[10px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  title="Send Discrepancy Alert to Telegram Bot"
                >
                  <Send className="w-3 h-3" />
                  <span>Telegram</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "executive" && (
        <div className="flex-1 overflow-y-auto p-2.5 space-y-3">
          {!activeFolder && (
            <div className="p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-app)] text-xs text-[var(--text-muted)] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-[#cf6613] shrink-0 mt-0.5" />
              <span>Open an active workspace folder to synthesize executive deliverables.</span>
            </div>
          )}

          <div className="p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-app)] space-y-2.5">
            <div className="text-[11px] font-semibold text-[var(--text-secondary)]">
              Multi-Format Executive Synthesis
            </div>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              Transforms workspace ledgers into a 1-page A4 Executive Memorandum in{" "}
              <strong className="text-white">WordCraft</strong> and a 16:9 Presentation Slide Deck in{" "}
              <strong className="text-white">DeckCraft</strong>.
            </p>

            <div className="space-y-1">
              <label className="text-[10px] text-[var(--text-dim)] font-medium">
                Reporting Period
              </label>
              <input
                type="text"
                value={execPeriod}
                onChange={(e) => setExecPeriod(e.target.value)}
                className="w-full h-7 px-2 rounded bg-[var(--bg-panel)] border border-[var(--border-color)] text-xs text-white focus:outline-none focus:border-[var(--border-strong)]"
                placeholder="October 2026"
              />
            </div>

            <button
              type="button"
              disabled={synthesizing || !activeFolder}
              onClick={handleSynthesizeExecutive}
              className={cn(
                "w-full py-1.5 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer",
                synthesizing
                  ? "bg-[#cf6613]/80 text-white cursor-wait"
                  : !activeFolder
                  ? "bg-[var(--bg-hover)] text-[var(--text-muted)] cursor-not-allowed"
                  : "bg-[#cf6613] hover:bg-[#b8580f] text-white active:scale-[0.98]"
              )}
            >
              {synthesizing ? (
                <>
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing Brief & Slides...</span>
                </>
              ) : (
                <>
                  <Presentation className="w-3.5 h-3.5" />
                  <span>Synthesize Memo & Slide Deck</span>
                </>
              )}
            </button>
          </div>

          {execKpi && (
            <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-app)] p-2.5 space-y-2.5">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border-color)]">
                <span className="text-xs font-bold text-white">{execKpi.period}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-white border border-[var(--border-strong)]">
                  Margin: {execKpi.operating_margin_pct.toFixed(1)}%
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div className="p-1.5 rounded bg-[var(--bg-panel)] border border-[var(--border-color)]">
                  <div className="text-[10px] text-[var(--text-dim)]">Gross Revenue</div>
                  <div className="font-mono font-semibold text-white">
                    {execKpi.gross_revenue.toLocaleString()}
                  </div>
                </div>
                <div className="p-1.5 rounded bg-[var(--bg-panel)] border border-[var(--border-color)]">
                  <div className="text-[10px] text-[var(--text-dim)]">Net Operating Income</div>
                  <div className="font-mono font-semibold text-white">
                    {execKpi.net_operating_income.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-[var(--text-secondary)]">
                  Strategic Recommendations
                </div>
                {execKpi.recommendations.map((rec, i) => (
                  <div
                    key={i}
                    className="p-1.5 rounded bg-[var(--bg-panel)] border border-[var(--border-color)] text-[10px] text-[var(--text-secondary)] leading-snug"
                  >
                    {i + 1}. {rec}
                  </div>
                ))}
              </div>

              <div className="pt-1 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onOpenFileTab?.("executive_summary_memo.docx")}
                  className="flex-1 py-1 px-2 rounded bg-[var(--bg-hover)] hover:bg-[var(--border-strong)] text-white text-[10px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <FileText className="w-3 h-3" />
                  <span>A4 Memo</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenFileTab?.("executive_presentation_deck.pptx")}
                  className="flex-1 py-1 px-2 rounded bg-[var(--bg-hover)] hover:bg-[var(--border-strong)] text-white text-[10px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <Presentation className="w-3 h-3" />
                  <span>Slide Deck</span>
                </button>
                <button
                  type="button"
                  disabled={dispatchingTg}
                  onClick={() =>
                    handleDispatchTelegram(
                      "report",
                      `Executive Summary — ${execKpi.period}`,
                      "executive_summary_memo.docx"
                    )
                  }
                  className="py-1 px-2 rounded bg-[#cf6613] hover:bg-[#b8580f] text-white text-[10px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  title="Dispatch Executive Summary to Telegram Bot"
                >
                  <Send className="w-3 h-3" />
                  <span>Telegram</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer Info */}
      <div className="p-2 border-t border-[var(--border-color)] bg-[var(--bg-app)] shrink-0 flex items-center justify-between text-[10px] text-[var(--text-dim)]">
        <span className="flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-white" />
          <span>SOP, Audit & Executive Engine</span>
        </span>
        <span>v1.4</span>
      </div>
    </div>
  );
});
