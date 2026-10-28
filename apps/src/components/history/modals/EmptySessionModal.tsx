import { AlertCircle, Trash2 } from "lucide-react";
import { ChatSession } from "../historyUtils";

interface EmptySessionModalProps {
  session: ChatSession | null;
  onClose: () => void;
  onDelete: (session: ChatSession) => void;
  onOpenAnyway: (session: ChatSession) => void;
}

export function EmptySessionModal({
  session,
  onClose,
  onDelete,
  onOpenAnyway,
}: EmptySessionModalProps) {
  if (!session) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-[var(--bg-card)] text-[var(--text-primary)] rounded-xl max-w-md w-full p-5 border border-[var(--border-strong)] shadow-2xl">
        <div className="flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-[var(--bg-hover)] border border-[var(--border-color)] flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-white" strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-white tracking-tight">
              Empty Session Notice
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-1.5 leading-relaxed">
              This session contains <strong className="text-white">0 messages</strong>. It was created automatically when opening a folder or starting the app without sending instructions.
            </p>
            <div className="mt-3 p-2.5 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)] text-[11px] text-[var(--text-dim)] space-y-1">
              <div className="truncate">
                <strong className="text-[var(--text-muted)]">ID:</strong>{" "}
                {session.id}
              </div>
              {session.directory && (
                <div className="truncate">
                  <strong className="text-[var(--text-muted)]">Folder:</strong>{" "}
                  {session.directory}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-[var(--border-color)]">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onDelete(session)}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white border border-rose-600 transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Session</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenAnyway(session)}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white text-black hover:bg-neutral-200 transition-colors cursor-pointer shadow-xs"
          >
            Open Anyway
          </button>
        </div>
      </div>
    </div>
  );
}
