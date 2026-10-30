import { memo } from "react";
import { ChevronDown, ChevronRight, FileText } from "lucide-react";
import { getFileIcon } from "../../../workspace/tree-utils";
import type { GroupedContentMatch } from "../hooks/useWorkspaceSearch";

interface SearchContentMatchGroupProps {
  group: GroupedContentMatch;
  isCollapsed: boolean;
  query: string;
  caseSensitive: boolean;
  onToggleCollapse: (path: string) => void;
  onOpenFileTab: (filePath: string, fileName: string) => void;
}

export const SearchContentMatchGroup = memo(function SearchContentMatchGroup({
  group,
  isCollapsed,
  query,
  caseSensitive,
  onToggleCollapse,
  onOpenFileTab,
}: SearchContentMatchGroupProps) {
  const icon = getFileIcon(group.fileName) || <FileText className="w-3.5 h-3.5 shrink-0" />;

  const renderHighlightedText = (text: string, highlight: string) => {
    const q = highlight.trim();
    if (!q) return text;
    const hay = caseSensitive ? text : text.toLowerCase();
    const needle = caseSensitive ? q : q.toLowerCase();
    const idx = hay.indexOf(needle);
    if (idx === -1) return text;

    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + q.length);
    const after = text.slice(idx + q.length);
    return (
      <>
        {before}
        <span className="bg-[#cf6613]/25 text-[var(--text-primary)] font-semibold rounded-xs px-0.5">
          {match}
        </span>
        {after}
      </>
    );
  };

  return (
    <div className="space-y-0.5">
      {/* Group File Header */}
      <button
        type="button"
        onClick={() => onToggleCollapse(group.filePath)}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-md transition-colors text-left cursor-pointer group"
      >
        {isCollapsed ? (
          <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] shrink-0" />
        )}
        {icon}
        <span className="font-semibold text-[var(--text-primary)] truncate flex-1" title={group.filePath}>
          {group.fileName}
        </span>
        <span className="text-[10px] bg-[var(--bg-card)] border border-[var(--border-color)] px-1.5 py-0.2 rounded-full font-mono text-[var(--text-muted)]">
          {group.lines.length}
        </span>
      </button>

      {/* Matched Lines */}
      {!isCollapsed && (
        <div className="pl-6 space-y-0.5">
          {group.lines.map((line, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onOpenFileTab(group.filePath, group.fileName)}
              className="w-full flex items-baseline gap-2 px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-md transition-colors text-left cursor-pointer font-mono"
            >
              <span className="text-[10px] text-[var(--text-dim)] shrink-0 w-5 text-right select-none">
                {line.lineNumber}
              </span>
              <span className="truncate flex-1 text-[11px]">
                {renderHighlightedText(line.text, query)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
