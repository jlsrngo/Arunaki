import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { engineFetch } from "../../../lib/engine";
import { WorkspaceFile } from "../chat/types";

interface UseWorkstationFilesOptions {
  activeFolder: string;
}

export function useWorkstationFiles({ activeFolder }: UseWorkstationFilesOptions) {
  const { data: workspaceFiles = [], refetch: queryRefetchFiles } = useQuery<WorkspaceFile[]>({
    queryKey: ["folder-files", activeFolder],
    queryFn: async () => {
      if (!activeFolder) return [];
      // "path" is relative to the instance directory, and "." is the folder root.
      const res = await engineFetch(
        `/file?directory=${encodeURIComponent(activeFolder)}&path=${encodeURIComponent(".")}`
      );
      if (!res.ok) throw new Error(`file list failed: HTTP ${res.status}`);
      const json = await res.json();
      const entries: Array<{ name: string; path: string; type: string }> =
        json.data || json || [];
      return entries
        .filter((e) => e && e.type !== "directory")
        .map((e) => ({
          id: e.path,
          name: e.name,
          path: e.path,
          type: "file",
          size: 0,
        }));
    },
    enabled: !!activeFolder,
  });

  const refetchFiles = useCallback(() => {
    window.dispatchEvent(new Event("arunaki-refresh-explorer"));
    return queryRefetchFiles();
  }, [queryRefetchFiles]);

  const [nativeFileNames, setNativeFileNames] = useState<string[]>([]);

  const mentionFiles = useMemo(
    () =>
      Array.from(
        new Set([...workspaceFiles.map((f) => f.name), ...nativeFileNames])
      ).map((name) => ({ name })),
    [workspaceFiles, nativeFileNames]
  );

  return {
    workspaceFiles,
    refetchFiles,
    nativeFileNames,
    setNativeFileNames,
    mentionFiles,
  };
}
