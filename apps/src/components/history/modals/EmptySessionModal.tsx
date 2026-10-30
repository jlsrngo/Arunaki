import { AlertCircle, Trash2 } from "lucide-react";
import { ChatSession } from "../historyUtils";
import { Dialog, DialogContent, DialogFooter, Button } from "../../ui";

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
    <Dialog open={Boolean(session)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent hideCloseButton className="max-w-md">
        <div className="flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-[var(--bg-hover)] border border-[var(--border-color)] flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-[var(--text-primary)]" strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">
              Empty Session Notice
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-1.5 leading-relaxed">
              This session contains <strong className="text-[var(--text-primary)]">0 messages</strong>. It was created automatically when opening a folder or starting the app without sending instructions.
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

        <DialogFooter className="mt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => onDelete(session)}>
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Session</span>
          </Button>
          <Button variant="default" onClick={() => onOpenAnyway(session)}>
            Open Anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
