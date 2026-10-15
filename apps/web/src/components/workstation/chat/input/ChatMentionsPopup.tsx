import { memo } from "react";
import { cn } from "../../../../lib/utils";
import { getFileIcon } from "../../../workspace/tree-utils";
import { useI18n } from "../../../../lib/i18n";

interface ChatMentionsPopupProps {
  showMentions: boolean;
  mentionResults: string[];
  mentionIndex: number;
  onSelectMention: (name: string) => void;
}

export const ChatMentionsPopup = memo(function ChatMentionsPopup({
  showMentions,
  mentionResults,
  mentionIndex,
  onSelectMention,
}: ChatMentionsPopupProps) {
  const { t } = useI18n();

  if (!showMentions || mentionResults.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 z-50 bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-xl overflow-hidden shadow-2xl transform-gpu will-change-transform">
      <div className="px-3 py-1.5 text-[10px] font-bold text-[var(--text-muted)] bg-[var(--bg-hover)] border-b border-[var(--border-color)]">
        {t("selectFileToAttach", "Select file to attach")}
      </div>
      <div className="max-h-44 overflow-y-auto">
        {mentionResults.map((name, i) => (
          <button
            key={name}
            type="button"
            onClick={() => onSelectMention(name)}
            className={cn(
              "w-full px-3 py-1.5 text-xs flex items-center gap-2 transition-colors cursor-pointer text-left hover:bg-[var(--bg-hover)]",
              i === mentionIndex
                ? "bg-[var(--bg-hover)] text-[var(--text-primary)] font-medium"
                : "text-[var(--text-secondary)]"
            )}
          >
            {getFileIcon(name)}
            <span className="truncate">{name}</span>
          </button>
        ))}
      </div>
    </div>
  );
});
