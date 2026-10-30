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

  // 1. Fetch sessions with inline Rust-computed messageCount & lastMessagePreview
  useEffect(() => {
    let isMounted = true;

    async function fetchSessions() {
      try {
        setLoading(true);
        const raw = await listSessions({ limit: 150 });
        if (!isMounted) return;

        const mapped: ChatSession[] = (raw || []).map((s: any) => ({
          id: s.id,
          title: s.title || "",
          createdAt: s.time?.created ? new Date(s.time.created).toISOString() : "",
          updatedAt: s.time?.updated
            ? new Date(s.time.updated).toISOString()
            : s.time?.created
            ? new Date(s.time.created).toISOString()
            : "",
          directory: s.directory || s.location?.directory || "",
          messageCount: typeof s.messageCount === "number" ? s.messageCount : 0,
          lastMessagePreview:
            typeof s.lastMessagePreview === "string" ? s.lastMessagePreview : "",
          isLoadingStats: false,
        }));

        setSessions(mapped);
      } catch (err) {
        console.error("Failed to fetch chat history:", err);
      } finally {
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

  // 4. Atomic batch cleanup for all empty sessions via Rust engine::session::stats
  const handleCleanupEmptySessions = useCallback(async () => {
    const emptySessions = sessions.filter((s) => s.messageCount === 0);
    if (emptySessions.length === 0) return;

    setIsCleaning(true);
    try {
      const res = await engineFetch("/api/session/cleanup-empty", {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        const deletedCount =
          typeof data?.deletedCount === "number"
            ? data.deletedCount
            : emptySessions.length;
        setSessions((prev) => prev.filter((s) => s.messageCount !== 0));
        toast.success(`Cleaned up ${deletedCount} empty sessions`);
        return;
      }

      // Fallback if endpoint is unavailable
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
