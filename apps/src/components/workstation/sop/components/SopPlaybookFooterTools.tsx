import { memo } from "react";
import { ChevronDown, Scale, Presentation } from "lucide-react";
import { cn } from "../../../../lib/utils";
import { Badge } from "../../../ui";

interface SopPlaybookFooterToolsProps {
  selectedId: string | null;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onOpenReconcile: () => void;
  onOpenExecutive: () => void;
}

export const SopPlaybookFooterTools = memo(function SopPlaybookFooterTools({
  selectedId,
  isExpanded,
  onToggleExpanded,
  onOpenReconcile,
  onOpenExecutive,
}: SopPlaybookFooterToolsProps) {
  return (
    <div className="border-t border-[var(--border-color)] bg-[var(--bg-panel)] flex flex-col shrink-0">
      <button
        type="button"
        onClick={onToggleExpanded}
        className="w-full h-7 px-3 flex items-center justify-between text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors select-none cursor-pointer"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 transition-transform text-[var(--text-muted)]",
              !isExpanded && "-rotate-90"
            )}
          />
          <Scale className="w-3.5 h-3.5 text-[var(--text-muted)]" strokeWidth={1.5} />
          <span className="font-semibold text-xs tracking-tight text-[var(--text-primary)]">
            Audit & Executive
          </span>
          <Badge variant="outline" className="rounded-full px-1.5 py-0 font-mono text-[10px]">
            2
          </Badge>
        </div>
        <span className="text-[10px] text-[var(--text-dim)] font-mono">tools</span>
      </button>

      {isExpanded && (
        <div className="p-1 space-y-0.5 select-none">
          <button
            type="button"
            onClick={onOpenReconcile}
            className={cn(
              "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left text-xs transition-colors group cursor-pointer",
              selectedId === "__reconcile__"
                ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
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
            <Badge variant="outline" className="px-1.5 py-0 font-mono text-[10px] shrink-0 ml-2">
              audit
            </Badge>
          </button>

          <button
            type="button"
            onClick={onOpenExecutive}
            className={cn(
              "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left text-xs transition-colors group cursor-pointer",
              selectedId === "__executive__"
                ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
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
            <Badge variant="outline" className="px-1.5 py-0 font-mono text-[10px] shrink-0 ml-2">
              deck
            </Badge>
          </button>
        </div>
      )}
    </div>
  );
});

