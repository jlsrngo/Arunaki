import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { toggleStoredWordWrap } from "../../../../lib/wordWrap";

interface UseAppCommandsOptions {
  onOpenFolder?: () => void;
  onCloseFolder?: () => void;
  onOpenShortcuts?: () => void;
  onOpenAbout?: () => void;
}

export function useAppCommands({
  onOpenFolder,
  onCloseFolder,
  onOpenShortcuts,
  onOpenAbout,
}: UseAppCommandsOptions = {}) {
  const navigate = useNavigate();

  const undo = useCallback(() => {
    document.execCommand("undo");
  }, []);

  const redo = useCallback(() => {
    document.execCommand("redo");
  }, []);

  const cut = useCallback(() => {
    document.execCommand("cut");
  }, []);

  const copy = useCallback(() => {
    document.execCommand("copy");
  }, []);

  const paste = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text !== undefined) {
          document.execCommand("insertText", false, text);
          return;
        }
      }
      document.execCommand("paste");
    } catch {
      document.execCommand("paste");
    }
  }, []);

  const selectAll = useCallback(() => {
    document.execCommand("selectAll");
  }, []);

  const newSession = useCallback(() => {
    window.dispatchEvent(new CustomEvent("arunaki-new-chat"));
  }, []);

  const saveFile = useCallback(() => {
    window.dispatchEvent(new CustomEvent("arunaki-save-file"));
  }, []);

  const findSession = useCallback(() => {
    window.dispatchEvent(new CustomEvent("arunaki-search-session"));
  }, []);

  const toggleExplorer = useCallback(() => {
    window.dispatchEvent(new CustomEvent("arunaki-toggle-explorer"));
  }, []);

  const toggleChat = useCallback(() => {
    window.dispatchEvent(new CustomEvent("arunaki-toggle-chat"));
  }, []);

  const toggleWordWrap = useCallback(() => {
    toggleStoredWordWrap();
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const resetZoom = useCallback(() => {
    const desktop = typeof window !== "undefined" ? (window as any).arunakiDesktop : null;
    if (desktop?.resetZoom) {
      void desktop.resetZoom();
    }
  }, []);

  const backupWorkspace = useCallback(async () => {
    const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
    if (desktop?.backupFolder) {
      try {
        const res = await desktop.backupFolder();
        if (res?.success) {
          toast.success(`Backup created: ${res.path}`);
        } else {
          toast.error(res?.error || "Failed to create backup");
        }
      } catch (err: any) {
        toast.error(err?.message || "Backup failed");
      }
    } else {
      toast.info("Workspace backup is active in Desktop mode.");
    }
  }, []);

  const exitApp = useCallback(() => {
    const desktop = typeof window !== "undefined" ? (window as any).arunakiDesktop : undefined;
    if (desktop?.quit) {
      desktop.quit().catch(() => window.close());
      return;
    }
    if (typeof window !== "undefined" && window.close) {
      window.close();
    }
  }, []);

  const openSettings = useCallback(() => {
    navigate("/settings");
  }, [navigate]);

  const openKnowledge = useCallback(() => {
    navigate("/knowledge");
  }, [navigate]);

  return {
    undo,
    redo,
    cut,
    copy,
    paste,
    selectAll,
    newSession,
    saveFile,
    findSession,
    toggleExplorer,
    toggleChat,
    toggleWordWrap,
    toggleFullscreen,
    resetZoom,
    backupWorkspace,
    exitApp,
    openSettings,
    openKnowledge,
    openFolder: onOpenFolder,
    closeFolder: onCloseFolder,
    openShortcuts: onOpenShortcuts,
    openAbout: onOpenAbout,
  };
}

export type AppCommands = ReturnType<typeof useAppCommands>;
