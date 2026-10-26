import { memo } from "react";
import { FolderOpen } from "lucide-react";
import { ArunakiLogo } from "../../common/ArunakiLogo";
import { useI18n } from "../../../lib/i18n";

interface CenterEmptyStateProps {
  onOpenFolder?: () => void;
  hasOpenFolder?: boolean;
}

export const CenterEmptyState = memo(function CenterEmptyState({
  onOpenFolder,
  hasOpenFolder = false,
}: CenterEmptyStateProps) {
  const { t } = useI18n();

  return (
    <div className="h-full w-full flex flex-col items-center justify-center select-none p-8 animate-in fade-in duration-300">
      <div className="flex flex-col items-center gap-6">
        <ArunakiLogo className="w-16 h-16 text-[var(--text-primary)] opacity-95" />
        <span className="font-mono text-2xl md:text-3xl font-bold tracking-tight text-[var(--text-primary)] select-none">
          Arunaki Agent
        </span>
      </div>

      <div className="mt-16 flex flex-col items-center gap-4">
        <div className="text-sm md:text-base font-normal text-[var(--text-muted)] font-mono tracking-tight select-none">
          {t("workWithAgent", "Work with Agent")}
        </div>

        {!hasOpenFolder && onOpenFolder && (
          <button
            type="button"
            onClick={onOpenFolder}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[var(--bg-hover)] hover:bg-[var(--bg-card)] border border-[var(--border-strong)] text-xs font-semibold text-white transition-all shadow-xs cursor-pointer active:scale-95"
          >
            <FolderOpen className="w-3.5 h-3.5 text-white" strokeWidth={1.5} />
            <span>{t("openFolder", "Open Folder...")}</span>
          </button>
        )}
      </div>
    </div>
  );
});
