import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { FileText, X } from "lucide-react";
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
    const rawSearch = query.split(":")[0].split("@")[0].trim().toLowerCase();
    const seenPaths = new Set<string>();
    const recentList: QuickOpenEntry[] = [];
    const fileList: QuickOpenEntry[] = [];

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
      return norm.slice(0, norm.length - fileName.length - 1).replace(/\//g, "\\");
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
      className="fixed inset-0 z-[130] flex items-start justify-center pt-[6vh] bg-black/45 select-none"
      onClick={onClose}
    >
      <div
        className="w-[620px] max-w-[92vw] bg-[#181818] border border-[#333333] rounded-md shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Search Input Box */}
        <div className="p-2 border-b border-[#2a2a2a] bg-[#181818]">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search files by name (append : to go to line or @ to go to symbol)"
            className="w-full h-7 px-2.5 bg-[#222222] border border-[#007fd4] rounded-xs text-[13px] text-white placeholder-[#888888] focus:outline-none"
          />
        </div>

        {/* File Results List */}
        <div ref={listRef} className="max-h-[380px] overflow-y-auto py-1">
          {entries.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-[#888888]">
              {activeFolder
                ? "No matching files found in workspace"
                : "Open a workspace folder first to search files"}
            </div>
          ) : (
            entries.map((entry, idx) => {
              const isSelected = idx === selectedIndex;
              const isFirstRecent = idx === 0 && entry.isRecent;

              return (
                <div
                  key={entry.key}
                  data-quick-idx={idx}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => handleSelectEntry(entry)}
                  className={cn(
                    "h-7 px-3 flex items-center justify-between gap-2 cursor-pointer text-[13px] transition-colors",
                    isSelected ? "bg-[#04395e] text-white" : "text-[#cccccc] hover:bg-[#2a2d2e]"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                    <span className="shrink-0 flex items-center justify-center w-4 h-4">
                      {getFileIcon(entry.name) || (
                        <FileText className="w-3.5 h-3.5 text-[#888888]" />
                      )}
                    </span>
                    <span className="truncate font-normal text-white">{entry.name}</span>
                    {entry.dirPath && (
                      <span
                        className={cn(
                          "text-[11px] truncate ml-1",
                          isSelected ? "text-[#c0d8ec]" : "text-[#888888]"
                        )}
                      >
                        {entry.dirPath}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {entry.isRecent && entry.tabId && onCloseTab && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCloseTab(entry.tabId!);
                        }}
                        className={cn(
                          "p-0.5 rounded hover:bg-white/15 transition-opacity",
                          isSelected ? "opacity-90" : "opacity-0 group-hover:opacity-80"
                        )}
                        title="Close Tab"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {isFirstRecent && (
                      <span
                        className={cn(
                          "text-[11px]",
                          isSelected ? "text-[#c0d8ec]" : "text-[#888888]"
                        )}
                      >
                        recently opened
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
