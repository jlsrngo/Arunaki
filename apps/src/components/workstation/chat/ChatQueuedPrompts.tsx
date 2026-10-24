import { memo } from "react";
import { Clock, X } from "lucide-react";

interface ChatQueuedPromptsProps {
  queuedPrompts: string[];
  onRemoveQueuedPrompt?: (index: number) => void;
}

export const ChatQueuedPrompts = memo(function ChatQueuedPrompts({
  queuedPrompts,
  onRemoveQueuedPrompt,
}: ChatQueuedPromptsProps) {
  if (queuedPrompts.length === 0) return null;

  return (
    <div className="mb-2 px-3 py-2 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] font-mono">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-[var(--text-primary)] animate-pulse" />
          <span className="font-semibold text-[var(--text-primary)]">
            Message Queue ({queuedPrompts.length})
          </span>
        </div>
        <span className="text-[10px] text-[var(--text-dim)]">Auto-processing</span>
      </div>
      {queuedPrompts.map((promptText, idx) => (
        <div
          key={idx}
          className="flex items-center justify-between bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-2.5 py-1 text-xs text-[var(--text-primary)]"
        >
          <span className="truncate max-w-[210px] font-mono text-[11px]">{promptText}</span>
          <button
            type="button"
            onClick={() => onRemoveQueuedPrompt?.(idx)}
            className="text-[var(--text-dim)] hover:text-red-500 p-0.5 rounded transition-colors cursor-pointer"
            title="Cancel queued message"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
});
