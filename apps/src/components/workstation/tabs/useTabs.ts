import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { CenterTab } from "./types";
import { CanvasItem } from "../canvas/types";
import { extractCanvasTitle } from "../canvas/canvas";
import { engineFetch } from "../../../lib/engine";

interface UseTabsOptions {
  activeFolder: string;
  activeChatId?: string;
  refetchFiles?: () => void;
}

export function useTabs({ activeFolder, activeChatId, refetchFiles }: UseTabsOptions) {
  const [tabs, setTabs] = useState<CenterTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const activeChatIdRef = useRef<string>(activeChatId || "");
  useEffect(() => {
    activeChatIdRef.current = activeChatId || "";
  }, [activeChatId]);

  const [recentCanvases, setRecentCanvases] = useState<CanvasItem[]>(() => {
    try {
      if (!activeChatId) return [];
      const saved = localStorage.getItem(`arunaki_recent_canvases_${activeChatId}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const openingTabsRef = useRef<Set<string>>(new Set());
  const prevFolderRef = useRef<string>(activeFolder);
  const prevChatIdRef = useRef<string>(activeChatId || "");

  // Workspace folder isolation: when active folder changes, close previous folder's tabs and reset canvases
  useEffect(() => {
    if (prevFolderRef.current && prevFolderRef.current !== activeFolder) {
      setTabs([]);
      setActiveTabId(null);
      setRecentCanvases([]);
    }
    prevFolderRef.current = activeFolder;
  }, [activeFolder]);

  // Session isolation: when active chat session changes, load this session's canvases and close previous session's canvas tabs
  useEffect(() => {
    if (prevChatIdRef.current !== (activeChatId || "")) {
      prevChatIdRef.current = activeChatId || "";
      if (activeChatId) {
        try {
          const saved = localStorage.getItem(`arunaki_recent_canvases_${activeChatId}`);
          setRecentCanvases(saved ? JSON.parse(saved) : []);
        } catch {
          setRecentCanvases([]);
        }
      } else {
        setRecentCanvases([]);
      }

      // Close canvas tabs from previous session
      setTabs((prev) => prev.filter((t) => t.type !== "canvas"));
      setActiveTabId((current) => (current && current.startsWith("tab-canvas") ? null : current));
    }
  }, [activeChatId]);

  // Auto-deduplicate tabs by title/path to purge any duplicate tabs from state
  useEffect(() => {
    setTabs((prev) => {
      const seen = new Set<string>();
      const unique = prev.filter((t) => {
        const key = t.path || t.title;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return unique.length !== prev.length ? unique : prev;
    });
  }, []);

  const handleOpenCanvasTab = useCallback((item: CanvasItem) => {
    const canvasTabId = `tab-canvas-${item.id}`;
    setTabs((prev) => {
      const existingIdx = prev.findIndex((t) => t.id === canvasTabId);
      const newTab: CenterTab = {
        id: canvasTabId,
        type: "canvas",
        title: item.title,
        content: item.content,
        timeStr: item.timeStr,
        createdAt: item.createdAt,
      };
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx] = newTab;
        return copy;
      }
      return [...prev, newTab];
    });
    setActiveTabId(canvasTabId);
  }, []);

  const handleOpenFileTab = useCallback(
    async (filePath: string, fileName: string, content?: string, silent?: boolean) => {
      const cleanName = (fileName || "").trim();
      if (!cleanName || cleanName === "." || cleanName === ".." || cleanName === activeFolder) {
        return;
      }
      if (silent && !cleanName.includes(".")) {
        return;
      }

      const tabId = `file-${cleanName}`;
      const existing = tabs.find((t) => t.id === tabId || t.title === cleanName);
      if (existing) {
        if (!silent) {
          setActiveTabId(existing.id);
        }
        return;
      }

      if (openingTabsRef.current.has(tabId) || openingTabsRef.current.has(cleanName)) {
        return;
      }
      openingTabsRef.current.add(tabId);
      openingTabsRef.current.add(cleanName);

      try {
        let fileContent = content || "";
        const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
        if (!fileContent && desktop?.readFile) {
          const fullPath = (filePath.includes(":") || filePath.startsWith("/") || filePath.startsWith("\\"))
            ? filePath
            : `${activeFolder}\\${filePath}`;
          try {
            const res = await desktop.readFile(fullPath);
            if (typeof res?.content === "string") {
              fileContent = res.content;
            }
          } catch {}
        }

        if (!fileContent) {
          try {
            const res = await engineFetch(
              `/file/content?directory=${encodeURIComponent(activeFolder || "")}&path=${encodeURIComponent(filePath)}`
            );
            if (res.ok) {
              const json = await res.json();
              fileContent =
                json.data?.content ||
                (typeof json.data === "string" ? json.data : "");
            }
          } catch {}
        }

        // CRITICAL: If silent (auto-opened in background) and file is empty or unreadable, NEVER open an empty dummy tab!
        if (silent && (!fileContent || !fileContent.trim() || fileContent === "Empty document...")) {
          return;
        }

        const newTab: CenterTab = {
          id: tabId,
          type: "file",
          title: cleanName,
          path: filePath,
          fileType: cleanName.split(".").pop() || "txt",
          content: fileContent || "Empty document...",
        };

        setTabs((prev) => {
          if (prev.some((t) => t.id === tabId || t.title === cleanName || (filePath && t.path === filePath))) {
            return prev;
          }
          return [...prev, newTab];
        });
        setActiveTabId(tabId);
      } catch {
        if (!silent) {
          toast.error(`Failed to read file ${cleanName}`);
        }
      } finally {
        openingTabsRef.current.delete(tabId);
        openingTabsRef.current.delete(cleanName);
      }
    },
    [tabs, activeFolder]
  );

  const handleCloseTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const targetTab = prev.find((t) => t.id === tabId);
        const targetTitle = targetTab?.title;
        // Clean up both the tab and any accidental duplicates with the same title
        const next = prev.filter((t) => t.id !== tabId && (!targetTitle || t.title !== targetTitle));
        if (activeTabId === tabId || (targetTitle && prev.find((t) => t.id === activeTabId)?.title === targetTitle)) {
          setActiveTabId(next.length > 0 ? next[next.length - 1].id : null);
        }
        return next;
      });
    },
    [activeTabId]
  );

  const reloadOpenTabsContent = useCallback(async () => {
    if (!activeFolder) return;
    try {
      setTabs((currentTabs) => {
        const fileTabs = currentTabs.filter((t) => t.type === "file");
        if (fileTabs.length === 0) return currentTabs;

        const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;

        Promise.all(
          fileTabs.map(async (tab) => {
            if (!tab.path && !tab.title) return null;
            const filePath = tab.path || tab.title;
            let freshContent: string | null = null;

            if (desktop?.readFile) {
              const fullPath = (filePath.includes(":") || filePath.startsWith("/") || filePath.startsWith("\\"))
                ? filePath
                : `${activeFolder}\\${filePath}`;
              try {
                const res = await desktop.readFile(fullPath);
                if (typeof res?.content === "string") {
                  freshContent = res.content;
                }
              } catch {}
            }

            if (freshContent === null) {
              try {
                const contentRes = await engineFetch(
                  `/file/content?directory=${encodeURIComponent(activeFolder)}&path=${encodeURIComponent(filePath)}`
                );
                if (contentRes.ok) {
                  const contentJson = await contentRes.json();
                  freshContent =
                    typeof contentJson.data?.content === "string"
                      ? contentJson.data.content
                      : typeof contentJson.data === "string"
                      ? contentJson.data
                      : null;
                }
              } catch {}
            }

            if (freshContent !== null) {
              return { tabId: tab.id, content: freshContent };
            }
            return null;
          })
        ).then((results) => {
          const updates = results.filter(Boolean) as Array<{ tabId: string; content: string }>;
          if (updates.length > 0) {
            setTabs((latest) =>
              latest.map((t) => {
                const u = updates.find((item) => item.tabId === t.id);
                return u && u.content !== t.content ? { ...t, content: u.content } : t;
              })
            );
          }
        });

        return currentTabs;
      });
    } catch {}
  }, [activeFolder]);

  const handleUpdateTabContent = useCallback((tabId: string, newContent: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, content: newContent } : t))
    );
  }, []);

  const handleSaveFileTab = useCallback(
    async (tabId: string, newContent: string) => {
      const targetTab = tabs.find((t) => t.id === tabId);
      if (!targetTab) return;
      const filePath = targetTab.path || targetTab.title;
      const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
      if (desktop?.writeFile) {
        const fullPath = (filePath.includes(":") || filePath.startsWith("/") || filePath.startsWith("\\"))
          ? filePath
          : `${activeFolder}\\${filePath}`;
        try {
          const res = await desktop.writeFile(fullPath, newContent);
          if (res?.success) {
            toast.success(`Saved ${targetTab.title}`);
            setTabs((prev) =>
              prev.map((t) => (t.id === tabId ? { ...t, content: newContent } : t))
            );
            refetchFiles?.();
            return;
          } else if (res?.error) {
            toast.error(`Save failed: ${res.error}`);
            return;
          }
        } catch (err: any) {
          toast.error(`Failed to save: ${err?.message || err}`);
          return;
        }
      } else {
        setTabs((prev) =>
          prev.map((t) => (t.id === tabId ? { ...t, content: newContent } : t))
        );
        toast.info("Content updated locally");
      }
    },
    [tabs, activeFolder, refetchFiles]
  );

  const upsertCanvasTab = useCallback((canvasText: string, isStreamingDone?: boolean) => {
    if (!canvasText || canvasText.trim().length < 10) return;
    const canvasTabId = "tab-canvas-active";
    const canvasTitle = extractCanvasTitle(canvasText);
    const currentTimeStr = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    const currentCreatedAt = new Date().toISOString();

    setTabs((prev) => {
      const existingIdx = prev.findIndex((t) => t.id === canvasTabId);
      const newTab: CenterTab = {
        id: canvasTabId,
        type: "canvas",
        title: canvasTitle,
        content: canvasText,
        timeStr: currentTimeStr,
        createdAt: currentCreatedAt,
      };
      if (existingIdx >= 0) {
        if (prev[existingIdx].content === canvasText && prev[existingIdx].title === canvasTitle) {
          return prev;
        }
        const copy = [...prev];
        copy[existingIdx] = newTab;
        return copy;
      }
      return [...prev, newTab];
    });

    if (isStreamingDone) {
      setActiveTabId(canvasTabId);
      setRecentCanvases((prev) => {
        const filtered = prev.filter((i) => i.content.trim() !== canvasText.trim());
        const top5 = [
          {
            id: `canvas-${Date.now()}`,
            title: canvasTitle,
            content: canvasText,
            createdAt: currentCreatedAt,
            timeStr: currentTimeStr,
          },
          ...filtered,
        ].slice(0, 5);
        const chatId = activeChatIdRef.current;
        if (chatId) {
          try {
            localStorage.setItem(`arunaki_recent_canvases_${chatId}`, JSON.stringify(top5));
          } catch {}
        }
        return top5;
      });
    } else {
      setActiveTabId((currentActive) => currentActive || canvasTabId);
    }
  }, []);

  return {
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    recentCanvases,
    setRecentCanvases,
    handleOpenCanvasTab,
    handleOpenFileTab,
    handleCloseTab,
    reloadOpenTabsContent,
    handleUpdateTabContent,
    handleSaveFileTab,
    upsertCanvasTab,
  };
}
