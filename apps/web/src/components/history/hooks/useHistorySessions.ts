import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { listSessions, deleteSession, engineFetch } from "../../../lib/engine";
import { ChatSession, groupSessionsByDate } from "../historyUtils";

export type FilterTab = "all" | "active" | "empty";

export function useHistorySessions() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Modals state
  const [emptySessionModal, setEmptySessionModal] = useState<ChatSession | null>(null);
  const [deleteModal, setDeleteModal] = useState<ChatSession | null>(null);
  const [cleanupConfirmModal, setCleanupConfirmModal] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);

  // 1. Fetch sessions and background stats
  useEffect(() => {
    let isMounted = true;

    async function fetchSessions() {
      try {
        setLoading(true);
        const raw = await listSessions({ limit: 100 });
        if (!isMounted) return;

        const initial: ChatSession[] = (raw || []).map((s: any) => {
          const hasInlineStats = typeof s.messageCount === "number";
          return {
            id: s.id,
            title: s.title || "",
            createdAt: s.time?.created ? new Date(s.time.created).toISOString() : "",
            updatedAt: s.time?.updated
              ? new Date(s.time.updated).toISOString()
              : s.time?.created
              ? new Date(s.time.created).toISOString()
              : "",
            directory: s.directory || s.location?.directory || "",
            messageCount: hasInlineStats ? s.messageCount : undefined,
            lastMessagePreview:
              typeof s.lastMessagePreview === "string" ? s.lastMessagePreview : undefined,
            isLoadingStats: !hasInlineStats,
          };
        });

        setSessions(initial);
        setLoading(false);

        const needStats = initial.filter((s) => s.isLoadingStats);
        if (needStats.length === 0) return;

        // Fetch stats (message count & preview) in concurrent chunks of 10 only when not provided inline
        const chunkSize = 10;
        for (let i = 0; i < needStats.length; i += chunkSize) {
          if (!isMounted) break;
          const chunk = needStats.slice(i, i + chunkSize);

          const updates = await Promise.all(
            chunk.map(async (sess) => {
              try {
                const rawMsgs: any[] = [];
                let nextCursor: string | undefined = undefined;

                do {
                  const params = new URLSearchParams();
                  if (nextCursor) {
                    params.set("cursor", nextCursor);
                    params.set("limit", "200");
                  } else {
                    params.set("order", "desc");
                    params.set("limit", "200");
                  }
                  const res = await engineFetch(
                    `/api/session/${sess.id}/message?${params}`
                  );
                  if (!res.ok) break;
                  const json = await res.json();
                  const pageData = json.data || [];
                  rawMsgs.push(...pageData);
                  nextCursor = pageData.length >= 200 ? json.cursor?.next : undefined;
                } while (nextCursor && rawMsgs.length < 2000);

                if (rawMsgs.length > 0) {
                  // Count real conversational messages (user & assistant turns)
                  const chatMsgs = rawMsgs.filter(
                    (m: any) =>
                      m &&
                      m.type !== "system" &&
                      m.type !== "compaction" &&
                      m.type !== "model-switched" &&
                      m.type !== "plan" &&
                      m.agent !== "compaction" &&
                      m.summary !== true &&
                      m.info?.summary !== true
                  );
                  const count =
                    chatMsgs.length > 0 ? chatMsgs.length : rawMsgs.length;

                  // Extract latest message snippet from newest message
                  let preview = "";
                  const candidateMsgs =
                    chatMsgs.length > 0 ? chatMsgs : rawMsgs;
                  for (const m of candidateMsgs) {
                    if (typeof m.content === "string" && m.content.trim()) {
                      preview = m.content;
                      break;
                    }
                    if (typeof m.text === "string" && m.text.trim()) {
                      preview = m.text;
                      break;
                    }
                    if (Array.isArray(m.content)) {
                      const textPart = m.content.find(
                        (p: any) =>
                          p &&
                          (p.type === "text" || !p.type) &&
                          typeof p.text === "string" &&
                          p.text.trim()
                      );
                      if (textPart) {
                        preview = textPart.text;
                        break;
                      }
                    }
                  }

                  return {
                    id: sess.id,
                    messageCount: count,
                    lastMessagePreview: preview
                      ? preview.trim().replace(/\s+/g, " ").slice(0, 95)
                      : "",
                  };
                }
              } catch {}
              return { id: sess.id, messageCount: 0, lastMessagePreview: "" };
            })
          );

          if (!isMounted) break;

          setSessions((prev) =>
            prev.map((s) => {
              const match = updates.find((u) => u.id === s.id);
              if (match) {
                return {
                  ...s,
                  messageCount: match.messageCount,
                  lastMessagePreview: match.lastMessagePreview,
                  isLoadingStats: false,
                };
              }
              return s;
            })
          );
        }
      } catch (err) {
        console.error("Failed to fetch chat history:", err);
        if (isMounted) setLoading(false);
      }
    }

    fetchSessions();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Open / Resume session handler with feedback and warning popup for empty sessions
  const handleOpenSession = useCallback(
    (session: ChatSession, forceOpen = false) => {
      if (!forceOpen && session.messageCount === 0) {
        setEmptySessionModal(session);
        return;
      }

      const sessionFolder = session.directory || "";
      if (sessionFolder) {
        localStorage.setItem("arunaki_active_folder", sessionFolder);
        localStorage.setItem(
          `arunaki_active_chat_id_${sessionFolder}`,
          session.id
        );
      } else {
        localStorage.removeItem("arunaki_active_folder");
      }
      localStorage.setItem("arunaki_active_chat_id", session.id);

      if (session.messageCount && session.messageCount > 0) {
        toast.success(
          `Resuming conversation (${session.messageCount} messages)`
        );
      } else if (session.isLoadingStats) {
        toast.success("Resuming conversation");
      } else {
        toast.info("Resuming blank session");
      }

      const params = new URLSearchParams();
      params.set("chatId", session.id);
      if (sessionFolder) params.set("folder", sessionFolder);
      navigate(`/?${params.toString()}`);
      window.dispatchEvent(new Event("arunaki-folder-change"));
      window.dispatchEvent(new Event("arunaki-session-change"));
    },
    [navigate]
  );

  // 3. Delete single session
  const handleDeleteSession = useCallback(async (session: ChatSession) => {
    try {
      const ok = await deleteSession(session.id);
      if (ok) {
        setSessions((prev) => prev.filter((s) => s.id !== session.id));
        toast.success("Session deleted successfully");
      } else {
        toast.error("Failed to delete session from server");
      }
    } catch (err: any) {
      toast.error(`Error deleting session: ${err?.message || err}`);
    } finally {
      setDeleteModal(null);
      setEmptySessionModal(null);
    }
  }, []);

  // 4. Batch cleanup for all empty sessions
  const handleCleanupEmptySessions = useCallback(async () => {
    const emptySessions = sessions.filter((s) => s.messageCount === 0);
    if (emptySessions.length === 0) return;

    setIsCleaning(true);
    try {
      const results = await Promise.allSettled(
        emptySessions.map((s) => deleteSession(s.id))
      );
      const deletedCount = results.filter(
        (r) => r.status === "fulfilled" && (r as any).value
      ).length;
      setSessions((prev) => prev.filter((s) => s.messageCount !== 0));
      toast.success(`Cleaned up ${deletedCount} empty sessions`);
    } catch (err: any) {
      toast.error(`Error cleaning empty sessions: ${err?.message || err}`);
    } finally {
      setIsCleaning(false);
      setCleanupConfirmModal(false);
    }
  }, [sessions]);

  // Compute counts
  const totalCount = sessions.length;
  const activeCount = useMemo(
    () => sessions.filter((s) => (s.messageCount ?? 0) > 0).length,
    [sessions]
  );
  const emptyCount = useMemo(
    () => sessions.filter((s) => s.messageCount === 0).length,
    [sessions]
  );

  // Filtered sessions
  const filteredSessions = useMemo(() => {
    let result = sessions;

    if (activeTab === "active") {
      result = result.filter((s) => (s.messageCount ?? 0) > 0);
    } else if (activeTab === "empty") {
      result = result.filter((s) => s.messageCount === 0);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          (s.directory && s.directory.toLowerCase().includes(q)) ||
          (s.lastMessagePreview &&
            s.lastMessagePreview.toLowerCase().includes(q))
      );
    }

    return result;
  }, [sessions, activeTab, searchQuery]);

  const groupedSessions = useMemo(() => {
    return groupSessionsByDate(filteredSessions);
  }, [filteredSessions]);

  const toggleGroup = useCallback((group: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [group]: !prev[group],
    }));
  }, []);

  return {
    sessions,
    loading,
    searchQuery,
    setSearchQuery,
    activeTab,
    setActiveTab,
    collapsedGroups,
    toggleGroup,
    emptySessionModal,
    setEmptySessionModal,
    deleteModal,
    setDeleteModal,
    cleanupConfirmModal,
    setCleanupConfirmModal,
    isCleaning,
    handleOpenSession,
    handleDeleteSession,
    handleCleanupEmptySessions,
    totalCount,
    activeCount,
    emptyCount,
    filteredSessions,
    groupedSessions,
  };
}
