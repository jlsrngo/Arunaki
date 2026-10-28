import { memo } from "react";
import { ChevronDown, GitCompare, RotateCcw, Check, FileText } from "lucide-react";
import { cn } from "../../../lib/utils";

export interface DocumentChangeItem {
  filePath: string;
  fileName: string;
  beforeContent: string;
  afterContent: string;
  addedCount: number;
  deletedCount: number;
  status?: "modified" | "added" | "new" | "deleted";
}

interface ExplorerSourceControlProps {
  changes: DocumentChangeItem[];
  isOpen: boolean;
  onToggle: () => void;
  onOpenDiffTab: (item: DocumentChangeItem) => void;
  onRevertChange?: (item: DocumentChangeItem) => void;
  onAcceptChange?: (item: DocumentChangeItem) => void;
}

export const ExplorerSourceControl = memo(function ExplorerSourceControl({
  changes = [],
  isOpen,
  onToggle,
  onOpenDiffTab,
  onRevertChange,
  onAcceptChange,
}: ExplorerSourceControlProps) {
  const count = changes.length;

  return (
    <div className="border-t border-[var(--border-color)] shrink-0 flex flex-col select-none transition-colors duration-150">
      {/* Collapsible Section Header */}
      <button
        type="button"
        onClick={onToggle}
        className="h-8 px-3 flex items-center justify-between text-xs font-semibold text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)] transition-colors cursor-pointer w-full group"
      >
        <span className="flex items-center gap-1.5">
          <GitCompare className="w-3.5 h-3.5 text-white shrink-0" strokeWidth={1.5} />
          <span className="text-xs font-semibold text-white">
            Changes
          </span>
          {count > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[var(--bg-hover)] border border-[var(--border-strong)] text-[10px] font-mono text-white">
              {count}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-[var(--text-dim)] group-hover:text-white transition-transform duration-200 shrink-0",
            !isOpen && "-rotate-90"
          )}
          strokeWidth={1.5}
        />
      </button>

      {/* List of Modified Documents */}
      {isOpen && (
        <div className="flex flex-col py-1 overflow-y-auto max-h-44 text-xs font-mono">
          {count === 0 ? (
            <div className="px-3 py-2 text-[11px] text-[var(--text-dim)] italic font-sans flex items-center gap-2">
              <span>All files saved. No working changes.</span>
            </div>
          ) : (
            changes.map((item) => (
              <div
                key={item.filePath}
                className="group flex items-center justify-between px-3 py-1 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer text-[12px]"
                onClick={() => onOpenDiffTab(item)}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <FileText className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                  <span className="text-white truncate font-medium">{item.fileName}</span>
                  {item.status === "new" || item.status === "added" || (!item.beforeContent && item.afterContent) ? (
                    <span
                      className="px-1.5 py-0.5 rounded bg-white text-black text-[10px] font-bold leading-none shrink-0 select-none shadow-xs"
                      title="New file"
                    >
                      N
                    </span>
                  ) : (
                    <span
                      className="px-1.5 py-0.5 rounded bg-[#cf6613] text-white text-[10px] font-bold leading-none shrink-0 select-none shadow-xs"
                      title="Modified"
                    >
                      M
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] text-[var(--text-dim)] opacity-80 group-hover:hidden">
                    +{item.addedCount} -{item.deletedCount}
                  </span>

                  {/* Quick Action Buttons on Hover */}
                  <div className="hidden group-hover:flex items-center gap-1">
                    {onRevertChange && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRevertChange(item);
                        }}
                        className="p-1 rounded hover:bg-rose-600 text-rose-400 hover:text-white transition-colors"
                        title="Revert to last saved"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}

                    {onAcceptChange && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAcceptChange(item);
                        }}
                        className="p-1 rounded hover:bg-white/20 text-white transition-colors"
                        title="Save changes"
                      >
                        <Check className="w-3 h-3" strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
});
