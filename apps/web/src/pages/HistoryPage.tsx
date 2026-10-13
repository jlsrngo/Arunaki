import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Trash2,
  X,
  MessageSquare,
  MessageSquareDashed,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { listSessions, deleteSession, engineFetch } from "../lib/engine";
import { ChatSession, groupSessionsByDate } from "../components/history/historyUtils";
import { HistorySessionItem } from "../components/history/HistorySessionItem";

type FilterTab = "all" | "active" | "empty";

export function HistoryPage() {
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

        const initial: ChatSession[] = (raw || []).map((s: any) => ({
          id: s.id,
          title: s.title || "",
          createdAt: s.time?.created ? new Date(s.time.created).toISOString() : "",
          updatedAt: s.time?.updated ? new Date(s.time.updated).toISOString() : s.time?.created ? new Date(s.time.created).toISOString() : "",
          directory: s.directory || s.location?.directory || "",
          isLoadingStats: true,
        }));

        setSessions(initial);
        setLoading(false);

        // Fetch stats (message count & preview) in concurrent chunks of 10
        const chunkSize = 10;
        for (let i = 0; i < initial.length; i += chunkSize) {
          if (!isMounted) break;
          const chunk = initial.slice(i, i + chunkSize);

          const updates = await Promise.all(
            chunk.map(async (sess) => {
              try {
                const res = await engineFetch(`/api/session/${sess.id}/message?limit=200&order=desc`);
                if (res.ok) {
                  const json = await res.json();
                  const rawMsgs = json.data || [];

                  // Count real conversational messages (user & assistant turns)
                  const chatMsgs = rawMsgs.filter(
                    (m: any) => m && m.type !== "system" && m.type !== "compaction" && m.type !== "model-switched"
                  );
                  const count = chatMsgs.length > 0 ? chatMsgs.length : rawMsgs.length;

                  // Extract latest message snippet from newest message
                  let preview = "";
                  const candidateMsgs = chatMsgs.length > 0 ? chatMsgs : rawMsgs;
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
                        (p: any) => p && (p.type === "text" || !p.type) && typeof p.text === "string" && p.text.trim()
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
                    lastMessagePreview: preview ? preview.trim().replace(/\s+/g, " ").slice(0, 95) : "",
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
        localStorage.setItem(`arunaki_active_chat_id_${sessionFolder}`, session.id);
      } else {
        localStorage.removeItem("arunaki_active_folder");
      }
      localStorage.setItem("arunaki_active_chat_id", session.id);

      if (session.messageCount && session.messageCount > 0) {
        toast.success(`Resuming conversation (${session.messageCount} messages)`);
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
      const results = await Promise.allSettled(emptySessions.map((s) => deleteSession(s.id)));
      const deletedCount = results.filter((r) => r.status === "fulfilled" && (r as any).value).length;
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
  const activeCount = useMemo(() => sessions.filter((s) => (s.messageCount ?? 0) > 0).length, [sessions]);
  const emptyCount = useMemo(() => sessions.filter((s) => s.messageCount === 0).length, [sessions]);

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
          (s.lastMessagePreview && s.lastMessagePreview.toLowerCase().includes(q))
      );
    }

    return result;
  }, [sessions, activeTab, searchQuery]);

  const groupedSessions = useMemo(() => {
    return groupSessionsByDate(filteredSessions);
  }, [filteredSessions]);

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [group]: !prev[group],
    }));
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--bg-app)] text-[var(--text-primary)] overflow-hidden select-none transition-colors duration-150">
      {/* Sticky Top Header, Search & Filter Controls */}
      <div className="w-full max-w-4xl mx-auto px-8 pt-8 pb-4 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
              Chat History
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              View, resume, or clean up previous conversations and sessions
            </p>
          </div>

          {/* Batch Clean Up Button for Empty Sessions */}
          {emptyCount > 0 && (
            <button
              type="button"
              onClick={() => setCleanupConfirmModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-white bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] hover:border-[var(--border-strong)] transition-all cursor-pointer shadow-xs"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Clean up {emptyCount} empty {emptyCount === 1 ? "session" : "sessions"}</span>
            </button>
          )}
        </div>

        {/* Search Input */}
        <div className="relative mb-3">
          <Search
            size={14}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-dim)]"
            strokeWidth={1.5}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, prompt snippet, or project folder..."
            className="w-full pl-9 pr-3.5 py-2.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-primary)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--border-strong)] font-sans transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-dim)] hover:text-white p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
              activeTab === "all"
                ? "bg-[var(--bg-hover)] text-white border-[var(--border-strong)]"
                : "bg-transparent text-[var(--text-muted)] border-transparent hover:bg-[var(--bg-hover)]/50"
            }`}
          >
            All ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("active")}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer border flex items-center gap-1.5 ${
              activeTab === "active"
                ? "bg-[var(--bg-hover)] text-white border-[var(--border-strong)]"
                : "bg-transparent text-[var(--text-muted)] border-transparent hover:bg-[var(--bg-hover)]/50"
            }`}
          >
            <MessageSquare className="w-3 h-3" />
            <span>Active Conversations ({activeCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("empty")}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer border flex items-center gap-1.5 ${
              activeTab === "empty"
                ? "bg-[var(--bg-hover)] text-white border-[var(--border-strong)]"
                : "bg-transparent text-[var(--text-muted)] border-transparent hover:bg-[var(--bg-hover)]/50"
            }`}
          >
            <MessageSquareDashed className="w-3 h-3" />
            <span>Empty Stubs ({emptyCount})</span>
          </button>
        </div>
      </div>

      {/* Scrollable History List */}
      <div className="flex-1 overflow-y-auto w-full max-w-4xl mx-auto px-8 pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-[var(--text-muted)] gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Loading history...</span>
          </div>
        ) : groupedSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-10 h-10 rounded-full bg-[var(--bg-hover)] flex items-center justify-center mb-3 border border-[var(--border-color)]">
              <Sparkles className="w-5 h-5 text-[var(--text-muted)]" strokeWidth={1.5} />
            </div>
            <p className="text-xs font-medium text-[var(--text-primary)] mb-1">
              {searchQuery ? "No matching conversations found" : "No Chat History Yet"}
            </p>
            <p className="text-[11px] text-[var(--text-muted)] max-w-[280px]">
              {searchQuery
                ? "Try searching with a different keyword or reset your filter."
                : "Your conversations and project folder sessions will appear here automatically."}
            </p>
          </div>
        ) : (
          <div className="space-y-6 pt-2">
            {groupedSessions.map((group) => {
              const isCollapsed = collapsedGroups[group.group];
              return (
                <div key={group.group} className="space-y-2">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.group)}
                    className="flex items-center gap-1.5 px-1 cursor-pointer group/header w-full text-left"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover/header:text-[var(--text-primary)] transition-colors" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover/header:text-[var(--text-primary)] transition-colors" />
                    )}
                    <h2 className="text-sm font-bold text-[var(--text-primary)] tracking-wide">
                      {group.group}
                    </h2>
                    <span className="text-[11px] text-[var(--text-dim)] font-mono ml-1">
                      ({group.items.length})
                    </span>
                  </button>

                  {!isCollapsed && (
                    <div className="space-y-1.5">
                      {group.items.map((session) => (
                        <HistorySessionItem
                          key={session.id}
                          session={session}
                          onClick={() => handleOpenSession(session)}
                          onDelete={(sess) => setDeleteModal(sess)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL 1: Empty Session Warning Dialog */}
      {emptySessionModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[var(--bg-card)] text-[var(--text-primary)] rounded-xl max-w-md w-full p-5 border border-[var(--border-strong)] shadow-2xl">
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-[var(--bg-hover)] border border-[var(--border-color)] flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 text-white" strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-white tracking-tight">Empty Session Notice</h3>
                <p className="text-xs text-[var(--text-muted)] mt-1.5 leading-relaxed">
                  This session contains <strong className="text-white">0 messages</strong>. It was created automatically when opening a folder or starting the app without sending instructions.
                </p>
                <div className="mt-3 p-2.5 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)] text-[11px] text-[var(--text-dim)] space-y-1">
                  <div className="truncate"><strong className="text-[var(--text-muted)]">ID:</strong> {emptySessionModal.id}</div>
                  {emptySessionModal.directory && (
                    <div className="truncate"><strong className="text-[var(--text-muted)]">Folder:</strong> {emptySessionModal.directory}</div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-[var(--border-color)]">
              <button
                type="button"
                onClick={() => setEmptySessionModal(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteSession(emptySessionModal)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Session</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenSession(emptySessionModal, true)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white text-black hover:bg-neutral-200 transition-colors cursor-pointer shadow-xs"
              >
                Open Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Delete Session Confirmation */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[var(--bg-card)] text-[var(--text-primary)] rounded-xl max-w-md w-full p-5 border border-[var(--border-strong)] shadow-2xl">
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4 text-rose-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-white tracking-tight">Delete Conversation</h3>
                <p className="text-xs text-[var(--text-muted)] mt-1.5 leading-relaxed">
                  Are you sure you want to permanently delete <strong className="text-white">"{deleteModal.title || 'Untitled Conversation'}"</strong>?
                  {deleteModal.messageCount && deleteModal.messageCount > 0
                    ? ` This session has ${deleteModal.messageCount} saved messages which will be permanently erased.`
                    : " All associated records will be removed."}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-[var(--border-color)]">
              <button
                type="button"
                onClick={() => setDeleteModal(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteSession(deleteModal)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Batch Cleanup Confirm */}
      {cleanupConfirmModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[var(--bg-card)] text-[var(--text-primary)] rounded-xl max-w-md w-full p-5 border border-[var(--border-strong)] shadow-2xl">
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-[var(--bg-hover)] border border-[var(--border-color)] flex items-center justify-center shrink-0">
                <RotateCcw className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-white tracking-tight">Clean Up Empty Sessions</h3>
                <p className="text-xs text-[var(--text-muted)] mt-1.5 leading-relaxed">
                  This will remove all <strong className="text-white">{emptyCount} empty sessions</strong> (sessions with 0 messages). Active conversations with real chat history will not be affected.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-[var(--border-color)]">
              <button
                type="button"
                disabled={isCleaning}
                onClick={() => setCleanupConfirmModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)] transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isCleaning}
                onClick={handleCleanupEmptySessions}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white text-black hover:bg-neutral-200 transition-colors cursor-pointer shadow-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {isCleaning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Cleaning...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Clean Up All {emptyCount}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
