import { memo, useState, useEffect, type KeyboardEvent, type FocusEvent } from "react";
import { Bot, Plus, PanelRightClose, Sparkles, Loader2 } from "lucide-react";
import { getSession } from "../../../lib/engine";
import { API_BASE, apiFetch } from "../../../lib/api";
import { useI18n } from "../../../lib/i18n";
import { cn } from "../../../lib/utils";

interface WorkstationRightChatHeaderProps {
  activeChatId?: string;
  onNewChat?: () => void;
  onCompactSession?: () => void;
  isCompacting?: boolean;
  isCompacted?: boolean;
  onClose: () => void;
}

export const WorkstationRightChatHeader = memo(function WorkstationRightChatHeader({
  activeChatId,
  onNewChat,
  onCompactSession,
  isCompacting,
  isCompacted,
  onClose,
}: WorkstationRightChatHeaderProps) {
  const { t } = useI18n();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [chatTitle, setChatTitle] = useState("Chat");

  useEffect(() => {
    const fetchTitle = () => {
      if (activeChatId) {
        const saved = localStorage.getItem(`arunaki_chat_name_${activeChatId}`);
        if (saved) {
          setChatTitle(saved);
        } else {
          getSession(activeChatId).then((sess) => {
            if (sess?.title) {
              setChatTitle(sess.title);
            } else {
              setChatTitle("Chat");
            }
          }).catch(() => setChatTitle("Chat"));
        }
      } else {
        setChatTitle("New Chat");
      }
    };

    fetchTitle();

    const handleSessionUpdated = (e: any) => {
      const targetId = e.detail?.sessionId || e.detail?.sessionID;
      if (targetId === activeChatId && e.detail?.title) {
        setChatTitle(e.detail.title);
        localStorage.setItem(`arunaki_chat_name_${activeChatId}`, e.detail.title);
      }
    };

    window.addEventListener("arunaki:session-updated", handleSessionUpdated);
    return () => window.removeEventListener("arunaki:session-updated", handleSessionUpdated);
  }, [activeChatId]);

  const handleTitleSubmit = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  const handleTitleBlur = (e: FocusEvent<HTMLInputElement>) => {
    const newTitle = e.target.value.trim() || "Chat";
    setChatTitle(newTitle);
    setIsEditingTitle(false);
    if (activeChatId) {
      localStorage.setItem(`arunaki_chat_name_${activeChatId}`, newTitle);
      apiFetch(`${API_BASE}/session/${activeChatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      }).catch(() => {});
      window.dispatchEvent(
        new CustomEvent("arunaki:session-updated", {
          detail: { sessionId: activeChatId, title: newTitle },
        })
      );
    }
  };

  const displayTitle =
    chatTitle === "Chat"
      ? t("chat", "Chat")
      : chatTitle === "New Chat"
      ? t("newChat", "New Chat")
      : chatTitle;

  return (
    <div className="h-9 px-3 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-panel)] shrink-0 select-none">
      <div className="flex items-center gap-2 flex-1 min-w-0 pr-4">
        <Bot className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
        {isEditingTitle ? (
          <input
            type="text"
            defaultValue={chatTitle === "Chat" || chatTitle === "New Chat" ? "" : chatTitle}
            placeholder={t("sessionNamePlaceholder", "Session Name...")}
            autoFocus
            onKeyDown={handleTitleSubmit}
            onBlur={handleTitleBlur}
            className="bg-transparent border-none outline-none text-xs font-semibold text-[var(--text-primary)] w-full focus:ring-1 focus:ring-[var(--border-strong)] rounded px-1 -ml-1 transition-all placeholder-[var(--text-dim)]"
          />
        ) : (
          <span
            onClick={() => setIsEditingTitle(true)}
            className="text-xs font-semibold text-[var(--text-primary)] truncate cursor-pointer hover:bg-[var(--bg-hover)] px-1 py-0.5 -ml-1 rounded transition-colors"
            title={t("clickToRenameSession", "Click to rename session")}
          >
            {displayTitle}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {onCompactSession && (
          <button
            type="button"
            disabled={isCompacting}
            onClick={onCompactSession}
            className={cn(
              "w-5 h-5 rounded bg-[#cf6613] hover:bg-[#b8580f] text-white flex items-center justify-center transition-colors cursor-pointer shrink-0",
              isCompacting && "opacity-80 cursor-wait"
            )}
            title={
              isCompacting
                ? "Compacting session context..."
                : isCompacted
                ? "Context compacted (/compact active) — Click to restore"
                : t("compactSessionContext", "Compact Context (/compact)")
            }
          >
            {isCompacting ? (
              <Loader2 className="w-3 h-3 text-white animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3 text-white" strokeWidth={2} />
            )}
          </button>
        )}
        {onNewChat && (
          <button
            type="button"
            onClick={onNewChat}
            className="w-5 h-5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer flex items-center justify-center shrink-0"
            title={t("newChatSession", "New Chat Session")}
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="w-5 h-5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer flex items-center justify-center shrink-0"
          title={t("closePanel", "Close Panel")}
        >
          <PanelRightClose className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
});
