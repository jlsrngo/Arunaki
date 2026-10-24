import { useState, useEffect, useMemo } from "react";
import { Search, MessageSquare, Clock, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { listSessions } from "../../lib/engine";

interface ChatSession {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SearchSectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSession: (chatId: string) => void;
  activeFolder?: string;
}

export function SearchSectionModal({
  isOpen,
  onClose,
  onSelectSession,
  activeFolder,
}: SearchSectionModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const { data: sessions = [], isLoading } = useQuery<ChatSession[]>({
    queryKey: ["chat-sessions-search-section", activeFolder],
    queryFn: async () => {
      try {
        const cleanDir = activeFolder ? activeFolder.replace(/\\/g, "/").replace(/\/+/g, "/") : undefined;
        const data = await listSessions({ directory: cleanDir, limit: 50 });
        return (data || []).map((s: any) => ({
          id: s.id,
          title: s.title || "",
          createdAt: s.time?.created || "",
          updatedAt: s.time?.updated || s.time?.created || "",
        }));
      } catch {
        return [];
      }
    },
    enabled: isOpen,
  });

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const query = searchQuery.toLowerCase().trim();
    return sessions.filter((s) => {
      const title = s.title || "New Conversation";
      return title.toLowerCase().includes(query);
    });
  }, [sessions, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-150 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-2xl overflow-hidden flex flex-col h-[460px] min-h-[460px] max-h-[85vh] shadow-2xl transform-gpu will-change-transform"
      >
        {/* Header Search Bar */}
        <div className="p-3.5 border-b border-[var(--border-color)] flex items-center gap-3 bg-[var(--bg-panel)] shrink-0">
          <Search className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chat sessions or topics..."
            autoFocus
            className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] focus:outline-none font-sans"
          />
          <button
            onClick={onClose}
            className="text-[var(--text-dim)] hover:text-[var(--text-primary)] p-1 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sessions List Area */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 overscroll-contain custom-scrollbar transform-gpu min-h-0">
          {isLoading ? (
            <div className="h-full flex items-center justify-center text-xs text-[var(--text-dim)] font-mono">
              Loading chat sessions...
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-[var(--text-dim)] font-mono">
              No chat sessions found
            </div>
          ) : (
            filteredSessions.map((session) => {
              const displayTitle = session.title || "New Conversation";
              const dateStr = session.updatedAt
                ? new Date(session.updatedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "";

              return (
                <button
                  key={session.id}
                  onClick={() => {
                    onSelectSession(session.id);
                    onClose();
                  }}
                  className="w-full text-left py-2.5 px-3 rounded-xl hover:bg-[var(--bg-hover)] transition-colors flex items-center justify-between group cursor-pointer border border-transparent hover:border-[var(--border-strong)]"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-3">
                    <div className="w-7 h-7 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-color)] flex items-center justify-center shrink-0 group-hover:bg-[var(--bg-card)] transition-colors">
                      <MessageSquare className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[var(--text-primary)] truncate transition-colors">
                        {displayTitle}
                      </p>
                      <p className="text-[10px] text-[var(--text-dim)] flex items-center gap-1 mt-0.5 font-mono">
                        <Clock className="w-3 h-3" />
                        <span>{dateStr || "Just now"}</span>
                      </p>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 border-t border-[var(--border-color)] bg-[var(--bg-panel)] flex items-center justify-between text-[11px] text-[var(--text-dim)] shrink-0">
          <span>Select session to open</span>
          <span className="font-mono text-[10px] bg-[var(--bg-hover)] text-[var(--text-muted)] px-1.5 py-0.5 rounded">
            ESC to close
          </span>
        </div>
      </div>
    </div>
  );
}
