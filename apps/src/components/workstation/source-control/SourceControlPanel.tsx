import { memo } from "react";
import { GitBranch, RotateCcw, Check, FileText, RotateCw } from "lucide-react";
import { DocumentChangeItem } from "../explorer/ExplorerSourceControl";

interface SourceControlPanelProps {
  changes: DocumentChangeItem[];
  onOpenDiffTab: (item: DocumentChangeItem) => void;
  onRevertChange?: (item: DocumentChangeItem) => void;
  onAcceptChange?: (item: DocumentChangeItem) => void;
  onRefresh?: () => void;
  width?: number | string;
}

export const SourceControlPanel = memo(function SourceControlPanel({
  changes = [],
  onOpenDiffTab,
  onRevertChange,
  onAcceptChange,
  onRefresh,
  width = 256,
}: SourceControlPanelProps) {
  const count = changes.length;

  return (
    <aside
      className="h-full flex flex-col bg-[var(--bg-app)] border-r border-[var(--border-color)] text-[var(--text-primary)] select-none shrink-0 overflow-hidden"
      style={{ width }}
      aria-label="Source Control Panel"
    >
      {/* Top Header */}
      <div className="h-10 px-3.5 border-b border-[var(--border-color)] flex items-center justify-between shrink-0 bg-[var(--bg-app)]">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-white" strokeWidth={1.8} />
          <span className="text-xs font-semibold text-white tracking-wide">
            Source Control
          </span>
        </div>

        <div className="flex items-center gap-1">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              title="Refresh changes"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Changes Section Header (Title case) */}
      <div className="h-8 px-3.5 bg-[var(--bg-panel)]/30 border-b border-[var(--border-color)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white">
            Changes
          </span>
          {count > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-[var(--bg-hover)] border border-[var(--border-strong)] text-[10px] font-mono text-white">
              {count}
            </span>
          )}
        </div>
      </div>

      {/* Changes List */}
      <div className="flex-1 overflow-y-auto py-1">
        {count === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-[var(--text-muted)]">
            <GitBranch className="w-8 h-8 opacity-30 mb-2 stroke-[1.5]" />
            <p className="text-xs font-semibold text-white mb-1">
              No changes detected
            </p>
            <p className="text-[11px] leading-relaxed max-w-[200px]">
              Working tree is clean. All document files match disk.
            </p>
          </div>
        ) : (
          changes.map((item) => (
            <div
              key={item.filePath}
              onClick={() => onOpenDiffTab(item)}
              className="group flex items-center justify-between px-3 py-1.5 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer text-xs"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <FileText className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                <span className="text-white truncate font-medium font-mono text-[11px]">
                  {item.fileName}
                </span>
                {/* Solid Orange M Badge */}
                <span className="px-1.5 py-0.5 rounded bg-[#cf6613] text-white text-[10px] font-bold leading-none shrink-0 select-none">
                  M
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] text-[var(--text-muted)] font-mono opacity-80 group-hover:hidden">
                  +{item.addedCount} -{item.deletedCount}
                </span>

                {/* Hover Quick Actions */}
                <div className="hidden group-hover:flex items-center gap-1">
                  {onRevertChange && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRevertChange(item);
                      }}
                      className="p-1 rounded text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-panel)] transition-colors"
                      title="Discard changes"
                    >
                      <RotateCcw className="w-3 h-3 text-rose-400" />
                    </button>
                  )}

                  {onAcceptChange && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAcceptChange(item);
                      }}
                      className="p-1 rounded text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-panel)] transition-colors"
                      title="Save changes to disk"
                    >
                      <Check className="w-3 h-3 text-white" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
});
