import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { engineFetch, getSession, listSessions } from "../../../lib/engine";

export interface WorkspaceFolder {
  id: string;
  name: string;
  rootPath: string;
  status: string;
}

interface UseWorkstationSessionOptions {
  isWorkstationRoute: boolean;
}

export function useWorkstationSession({ isWorkstationRoute }: UseWorkstationSessionOptions) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlChatId = searchParams.get("chatId") || "";

  // 1. Active folder management (agent-per-folder architecture)
  const [activeFolder, setActiveFolder] = useState<string>(() => {
    return (
      searchParams.get("folder") ||
      localStorage.getItem("arunaki_active_folder") ||
      ""
    );
  });

  const activeFolderName = useMemo(() => {
    if (!activeFolder) return "";
    return activeFolder.split(/[\\/]/).filter(Boolean).pop() || activeFolder;
  }, [activeFolder]);

  const activeWorkspace = useMemo<WorkspaceFolder | null>(
    () =>
      activeFolder
        ? { id: "active-folder", name: activeFolderName, rootPath: activeFolder, status: "ready" }
        : null,
    [activeFolder, activeFolderName]
  );

  const [activeChatId, setActiveChatId] = useState<string>(() => {
    if (urlChatId && urlChatId.startsWith("ses_")) return urlChatId;
    const initialFolder =
      searchParams.get("folder") || localStorage.getItem("arunaki_active_folder") || "";
    if (initialFolder) {
      const folderChat = localStorage.getItem(`arunaki_active_chat_id_${initialFolder}`) || "";
      if (folderChat.startsWith("ses_")) return folderChat;
      // CRITICAL ISOLATION: Never fall back to another folder's global chat when a specific folder is open!
      return "";
    }
    const globalChat = localStorage.getItem("arunaki_active_chat_id") || "";
    return globalChat.startsWith("ses_") ? globalChat : "";
  });

  // Auto-connect to the active / most recent session in this folder if none is currently selected
  useEffect(() => {
    if (!activeFolder || activeChatId) return;
    let isCancelled = false;
    listSessions({ directory: activeFolder, limit: 1 })
      .then((sessions) => {
        if (isCancelled || !sessions || sessions.length === 0) return;
        const latest = sessions[0];
        if (latest && latest.id && latest.id.startsWith("ses_")) {
          setActiveChatId(latest.id);
          localStorage.setItem("arunaki_active_chat_id", latest.id);
          localStorage.setItem(`arunaki_active_chat_id_${activeFolder}`, latest.id);
        }
      })
      .catch(() => { });
    return () => {
      isCancelled = true;
    };
  }, [activeFolder, activeChatId]);

  // Folder-Session Isolation Guard: verify that active session belongs to activeFolder
  useEffect(() => {
    if (!activeChatId || !activeFolder) return;
    let isCancelled = false;
    getSession(activeChatId)
      .then((sess) => {
        if (isCancelled) return;
        const sessDir = (
          sess?.directory ||
          (sess as any)?.location?.directory ||
          ""
        )
          .toLowerCase()
          .replace(/\\/g, "/")
          .replace(/\/+/g, "/");
        const curDir = activeFolder.toLowerCase().replace(/\\/g, "/").replace(/\/+/g, "/");
        if (sessDir && curDir && sessDir !== curDir) {
          console.warn(
            `[useWorkstationSession] Isolation mismatch: Session ${activeChatId} (${sessDir}) does not belong to active folder (${curDir}). Resetting.`
          );
          setActiveChatId("");
          localStorage.removeItem("arunaki_active_chat_id");
        }
      })
      .catch(() => { });
    return () => {
      isCancelled = true;
    };
  }, [activeChatId, activeFolder]);

  const activeFolderRef = useRef(activeFolder);
  activeFolderRef.current = activeFolder;
  const activeChatIdRef = useRef(activeChatId);
  activeChatIdRef.current = activeChatId;

  const isUpdatingUrlFromStateRef = useRef(false);

  // 1. Open / Switch Active Folder with complete workspace isolation (Antigravity Parity)
  const openFolder = useCallback(
    (folderPath: string, preferredChatId?: string) => {
      const cleanPath = (folderPath || "").trim();
      if (!cleanPath) return;

      activeFolderRef.current = cleanPath;
      setActiveFolder(cleanPath);
      localStorage.setItem("arunaki_active_folder", cleanPath);

      // Workspace folder isolation: check if preferredChatId exists or if folder has existing session
      const savedFolderSession =
        localStorage.getItem(`arunaki_active_chat_id_${cleanPath}`) || "";
      const nextChatId =
        preferredChatId && preferredChatId.startsWith("ses_")
          ? preferredChatId
          : savedFolderSession.startsWith("ses_")
            ? savedFolderSession
            : "";

      activeChatIdRef.current = nextChatId;
      setActiveChatId(nextChatId);
      if (nextChatId) {
        localStorage.setItem("arunaki_active_chat_id", nextChatId);
        localStorage.setItem(`arunaki_active_chat_id_${cleanPath}`, nextChatId);
      } else {
        localStorage.removeItem("arunaki_active_chat_id");
      }

      isUpdatingUrlFromStateRef.current = true;
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("folder", cleanPath);
          if (nextChatId) {
            next.set("chatId", nextChatId);
          } else {
            next.delete("chatId");
          }
          if (next.has("openFolder")) {
            next.delete("openFolder");
          }
          return next;
        },
        { replace: true }
      );

      window.dispatchEvent(new Event("arunaki-folder-change"));
      window.dispatchEvent(new Event("arunaki-session-change"));
    },
    [setSearchParams]
  );

  // 2. Unidirectional Sync: State (activeFolder, activeChatId) -> URL & localStorage
  useEffect(() => {
    if (!isWorkstationRoute) return;

    if (activeFolder) {
      localStorage.setItem("arunaki_active_folder", activeFolder);
    }

    if (activeChatId && activeChatId.startsWith("ses_")) {
      localStorage.setItem("arunaki_active_chat_id", activeChatId);
      if (activeFolder) {
        localStorage.setItem(`arunaki_active_chat_id_${activeFolder}`, activeChatId);
        // Sync active session with messaging gateway so incoming Telegram prompts route directly into this desktop chat
        engineFetch("/api/messaging/active-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionID: activeChatId, directory: activeFolder }),
        }).catch(() => { });
      }
    } else {
      localStorage.removeItem("arunaki_active_chat_id");
      if (activeFolder) {
        localStorage.removeItem(`arunaki_active_chat_id_${activeFolder}`);
      }
    }

    const currentUrlFolder = searchParams.get("folder") || searchParams.get("openFolder") || "";
    const currentUrlChatId = searchParams.get("chatId") || "";

    // CRITICAL GUARD: If incoming URL carries a folder that hasn't synced into activeFolder state yet,
    // DO NOT wipe it out! Let Effect 3 (URL -> State) process it into state first.
    if (currentUrlFolder && currentUrlFolder !== activeFolder) {
      return;
    }

    const targetFolder = activeFolder || "";
    const targetChatId = activeChatId && activeChatId.startsWith("ses_") ? activeChatId : "";

    if (currentUrlFolder === targetFolder && currentUrlChatId === targetChatId) {
      return;
    }

    isUpdatingUrlFromStateRef.current = true;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (targetFolder) next.set("folder", targetFolder);
        else next.delete("folder");

        if (targetChatId) next.set("chatId", targetChatId);
        else next.delete("chatId");

        if (next.has("openFolder")) next.delete("openFolder");

        if (next.toString() === prev.toString()) return prev;
        return next;
      },
      { replace: true }
    );
  }, [isWorkstationRoute, activeFolder, activeChatId, searchParams, setSearchParams]);

  // 3. Unidirectional Sync: URL -> State (for browser history navigation or deep linking)
  useEffect(() => {
    if (!isWorkstationRoute) return;
    if (isUpdatingUrlFromStateRef.current) {
      isUpdatingUrlFromStateRef.current = false;
      return;
    }

    const targetFolder = searchParams.get("folder") || searchParams.get("openFolder") || "";
    const targetChatId = searchParams.get("chatId") || "";

    if (targetFolder && targetFolder !== activeFolderRef.current) {
      openFolder(targetFolder, targetChatId);
    } else if (targetChatId !== activeChatIdRef.current) {
      if (!targetChatId || targetChatId.startsWith("ses_")) {
        activeChatIdRef.current = targetChatId;
        setActiveChatId(targetChatId);
      }
    }
  }, [isWorkstationRoute, searchParams, openFolder]);

  // 4. External window event listeners for folder and session changes
  useEffect(() => {
    function handleFolderChange() {
      const saved = localStorage.getItem("arunaki_active_folder") || "";
      // CRITICAL: Compare with activeFolderRef.current to prevent synchronous recursion storm!
      if (saved && saved !== activeFolderRef.current) {
        const savedSession = localStorage.getItem("arunaki_active_chat_id") || "";
        openFolder(saved, savedSession);
      }
    }
    function handleSessionChange() {
      const saved = localStorage.getItem("arunaki_active_chat_id") || "";
      if (saved !== activeChatIdRef.current && (!saved || saved.startsWith("ses_"))) {
        activeChatIdRef.current = saved;
        setActiveChatId(saved);
      }
    }
    window.addEventListener("arunaki-folder-change", handleFolderChange);
    window.addEventListener("arunaki-session-change", handleSessionChange);
    return () => {
      window.removeEventListener("arunaki-folder-change", handleFolderChange);
      window.removeEventListener("arunaki-session-change", handleSessionChange);
    };
  }, [openFolder]);

  const handleCloseFolderAction = useCallback(() => {
    localStorage.removeItem("arunaki_active_folder");
    localStorage.removeItem("arunaki_active_chat_id");
    activeFolderRef.current = "";
    activeChatIdRef.current = "";
    setActiveFolder("");
    setActiveChatId("");
    isUpdatingUrlFromStateRef.current = true;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("folder");
        next.delete("chatId");
        next.delete("openFolder");
        return next;
      },
      { replace: true }
    );
    window.dispatchEvent(new Event("arunaki-folder-change"));
    window.dispatchEvent(new Event("arunaki-session-change"));
    toast.info("Folder closed. Agent is now in sandbox mode.");
  }, [setSearchParams]);

  const handleSelectSessionAction = useCallback((chatId: string) => {
    setActiveChatId(chatId);
  }, []);

  return {
    activeFolder,
    setActiveFolder,
    activeFolderName,
    activeWorkspace,
    activeChatId,
    setActiveChatId,
    openFolder,
    handleCloseFolderAction,
    handleSelectSessionAction,
  };
}
