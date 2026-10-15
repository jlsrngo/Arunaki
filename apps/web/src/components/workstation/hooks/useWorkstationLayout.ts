import { useState, useRef, useCallback, useEffect } from "react";
import { setPanel, togglePanel, usePanels } from "../../../lib/panels";

interface UseWorkstationLayoutOptions {
  onNewChat: () => void;
  onSaveActiveTab: () => void;
  onOpenCanvas: (content: string) => void;
}

export function useWorkstationLayout({
  onNewChat,
  onSaveActiveTab,
  onOpenCanvas,
}: UseWorkstationLayoutOptions) {
  const { explorerOpen, chatOpen } = usePanels();
  const leftCollapsed = !explorerOpen;
  const rightCollapsed = !chatOpen;

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
      const startWidth =
        side === "left"
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

  const handleCloseLeft = useCallback(() => setPanel("explorer", false), []);
  const handleToggleLeft = useCallback(() => togglePanel("explorer"), []);
  const handleToggleRight = useCallback(() => togglePanel("chat"), []);
  const handleOpenFolderModal = useCallback(() => setShowFolderModal(true), []);
  const handleCloseFolderModal = useCallback(() => setShowFolderModal(false), []);
  const handleOpenSearchModal = useCallback(() => setShowSearchSectionModal(true), []);
  const handleCloseSearchModal = useCallback(() => setShowSearchSectionModal(false), []);

  const onNewChatRef = useRef(onNewChat);
  onNewChatRef.current = onNewChat;
  const onSaveActiveTabRef = useRef(onSaveActiveTab);
  onSaveActiveTabRef.current = onSaveActiveTab;
  const onOpenCanvasRef = useRef(onOpenCanvas);
  onOpenCanvasRef.current = onOpenCanvas;

  // Listen for top menubar global events
  useEffect(() => {
    const handleNewChatEvent = () => onNewChatRef.current();
    const handleSaveFileEvent = () => onSaveActiveTabRef.current();
    const handleSearchSessionEvent = () => setShowSearchSectionModal(true);
    const handleToggleExplorerEvent = () => togglePanel("explorer");
    const handleToggleChatEvent = () => togglePanel("chat");
    const handleOpenCanvasEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ content: string }>;
      if (customEvent.detail?.content) {
        onOpenCanvasRef.current(customEvent.detail.content);
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

  return {
    containerRef,
    leftCollapsed,
    rightCollapsed,
    startDrag,
    handleCloseLeft,
    handleToggleLeft,
    handleToggleRight,
    showFolderModal,
    handleOpenFolderModal,
    handleCloseFolderModal,
    showSearchSectionModal,
    handleOpenSearchModal,
    handleCloseSearchModal,
  };
}
