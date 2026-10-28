import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { engineFetch } from "../../../lib/engine";
import { computeLineDiff } from "../tabs/diffUtils";
import { DocumentChangeItem } from "../explorer/ExplorerSourceControl";
import { CenterTab } from "../tabs/types";

interface UseDocumentChangesOptions {
  activeFolder: string;
  tabs?: CenterTab[];
  setTabs?: React.Dispatch<React.SetStateAction<CenterTab[]>>;
  setActiveTabId?: (id: string | null) => void;
  onOpenDiffTab?: (file: { path: string; name: string; beforeContent: string; afterContent: string }) => void;
  onFileReverted?: (filePath: string, restoredContent: string) => void;
  refetchFiles?: () => void;
}

export function useDocumentChanges({
  activeFolder,
  tabs,
  setTabs,
  setActiveTabId,
  onOpenDiffTab,
  onFileReverted,
  refetchFiles,
}: UseDocumentChangesOptions) {
  const [changes, setChanges] = useState<DocumentChangeItem[]>([]);
  const isRefreshingRef = useRef(false);

  const fetchChanges = useCallback(async () => {
    if (!activeFolder || isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    try {
      const res = await engineFetch(`/api/file/status?directory=${encodeURIComponent(activeFolder)}`);
      if (res.ok) {
        const json = await res.json();
        const rawItems: any[] = json.data || [];
        const mapped: DocumentChangeItem[] = rawItems
          .filter((item: any) => {
            const p = String(item.path || "").replace(/\\/g, "/");
            const n = String(item.name || "");
            if (!p || p.startsWith(".") || p.startsWith("~$") || p.includes("/.") || p.includes("/~$")) {
              return false;
            }
            if (n.startsWith(".") || n.startsWith("~$")) {
              return false;
            }
            if (/\.(py|ps1|sh|bat|cmd|bak|tmp)$/i.test(n)) {
              return false;
            }
            return true;
          })
          .map((item: any) => {
            const before = item.before ?? item.before_content ?? "";
            const after = item.after ?? item.after_content ?? "";
            const diffLines = computeLineDiff(before, after);
            const added = diffLines.filter((l) => l.type === "added").length;
            const deleted = diffLines.filter((l) => l.type === "deleted").length;
            const isNew = item.status === "new" || item.status === "added" || (!before && after.length > 0);

            return {
              filePath: item.path,
              fileName: item.name,
              beforeContent: before,
              afterContent: after,
              addedCount: added,
              deletedCount: deleted,
              status: isNew ? "new" : (item.status || "modified"),
            };
          })
          .filter((item) => item.beforeContent !== item.afterContent && (item.addedCount > 0 || item.deletedCount > 0));
        setChanges(mapped);
      }
    } catch {
      // Ignore background status polling errors
    } finally {
      isRefreshingRef.current = false;
    }
  }, [activeFolder]);

  // Initial load and periodic refresh
  useEffect(() => {
    fetchChanges();
    const interval = setInterval(fetchChanges, 3000);
    return () => clearInterval(interval);
  }, [fetchChanges]);

  // Handle SSE file.edited events
  useEffect(() => {
    const handleFileEdited = () => {
      fetchChanges();
    };
    window.addEventListener("arunaki:file.edited", handleFileEdited);
    return () => window.removeEventListener("arunaki:file.edited", handleFileEdited);
  }, [fetchChanges]);

  // Live buffer integration: merge in-memory edited tabs with disk changes
  const combinedChanges = useMemo(() => {
    const list = [...changes];
    if (tabs && tabs.length > 0) {
      for (const tab of tabs) {
        if (
          tab.type === "file" &&
          tab.originalContent !== undefined &&
          tab.content !== undefined &&
          tab.content !== tab.originalContent
        ) {
          const filePath = tab.path || tab.title;
          const diffLines = computeLineDiff(tab.originalContent, tab.content);
          const added = diffLines.filter((l) => l.type === "added").length;
          const deleted = diffLines.filter((l) => l.type === "deleted").length;
          if (added > 0 || deleted > 0) {
            const existingIdx = list.findIndex(
              (c) => c.filePath === filePath || c.fileName === tab.title
            );
            const isNew = (!tab.originalContent || tab.originalContent.length === 0) && (tab.content?.length ?? 0) > 0;
            const liveItem: DocumentChangeItem = {
              filePath,
              fileName: tab.title,
              beforeContent: tab.originalContent,
              afterContent: tab.content,
              addedCount: added,
              deletedCount: deleted,
              status: isNew ? "new" : "modified",
            };
            if (existingIdx >= 0) {
              list[existingIdx] = liveItem;
            } else {
              list.unshift(liveItem);
            }
          }
        }
      }
    }
    return list;
  }, [changes, tabs]);

  const handleOpenDiff = useCallback(
    (item: DocumentChangeItem) => {
      if (onOpenDiffTab) {
        onOpenDiffTab({
          path: item.filePath,
          name: item.fileName,
          beforeContent: item.beforeContent,
          afterContent: item.afterContent,
        });
      }
    },
    [onOpenDiffTab]
  );

  const syncTabsAfterResolve = useCallback(
    (item: DocumentChangeItem, resolvedContent: string) => {
      const targetName = (item.fileName || item.filePath.split(/[/\\]/).pop() || item.filePath).toLowerCase();
      const targetPath = item.filePath.replace(/\\/g, "/").toLowerCase();

      if (setTabs) {
        let fallbackTabId: string | null = null;
        setTabs((prev) => {
          const next: CenterTab[] = [];
          for (const t of prev) {
            const tPath = (t.path || "").replace(/\\/g, "/").toLowerCase();
            const tName = (t.title || "").toLowerCase();
            const isMatch =
              tPath === targetPath ||
              tPath.endsWith(`/${targetName}`) ||
              tName === targetName ||
              tName === `${targetName} (working tree)`;

            if (t.type === "diff" && isMatch) {
              continue;
            }
            if (t.type === "file" && isMatch) {
              fallbackTabId = t.id;
              const finalContent = resolvedContent || t.content || "";
              next.push({
                ...t,
                content: finalContent,
                originalContent: finalContent,
              });
              continue;
            }
            next.push(t);
          }
          if (!fallbackTabId && next.length > 0) {
            fallbackTabId = next[next.length - 1].id;
          }
          return next;
        });
        if (setActiveTabId && fallbackTabId) {
          setActiveTabId(fallbackTabId);
        }
      }

      window.dispatchEvent(
        new CustomEvent("arunaki:diff-cleared", {
          detail: { filePath: item.filePath, fileName: item.fileName, content: resolvedContent },
        })
      );
    },
    [setTabs, setActiveTabId]
  );

  const handleRevertChange = useCallback(
    async (item: DocumentChangeItem) => {
      try {
        const res = await engineFetch(
          `/api/file/revert?directory=${encodeURIComponent(activeFolder)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: item.filePath, beforeContent: item.beforeContent }),
          }
        );

        if (res.ok) {
          toast.success(`Reverted ${item.fileName}`);
          onFileReverted?.(item.filePath, item.beforeContent);
          syncTabsAfterResolve(item, item.beforeContent);
          setChanges((prev) =>
            prev.filter((c) => c.filePath !== item.filePath && c.fileName !== item.fileName)
          );
          refetchFiles?.();
        } else {
          const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
          if (desktop?.writeFile) {
            const fullPath =
              item.filePath.includes(":") || item.filePath.startsWith("/") || item.filePath.startsWith("\\")
                ? item.filePath
                : `${activeFolder}\\${item.filePath}`;
            await desktop.writeFile(fullPath, item.beforeContent);
            toast.success(`Reverted ${item.fileName}`);
            onFileReverted?.(item.filePath, item.beforeContent);
            syncTabsAfterResolve(item, item.beforeContent);
            setChanges((prev) =>
              prev.filter((c) => c.filePath !== item.filePath && c.fileName !== item.fileName)
            );
            refetchFiles?.();
          } else {
            toast.error(`Failed to revert ${item.fileName}`);
          }
        }
      } catch (err: any) {
        toast.error(`Failed to revert: ${err?.message || err}`);
      }
    },
    [activeFolder, onFileReverted, refetchFiles, syncTabsAfterResolve]
  );

  const handleAcceptChange = useCallback(
    async (item: DocumentChangeItem) => {
      try {
        await engineFetch(
          `/api/file/accept?directory=${encodeURIComponent(activeFolder)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: item.filePath, content: item.afterContent }),
          }
        );
        toast.success(`Saved changes for ${item.fileName}`);
        syncTabsAfterResolve(item, item.afterContent);
        setChanges((prev) =>
          prev.filter((c) => c.filePath !== item.filePath && c.fileName !== item.fileName)
        );
        refetchFiles?.();
      } catch (err: any) {
        toast.error(`Failed to save: ${err?.message || err}`);
      }
    },
    [activeFolder, refetchFiles, syncTabsAfterResolve]
  );

  const handleRevertDiff = useCallback(
    async (filePath: string) => {
      const item = combinedChanges.find((c) => c.filePath === filePath);
      if (item) {
        await handleRevertChange(item);
      } else {
        await handleRevertChange({
          filePath,
          fileName: filePath.split(/[/\\]/).pop() || filePath,
          beforeContent: "",
          afterContent: "",
          addedCount: 0,
          deletedCount: 0,
        });
      }
    },
    [combinedChanges, handleRevertChange]
  );

  const handleAcceptDiff = useCallback(
    async (filePath: string) => {
      const item = combinedChanges.find((c) => c.filePath === filePath);
      if (item) {
        await handleAcceptChange(item);
      } else {
        await handleAcceptChange({
          filePath,
          fileName: filePath.split(/[/\\]/).pop() || filePath,
          beforeContent: "",
          afterContent: "",
          addedCount: 0,
          deletedCount: 0,
        });
      }
    },
    [combinedChanges, handleAcceptChange]
  );

  return {
    changes: combinedChanges,
    fetchChanges,
    handleOpenDiff,
    handleRevertChange,
    handleAcceptChange,
    handleRevertDiff,
    handleAcceptDiff,
  };
}
