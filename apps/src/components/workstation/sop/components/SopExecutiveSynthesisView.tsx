import { memo } from "react";
import { Presentation, RotateCw, Play, FileText, Send } from "lucide-react";
import { Button, Input, Card } from "../../../ui";
import { ExecutiveKpiResult, IDR_NUMBER_FORMATTER } from "../sopTypes";

interface SopExecutiveSynthesisViewProps {
  execPeriod: string;
  onExecPeriodChange: (period: string) => void;
  synthesizing: boolean;
  onSynthesizeExecutive: () => void;
  execKpi: ExecutiveKpiResult | null;
  dispatchingTg: boolean;
  onDispatchTelegram: (
    kind: "report" | "alert",
    reportTitle: string,
    filePath?: string,
    details?: string
  ) => void;
  onOpenFileTab?: (path: string) => void;
}

export const SopExecutiveSynthesisView = memo(function SopExecutiveSynthesisView({
  execPeriod,
  onExecPeriodChange,
  synthesizing,
  onSynthesizeExecutive,
  execKpi,
  dispatchingTg,
  onDispatchTelegram,
  onOpenFileTab,
}: SopExecutiveSynthesisViewProps) {
  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[var(--bg-app)]">
      <div className="max-w-3xl mx-auto space-y-5">
        <Card className="p-5 bg-[var(--bg-panel)] space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#cf6613] flex items-center justify-center shrink-0">
                <Presentation className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  Executive Multi-Format Synthesis
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  Synthesize spreadsheets and reports into an A4 Executive Memo (.docx) and Board Slide Deck (.pptx).
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={execPeriod}
                onChange={(e) => onExecPeriodChange(e.target.value)}
                className="w-40 bg-[var(--bg-app)]"
                placeholder="Reporting Period"
              />
              <Button
                type="button"
                variant="brand"
                size="icon"
                disabled={synthesizing}
                onClick={onSynthesizeExecutive}
                title="Generate Brief & Deck"
              >
                {synthesizing ? (
                  <RotateCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 fill-current" />
                )}
              </Button>
            </div>
          </div>
        </Card>

        {execKpi && (
          <Card className="p-5 bg-[var(--bg-panel)] space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                Executive KPI Snapshot — {execKpi.period}
              </span>
              <div className="flex items-center gap-2">
                {onOpenFileTab && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenFileTab("executive_summary_memo.docx")}
                    >
                      <FileText className="w-3.5 h-3.5 text-[#cf6613]" />
                      <span>Open Memo (.docx)</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenFileTab("executive_presentation_deck.pptx")}
                    >
                      <Presentation className="w-3.5 h-3.5 text-[#cf6613]" />
                      <span>Open Slides (.pptx)</span>
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={dispatchingTg}
                  onClick={() =>
                    onDispatchTelegram(
                      "report",
                      `Executive Brief (${execKpi.period})`,
                      "executive_summary_memo.docx",
                      `Net Income: Rp ${IDR_NUMBER_FORMATTER.format(execKpi.net_operating_income)} (${execKpi.operating_margin_pct.toFixed(1)}%)`
                    )
                  }
                >
                  <Send className="w-3.5 h-3.5 text-[#cf6613]" />
                  <span>Send to Telegram</span>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)]">
                <div className="text-[11px] text-[var(--text-muted)]">Gross Revenue</div>
                <div className="text-sm font-mono font-bold text-[var(--text-primary)] mt-1">
                  Rp {IDR_NUMBER_FORMATTER.format(execKpi.gross_revenue)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)]">
                <div className="text-[11px] text-[var(--text-muted)]">Operating Expenses</div>
                <div className="text-sm font-mono font-bold text-[var(--text-primary)] mt-1">
                  Rp {IDR_NUMBER_FORMATTER.format(execKpi.operating_expenses)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)]">
                <div className="text-[11px] text-[var(--text-muted)]">
                  Net Operating Income ({execKpi.operating_margin_pct.toFixed(1)}%)
                </div>
                <div className="text-sm font-mono font-bold text-[var(--text-primary)] mt-1">
                  Rp {IDR_NUMBER_FORMATTER.format(execKpi.net_operating_income)}
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
});

