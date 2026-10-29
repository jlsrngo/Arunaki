import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Search, FileText, FolderOpen, CornerDownLeft, X } from "lucide-react";
import { engineFetch } from "../../lib/engine";
import { getFileIcon } from "../workspace/tree-utils";
import { CenterTab } from "./tabs/types";
import { cn } from "../../lib/utils";

interface WorkspaceFileItem {
  name: string;
  path?: string;
  size?: number | string;
}

interface QuickOpenEntry {
  key: string;
  name: string;
  path: string;
  dirPath: string;
  extLabel: string;
  sizeLabel?: string;
  isRecent: boolean;
  tabId?: string;
}

interface QuickOpenFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeFolder: string;
  workspaceFiles: WorkspaceFileItem[];
  tabs: CenterTab[];
  onOpenFileTab: (filePath: string, fileName: string) => void;
  onSelectTab?: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void;
}

function formatFileSize(size?: number | string): string | undefined {
  if (size === undefined || size === null) return undefined;
  if (typeof size === "string") return size;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getExtBadge(name: string): string {
  const parts = name.split(".");
  if (parts.length < 2) return "FILE";
  return parts[parts.length - 1].toUpperCase().slice(0, 6);
}

export function QuickOpenFileModal({
  isOpen,
  onClose,
  activeFolder,
  workspaceFiles = [],
  tabs = [],
  onOpenFileTab,
  onSelectTab,
  onCloseTab,
}: QuickOpenFileModalProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [indexedFiles, setIndexedFiles] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const folderName = useMemo(() => {
    if (!activeFolder) return "";
    const clean = activeFolder.replace(/\\/g, "/").replace(/\/+$/, "");
    return clean.split("/").pop() || clean;
  }, [activeFolder]);

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setSelectedIndex(0);
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 15);
    return () => clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !activeFolder) return;
    let cancelled = false;
    engineFetch(`/api/find/file?directory=${encodeURIComponent(activeFolder)}&limit=300`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (cancelled) return;
        const arr: string[] = Array.isArray(data) ? data : data?.data || [];
        setIndexedFiles(arr.filter((p) => typeof p === "string" && p.trim().length > 0));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeFolder]);

  const entries = useMemo<QuickOpenEntry[]>(() => {
    const rawSearch = query.trim().toLowerCase();
    const seenPaths = new Set<string>();
    const recentList: QuickOpenEntry[] = [];
    const fileList: QuickOpenEntry[] = [];

    const sizeLookup = new Map<string, string>();
    for (const wf of workspaceFiles) {
      const formatted = formatFileSize(wf.size);
      if (formatted) {
        sizeLookup.set((wf.path || wf.name).replace(/\\/g, "/").toLowerCase(), formatted);
        sizeLookup.set(wf.name.toLowerCase(), formatted);
      }
    }

    const normalizeRel = (rawPath: string) => {
      const norm = rawPath.replace(/\\/g, "/");
      const folderNorm = (activeFolder || "").replace(/\\/g, "/").replace(/\/+$/, "");
      if (folderNorm && norm.toLowerCase().startsWith(folderNorm.toLowerCase() + "/")) {
        return norm.slice(folderNorm.length + 1);
      }
      return norm;
    };

    const getDirPart = (relPath: string, fileName: string) => {
      const norm = relPath.replace(/\\/g, "/");
      if (norm === fileName || !norm.includes("/")) return "";
      return norm.slice(0, norm.length - fileName.length - 1);
    };

    // 1. Open / Recent tabs first
    for (let i = tabs.length - 1; i >= 0; i--) {
      const t = tabs[i];
      if (t.type === "diff") continue;
      const rel = normalizeRel(t.path || t.title);
      const name = t.title || rel.split("/").pop() || rel;
      const normKey = rel.toLowerCase();
      if (seenPaths.has(normKey)) continue;
      seenPaths.add(normKey);
      recentList.push({
        key: `recent-${t.id}`,
        name,
        path: t.path || t.title,
        dirPath: getDirPart(rel, name),
        extLabel: getExtBadge(name),
        sizeLabel: sizeLookup.get(normKey) || sizeLookup.get(name.toLowerCase()),
        isRecent: true,
        tabId: t.id,
      });
    }

    // 2. Active folder files from workspaceFiles
    for (const f of workspaceFiles) {
      const rel = normalizeRel(f.path || f.name);
      const normKey = rel.toLowerCase();
      if (seenPaths.has(normKey)) continue;
      seenPaths.add(normKey);
      fileList.push({
        key: `ws-${rel}`,
        name: f.name,
        path: f.path || f.name,
        dirPath: getDirPart(rel, f.name),
        extLabel: getExtBadge(f.name),
        sizeLabel: formatFileSize(f.size),
        isRecent: false,
      });
    }

    // 3. Recursive files from /api/find/file
    for (const relRaw of indexedFiles) {
      const rel = normalizeRel(relRaw);
      const normKey = rel.toLowerCase();
      if (seenPaths.has(normKey)) continue;
      seenPaths.add(normKey);
      const name = rel.split("/").pop() || rel;
      fileList.push({
        key: `idx-${rel}`,
        name,
        path: rel,
        dirPath: getDirPart(rel, name),
        extLabel: getExtBadge(name),
        sizeLabel: sizeLookup.get(normKey) || sizeLookup.get(name.toLowerCase()),
        isRecent: false,
      });
    }

    const combined = [...recentList, ...fileList];
    if (!rawSearch) {
      return combined.slice(0, 60);
    }

    return combined
      .filter(
        (item) =>
          item.name.toLowerCase().includes(rawSearch) ||
          item.dirPath.toLowerCase().includes(rawSearch) ||
          item.path.toLowerCase().includes(rawSearch)
      )
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(rawSearch) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(rawSearch) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        if (a.isRecent !== b.isRecent) return a.isRecent ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 60);
  }, [query, tabs, workspaceFiles, indexedFiles, activeFolder]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const activeEl = container.querySelector(`[data-quick-idx="${selectedIndex}"]`) as HTMLElement | null;
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const handleSelectEntry = useCallback(
    (entry: QuickOpenEntry) => {
      if (entry.tabId && onSelectTab) {
        onSelectTab(entry.tabId);
      } else {
        onOpenFileTab(entry.path, entry.name);
      }
      onClose();
    },
    [onSelectTab, onOpenFileTab, onClose]
  );

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (entries.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % entries.length);
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (entries.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + entries.length) % entries.length);
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const chosen = entries[selectedIndex];
      if (chosen) {
        handleSelectEntry(chosen);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh] transform-gpu"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Search Input Bar */}
        <div className="px-4 py-3.5 border-b border-[var(--border-color)] flex items-center gap-3 bg-[var(--bg-panel)] shrink-0">
          <Search className="w-4 h-4 text-[#cf6613] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search documents & files by name..."
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] focus:outline-none font-sans"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              title="Clear search"
              className="text-[var(--text-dim)] hover:text-[var(--text-primary)] p-1 rounded-md hover:bg-[var(--bg-hover)] transition-colors cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {folderName && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--bg-hover)] border border-[var(--border-color)] text-[10px] font-mono text-[var(--text-muted)] shrink-0 max-w-[140px] truncate">
              <FolderOpen className="w-3 h-3 text-[#cf6613] shrink-0" />
              <span className="truncate">{folderName}</span>
            </span>
          )}
        </div>

        {/* File Results List */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto p-2 space-y-1 min-h-[240px] max-h-[380px] overscroll-contain custom-scrollbar"
        >
          {entries.length === 0 ? (
            <div className="h-[220px] flex flex-col items-center justify-center text-center px-4 gap-2">
              <div className="w-9 h-9 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-color)] flex items-center justify-center text-[var(--text-dim)]">
                <FileText className="w-4 h-4" />
              </div>
              <p className="text-xs font-medium text-[var(--text-muted)]">
                {activeFolder
                  ? `No documents matching "${query}"`
                  : "No active project folder connected"}
              </p>
              <p className="text-[11px] text-[var(--text-dim)]">
                {activeFolder
                  ? "Try typing a partial document name (.docx, .xlsx, .pdf, .txt)"
                  : "Open a project folder first to search and launch documents"}
              </p>
            </div>
          ) : (
            entries.map((entry, idx) => {
              const isSelected = idx === selectedIndex;

              return (
                <div
                  key={entry.key}
                  data-quick-idx={idx}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => handleSelectEntry(entry)}
                  className={cn(
                    "group relative w-full py-2.5 px-3 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-colors border",
                    isSelected
                      ? "bg-[var(--bg-hover)] border-[var(--border-strong)] text-[var(--text-primary)]"
                      : "bg-transparent border-transparent text-[var(--text-muted)] hover:bg-[var(--bg-hover)]/60"
                  )}
                >
                  {/* Active Left Pill Indicator */}
                  {isSelected && (
                    <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-[#cf6613]" />
                  )}

                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={cn(
                        "w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 transition-colors",
                        isSelected
                          ? "bg-[var(--bg-card)] border-[var(--border-strong)]"
                          : "bg-[var(--bg-panel)] border-[var(--border-color)]"
                      )}
                    >
                      {getFileIcon(entry.name) || (
                        <FileText className="w-4 h-4 text-[var(--text-muted)]" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={cn(
                            "text-xs font-medium truncate",
                            isSelected ? "text-[var(--text-primary)]" : "text-[var(--text-primary)]/90"
                          )}
                        >
                          {entry.name}
                        </span>
                        {entry.isRecent && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase tracking-wider bg-[#cf6613]/15 text-[#cf6613] border border-[#cf6613]/30 shrink-0">
                            Open Tab
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--text-dim)] font-mono truncate">
                        <span className="truncate">
                          {entry.dirPath ? entry.dirPath : folderName || "Workspace root"}
                        </span>
                        {entry.sizeLabel && (
                          <>
                            <span>•</span>
                            <span className="shrink-0">{entry.sizeLabel}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Action / Extension Badge */}
                  <div className="flex items-center gap-2 shrink-0">
                    {entry.tabId && onCloseTab && (
                      <button
                        type="button"
                        title="Close open tab"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCloseTab(entry.tabId!);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-all cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--bg-panel)] border border-[var(--border-color)] text-[var(--text-dim)]">
                      {entry.extLabel}
                    </span>
                    {isSelected && (
                      <CornerDownLeft className="w-3.5 h-3.5 text-[#cf6613] shrink-0" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Keyboard Navigation Bar */}
        <div className="px-4 py-2.5 border-t border-[var(--border-color)] bg-[var(--bg-panel)] flex items-center justify-between text-[11px] text-[var(--text-dim)] shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <kbd className="font-mono text-[10px] bg-[var(--bg-hover)] text-[var(--text-muted)] border border-[var(--border-color)] px-1.5 py-0.5 rounded">
                ↑↓
              </kbd>
              <span>Navigate</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="font-mono text-[10px] bg-[var(--bg-hover)] text-[var(--text-muted)] border border-[var(--border-color)] px-1.5 py-0.5 rounded">
                Enter
              </kbd>
              <span>Open</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-[var(--text-dim)]">
              {entries.length} {entries.length === 1 ? "document" : "documents"}
            </span>
            <kbd className="font-mono text-[10px] bg-[var(--bg-hover)] text-[var(--text-muted)] border border-[var(--border-color)] px-1.5 py-0.5 rounded">
              ESC to close
            </kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
