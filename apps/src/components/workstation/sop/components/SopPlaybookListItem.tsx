import { memo } from "react";
import { ClipboardCheck } from "lucide-react";
import { cn } from "../../../../lib/utils";
import { Badge } from "../../../ui";
import { SopPlaybookDef } from "../sopTypes";

interface SopPlaybookListItemProps {
  playbook: SopPlaybookDef;
  isSelected: boolean;
  onSelect: (playbook: SopPlaybookDef) => void;
}

export const SopPlaybookListItem = memo(function SopPlaybookListItem({
  playbook,
  isSelected,
  onSelect,
}: SopPlaybookListItemProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(playbook)}
      className={cn(
        "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left text-xs transition-colors group cursor-pointer",
        isSelected
          ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
      )}
      title={`${playbook.title} (${playbook.category})`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-4 h-4 rounded bg-[#cf6613] flex items-center justify-center shrink-0">
          <ClipboardCheck className="w-2.5 h-2.5 text-white" />
        </span>
        <span
          className={cn(
            "truncate text-xs transition-colors",
            isSelected
              ? "font-medium text-[var(--text-primary)]"
              : "font-normal text-[var(--text-primary)]"
          )}
        >
          {playbook.title}
        </span>
      </div>
      <Badge
        variant="outline"
        className="px-1.5 py-0 font-mono text-[10px] shrink-0 ml-2"
      >
        {playbook.steps.length} steps
      </Badge>
    </button>
  );
});

