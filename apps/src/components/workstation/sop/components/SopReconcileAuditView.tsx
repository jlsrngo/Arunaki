import { memo } from "react";
import {
  Scale,
  RotateCw,
  Play,
  ShieldCheck,
  ShieldAlert,
  FileText,
  Send,
  AlertTriangle,
} from "lucide-react";
import { cn } from "../../../../lib/utils";
import { Button, Card, Badge } from "../../../ui";
import {
  ReconcileAuditMode,
  ReconcileAuditResult,
  IDR_NUMBER_FORMATTER,
} from "../sopTypes";

interface SopReconcileAuditViewProps {
  auditMode: ReconcileAuditMode;
  onSelectAuditMode: (mode: ReconcileAuditMode) => void;
  auditing: boolean;
  onRunReconciliation: () => void;
  auditResult: ReconcileAuditResult | null;
  dispatchingTg: boolean;
  onDispatchTelegram: (
    kind: "report" | "alert",
    reportTitle: string,
    filePath?: string,
    details?: string
  ) => void;
  onOpenFileTab?: (path: string) => void;
}

export const SopReconcileAuditView = memo(function SopReconcileAuditView({
  auditMode,
  onSelectAuditMode,
  auditing,
  onRunReconciliation,
  auditResult,
  dispatchingTg,
  onDispatchTelegram,
  onOpenFileTab,
}: SopReconcileAuditViewProps) {
  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[var(--bg-app)]">
      <div className="max-w-3xl mx-auto space-y-5">
        <Card className="p-5 bg-[var(--bg-panel)] space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#cf6613] flex items-center justify-center shrink-0">
                <Scale className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  3-Way Reconciliation & Anomaly Guard
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  Cross-check 3 operational data sources in your active folder to detect variances and anomalies.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="brand"
              size="icon"
              disabled={auditing}
              onClick={onRunReconciliation}
              title="Run 3-Way Audit"
            >
              {auditing ? (
                <RotateCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--border-color)]">
            <button
              type="button"
              onClick={() => onSelectAuditMode("cash_and_bank")}
              className={cn(
                "p-3 rounded-lg border text-left transition-all cursor-pointer",
                auditMode === "cash_and_bank"
                  ? "bg-[var(--bg-hover)] border-[#cf6613] text-[var(--text-primary)]"
                  : "bg-[var(--bg-app)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              )}
            >
              <div className="text-xs font-semibold text-[var(--text-primary)] mb-0.5">
                POS vs Bank vs Cash Ledger
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Reconcile daily register sales, bank settlements, and Excel cash recaps.
              </div>
            </button>
            <button
              type="button"
              onClick={() => onSelectAuditMode("procurement_three_way")}
              className={cn(
                "p-3 rounded-lg border text-left transition-all cursor-pointer",
                auditMode === "procurement_three_way"
                  ? "bg-[var(--bg-hover)] border-[#cf6613] text-[var(--text-primary)]"
                  : "bg-[var(--bg-app)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              )}
            >
              <div className="text-xs font-semibold text-[var(--text-primary)] mb-0.5">
                PO vs Goods Receipt vs Supplier Invoice
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Verify purchase orders against receiving logs and supplier billing.
              </div>
            </button>
          </div>
        </Card>

        {auditResult && (
          <Card className="p-5 bg-[var(--bg-panel)] space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <div className="flex items-center gap-2">
                {auditResult.audit_status === "BALANCED" ? (
                  <ShieldCheck className="w-5 h-5 text-[var(--text-primary)]" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-rose-500" />
                )}
                <span
                  className={cn(
                    "text-sm font-bold",
                    auditResult.audit_status === "BALANCED"
                      ? "text-[var(--text-primary)]"
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenFileTab("reconciliation_discrepancy_memo.docx")}
                  >
                    <FileText className="w-3.5 h-3.5 text-[#cf6613]" />
                    <span>Open Audit Memo (.docx)</span>
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={dispatchingTg}
                  onClick={() =>
                    onDispatchTelegram(
                      "alert",
                      `3-Way Audit Alert (${auditResult.period})`,
                      "reconciliation_discrepancy_memo.docx",
                      `Anomalies: ${auditResult.anomalies_count} | Variance: Rp ${IDR_NUMBER_FORMATTER.format(auditResult.totals.absolute_variance)}`
                    )
                  }
                >
                  <Send className="w-3.5 h-3.5 text-[#cf6613]" />
                  <span>Send Alert to Telegram</span>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)]">
                <div className="text-[11px] text-[var(--text-muted)]">
                  {auditResult.labels.source_a}
                </div>
                <div className="text-sm font-mono font-bold text-[var(--text-primary)] mt-1">
                  Rp {IDR_NUMBER_FORMATTER.format(auditResult.totals.source_a)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)]">
                <div className="text-[11px] text-[var(--text-muted)]">
                  {auditResult.labels.source_b}
                </div>
                <div className="text-sm font-mono font-bold text-[var(--text-primary)] mt-1">
                  Rp {IDR_NUMBER_FORMATTER.format(auditResult.totals.source_b)}
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
                      : "text-[var(--text-primary)]"
                  )}
                >
                  Rp {IDR_NUMBER_FORMATTER.format(auditResult.totals.absolute_variance)}
                </div>
              </div>
            </div>

            {auditResult.anomalies.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-[var(--text-primary)]">
                  Detected Anomalies
                </h4>
                {auditResult.anomalies.map((anom, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-[var(--bg-app)] border border-rose-500/40 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                        {anom.title}
                      </span>
                      <Badge variant="destructive" className="font-mono">
                        {anom.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">{anom.description}</p>
                    <p className="text-[11px] text-[#cf6613] font-medium">
                      Action: {anom.recommendation}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
});

