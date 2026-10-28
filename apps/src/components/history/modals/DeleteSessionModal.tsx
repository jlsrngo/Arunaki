import { Trash2 } from "lucide-react";
import { ChatSession } from "../historyUtils";

interface DeleteSessionModalProps {
  session: ChatSession | null;
  onClose: () => void;
  onConfirm: (session: ChatSession) => void;
}

export function DeleteSessionModal({
  session,
  onClose,
  onConfirm,
}: DeleteSessionModalProps) {
  if (!session) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-[var(--bg-card)] text-[var(--text-primary)] rounded-xl max-w-md w-full p-5 border border-[var(--border-strong)] shadow-2xl">
        <div className="flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-rose-600 border border-rose-600 flex items-center justify-center shrink-0">
            <Trash2 className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-white tracking-tight">
              Delete Conversation
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-1.5 leading-relaxed">
              Are you sure you want to permanently delete{" "}
              <strong className="text-white">
                "{session.title || "Untitled Conversation"}"
              </strong>
              ?
              {session.messageCount && session.messageCount > 0
                ? ` This session has ${session.messageCount} saved messages which will be permanently erased.`
                : " All associated records will be removed."}
            </p>
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
            onClick={() => onConfirm(session)}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Confirm Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
}
