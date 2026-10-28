import { memo, useState, useEffect, useCallback } from "react";
import {
  ClipboardCheck,
  Play,
  RotateCw,
  Clock,
  FileSpreadsheet,
  FileText,
  Presentation,
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

const DEFAULT_PLAYBOOKS: SopPlaybookDef[] = [
  {
    id: "daily_cash_closing",
    title: "Daily Register Closing & Cash Reconciliation",
    category: "Finance & POS",
    description:
      "Reconcile cashier register sales, QRIS/card receipts, update daily cash ledger in GridCraft, and generate an official sign-off memo in WordCraft.",
    estimated_minutes: 2,
    steps: [
      {
        step_index: 1,
        title: "Cashier Shift Sales Synchronization",
        description: "Pull register transactions from ArunakiZen POS or local transaction log.",
        target_file: "cashier_shift_report.txt",
        app: "wordcraft",
      },
      {
        step_index: 2,
        title: "Update Daily Cash Ledger (GridCraft)",
        description: "Record cash, QRIS, debit, expense deductions, and drawer balance.",
        target_file: "daily_cash_recap.xlsx",
        app: "gridcraft",
      },
      {
        step_index: 3,
        title: "Generate Official Closing Memo (WordCraft)",
        description: "Produce formal A4 memorandum for cashier and manager sign-off.",
        target_file: "daily_cash_closing_memo.docx",
        app: "wordcraft",
      },
    ],
  },
  {
    id: "supplier_invoice_verification",
    title: "Supplier Invoice Verification & AP Ledger",
    category: "Procurement & AP",
    description:
      "Verify incoming supplier invoices in active folder, record payment due dates to Accounts Payable, and draft disbursement vouchers.",
    estimated_minutes: 3,
    steps: [
      {
        step_index: 1,
        title: "Scan & Extract Invoices",
        description: "Identify supplier invoice documents in active project folder.",
        target_file: "supplier_invoice_index.txt",
        app: "pdfcraft",
      },
      {
        step_index: 2,
        title: "Record Accounts Payable Ledger (GridCraft)",
        description: "Record invoice numbers, vendors, due dates, and payable amounts.",
        target_file: "accounts_payable_ledger.xlsx",
        app: "gridcraft",
      },
      {
        step_index: 3,
        title: "Draft Payment Approval Voucher (WordCraft)",
        description: "Create official manager disbursement voucher ready for management approval.",
        target_file: "payment_approval_voucher.docx",
        app: "wordcraft",
      },
    ],
  },
  {
    id: "monthly_administrative_archive",
    title: "Monthly Administration Archive & Governance",
    category: "Office Governance",
    description:
      "Audit project documents, verify file integrity, and build a consolidated document archive index.",
    estimated_minutes: 2,
    steps: [
      {
        step_index: 1,
        title: "Audit & Inventory Project Files",
        description: "Scan all office files and compile integrity checklist.",
        target_file: "document_archive_index.xlsx",
        app: "gridcraft",
      },
      {
        step_index: 2,
        title: "Compile Executive Monthly Summary",
        description: "Synthesize operational indicators into formal archive summary report.",
        target_file: "monthly_governance_report.docx",
        app: "wordcraft",
      },
    ],
  },
];

export const SopPlaybookPanel = memo(function SopPlaybookPanel({
  activeFolder,
  onOpenFileTab,
  refetchFiles,
  onClose,
  width = "var(--left-panel-width)",
}: SopPlaybookPanelProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<"playbooks" | "reconcile" | "executive">("playbooks");
  const [playbooks, setPlaybooks] = useState<SopPlaybookDef[]>(DEFAULT_PLAYBOOKS);
  const [loading, setLoading] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>("daily_cash_closing");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // 3-Way Reconciliation State
  const [auditMode, setAuditMode] = useState<"cash_and_bank" | "procurement_three_way">("cash_and_bank");
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<ReconcileAuditResult | null>(null);

  // Executive Synthesis State
  const [execPeriod, setExecPeriod] = useState("October 2026");
  const [synthesizing, setSynthesizing] = useState(false);
  const [execKpi, setExecKpi] = useState<ExecutiveKpiResult | null>(null);

  const fetchPlaybooks = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiFetch("/api/sop/playbooks");
      if (response.ok) {
        const data = await response.json();
        if (data && data.status === "success" && Array.isArray(data.playbooks) && data.playbooks.length > 0) {
          setPlaybooks(data.playbooks);
        }
      }
    } catch {
      // Fallback to default playbooks
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlaybooks();
  }, [fetchPlaybooks]);

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
          notes: "Executed via Administration Manager Playbook Drawer",
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
            }, 300);
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

  const filteredPlaybooks = playbooks.filter((p) => {
    if (categoryFilter === "all") return true;
    return p.category.toLowerCase().includes(categoryFilter.toLowerCase());
  });

  return (
    <div
      style={{ width }}
      className="h-full bg-[var(--bg-panel)] border-r border-[var(--border-color)] flex flex-col shrink-0 select-none overflow-hidden"
    >
      {/* Header */}
      <div className="h-9 px-3 border-b border-[var(--border-color)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardCheck className="w-4 h-4 text-[#cf6613] shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)] truncate">
            {t("sopPlaybooks", "Admin Manager")}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
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

      {/* Mode Switcher Tabs: SOP Playbooks | 3-Way Audit | Exec Brief */}
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
        <>
          {/* Category Filter Pills */}
          <div className="p-2 border-b border-[var(--border-color)] flex items-center gap-1 overflow-x-auto shrink-0 scrollbar-none">
            {["all", "Finance", "Procurement", "Governance"].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={cn(
                  "px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap",
                  categoryFilter === cat
                    ? "bg-[var(--bg-hover)] text-white border border-[var(--border-strong)]"
                    : "text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]/50"
                )}
              >
                {cat === "all" ? "All" : cat}
              </button>
            ))}
          </div>

          {/* Playbook List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {!activeFolder && (
              <div className="p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-app)] text-xs text-[var(--text-muted)] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-[#cf6613] shrink-0 mt-0.5" />
                <span>Open an active workspace folder to execute SOP deliverables directly to disk.</span>
              </div>
            )}

            {filteredPlaybooks.map((pb) => {
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
                    <div className="mt-1 text-[var(--text-muted)]">
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
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
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
        </>
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
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
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
                      ? "AUDIT BALANCED"
                      : "DISCREPANCY DETECTED"}
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
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
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
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
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
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
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
        <span>v1.3</span>
      </div>
    </div>
  );
});
