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
  const savingTabsRef = useRef<Set<string>>(new Set());
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

  useEffect(() => {
    const handleOpenAppEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ app: string; title?: string; path?: string; content?: string }>;
      const app = customEvent.detail?.app?.toLowerCase();
      if (!app) return;

      const rawTitle = (customEvent.detail?.title || "").trim();
      const rawPath = (customEvent.detail?.path || "").trim();

      if (app === "gridcraft" || app === "grid" || app === "spreadsheet") {
        let docTitle = rawTitle;
        let docPath = rawPath;
        if (!docTitle && !docPath) {
          docTitle = "Spreadsheet 1.xlsx";
          docPath = "Spreadsheet 1.xlsx";
        } else if (!docPath) {
          if (docTitle.toLowerCase() === "gridcraft") {
            docTitle = "GridCraft";
            docPath = "GridCraft.xlsx";
          } else {
            docPath = docTitle.includes(".") ? docTitle : `${docTitle}.xlsx`;
            if (!docTitle.includes(".")) docTitle = `${docTitle}.xlsx`;
          }
        } else if (!docTitle) {
          docTitle = docPath;
        }

        const content =
          customEvent.detail?.content ||
          "Item,Category,Quantity,Unit Price,Total\nProduct A,Electronics,2,150000,=C2*D2\nProduct B,Stationery,5,25000,=C3*D3\nTotal,,,,=SUM(E2:E3)\n";

        setTabs((prev) => {
          const existing = prev.find((t) => (t.path && t.path === docPath) || t.title === docTitle);
          if (existing) {
            return prev.map((t) => (t.id === existing.id ? { ...t, content: content || t.content, path: docPath } : t));
          }
          const id = `app-gridcraft-${Date.now()}`;
          const newTab: CenterTab = {
            id,
            type: "file",
            title: docTitle,
            path: docPath,
            fileType: "xlsx",
            content,
          };
          return [...prev, newTab];
        });

        setTimeout(() => {
          setTabs((latest) => {
            const found = latest.find((t) => (t.path && t.path === docPath) || t.title === docTitle);
            if (found) setActiveTabId(found.id);
            return latest;
          });
        }, 10);
      } else if (app === "wordcraft" || app === "word" || app === "document") {
        let docTitle = rawTitle;
        let docPath = rawPath;
        if (!docTitle && !docPath) {
          docTitle = "Document 1.docx";
          docPath = "Document 1.docx";
        } else if (!docPath) {
          if (docTitle.toLowerCase() === "wordcraft") {
            docTitle = "WordCraft";
            docPath = "WordCraft.docx";
          } else {
            docPath = docTitle.includes(".") ? docTitle : `${docTitle}.docx`;
            if (!docTitle.includes(".")) docTitle = `${docTitle}.docx`;
          }
        } else if (!docTitle) {
          docTitle = docPath;
        }

        const content =
          customEvent.detail?.content ||
          "# Document Title\n\nOfficial document canvas for reports, briefs, and notes.\n\n## Section 1: Executive Summary\nType your content here or use Arunaki AI to draft sections automatically.\n";

        setTabs((prev) => {
          const existing = prev.find((t) => (t.path && t.path === docPath) || t.title === docTitle);
          if (existing) {
            return prev.map((t) => (t.id === existing.id ? { ...t, content: content || t.content, path: docPath } : t));
          }
          const id = `app-wordcraft-${Date.now()}`;
          const newTab: CenterTab = {
            id,
            type: "app",
            title: docTitle,
            path: docPath,
            fileType: "wordcraft-app",
            content,
          };
          return [...prev, newTab];
        });

        setTimeout(() => {
          setTabs((latest) => {
            const found = latest.find((t) => (t.path && t.path === docPath) || t.title === docTitle);
            if (found) setActiveTabId(found.id);
            return latest;
          });
        }, 10);
      } else if (app === "pdfcraft" || app === "pdf") {
        const title = rawTitle || "PdfCraft";
        const path = rawPath || (title.includes(".") ? title : `${title}.pdf`);
        const id = `app-pdfcraft-${Date.now()}`;
        const content =
          customEvent.detail?.content ||
          "PDF Document Viewer & Cartographer\n\nExtract tables, analyze invoices, and inspect documents.";
        const newTab: CenterTab = {
          id,
          type: "file",
          title,
          path,
          fileType: "pdf",
          content,
        };
        setTabs((prev) => [...prev, newTab]);
        setActiveTabId(id);
      } else if (app === "deckcraft" || app === "deck" || app === "slides") {
        const title = rawTitle || "DeckCraft";
        const path = rawPath || (title.includes(".") ? title : `${title}.pptx`);
        const id = `app-deckcraft-${Date.now()}`;
        const content =
          customEvent.detail?.content ||
          "# Presentation Title\nExecutive Deck\n---\n## Slide 1: Introduction\n- Key objective 1\n- Key objective 2\n---\n## Slide 2: Next Steps\n- Roadmap and deliverables\n";
        const newTab: CenterTab = {
          id,
          type: "file",
          title,
          path,
          fileType: "pptx",
          content,
        };
        setTabs((prev) => [...prev, newTab]);
        setActiveTabId(id);
      }
    };

    window.addEventListener("arunaki:open-app", handleOpenAppEvent);
    return () => {
      window.removeEventListener("arunaki:open-app", handleOpenAppEvent);
    };
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
          originalContent: fileContent || "",
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
                return u && u.content !== t.content
                  ? { ...t, content: u.content, originalContent: t.originalContent ?? u.content }
                  : t;
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
      if (savingTabsRef.current.has(tabId)) {
        return;
      }
      savingTabsRef.current.add(tabId);
      setTimeout(() => {
        savingTabsRef.current.delete(tabId);
      }, 600);

      const targetTab = tabs.find((t) => t.id === tabId);
      if (!targetTab) return;
      let filePath = targetTab.path || targetTab.title;
      if (targetTab.fileType === "wordcraft-app" && !filePath.includes(".")) {
        filePath = `${filePath}.docx`;
      } else if (targetTab.fileType === "gridcraft-app" && !filePath.includes(".")) {
        filePath = `${filePath}.xlsx`;
      }
      const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
      if (desktop?.writeFile) {
        const fullPath = (filePath.includes(":") || filePath.startsWith("/") || filePath.startsWith("\\"))
          ? filePath
          : `${activeFolder}\\${filePath}`;
        try {
          const res = await desktop.writeFile(fullPath, newContent);
          if (res?.success) {
            toast.success(`Saved ${targetTab.title}`, { id: `save-${targetTab.title}` });
            setTabs((prev) =>
              prev.map((t) =>
                t.id === tabId
                  ? { ...t, content: newContent, originalContent: newContent, path: filePath }
                  : t
              )
            );
            // Accept change on backend to clean baseline
            try {
              engineFetch(
                `/api/file/accept?directory=${encodeURIComponent(activeFolder)}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ path: filePath }),
                }
              );
            } catch {}
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

  const handleOpenDiffTab = useCallback(
    (file: { path: string; name: string; beforeContent: string; afterContent: string }) => {
      const tabId = `diff-${file.path}`;
      setTabs((prev) => {
        const existing = prev.find((t) => t.id === tabId);
        if (existing) {
          return prev.map((t) =>
            t.id === tabId
              ? {
                  ...t,
                  beforeContent: file.beforeContent,
                  afterContent: file.afterContent,
                }
              : t
          );
        }
        const newTab: CenterTab = {
          id: tabId,
          type: "diff",
          title: `${file.name} (Working Tree)`,
          path: file.path,
          beforeContent: file.beforeContent,
          afterContent: file.afterContent,
        };
        return [...prev, newTab];
      });
      setActiveTabId(tabId);
    },
    []
  );

  return {
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    recentCanvases,
    setRecentCanvases,
    handleOpenCanvasTab,
    handleOpenFileTab,
    handleOpenDiffTab,
    handleCloseTab,
    reloadOpenTabsContent,
    handleUpdateTabContent,
    handleSaveFileTab,
    upsertCanvasTab,
  };
}
