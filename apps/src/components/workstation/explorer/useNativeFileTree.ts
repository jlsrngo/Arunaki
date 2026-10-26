import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { NativeNode } from "../../workspace/tree-utils";
import { Workspace, LoadState } from "./types";

export const flattenFileNames = (nodes: NativeNode[]): string[] => {
  const out: string[] = [];
  const walk = (list: NativeNode[]) => {
    for (const n of list) {
      if (n.type === "file") out.push(n.name);
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  return out;
};

interface UseNativeFileTreeProps {
  activeWorkspace: Workspace | null;
  onOpenFileTab: (path: string, name: string, content?: string) => void;
  onNativeFilesChange?: (names: string[]) => void;
}

export function useNativeFileTree({
  activeWorkspace,
  onOpenFileTab,
  onNativeFilesChange,
}: UseNativeFileTreeProps) {
  const [nativeTree, setNativeTree] = useState<NativeNode[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastLoadedPath = useRef<string | null>(null);

  const loadNativeTree = useCallback(async (rootPath: string, force = false) => {
    const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;

    if (!desktop?.getFolderTree) {
      setLoadState("done");
      return;
    }

    if (!force && lastLoadedPath.current === rootPath) return;

    setLoadState("loading");

    try {
      const result = await desktop.getFolderTree(rootPath);
      if (result?.tree && Array.isArray(result.tree)) {
        setNativeTree(result.tree as NativeNode[]);
        lastLoadedPath.current = rootPath;
        setLoadState("done");
      } else {
        setNativeTree([]);
        setLoadState("error");
      }
    } catch (err: any) {
      console.error("[Explorer] getFolderTree error:", err);
      setNativeTree([]);
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    if (!activeWorkspace?.rootPath) {
      setNativeTree([]);
      setLoadState("idle");
      lastLoadedPath.current = null;
      return;
    }
    loadNativeTree(activeWorkspace.rootPath);
  }, [activeWorkspace?.rootPath, loadNativeTree]);

  useEffect(() => {
    const onExternalRefresh = () => {
      if (activeWorkspace?.rootPath) {
        void loadNativeTree(activeWorkspace.rootPath, true);
      }
    };
    window.addEventListener("arunaki-refresh-explorer", onExternalRefresh);
    return () => window.removeEventListener("arunaki-refresh-explorer", onExternalRefresh);
  }, [activeWorkspace?.rootPath, loadNativeTree]);

  useEffect(() => {
    onNativeFilesChange?.(flattenFileNames(nativeTree));
  }, [nativeTree, onNativeFilesChange]);

  const handleRefresh = useCallback(async () => {
    if (!activeWorkspace?.rootPath || isRefreshing) return;
    setIsRefreshing(true);
    await loadNativeTree(activeWorkspace.rootPath, true);
    setIsRefreshing(false);
  }, [activeWorkspace?.rootPath, isRefreshing, loadNativeTree]);

  const handleRenamePath = useCallback(
    async (oldPath: string, oldName: string, newName: string) => {
      if (!newName || newName.trim() === oldName) return;
      const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
      if (desktop?.renamePath) {
        const lastSlash = Math.max(oldPath.lastIndexOf("\\"), oldPath.lastIndexOf("/"));
        const parentDir = lastSlash !== -1 ? oldPath.substring(0, lastSlash) : "";
        const separator = oldPath.includes("\\") ? "\\" : "/";
        const newPath = parentDir ? `${parentDir}${separator}${newName.trim()}` : newName.trim();
        try {
          const res = await desktop.renamePath(oldPath, newPath);
          if (res?.success) {
            toast.success(`Renamed to "${newName.trim()}"`);
            handleRefresh();
          } else {
            toast.error(res?.error || "Failed to rename");
          }
        } catch (err: any) {
          toast.error(`Rename failed: ${err.message}`);
        }
      }
    },
    [handleRefresh]
  );

  const [deleteTarget, setDeleteTarget] = useState<{ path: string; name: string } | null>(null);

  const handleDeletePath = useCallback((targetPath: string, targetName: string) => {
    setDeleteTarget({ path: targetPath, name: targetName });
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const { path: targetPath, name: targetName } = deleteTarget;
    setDeleteTarget(null);
    const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
    if (desktop?.deletePath) {
      try {
        const res = await desktop.deletePath(targetPath);
        if (res?.success) {
          toast.success(`Deleted "${targetName}"`);
          handleRefresh();
        } else {
          toast.error(res?.error || "Failed to delete");
        }
      } catch (err: any) {
        toast.error(`Delete failed: ${err.message}`);
      }
    }
  }, [deleteTarget, handleRefresh]);

  const handleCreateFile = useCallback(
    async (fileName: string) => {
      if (!fileName || !fileName.trim() || !activeWorkspace?.rootPath) return;
      const cleanName = fileName.trim();
      const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
      const separator = activeWorkspace.rootPath.includes("\\") ? "\\" : "/";
      const fullPath = `${activeWorkspace.rootPath}${separator}${cleanName}`;

      if (desktop?.writeFile) {
        try {
          const res = await desktop.writeFile(fullPath, "");
          if (res?.success) {
            toast.success(`Created file "${cleanName}"`);
            await handleRefresh();
            onOpenFileTab(fullPath, cleanName, "");
          } else {
            toast.error(res?.error || "Failed to create file");
          }
        } catch (err: any) {
          toast.error(`Create file failed: ${err.message}`);
        }
      } else {
        toast.info("File creation requires the desktop app");
      }
    },
    [activeWorkspace, handleRefresh, onOpenFileTab]
  );

  const handleCreateFolder = useCallback(
    async (folderName: string) => {
      if (!folderName || !folderName.trim() || !activeWorkspace?.rootPath) return;
      const cleanName = folderName.trim();
      const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
      const separator = activeWorkspace.rootPath.includes("\\") ? "\\" : "/";
      const fullPath = `${activeWorkspace.rootPath}${separator}${cleanName}`;

      if (desktop?.createFolder) {
        try {
          const res = await desktop.createFolder(fullPath);
          if (res?.success) {
            toast.success(`Created folder "${cleanName}"`);
            await handleRefresh();
          } else {
            toast.error(res?.error || "Failed to create folder");
          }
        } catch (err: any) {
          toast.error(`Create folder failed: ${err.message}`);
        }
      }
    },
    [activeWorkspace, handleRefresh]
  );

  return {
    nativeTree,
    loadState,
    isRefreshing,
    handleRefresh,
    handleRenamePath,
    handleDeletePath,
    deleteTarget,
    setDeleteTarget,
    confirmDelete,
    handleCreateFile,
    handleCreateFolder,
  };
}
