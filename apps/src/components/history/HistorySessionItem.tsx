import { memo } from "react";
import { MessageSquare, Clock, Folder, Trash2, ArrowUpRight, MessageSquareDashed } from "lucide-react";
import { ChatSession } from "./historyUtils";

interface HistorySessionItemProps {
  session: ChatSession;
  onClick: () => void;
  onDelete: (session: ChatSession) => void;
}

export const HistorySessionItem = memo(function HistorySessionItem({
  session,
  onClick,
  onDelete,
}: HistorySessionItemProps) {
  const dateStr = session.createdAt
    ? new Date(session.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const folderName = session.directory
    ? session.directory.replace(/\\/g, "/").split("/").filter(Boolean).pop() || session.directory
    : "";

  const isEmpty = session.messageCount === 0;

  return (
    <div
      onClick={onClick}
      className={`group flex items-center justify-between p-3.5 bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] border rounded-xl cursor-pointer transition-all duration-150 ${
        isEmpty
          ? "border-[var(--border-color)] opacity-75 hover:opacity-100"
          : "border-[var(--border-color)] hover:border-[var(--border-strong)]"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1 mr-3">
        <div className="w-8 h-8 rounded-lg bg-[var(--bg-hover)] flex items-center justify-center shrink-0 border border-[var(--border-color)]">
          {isEmpty ? (
            <MessageSquareDashed
              className="w-4 h-4 text-[var(--text-dim)] group-hover:text-[var(--text-muted)] transition-colors"
              strokeWidth={1.5}
            />
          ) : (
            <MessageSquare
              className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors"
              strokeWidth={1.5}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
            {session.title || "Untitled Conversation"}
          </p>

          {session.lastMessagePreview && (
            <p className="text-[11px] text-[var(--text-muted)] line-clamp-1 italic mt-0.5 select-none">
              "{session.lastMessagePreview}"
            </p>
          )}

          <div className="text-[11px] text-[var(--text-dim)] flex items-center gap-1.5 mt-1">
            <span className="flex items-center gap-1 shrink-0">
              <Clock className="w-3 h-3" strokeWidth={1.5} />
              <span>{dateStr || "Just now"}</span>
            </span>
            {folderName && (
              <>
                <span>•</span>
                <span
                  className="flex items-center gap-1 text-[var(--text-muted)] hover:text-white font-medium truncate transition-colors cursor-pointer"
                  title={`Open folder: ${session.directory}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClick();
                  }}
                >
                  <Folder className="w-3 h-3 shrink-0" strokeWidth={1.5} />
                  <span className="truncate">{folderName}</span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right side: Badge & Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {session.isLoadingStats ? (
          <span className="px-2 py-0.5 text-[10px] text-[var(--text-dim)] bg-[var(--bg-app)] border border-[var(--border-color)] rounded-md animate-pulse">
            Checking...
          </span>
        ) : isEmpty ? (
          <span className="px-2 py-0.5 text-[10px] font-medium text-[var(--text-dim)] bg-[var(--bg-app)] border border-[var(--border-color)] rounded-md">
            Empty (0 msgs)
          </span>
        ) : typeof session.messageCount === "number" ? (
          <span className="px-2 py-0.5 text-[10px] font-medium text-white bg-[var(--bg-hover)] border border-[var(--border-strong)] rounded-md">
            {session.messageCount} msgs
          </span>
        ) : null}

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            title="Resume conversation"
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(session);
            }}
            title="Delete session"
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-white hover:bg-rose-600 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
});
