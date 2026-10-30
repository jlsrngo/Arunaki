import { memo } from "react";
import { MessageSquare, Clock, Folder, Trash2, ArrowUpRight, MessageSquareDashed } from "lucide-react";
import { ChatSession } from "./historyUtils";
import { Card, Badge, Button } from "../ui";

const SESSION_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function getFolderBasename(directory?: string): string {
  if (!directory) return "";
  return directory.replace(/\\/g, "/").split("/").filter(Boolean).pop() || directory;
}

interface HistorySessionItemProps {
  session: ChatSession;
  onSelect: (session: ChatSession) => void;
  onDelete: (session: ChatSession) => void;
}

export const HistorySessionItem = memo(function HistorySessionItem({
  session,
  onSelect,
  onDelete,
}: HistorySessionItemProps) {
  const dateStr = session.createdAt
    ? SESSION_DATE_FORMATTER.format(new Date(session.createdAt))
    : "";

  const folderName = getFolderBasename(session.directory);
  const isEmpty = session.messageCount === 0;

  return (
    <Card
      onClick={() => onSelect(session)}
      className={`group flex items-center justify-between p-3.5 hover:bg-[var(--bg-hover)] rounded-xl cursor-pointer transition-all duration-150 ${
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
                  className="flex items-center gap-1 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] font-medium truncate transition-colors"
                  title={`Open folder: ${session.directory}`}
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
          <Badge variant="outline" className="animate-pulse">
            Checking...
          </Badge>
        ) : isEmpty ? (
          <Badge variant="outline">
            Empty (0 msgs)
          </Badge>
        ) : typeof session.messageCount === "number" ? (
          <Badge variant="secondary">
            {session.messageCount} msgs
          </Badge>
        ) : null}

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(session);
            }}
            title="Resume conversation"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost-destructive"
            size="icon-sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(session);
            }}
            title="Delete session"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
});
