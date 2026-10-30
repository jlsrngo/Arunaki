import { memo } from "react";
import { GitBranch, RotateCcw, Check, FileText, RotateCw, PanelLeftClose } from "lucide-react";
import { DocumentChangeItem } from "../explorer/ExplorerSourceControl";
import { useI18n } from "../../../lib/i18n";

interface SourceControlPanelProps {
  changes: DocumentChangeItem[];
  onOpenDiffTab: (item: DocumentChangeItem) => void;
  onRevertChange?: (item: DocumentChangeItem) => void;
  onAcceptChange?: (item: DocumentChangeItem) => void;
  onRefresh?: () => void;
  onClose?: () => void;
  onToggle?: () => void;
  width?: number | string;
}

export const SourceControlPanel = memo(function SourceControlPanel({
  changes = [],
  onOpenDiffTab,
  onRevertChange,
  onAcceptChange,
  onRefresh,
  onClose,
  onToggle,
  width = 256,
}: SourceControlPanelProps) {
  const { t } = useI18n();
  const count = changes.length;

  return (
    <aside
      className="h-full flex flex-col bg-[var(--bg-panel)] border-r border-[var(--border-color)] text-[var(--text-primary)] select-none shrink-0 overflow-hidden"
      style={{ width }}
      aria-label="Document Changes Panel"
    >
      {/* Top Header (Exact Parity with Explorer & Playbooks) */}
      <div className="h-9 px-3 box-border border-b border-[var(--border-color)] flex items-center justify-between shrink-0 bg-[var(--bg-panel)]">
        <div className="flex items-center gap-2 min-w-0 flex-1 mr-1 overflow-hidden">
          <GitBranch className="w-3.5 h-3.5 text-[var(--text-primary)] shrink-0" strokeWidth={1.8} />
          <span
            className="text-xs font-semibold text-[var(--text-primary)] tracking-wide truncate whitespace-nowrap"
            title={t("documentChanges", "Document Changes")}
          >
            {t("documentChanges", "Document Changes")}
          </span>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              title={t("refresh", "Refresh")}
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          )}
          {(onClose || onToggle) && (
            <button
              type="button"
              onClick={onToggle || onClose}
              className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              title={`${t("closePanel", "Close Panel")} (Ctrl+B)`}
            >
              <PanelLeftClose className="w-4 h-4" strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {/* Changes Section Header (Title case) */}
      <div className="h-8 px-3 bg-[var(--bg-panel-sub)] border-b border-[var(--border-color)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1 mr-1 overflow-hidden">
          <span className="text-xs font-semibold text-[var(--text-primary)] truncate whitespace-nowrap">
            {t("changesTitle", "Changes")}
          </span>
          {count > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-[var(--bg-hover)] border border-[var(--border-strong)] text-[10px] font-mono text-[var(--text-primary)] shrink-0">
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
            <p className="text-xs font-semibold text-[var(--text-primary)] mb-1">
              {t("noChangesDetected", "No changes detected")}
            </p>
            <p className="text-[11px] leading-relaxed max-w-[200px]">
              {t("workingTreeClean", "All documents are up to date with disk.")}
            </p>
          </div>
        ) : (
          changes.map((item) => (
            <div
              key={item.filePath}
              onClick={() => onOpenDiffTab(item)}
              className="group flex items-center justify-between px-3 py-1.5 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer text-xs"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1 mr-1 overflow-hidden">
                <FileText className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                <span
                  className="text-[var(--text-primary)] truncate whitespace-nowrap font-medium font-mono text-[11px] min-w-0 flex-1"
                  title={item.fileName}
                >
                  {item.fileName}
                </span>
                {/* Status Badge: N for New, M for Modified */}
                {item.status === "new" || item.status === "added" || (!item.beforeContent && item.afterContent) ? (
                  <span
                    className="px-1.5 py-0.5 rounded bg-[var(--text-primary)] text-[var(--bg-card)] text-[10px] font-bold leading-none shrink-0 select-none"
                    title={t("newFileBadge", "New")}
                  >
                    N
                  </span>
                ) : (
                  <span
                    className="px-1.5 py-0.5 rounded bg-[#cf6613] text-white text-[10px] font-bold leading-none shrink-0 select-none"
                    title={t("modifiedBadge", "Modified")}
                  >
                    M
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] text-[var(--text-muted)] font-mono opacity-80 group-hover:hidden group-focus-within:hidden">
                  +{item.addedCount} -{item.deletedCount}
                </span>

                {/* Hover Quick Actions */}
                <div className="hidden group-hover:flex group-focus-within:flex items-center gap-1">
                  {onRevertChange && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRevertChange(item);
                      }}
                      className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel)] transition-colors"
                      title={t("discardChanges", "Discard Changes")}
                    >
                      <RotateCcw className="w-3 h-3 text-rose-500" />
                    </button>
                  )}

                  {onAcceptChange && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAcceptChange(item);
                      }}
                      className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel)] transition-colors"
                      title={t("saveToDisk", "Save to Disk")}
                    >
                      <Check className="w-3 h-3 text-[var(--text-primary)]" />
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
