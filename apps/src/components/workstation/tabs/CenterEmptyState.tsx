import { memo } from "react";
import { ArunakiLogo } from "../../common/ArunakiLogo";
import { useI18n } from "../../../lib/i18n";

export const CenterEmptyState = memo(function CenterEmptyState() {
  const { t } = useI18n();

  return (
    <div className="h-full w-full flex flex-col items-center justify-center select-none p-8 animate-in fade-in duration-300">
      <div className="flex flex-col items-center gap-6">
        <ArunakiLogo className="w-16 h-16 text-[var(--text-primary)] opacity-95" />
        <span className="font-mono text-2xl md:text-3xl font-bold tracking-tight text-[var(--text-primary)] select-none">
          Arunaki Agent
        </span>
      </div>

      <div className="mt-20 text-sm md:text-base font-normal text-[var(--text-muted)] font-mono tracking-tight select-none">
        {t("workWithAgent", "Work with Agent")}
      </div>
    </div>
  );
});
