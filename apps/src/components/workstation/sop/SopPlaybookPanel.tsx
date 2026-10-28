import { memo, useState, useEffect, useCallback } from "react";
import {
  ClipboardCheck,
  RotateCw,
  Presentation,
  Plus,
  Wand2,
  Scale,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
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
  onClose,
  width = "var(--left-panel-width)",
}: SopPlaybookPanelProps) {
  const { t } = useI18n();
  const [playbooks, setPlaybooks] = useState<SopPlaybookDef[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [isRootExpanded, setIsRootExpanded] = useState(true);
  const [isStudiosExpanded, setIsStudiosExpanded] = useState(true);

  const folderName = activeFolder
    ? activeFolder.split(/[\\/]/).filter(Boolean).pop() || "WORKSPACE"
    : "WORKSPACE";

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

  return (
    <aside
      style={{ width }}
      className="bg-[var(--bg-panel)] text-[var(--text-primary)] border-r border-[var(--border-color)] flex flex-col shrink-0 select-none overflow-hidden transition-colors duration-150"
    >
      {/* 1. Panel Header (Exact Explorer Parity) */}
      <div className="h-9 px-3 box-border border-b border-[var(--border-color)] flex items-center justify-between shrink-0">
        <span className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-2 truncate">
          <ClipboardCheck className="w-3.5 h-3.5 text-[var(--text-primary)] shrink-0" strokeWidth={2} />
          {t("sopPlaybooks", "Playbooks")}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={fetchPlaybooks}
            disabled={loading}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-md hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            title="Refresh Playbooks"
          >
            <RotateCw
              className={cn("w-3.5 h-3.5", loading && "animate-spin")}
              strokeWidth={1.5}
            />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-md hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              title="Close Playbooks Panel"
            >
              <PanelLeftClose className="w-4 h-4" strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {/* 2. Project Sub-Header Bar (Exact FileTree Parity: Folder Name on Left + Subtle Icon Actions on Right) */}
      <div className="flex items-center justify-between px-3 h-8 bg-[var(--bg-panel-sub)] shrink-0 border-b border-[var(--border-color)] transition-colors duration-150">
        <button
          type="button"
          onClick={() => setIsRootExpanded((v) => !v)}
          className="flex items-center gap-1.5 min-w-0 text-left hover:text-[var(--text-primary)] transition-colors cursor-pointer group"
          title="Toggle Playbooks List"
        >
          <span className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] shrink-0">
            {isRootExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.75} />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.75} />
            )}
          </span>
          <span className="text-[var(--text-primary)] font-semibold text-xs tracking-wide truncate">
            {folderName}
          </span>
        </button>

        {/* Icon-Only Actions (Generate, Add Playbook, Refresh) */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={!activeFolder || generating}
            onClick={handleGenerateFromFolder}
            title="Generate Playbooks from Folder"
            className="p-1 hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[#cf6613] rounded transition-colors cursor-pointer disabled:opacity-40"
          >
            <Wand2
              className={cn("w-3.5 h-3.5", generating && "animate-spin text-[#cf6613]")}
              strokeWidth={1.75}
            />
          </button>
          <button
            type="button"
            disabled={!activeFolder}
            onClick={openNewPlaybookInCenter}
            title="Add New Playbook"
            className="p-1 hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded transition-colors cursor-pointer disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={fetchPlaybooks}
            title="Refresh Playbooks"
            className="p-1 hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded transition-colors cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* 3. Clean File-Tree Style Playbook Rows (Empty when no playbooks exist) */}
      <div className="flex-1 flex flex-col overflow-y-auto min-h-0 p-1 space-y-0.5">
        {isRootExpanded &&
          playbooks.map((pb) => {
            const isSelected = selectedId === pb.id;
            return (
              <button
                key={pb.id}
                type="button"
                onClick={() => openPlaybookInCenter(pb)}
                className={cn(
                  "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left text-xs transition-colors group cursor-pointer",
                  isSelected
                    ? "bg-[var(--bg-hover)] text-white"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                )}
                title={`${pb.title} (${pb.category})`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-4 h-4 rounded bg-[#cf6613] flex items-center justify-center shrink-0">
                    <ClipboardCheck className="w-2.5 h-2.5 text-white" />
                  </span>
                  <span
                    className={cn(
                      "truncate text-xs transition-colors",
                      isSelected
                        ? "font-medium text-white"
                        : "font-normal text-[var(--text-primary)]"
                    )}
                  >
                    {pb.title}
                  </span>
                </div>
                <span className="text-[10px] text-[var(--text-dim)] shrink-0 ml-2 font-mono">
                  {pb.steps.length} steps
                </span>
              </button>
            );
          })}
      </div>

      {/* 4. Bottom Section: Audit & Executive (Exact ExplorerRecentCanvases Parity) */}
      <div className="border-t border-[var(--border-color)] bg-[var(--bg-panel)] flex flex-col shrink-0">
        <button
          type="button"
          onClick={() => setIsStudiosExpanded((v) => !v)}
          className="w-full h-7 px-3 flex items-center justify-between text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors select-none cursor-pointer"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 transition-transform text-[var(--text-muted)]",
                !isStudiosExpanded && "-rotate-90"
              )}
            />
            <Scale className="w-3.5 h-3.5 text-[var(--text-muted)]" strokeWidth={1.5} />
            <span className="font-semibold text-xs tracking-tight text-[var(--text-primary)]">
              Audit & Executive
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[var(--bg-card)] text-[var(--text-dim)] border border-[var(--border-color)] font-mono">
              2
            </span>
          </div>
          <span className="text-[10px] text-[var(--text-dim)] font-mono">tools</span>
        </button>

        {isStudiosExpanded && (
          <div className="p-1 space-y-0.5 select-none">
            <button
              type="button"
              onClick={openReconcileInCenter}
              className={cn(
                "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left text-xs transition-colors group cursor-pointer",
                selectedId === "__reconcile__"
                  ? "bg-[var(--bg-hover)] text-white"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              )}
              title="Open 3-Way Reconciliation Audit in Center Panel"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-4 h-4 rounded bg-[#cf6613] flex items-center justify-center shrink-0">
                  <Scale className="w-2.5 h-2.5 text-white" />
                </span>
                <span className="truncate text-[11px] font-normal text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                  3-Way Reconciliation
                </span>
              </div>
              <span className="text-[10px] text-[var(--text-dim)] shrink-0 ml-2 font-mono">
                audit
              </span>
            </button>

            <button
              type="button"
              onClick={openExecutiveInCenter}
              className={cn(
                "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left text-xs transition-colors group cursor-pointer",
                selectedId === "__executive__"
                  ? "bg-[var(--bg-hover)] text-white"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              )}
              title="Open Executive Brief Synthesis in Center Panel"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-4 h-4 rounded bg-[#cf6613] flex items-center justify-center shrink-0">
                  <Presentation className="w-2.5 h-2.5 text-white" />
                </span>
                <span className="truncate text-[11px] font-normal text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                  Executive Brief
                </span>
              </div>
              <span className="text-[10px] text-[var(--text-dim)] shrink-0 ml-2 font-mono">
                deck
              </span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
});
