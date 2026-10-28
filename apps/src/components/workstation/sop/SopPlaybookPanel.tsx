import { memo, useState, useEffect, useCallback } from "react";
import {
  ClipboardCheck,
  Play,
  RotateCw,
  Clock,
  FileSpreadsheet,
  FileText,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
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
        target_file: "laporan_shift_kasir.txt",
        app: "wordcraft",
      },
      {
        step_index: 2,
        title: "Update Daily Cash Ledger (GridCraft)",
        description: "Record cash, QRIS, debit, expense deductions, and drawer balance.",
        target_file: "rekap_kas_harian.xlsx",
        app: "gridcraft",
      },
      {
        step_index: 3,
        title: "Generate Official Closing Memo (WordCraft)",
        description: "Produce formal A4 memorandum for cashier and manager sign-off.",
        target_file: "memo_tutup_kas.docx",
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
        target_file: "daftar_faktur_masuk.txt",
        app: "pdfcraft",
      },
      {
        step_index: 2,
        title: "Record Accounts Payable Ledger (GridCraft)",
        description: "Record invoice numbers, vendors, due dates, and payable amounts.",
        target_file: "buku_hutang_supplier.xlsx",
        app: "gridcraft",
      },
      {
        step_index: 3,
        title: "Draft Payment Approval Voucher (WordCraft)",
        description: "Create official manager disbursement voucher ready for management approval.",
        target_file: "voucher_pembayaran_supplier.docx",
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
        target_file: "arsip_indeks_dokumen.xlsx",
        app: "gridcraft",
      },
      {
        step_index: 2,
        title: "Compile Executive Monthly Summary",
        description: "Synthesize operational indicators into formal archive summary report.",
        target_file: "laporan_arsip_bulanan.docx",
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
  const [playbooks, setPlaybooks] = useState<SopPlaybookDef[]>(DEFAULT_PLAYBOOKS);
  const [loading, setLoading] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>("daily_cash_closing");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

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

          // Open the primary resulting file if available
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
            {t("sopPlaybooks", "SOP Playbooks")}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--bg-hover)] text-[var(--text-muted)] border border-[var(--border-strong)]">
            Manager
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={fetchPlaybooks}
            disabled={loading}
            className="w-5 h-5 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            title="Refresh Playbooks"
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

      {/* Content List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {!activeFolder && (
          <div className="p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-app)]/50 text-xs text-[var(--text-muted)] flex items-start gap-2">
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
              {/* Card Header */}
              <div
                onClick={() => setExpandedId(isExpanded ? null : pb.id)}
                className="p-2.5 flex items-start justify-between gap-2 cursor-pointer hover:bg-[var(--bg-hover)]/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-[var(--bg-hover)] text-[var(--text-muted)] border border-[var(--border-color)]">
                      {pb.category}
                    </span>
                    <span className="text-[10px] text-[var(--text-dim)] flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      ~{pb.estimated_minutes}m
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-[var(--text-primary)] leading-snug">
                    {pb.title}
                  </h4>
                </div>
                <div className="text-[var(--text-muted)] shrink-0 pt-0.5">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="px-2.5 pb-2.5 pt-1 border-t border-[var(--border-color)] space-y-2.5 bg-[var(--bg-panel)]">
                  <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                    {pb.description}
                  </p>

                  {/* Steps Checklist */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-semibold text-[var(--text-dim)] uppercase tracking-wider">
                      Automated Steps ({pb.steps.length})
                    </div>
                    {pb.steps.map((st) => (
                      <div
                        key={st.step_index}
                        className="p-1.5 rounded bg-[var(--bg-app)] border border-[var(--border-color)] text-[11px] flex items-start gap-2"
                      >
                        <span className="w-4 h-4 rounded-full bg-[var(--bg-hover)] text-[var(--text-muted)] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                          {st.step_index}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-[var(--text-primary)]">{st.title}</div>
                          <div className="text-[10px] text-[var(--text-muted)] leading-snug">
                            {st.description}
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 text-[10px] font-mono text-[var(--text-dim)]">
                            {st.app === "gridcraft" ? (
                              <FileSpreadsheet className="w-3 h-3 text-[#107c41]" />
                            ) : (
                              <FileText className="w-3 h-3 text-[#2b579a]" />
                            )}
                            <span className="truncate">{st.target_file}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Action Button */}
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
                        <span>Run Playbook</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="p-2 border-t border-[var(--border-color)] bg-[var(--bg-app)] shrink-0 flex items-center justify-between text-[10px] text-[var(--text-dim)]">
        <span className="flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-white" />
          <span>SOP Compliance v1.0</span>
        </span>
        <span>Auto-Audit Enabled</span>
      </div>
    </div>
  );
});
