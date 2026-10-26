import { memo } from "react";
import { ChevronRight } from "lucide-react";

interface CenterBreadcrumbsProps {
  folderName: string;
  tabTitle: string;
  appName?: string;
}

export const CenterBreadcrumbs = memo(function CenterBreadcrumbs({
  folderName,
  tabTitle,
  appName,
}: CenterBreadcrumbsProps) {
  const showAppCrumb = appName && appName.toLowerCase() !== tabTitle.toLowerCase();

  return (
    <div className="h-[24px] bg-[var(--bg-panel)] border-b border-[var(--border-color)] px-4 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] select-none shrink-0 font-sans transition-colors">
      <span>{folderName}</span>
      <ChevronRight className="w-3 h-3 text-[var(--text-dim)]" />
      {showAppCrumb && (
        <>
          <span className="text-[var(--text-muted)]">{appName}</span>
          <ChevronRight className="w-3 h-3 text-[var(--text-dim)]" />
        </>
      )}
      <span className="text-[var(--text-primary)] font-medium">{tabTitle}</span>
    </div>
  );
});
