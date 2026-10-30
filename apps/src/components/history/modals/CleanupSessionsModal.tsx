import { RotateCcw, Trash2, Loader2 } from "lucide-react";

interface CleanupSessionsModalProps {
  isOpen: boolean;
  emptyCount: number;
  isCleaning: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function CleanupSessionsModal({
  isOpen,
  emptyCount,
  isCleaning,
  onClose,
  onConfirm,
}: CleanupSessionsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-[var(--bg-card)] text-[var(--text-primary)] rounded-xl max-w-md w-full p-5 border border-[var(--border-strong)]">
        <div className="flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-[var(--bg-hover)] border border-[var(--border-color)] flex items-center justify-center shrink-0">
            <RotateCcw className="w-4 h-4 text-[var(--text-primary)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">
              Clean Up Empty Sessions
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-1.5 leading-relaxed">
              This will remove all{" "}
              <strong className="text-[var(--text-primary)]">
                {emptyCount} empty sessions
              </strong>{" "}
              (sessions with 0 messages). Active conversations with real chat
              history will not be affected.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-[var(--border-color)]">
          <button
            type="button"
            disabled={isCleaning}
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isCleaning}
            onClick={onConfirm}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--text-primary)] text-[var(--bg-card)] hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
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
  );
}
