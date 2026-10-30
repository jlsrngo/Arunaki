import { memo } from "react";
import {
  Search,
  X,
  RotateCw,
  PanelLeftClose,
  CaseSensitive,
  FileText,
  Loader2,
} from "lucide-react";
import { getFileIcon, formatSize } from "../../workspace/tree-utils";
import { cn } from "../../../lib/utils";
import { useI18n } from "../../../lib/i18n";
import { useWorkspaceSearch, type WorkspaceFileItem } from "./hooks/useWorkspaceSearch";
import { SearchContentMatchGroup } from "./components/SearchContentMatchGroup";

export type { WorkspaceFileItem };

interface WorkspaceSearchPanelProps {
  activeFolder: string;
  workspaceFiles: WorkspaceFileItem[];
  onOpenFileTab: (filePath: string, fileName: string) => void;
  onClose?: () => void;
  onToggle?: () => void;
  width?: number | string;
}

export const WorkspaceSearchPanel = memo(function WorkspaceSearchPanel({
  activeFolder,
  workspaceFiles = [],
  onOpenFileTab,
  onClose,
  onToggle,
  width = 256,
}: WorkspaceSearchPanelProps) {
  const { t } = useI18n();

  const {
    query,
    setQuery,
    caseSensitive,
    setCaseSensitive,
    isSearching,
    contentGroups,
    collapsedFiles,
    inputRef,
    matchingFiles,
    totalContentMatches,
    runSearch,
    toggleFileCollapse,
  } = useWorkspaceSearch({
    activeFolder,
    workspaceFiles,
  });

  return (
    <aside
      className="h-full flex flex-col bg-[var(--bg-app)] border-r border-[var(--border-color)] text-[var(--text-primary)] select-none shrink-0 overflow-hidden"
      style={{ width }}
      aria-label="Workspace Search Panel"
    >
      {/* Top Header */}
      <div className="h-9 px-3 box-border border-b border-[var(--border-color)] flex items-center justify-between shrink-0 bg-[var(--bg-panel)]">
        <div className="flex items-center gap-2 min-w-0 flex-1 mr-1 overflow-hidden">
          <Search className="w-3.5 h-3.5 text-[var(--text-primary)] shrink-0" strokeWidth={1.8} />
          <span
            className="text-xs font-semibold text-[var(--text-primary)] tracking-wide truncate whitespace-nowrap"
            title="Search"
          >
            Search
          </span>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => runSearch(query, caseSensitive)}
            className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            title={t("refresh", "Refresh")}
          >
            <RotateCw className={cn("w-3.5 h-3.5", isSearching && "animate-spin")} />
          </button>
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

      {/* Search Input Bar */}
      <div className="p-2.5 border-b border-[var(--border-color)] bg-[var(--bg-panel)] shrink-0">
        <div className="flex items-center bg-[var(--bg-input)] border border-[var(--border-strong)] focus-within:border-[var(--text-primary)] rounded-md px-2 h-7 gap-1.5 transition-colors">
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files or document text..."
            className="flex-1 min-w-0 bg-transparent text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              title="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setCaseSensitive((v) => !v)}
            className={cn(
              "p-0.5 rounded transition-colors cursor-pointer",
              caseSensitive
                ? "bg-[var(--text-primary)] text-[var(--bg-card)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            )}
            title="Match Case (Aa)"
          >
            <CaseSensitive className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Status text */}
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
          <span>
            {isSearching ? (
              <span className="flex items-center gap-1">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                Searching...
              </span>
            ) : query ? (
              `${totalContentMatches} in-file ${
                totalContentMatches === 1 ? "match" : "matches"
              } · ${matchingFiles.length} file ${matchingFiles.length === 1 ? "match" : "matches"}`
            ) : (
              `${workspaceFiles.length} files in active folder`
            )}
          </span>
        </div>
      </div>

      {/* Results Content Body */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-3">
        {/* In-File Matches */}
        {contentGroups.length > 0 && (
          <div className="space-y-1">
            <div className="px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center justify-between">
              <span>Text Matches</span>
              <span className="font-mono">{contentGroups.length} files</span>
            </div>
            {contentGroups.map((group) => (
              <SearchContentMatchGroup
                key={group.filePath}
                group={group}
                isCollapsed={Boolean(collapsedFiles[group.filePath])}
                query={query}
                caseSensitive={caseSensitive}
                onToggleCollapse={toggleFileCollapse}
                onOpenFileTab={onOpenFileTab}
              />
            ))}
          </div>
        )}

        {/* File Name Matches */}
        <div className="space-y-0.5">
          {contentGroups.length > 0 && (
            <div className="px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center justify-between mt-2">
              <span>File Names</span>
              <span className="font-mono">{matchingFiles.length} files</span>
            </div>
          )}

          {matchingFiles.map((file) => {
            const icon = getFileIcon(file.name) || (
              <FileText className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)] group-hover:text-[var(--text-primary)]" />
            );
            const filePath = file.path || file.name;
            const fileSizeNum = typeof file.size === "number" ? file.size : undefined;
            return (
              <button
                key={filePath}
                type="button"
                onClick={() => onOpenFileTab(filePath, file.name)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-md transition-colors text-left cursor-pointer group"
              >
                {icon}
                <span className="truncate flex-1 font-medium">{file.name}</span>
                {fileSizeNum !== undefined && (
                  <span className="text-[10px] text-[var(--text-dim)] font-mono shrink-0">
                    {formatSize(fileSizeNum)}
                  </span>
                )}
              </button>
            );
          })}

          {query && contentGroups.length === 0 && matchingFiles.length === 0 && !isSearching && (
            <div className="p-4 text-center text-xs text-[var(--text-muted)]">
              No matching files or text found for "{query}".
            </div>
          )}
        </div>
      </div>
    </aside>
  );
});
