import { memo, useState, useEffect, useCallback } from "react";
import {
  ClipboardCheck,
  Play,
  RotateCw,
  Clock,
  Presentation,
  Plus,
  Trash2,
  Sparkles,
  HelpCircle,
  Scale,
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
  const [playbooks, setPlaybooks] = useState<SopPlaybookDef[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const openPlaybookInCenter = useCallback((pb: SopPlaybookDef) => {
    setSelectedId(pb.id);
    window.dispatchEvent(
      new CustomEvent("arunaki:open-app", {
        detail: {
          app: "playbook",
          title: pb.title,
          path: pb.id,
          content: JSON.stringify(pb),
        },
      })
    );
  }, []);

  const openNewPlaybookInCenter = useCallback(() => {
    setSelectedId("__new__");
    window.dispatchEvent(
      new CustomEvent("arunaki:open-app", {
        detail: {
          app: "playbook-new",
          title: "New Playbook",
          path: "new",
          content: "",
        },
      })
    );
  }, []);

  const openReconcileInCenter = useCallback(() => {
    setSelectedId("__reconcile__");
    window.dispatchEvent(
      new CustomEvent("arunaki:open-app", {
        detail: {
          app: "playbook-audit",
          title: "3-Way Reconciliation Audit",
          path: "reconcile",
          content: "",
        },
      })
    );
  }, []);

  const openExecutiveInCenter = useCallback(() => {
    setSelectedId("__executive__");
    window.dispatchEvent(
      new CustomEvent("arunaki:open-app", {
        detail: {
          app: "playbook-exec",
          title: "Executive Brief Synthesis",
          path: "executive",
          content: "",
        },
      })
    );
  }, []);

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
        }
      }
    } catch {
      // Keep current list on transient error
    } finally {
      setLoading(false);
    }
  }, [activeFolder]);

  useEffect(() => {
    fetchPlaybooks();
  }, [fetchPlaybooks]);

  // Listen for updates when a playbook is edited/created/deleted in Center Panel
  useEffect(() => {
    const handleUpdated = () => {
      fetchPlaybooks();
    };
    window.addEventListener("arunaki:playbooks-updated", handleUpdated);
    return () => {
      window.removeEventListener("arunaki:playbooks-updated", handleUpdated);
    };
  }, [fetchPlaybooks]);

  const handleGenerateFromFolder = async () => {
    if (!activeFolder) {
      toast.error("Please open a project folder first.");
      return;
    }
    try {
      setGenerating(true);
      toast.info("Scanning workspace documents to build SOP Playbooks...");
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
            openPlaybookInCenter(data.playbooks[0]);
          }
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
          toast.success(`Removed playbook: ${title}`);
        }
      }
    } catch {
      toast.error("Failed to delete playbook.");
    }
  };

  const handleQuickRunPlaybook = async (playbook: SopPlaybookDef) => {
    if (!activeFolder) {
      toast.error("Please open a project folder first.");
      return;
    }
    try {
      setExecutingId(playbook.id);
      toast.info(`Executing SOP: ${playbook.title}...`);

      const response = await apiFetch("/api/sop/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playbook_id: playbook.id,
          workspace_dir: activeFolder,
          session_id: "sop_sidebar_exec",
          params: {
            cashier_name: "ADMIN",
            notes: "Executed via Admin Playbooks List",
          },
        }),
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
      }
    } catch (err: any) {
      toast.error(`Execution error: ${err?.message || "Unknown error"}`);
    } finally {
      setExecutingId(null);
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
            title="How Playbooks Work"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={fetchPlaybooks}
            disabled={loading}
            className="w-5 h-5 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            title="Refresh List"
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

      {/* Action Buttons: Auto-Generate & + New Playbook */}
      <div className="p-2 border-b border-[var(--border-color)] grid grid-cols-2 gap-1.5 shrink-0">
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
          title="Scan documents in active folder and generate SOP Playbooks"
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
          onClick={openNewPlaybookInCenter}
          className={cn(
            "py-1.5 px-2 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1 transition-all border cursor-pointer",
            !activeFolder
              ? "bg-[var(--bg-hover)] text-[var(--text-muted)] border-[var(--border-color)] cursor-not-allowed"
              : "bg-[var(--bg-app)] hover:bg-[var(--bg-hover)] text-white border-[var(--border-strong)]"
          )}
          title="Create a new custom Playbook in Center Panel"
        >
          <Plus className="w-3 h-3 shrink-0" />
          <span className="truncate">New Playbook</span>
        </button>
      </div>

      {/* Main List Body (Explorer Parity) */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {!activeFolder && (
          <div className="p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-app)] text-xs text-[var(--text-muted)] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-[#cf6613] shrink-0 mt-0.5" />
            <span>Open a project folder first to generate or create SOP Playbooks.</span>
          </div>
        )}

        {(showGuide || (activeFolder && playbooks.length === 0)) && (
          <div className="p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-app)] space-y-1.5 text-[11px] text-[var(--text-muted)]">
            <div className="font-semibold text-white flex items-center justify-between">
              <span>Playbook Explorer</span>
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
            <p className="leading-relaxed">
              Click <strong className="text-white">Auto-Generate</strong> to scan your folder documents, or <strong className="text-white">New Playbook</strong>. Clicking any playbook opens its full details & editor in the <strong className="text-white">Center Panel</strong>.
            </p>
          </div>
        )}

        {/* Section 1: Workspace Playbooks List */}
        {playbooks.length > 0 && (
          <div className="space-y-1">
            <div className="px-1 text-[11px] font-semibold text-[var(--text-muted)] flex items-center justify-between">
              <span>Workspace Playbooks</span>
              <span>{playbooks.length}</span>
            </div>

            {playbooks.map((pb) => {
              const isSelected = selectedId === pb.id;
              const isRunning = executingId === pb.id;

              return (
                <div
                  key={pb.id}
                  onClick={() => openPlaybookInCenter(pb)}
                  className={cn(
                    "group px-2.5 py-2 rounded-lg border flex items-start justify-between gap-2 cursor-pointer transition-all",
                    isSelected
                      ? "bg-[var(--bg-hover)] border-[#cf6613] text-white"
                      : "bg-[var(--bg-app)] border-[var(--border-color)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]/50 text-[var(--text-primary)]"
                  )}
                >
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <ClipboardCheck
                      className={cn(
                        "w-3.5 h-3.5 shrink-0 mt-0.5",
                        isSelected ? "text-[#cf6613]" : "text-[var(--text-muted)]"
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-white truncate">
                        {pb.title}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-[var(--text-muted)]">
                        <span className="truncate">{pb.category}</span>
                        <span>·</span>
                        <span>{pb.steps.length} steps</span>
                        <span>·</span>
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {pb.estimated_minutes}m
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Run & Delete on row */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={isRunning}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleQuickRunPlaybook(pb);
                      }}
                      className="w-6 h-6 rounded border border-[var(--border-strong)] bg-[var(--bg-panel)] hover:bg-[#cf6613] hover:border-[#cf6613] text-white flex items-center justify-center transition-colors cursor-pointer"
                      title="Quick Run Playbook"
                    >
                      {isRunning ? (
                        <RotateCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Play className="w-3 h-3 fill-current" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePlaybook(pb.id, pb.title);
                      }}
                      className="w-6 h-6 rounded border border-[var(--border-strong)] bg-[var(--bg-panel)] hover:bg-rose-600 hover:border-rose-500 text-white/80 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                      title="Delete Playbook"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Section 2: Audit & Executive Studios (Open in Center Panel) */}
        <div className="space-y-1 pt-2 border-t border-[var(--border-color)]">
          <div className="px-1 text-[11px] font-semibold text-[var(--text-muted)]">
            Audit & Executive Studios
          </div>

          <button
            type="button"
            onClick={openReconcileInCenter}
            className={cn(
              "w-full px-2.5 py-2 rounded-lg border flex items-center gap-2 text-left transition-all cursor-pointer",
              selectedId === "__reconcile__"
                ? "bg-[var(--bg-hover)] border-[#cf6613] text-white"
                : "bg-[var(--bg-app)] border-[var(--border-color)] hover:border-[var(--border-strong)] text-white"
            )}
          >
            <Scale className="w-3.5 h-3.5 text-[#cf6613] shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium truncate">
                3-Way Reconciliation Audit
              </div>
              <div className="text-[10px] text-[var(--text-muted)] truncate">
                Cross-check POS, Bank & Cash Ledger in Center Panel
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={openExecutiveInCenter}
            className={cn(
              "w-full px-2.5 py-2 rounded-lg border flex items-center gap-2 text-left transition-all cursor-pointer",
              selectedId === "__executive__"
                ? "bg-[var(--bg-hover)] border-[#cf6613] text-white"
                : "bg-[var(--bg-app)] border-[var(--border-color)] hover:border-[var(--border-strong)] text-white"
            )}
          >
            <Presentation className="w-3.5 h-3.5 text-[#cf6613] shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium truncate">
                Executive Brief Synthesis
              </div>
              <div className="text-[10px] text-[var(--text-muted)] truncate">
                Generate A4 Memo (.docx) & Slide Deck (.pptx)
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
});
