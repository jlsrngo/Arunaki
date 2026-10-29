import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import {
  Search,
  X,
  RotateCw,
  PanelLeftClose,
  ChevronDown,
  ChevronRight,
  CaseSensitive,
  FileText,
  Loader2,
} from "lucide-react";
import { engineFetch } from "../../../lib/engine";
import { getFileIcon, formatSize } from "../../workspace/tree-utils";
import { cn } from "../../../lib/utils";
import { useI18n } from "../../../lib/i18n";

interface WorkspaceFileItem {
  name: string;
  path?: string;
  size?: number | string;
}

interface ContentMatchLine {
  lineNumber: number;
  text: string;
}

interface GroupedContentMatch {
  filePath: string;
  fileName: string;
  lines: ContentMatchLine[];
}

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
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [contentGroups, setContentGroups] = useState<GroupedContentMatch[]>([]);
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => clearTimeout(timer);
  }, []);

  const runSearch = useCallback(
    async (searchText: string, isCaseSensitive: boolean) => {
      const trimmed = searchText.trim();
      if (!trimmed || !activeFolder) {
        setContentGroups([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        const url = `/api/find?directory=${encodeURIComponent(activeFolder)}&pattern=${encodeURIComponent(
          trimmed
        )}&caseSensitive=${isCaseSensitive ? "true" : "false"}`;
        const res = await engineFetch(url);
        if (res.ok) {
          const data = await res.json();
          const rawList: any[] = Array.isArray(data) ? data : data?.data || [];
          const map = new Map<string, GroupedContentMatch>();

          for (const item of rawList) {
            const relPath = String(item?.path?.text || item?.path || "").replace(/\\/g, "/");
            if (!relPath) continue;
            const fileName = relPath.split("/").pop() || relPath;
            const lineText = String(item?.lines?.text || item?.line || "").trim();
            const lineNumber = Number(item?.line_number || 1);

            let group = map.get(relPath);
            if (!group) {
              group = {
                filePath: relPath,
                fileName,
                lines: [],
              };
              map.set(relPath, group);
            }
            group.lines.push({ lineNumber, text: lineText });
          }

          setContentGroups(Array.from(map.values()));
        }
      } catch {
        // Ignore transient search errors
      } finally {
        setIsSearching(false);
      }
    },
    [activeFolder]
  );

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setContentGroups([]);
      setIsSearching(false);
      return;
    }
    const timer = setTimeout(() => {
      runSearch(trimmed, caseSensitive);
    }, 180);
    return () => clearTimeout(timer);
  }, [query, caseSensitive, runSearch]);

  const matchingFiles = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return workspaceFiles;
    const needle = caseSensitive ? trimmed : trimmed.toLowerCase();
    return workspaceFiles.filter((f) => {
      const hay = caseSensitive ? f.name : f.name.toLowerCase();
      return hay.includes(needle);
    });
  }, [workspaceFiles, query, caseSensitive]);

  const totalContentMatches = useMemo(
    () => contentGroups.reduce((acc, g) => acc + g.lines.length, 0),
    [contentGroups]
  );

  const toggleFileCollapse = useCallback((filePath: string) => {
    setCollapsedFiles((prev) => ({ ...prev, [filePath]: !prev[filePath] }));
  }, []);

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
        <span className="bg-[#cf6613]/35 text-white font-semibold rounded-xs px-0.5">
          {match}
        </span>
        {after}
      </>
    );
  };

  return (
    <aside
      className="h-full flex flex-col bg-[var(--bg-app)] border-r border-[var(--border-color)] text-[var(--text-primary)] select-none shrink-0 overflow-hidden"
      style={{ width }}
      aria-label="Workspace Search Panel"
    >
      {/* Top Header (Exact Parity with Explorer & SourceControlPanel) */}
      <div className="h-9 px-3 box-border border-b border-[var(--border-color)] flex items-center justify-between shrink-0 bg-[var(--bg-app)]">
        <div className="flex items-center gap-2 min-w-0 flex-1 mr-1 overflow-hidden">
          <Search className="w-3.5 h-3.5 text-white shrink-0" strokeWidth={1.8} />
          <span
            className="text-xs font-semibold text-white tracking-wide truncate whitespace-nowrap"
            title="Search"
          >
            Search
          </span>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => runSearch(query, caseSensitive)}
            className="p-1 rounded-md text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            title={t("refresh", "Refresh")}
          >
            <RotateCw className={cn("w-3.5 h-3.5", isSearching && "animate-spin")} />
          </button>
          {(onClose || onToggle) && (
            <button
              type="button"
              onClick={onToggle || onClose}
              className="p-1 rounded-md text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              title={`${t("closePanel", "Close Panel")} (Ctrl+B)`}
            >
              <PanelLeftClose className="w-4 h-4" strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="p-2.5 border-b border-[var(--border-color)] bg-[var(--bg-panel)]/20 shrink-0">
        <div className="flex items-center bg-[#181818] border border-[var(--border-strong)] focus-within:border-white/60 rounded-md px-2 h-7 gap-1.5 transition-colors">
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files or document text..."
            className="flex-1 min-w-0 bg-transparent text-xs text-white placeholder-[var(--text-muted)] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="p-0.5 rounded text-[var(--text-muted)] hover:text-white cursor-pointer"
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
                ? "bg-white text-black"
                : "text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]"
            )}
            title="Match Case (Aa)"
          >
            <CaseSensitive className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Summary Status */}
        {query.trim() && (
          <div className="mt-1.5 px-0.5 flex items-center justify-between text-[10px] text-[var(--text-muted)] font-mono">
            <span>
              {totalContentMatches} {totalContentMatches === 1 ? "result" : "results"} in{" "}
              {contentGroups.length} {contentGroups.length === 1 ? "file" : "files"}
            </span>
            {isSearching && <Loader2 className="w-3 h-3 animate-spin text-white" />}
          </div>
        )}
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto py-1">
        {!activeFolder ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-[var(--text-muted)]">
            <Search className="w-8 h-8 opacity-30 mb-2 stroke-[1.5]" />
            <p className="text-xs font-semibold text-white mb-1">No folder opened</p>
            <p className="text-[11px] leading-relaxed max-w-[200px]">
              Open a project folder to search across documents.
            </p>
          </div>
        ) : !query.trim() ? (
          /* Quick File Filter List when search input is empty */
          <div>
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Workspace Files ({workspaceFiles.length})
            </div>
            {workspaceFiles.map((f) => {
              const p = f.path || f.name;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => onOpenFileTab(p, f.name)}
                  className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer text-left text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                    <span className="shrink-0">
                      {getFileIcon(f.name) || <FileText className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                    </span>
                    <span className="text-white truncate text-[12px]">{f.name}</span>
                  </div>
                  {f.size !== undefined && (
                    <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">
                      {typeof f.size === "number" ? formatSize(f.size) : f.size}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {/* 1. Matching File Names */}
            {matchingFiles.length > 0 && (
              <div>
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center justify-between">
                  <span>Matching Files</span>
                  <span className="font-mono">{matchingFiles.length}</span>
                </div>
                {matchingFiles.map((f) => {
                  const p = f.path || f.name;
                  return (
                    <button
                      key={`file-${p}`}
                      type="button"
                      onClick={() => onOpenFileTab(p, f.name)}
                      className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer text-left text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="shrink-0">
                          {getFileIcon(f.name) || <FileText className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                        </span>
                        <span className="text-white truncate text-[12px]">
                          {renderHighlightedText(f.name, query)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* 2. Matching Document Contents (.docx, .xlsx, .pptx, .pdf, .md, .txt) */}
            {contentGroups.length > 0 && (
              <div>
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center justify-between">
                  <span>Document Contents</span>
                  <span className="font-mono">{totalContentMatches}</span>
                </div>
                {contentGroups.map((group) => {
                  const isCollapsed = Boolean(collapsedFiles[group.filePath]);
                  return (
                    <div key={group.filePath} className="mb-0.5">
                      <button
                        type="button"
                        onClick={() => toggleFileCollapse(group.filePath)}
                        className="w-full flex items-center justify-between px-2.5 py-1 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-1">
                          {isCollapsed ? (
                            <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                          )}
                          <span className="shrink-0">
                            {getFileIcon(group.fileName) || (
                              <FileText className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                            )}
                          </span>
                          <span
                            className="text-xs font-medium text-white truncate"
                            title={group.filePath}
                          >
                            {group.fileName}
                          </span>
                        </div>
                        <span className="px-1.5 py-0.2 rounded-full bg-[var(--bg-hover)] border border-[var(--border-strong)] text-[10px] font-mono text-white shrink-0">
                          {group.lines.length}
                        </span>
                      </button>

                      {!isCollapsed && (
                        <div className="pl-6 pr-2 py-0.5 space-y-0.5">
                          {group.lines.map((line, idx) => (
                            <button
                              key={`${group.filePath}-${line.lineNumber}-${idx}`}
                              type="button"
                              onClick={() => onOpenFileTab(group.filePath, group.fileName)}
                              className="w-full flex items-baseline gap-2 px-2 py-1 rounded hover:bg-[var(--bg-hover)] transition-colors cursor-pointer text-left font-mono text-[11px]"
                              title={line.text}
                            >
                              <span className="text-[10px] text-[var(--text-muted)] shrink-0 select-none">
                                {line.lineNumber}:
                              </span>
                              <span className="text-neutral-300 truncate flex-1">
                                {renderHighlightedText(line.text, query)}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!isSearching && matchingFiles.length === 0 && contentGroups.length === 0 && (
              <div className="flex flex-col items-center justify-center p-6 text-center text-[var(--text-muted)]">
                <p className="text-xs font-semibold text-white mb-1">No results found</p>
                <p className="text-[11px] leading-relaxed max-w-[200px]">
                  No files or document text matched "{query.trim()}".
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
});
