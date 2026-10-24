import { memo } from "react";
import { X, Copy, Check, Download, Save } from "lucide-react";
import { cn } from "../../../lib/utils";
import { getFileIcon } from "../../workspace/tree-utils";
import { CenterTab } from "./types";
import { DiffLine } from "./diffUtils";

interface CenterTabHeaderProps {
  tabs: CenterTab[];
  activeTabId: string | null;
  activeTab?: CenterTab;
  unsavedTabs: Record<string, boolean>;
  activeDiff: {
    diffLines: DiffLine[];
    addedCount: number;
    deletedCount: number;
  } | null;
  onClearDiff: () => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onSave: () => void;
  onCopyContent: () => void;
  onDownloadTxt: () => void;
  isUnsaved: boolean;
  copied: boolean;
}

export const CenterTabHeader = memo(function CenterTabHeader({
  tabs,
  activeTabId,
  activeTab,
  unsavedTabs,
  activeDiff,
  onClearDiff,
  onSelectTab,
  onCloseTab,
  onSave,
  onCopyContent,
  onDownloadTxt,
  isUnsaved,
  copied,
}: CenterTabHeaderProps) {
  if (tabs.length === 0) return null;

  return (
    <div className="h-[35px] bg-[var(--bg-panel)] border-b border-[var(--border-color)] flex items-center justify-between px-0 gap-0 select-none shrink-0 overflow-hidden transition-colors">
      {/* Left: VSCode Rectangular Flush Tabs */}
      <div className="flex items-center h-full overflow-x-auto no-scrollbar min-w-0">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const hasUnsavedChanges = !!unsavedTabs[tab.id];
          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }
              }}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                }
              }}
              className={cn(
                "group h-full flex items-center gap-2 px-3 text-xs font-sans cursor-pointer transition-colors border-r border-[var(--border-color)] select-none shrink-0 relative",
                isActive
                  ? "bg-[var(--bg-card)] text-[var(--text-primary)] border-t-2 border-t-[var(--text-primary)] font-medium shadow-2xs"
                  : "bg-[var(--bg-panel)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] border-t-2 border-t-transparent"
              )}
            >
              {getFileIcon(tab.title)}
              <span className="truncate max-w-[150px] text-[12px]">{tab.title}</span>
              {hasUnsavedChanges ? (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  className="w-2 h-2 rounded-full bg-[var(--text-primary)] group-hover:hidden transition-all"
                  title="Unsaved changes"
                />
              ) : null}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                className={cn(
                  "p-0.5 rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer",
                  hasUnsavedChanges ? "hidden group-hover:block" : "opacity-0 group-hover:opacity-100"
                )}
                title="Close (Middle-click)"
              >
                <X className="w-3 h-3 text-[var(--text-muted)] hover:text-[var(--text-primary)]" strokeWidth={1.5} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Right: VSCode Action Icons */}
      {activeTab && (
        <div className="flex items-center gap-1.5 shrink-0 px-2">
          {activeDiff && (
            <span className="text-[11px] text-[var(--text-primary)] bg-[var(--bg-hover)] px-2 py-0.5 rounded border border-[var(--border-strong)] flex items-center gap-1.5 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-primary)] animate-pulse" />
              <span>
                +{activeDiff.addedCount} / -{activeDiff.deletedCount}
              </span>
              <button
                type="button"
                onClick={onClearDiff}
                className="ml-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                title="Dismiss highlight"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          )}

          {isUnsaved && (
            <button
              type="button"
              onClick={onSave}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--text-primary)] hover:opacity-90 text-[var(--bg-card)] font-medium font-sans text-[11px] transition-all cursor-pointer shadow-xs"
              title="Save Changes (Ctrl+S)"
            >
              <Save className="w-3 h-3" />
              <span>Save</span>
            </button>
          )}

          <button
            type="button"
            onClick={onCopyContent}
            className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            title="Copy Content"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[var(--text-primary)]" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {activeTab.type === "canvas" && (
            <button
              type="button"
              onClick={onDownloadTxt}
              className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              title="Download File"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
});
