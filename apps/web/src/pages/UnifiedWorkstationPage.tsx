import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { WorkstationLeftExplorer } from "../components/workstation/WorkstationLeftExplorer";
import { WorkstationCenterPanel } from "../components/workstation/WorkstationCenterPanel";
import { WorkstationRightChat } from "../components/workstation/WorkstationRightChat";
import { ConnectFolderModal } from "../components/workstation/ConnectFolderModal";
import { SearchSectionModal } from "../components/workstation/SearchSectionModal";
import { useTabs } from "../components/workstation/tabs/useTabs";
import { useWorkstationChat } from "../components/workstation/chat/useWorkstationChat";
import { WorkspaceFile } from "../components/workstation/chat/types";
import { ErrorBoundary } from "../components/common/ErrorBoundary";
import { engineFetch, getSession, listSessions } from "../lib/engine";

export function UnifiedWorkstationPage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const isWorkstationRoute =
    location.pathname === "/" || location.pathname.startsWith("/workspace");

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

  const activeWorkspace = useMemo(
    () =>
      activeFolder
        ? { id: "active-folder", name: activeFolderName, rootPath: activeFolder, status: "ready" }
        : null,
    [activeFolder, activeFolderName]
  );

  const [activeChatId, setActiveChatId] = useState<string>(() => {
    if (urlChatId && urlChatId.startsWith("ses_")) return urlChatId;
    const initialFolder = searchParams.get("folder") || localStorage.getItem("arunaki_active_folder") || "";
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
    listSessions({ directory: activeFolder, limit: 1 }).then((sessions) => {
      if (isCancelled || !sessions || sessions.length === 0) return;
      const latest = sessions[0];
      if (latest && latest.id && latest.id.startsWith("ses_")) {
        setActiveChatId(latest.id);
        localStorage.setItem("arunaki_active_chat_id", latest.id);
        localStorage.setItem(`arunaki_active_chat_id_${activeFolder}`, latest.id);
      }
    }).catch(() => {});
    return () => {
      isCancelled = true;
    };
  }, [activeFolder, activeChatId]);

  // Folder-Session Isolation Guard: verify that active session belongs to activeFolder
  useEffect(() => {
    if (!activeChatId || !activeFolder) return;
    let isCancelled = false;
    getSession(activeChatId).then((sess) => {
      if (isCancelled) return;
      const sessDir = (sess?.directory || (sess as any)?.location?.directory || "").toLowerCase().replace(/\\/g, "/").replace(/\/+/g, "/");
      const curDir = activeFolder.toLowerCase().replace(/\\/g, "/").replace(/\/+/g, "/");
      if (sessDir && curDir && sessDir !== curDir) {
        console.warn(`[UnifiedWorkstationPage] Isolation mismatch: Session ${activeChatId} (${sessDir}) does not belong to active folder (${curDir}). Resetting.`);
        setActiveChatId("");
        localStorage.removeItem("arunaki_active_chat_id");
      }
    }).catch(() => {});
    return () => {
      isCancelled = true;
    };
  }, [activeChatId, activeFolder]);

  const isUpdatingUrlFromStateRef = useRef(false);

  // 1. Open / Switch Active Folder with complete workspace isolation (Antigravity Parity)
  const openFolder = useCallback((folderPath: string) => {
    const cleanPath = (folderPath || "").trim();
    if (!cleanPath) return;

    setActiveFolder(cleanPath);
    localStorage.setItem("arunaki_active_folder", cleanPath);

    // Workspace folder isolation: check if this folder already has an existing session
    const savedFolderSession = localStorage.getItem(`arunaki_active_chat_id_${cleanPath}`) || "";
    const nextChatId = savedFolderSession.startsWith("ses_") ? savedFolderSession : "";

    setActiveChatId(nextChatId);
    if (nextChatId) {
      localStorage.setItem("arunaki_active_chat_id", nextChatId);
    } else {
      localStorage.removeItem("arunaki_active_chat_id");
    }

    isUpdatingUrlFromStateRef.current = true;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("folder", cleanPath);
      if (nextChatId) {
        next.set("chatId", nextChatId);
      } else {
        next.delete("chatId");
      }
      return next;
    }, { replace: true });

    window.dispatchEvent(new Event("arunaki-folder-change"));
  }, [setSearchParams]);

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
          body: JSON.stringify({ sessionID: activeChatId, directory: activeFolder }),
        }).catch(() => {});
      }
    } else {
      localStorage.removeItem("arunaki_active_chat_id");
      if (activeFolder) {
        localStorage.removeItem(`arunaki_active_chat_id_${activeFolder}`);
      }
    }

    const currentUrlFolder = searchParams.get("folder") || "";
    const currentUrlChatId = searchParams.get("chatId") || "";

    const targetFolder = activeFolder || "";
    const targetChatId = (activeChatId && activeChatId.startsWith("ses_")) ? activeChatId : "";

    if (currentUrlFolder === targetFolder && currentUrlChatId === targetChatId) {
      return;
    }

    isUpdatingUrlFromStateRef.current = true;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (targetFolder) next.set("folder", targetFolder);
      else next.delete("folder");

      if (targetChatId) next.set("chatId", targetChatId);
      else next.delete("chatId");

      if (next.toString() === prev.toString()) return prev;
      return next;
    }, { replace: true });
  }, [isWorkstationRoute, activeFolder, activeChatId, searchParams, setSearchParams]);

  // 3. Unidirectional Sync: URL -> State (for browser history navigation or deep linking)
  useEffect(() => {
    if (!isWorkstationRoute) return;
    if (isUpdatingUrlFromStateRef.current) {
      isUpdatingUrlFromStateRef.current = false;
      return;
    }

    const targetFolder = searchParams.get("folder") || "";
    const targetChatId = searchParams.get("chatId") || "";

    if (targetFolder && targetFolder !== activeFolder) {
      openFolder(targetFolder);
    } else if (targetChatId !== activeChatId) {
      if (!targetChatId || targetChatId.startsWith("ses_")) {
        setActiveChatId(targetChatId);
      }
    }
  }, [isWorkstationRoute, searchParams, activeFolder, activeChatId, openFolder]);

  // 4. External window event listeners for folder and session changes
  useEffect(() => {
    function handleFolderChange() {
      const saved = localStorage.getItem("arunaki_active_folder") || "";
      if (saved && saved !== activeFolder) {
        openFolder(saved);
      }
    }
    function handleSessionChange() {
      const saved = localStorage.getItem("arunaki_active_chat_id") || "";
      if (saved !== activeChatId && (!saved || saved.startsWith("ses_"))) {
        setActiveChatId(saved);
      }
    }
    window.addEventListener("arunaki-folder-change", handleFolderChange);
    window.addEventListener("arunaki-session-change", handleSessionChange);
    return () => {
      window.removeEventListener("arunaki-folder-change", handleFolderChange);
      window.removeEventListener("arunaki-session-change", handleSessionChange);
    };
  }, [activeFolder, activeChatId, openFolder]);

  const openFolderParam = searchParams.get("openFolder");
  useEffect(() => {
    if (openFolderParam && openFolderParam !== activeFolder) {
      openFolder(openFolderParam);
    }
  }, [openFolderParam, activeFolder, openFolder]);

  // 2. Folder files query
  const { data: workspaceFiles = [], refetch: refetchFiles } = useQuery<WorkspaceFile[]>({
    queryKey: ["folder-files", activeFolder],
    queryFn: async () => {
      if (!activeFolder) return [];
      // "path" is relative to the instance directory, and "." is the folder root.
      const res = await engineFetch(
        `/file?directory=${encodeURIComponent(activeFolder)}&path=${encodeURIComponent(".")}`,
      );
      if (!res.ok) throw new Error(`file list failed: HTTP ${res.status}`);
      const json = await res.json();
      const entries: Array<{ name: string; path: string; type: string }> = json.data || json || [];
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

  const [nativeFileNames, setNativeFileNames] = useState<string[]>([]);
  const mentionFiles = useMemo(
    () =>
      Array.from(
        new Set([...workspaceFiles.map((f) => f.name), ...nativeFileNames])
      ).map((name) => ({ name })),
    [workspaceFiles, nativeFileNames]
  );

  // 3. Modular domain hooks
  const tabs = useTabs({ activeFolder, activeChatId, refetchFiles });

  const chat = useWorkstationChat({
    activeFolder,
    activeChatId,
    setActiveChatId,
    refetchFiles,
    reloadOpenTabsContent: tabs.reloadOpenTabsContent,
    onOpenFileTab: tabs.handleOpenFileTab,
    upsertCanvasTab: tabs.upsertCanvasTab,
    setRecentCanvases: tabs.setRecentCanvases,
  });

  // 4. Panel UI layout & resize controls
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showSearchSectionModal, setShowSearchSectionModal] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const startDrag = useCallback(
    (side: "left" | "right", e: React.MouseEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const startX = e.clientX;
      const computedStyle = getComputedStyle(container);
      const startWidth = side === "left"
        ? parseInt(computedStyle.getPropertyValue("--left-panel-width") || "256", 10)
        : parseInt(computedStyle.getPropertyValue("--right-panel-width") || "320", 10);

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        if (side === "left") {
          const newW = Math.max(160, Math.min(480, startWidth + delta));
          container.style.setProperty("--left-panel-width", `${newW}px`);
        } else {
          const newW = Math.max(240, Math.min(600, startWidth - delta));
          container.style.setProperty("--right-panel-width", `${newW}px`);
        }
      };

      const onUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    []
  );

  const handleCloseLeft = useCallback(() => setLeftCollapsed(true), []);
  const handleToggleLeft = useCallback(() => setLeftCollapsed((prev) => !prev), []);
  const handleToggleRight = useCallback(() => setRightCollapsed((prev) => !prev), []);
  const handleOpenFolderModal = useCallback(() => setShowFolderModal(true), []);
  const handleCloseFolderModal = useCallback(() => setShowFolderModal(false), []);
  const handleOpenSearchModal = useCallback(() => setShowSearchSectionModal(true), []);
  const handleCloseSearchModal = useCallback(() => setShowSearchSectionModal(false), []);
  const handleCloseFolderAction = useCallback(() => {
    setActiveFolder("");
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("folder");
      return next;
    }, { replace: true });
    toast.info("Folder closed. Agent is now in sandbox mode.");
  }, [setSearchParams]);
  const handleSelectSessionAction = useCallback((chatId: string) => {
    setActiveChatId(chatId);
  }, []);

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const chatRef = useRef(chat);
  chatRef.current = chat;

  // Listen for top menubar global events
  useEffect(() => {
    const handleNewChatEvent = () => chatRef.current.handleNewChat();
    const handleSaveFileEvent = () => {
      const currentTabs = tabsRef.current.tabs;
      const currentActiveId = tabsRef.current.activeTabId;
      const activeTab = currentTabs.find((t) => t.id === currentActiveId);
      if (activeTab && activeTab.type === "file") {
        tabsRef.current.handleSaveFileTab(activeTab.id, activeTab.content || "");
      }
    };
    const handleSearchSessionEvent = () => setShowSearchSectionModal(true);
    const handleToggleExplorerEvent = () => setLeftCollapsed((prev) => !prev);
    const handleToggleChatEvent = () => setRightCollapsed((prev) => !prev);
    const handleOpenCanvasEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ content: string }>;
      if (customEvent.detail?.content) {
        tabsRef.current.upsertCanvasTab(customEvent.detail.content, true);
      }
    };

    window.addEventListener("arunaki-new-chat", handleNewChatEvent);
    window.addEventListener("arunaki-save-file", handleSaveFileEvent);
    window.addEventListener("arunaki-search-session", handleSearchSessionEvent);
    window.addEventListener("arunaki-toggle-explorer", handleToggleExplorerEvent);
    window.addEventListener("arunaki-toggle-chat", handleToggleChatEvent);
    window.addEventListener("arunaki-open-canvas", handleOpenCanvasEvent);

    return () => {
      window.removeEventListener("arunaki-new-chat", handleNewChatEvent);
      window.removeEventListener("arunaki-save-file", handleSaveFileEvent);
      window.removeEventListener("arunaki-search-session", handleSearchSessionEvent);
      window.removeEventListener("arunaki-toggle-explorer", handleToggleExplorerEvent);
      window.removeEventListener("arunaki-toggle-chat", handleToggleChatEvent);
      window.removeEventListener("arunaki-open-canvas", handleOpenCanvasEvent);
    };
  }, []);

  // Shortcuts: Ctrl+B (Explorer), Ctrl+J (Chat) (VS Code parity)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;
      if (!isInput && (e.ctrlKey || e.metaKey)) {
        if (e.key.toLowerCase() === "b") {
          e.preventDefault();
          setLeftCollapsed((prev) => !prev);
        } else if (e.key.toLowerCase() === "j") {
          e.preventDefault();
          setRightCollapsed((prev) => !prev);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-primary)] overflow-hidden select-none transition-colors duration-150">
      <div
        ref={containerRef}
        className="flex-1 flex overflow-hidden relative"
        style={{ "--left-panel-width": "256px", "--right-panel-width": "320px" } as React.CSSProperties}
      >
        <WorkstationLeftExplorer
          collapsed={leftCollapsed}
          onClose={handleCloseLeft}
          onToggle={handleToggleLeft}
          activeWorkspace={activeWorkspace}
          workspaceFiles={workspaceFiles}
          onOpenFileTab={tabs.handleOpenFileTab}
          onOpenFolderModal={handleOpenFolderModal}
          onCloseFolder={handleCloseFolderAction}
          width="var(--left-panel-width)"
          onNativeFilesChange={setNativeFileNames}
          recentCanvases={tabs.recentCanvases}
          onOpenCanvasTab={tabs.handleOpenCanvasTab}
        />

        {!leftCollapsed && (
          <div
            className="w-1 cursor-col-resize bg-transparent shrink-0 hover:bg-[var(--border-strong)] transition-colors"
            onMouseDown={(e) => startDrag("left", e)}
          />
        )}

        <WorkstationCenterPanel
          tabs={tabs.tabs}
          activeTabId={tabs.activeTabId}
          activeFolder={activeFolder}
          onSelectTab={tabs.setActiveTabId}
          onCloseTab={tabs.handleCloseTab}
          onUpdateTabContent={tabs.handleUpdateTabContent}
          onSaveTabContent={tabs.handleSaveFileTab}
        />

        {!rightCollapsed && (
          <div
            className="w-1 cursor-col-resize bg-transparent shrink-0 hover:bg-[var(--border-strong)] transition-colors"
            onMouseDown={(e) => startDrag("right", e)}
          />
        )}

        <ErrorBoundary fullScreen={false} fallbackTitle="Chat panel encountered an error">
          <WorkstationRightChat
            activeChatId={activeChatId}
            collapsed={rightCollapsed}
            onClose={handleToggleRight}
            chatMessages={chat.chatMessages}
            optimisticMessages={chat.optimisticMessages}
            liveStatus={chat.liveStatus}
            messagesEndRef={chat.messagesEndRef}
            activeWorkspace={activeWorkspace}
            isStreaming={chat.isStreaming}
            onSendMessage={chat.handleSendMessage}
            width="var(--right-panel-width, 320px)"
            files={mentionFiles}
            queuedPrompts={chat.queuedPrompts}
            onRemoveQueuedPrompt={chat.handleRemoveQueuedPrompt}
            onSearchSection={handleOpenSearchModal}
            reasoningEffort={chat.reasoningEffort}
            setReasoningEffort={chat.setReasoningEffort}
            onNewChat={chat.handleNewChat}
            onCancelStream={chat.handleCancelStream}
            onAnswerQuestion={chat.handleAnswerQuestion}
          />
        </ErrorBoundary>
      </div>

      <ConnectFolderModal
        isOpen={showFolderModal}
        onClose={handleCloseFolderModal}
        onOpenFolder={openFolder}
      />

      <SearchSectionModal
        isOpen={showSearchSectionModal}
        activeFolder={activeFolder}
        onClose={handleCloseSearchModal}
        onSelectSession={handleSelectSessionAction}
      />
    </div>
  );
}
