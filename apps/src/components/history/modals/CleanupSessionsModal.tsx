import { RotateCcw, Trash2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, Button } from "../../ui";

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
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isCleaning && onClose()}>
      <DialogContent hideCloseButton className="max-w-md">
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

        <DialogFooter className="mt-1">
          <Button variant="ghost" disabled={isCleaning} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="default" disabled={isCleaning} onClick={onConfirm}>
            {isCleaning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Cleaning...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                <span>Clean Up All {emptyCount}</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
