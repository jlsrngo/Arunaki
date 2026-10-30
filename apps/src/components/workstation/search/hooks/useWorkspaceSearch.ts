import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { engineFetch } from "../../../../lib/engine";

export interface WorkspaceFileItem {
  name: string;
  path?: string;
  size?: number | string;
}

export interface ContentMatchLine {
  lineNumber: number;
  text: string;
}

export interface GroupedContentMatch {
  filePath: string;
  fileName: string;
  lines: ContentMatchLine[];
}

interface UseWorkspaceSearchOptions {
  activeFolder: string;
  workspaceFiles: WorkspaceFileItem[];
}

export function useWorkspaceSearch({
  activeFolder,
  workspaceFiles = [],
}: UseWorkspaceSearchOptions) {
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

  return {
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
  };
}

