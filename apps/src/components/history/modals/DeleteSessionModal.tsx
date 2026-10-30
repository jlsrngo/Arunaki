import { Trash2 } from "lucide-react";
import { ChatSession } from "../historyUtils";
import { Dialog, DialogContent, DialogFooter, Button } from "../../ui";

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
    <Dialog open={Boolean(session)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent hideCloseButton className="max-w-md">
        <div className="flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-rose-600 border border-rose-600 flex items-center justify-center shrink-0">
            <Trash2 className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">
              Delete Conversation
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-1.5 leading-relaxed">
              Are you sure you want to permanently delete{" "}
              <strong className="text-[var(--text-primary)]">
                "{session.title || "Untitled Conversation"}"
              </strong>
              ?
              {session.messageCount && session.messageCount > 0
                ? ` This session has ${session.messageCount} saved messages which will be permanently erased.`
                : " All associated records will be removed."}
            </p>
          </div>
        </div>

        <DialogFooter className="mt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => onConfirm(session)}>
            <Trash2 className="w-3.5 h-3.5" />
            <span>Confirm Delete</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
