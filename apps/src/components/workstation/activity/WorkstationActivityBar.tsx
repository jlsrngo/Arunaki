import { memo } from "react";
import { Files, GitBranch, Search, ClipboardCheck } from "lucide-react";
import { cn } from "../../../lib/utils";
import { useI18n } from "../../../lib/i18n";

export type SidebarView = "explorer" | "source-control" | "search" | "sop";

interface WorkstationActivityBarProps {
  activeView: SidebarView;
  isCollapsed: boolean;
  onSelectView: (view: SidebarView) => void;
  changesCount?: number;
}

export const WorkstationActivityBar = memo(function WorkstationActivityBar({
  activeView,
  isCollapsed,
  onSelectView,
  changesCount = 0,
}: WorkstationActivityBarProps) {
  const { t } = useI18n();
  const isTabActive = (view: SidebarView) => !isCollapsed && activeView === view;

  return (
    <aside
      className="w-12 h-full bg-[var(--bg-app)] border-r border-[var(--border-color)] flex flex-col justify-between shrink-0 select-none z-10"
      aria-label="Activity Bar"
    >
      {/* Top Navigation Icons */}
      <div className="flex flex-col items-center py-2 gap-1 w-full">
        {/* Explorer Button */}
        <button
          type="button"
          onClick={() => onSelectView("explorer")}
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center transition-all cursor-pointer relative group",
            isTabActive("explorer")
              ? "text-white bg-[var(--bg-hover)] shadow-xs"
              : "text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]/60"
          )}
          title="Explorer"
          aria-label="Explorer"
        >
          {isTabActive("explorer") && (
            <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-white rounded-r" />
          )}
          <Files className="w-5 h-5 stroke-[1.6]" />
        </button>

        {/* Document Changes Button */}
        <button
          type="button"
          onClick={() => onSelectView("source-control")}
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center transition-all cursor-pointer relative group",
            isTabActive("source-control")
              ? "text-white bg-[var(--bg-hover)] shadow-xs"
              : "text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]/60"
          )}
          title={t("documentChanges", "Document Changes")}
          aria-label={t("documentChanges", "Document Changes")}
        >
          {isTabActive("source-control") && (
            <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-white rounded-r" />
          )}
          <GitBranch className="w-5 h-5 stroke-[1.6]" />
          {changesCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[17px] h-[17px] px-0.5 rounded-full bg-[#0078d4] text-white text-[10px] font-bold leading-none flex items-center justify-center text-center shadow-xs pointer-events-none select-none">
              <span className="inline-block transform -translate-y-[0.5px]">
                {changesCount > 99 ? "99+" : changesCount}
              </span>
            </span>
          )}
        </button>

        {/* Search Button */}
        <button
          type="button"
          onClick={() => onSelectView("search")}
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center transition-all cursor-pointer relative group",
            isTabActive("search")
              ? "text-white bg-[var(--bg-hover)] shadow-xs"
              : "text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]/60"
          )}
          title="Search"
          aria-label="Search"
        >
          {isTabActive("search") && (
            <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-white rounded-r" />
          )}
          <Search className="w-5 h-5 stroke-[1.6]" />
        </button>

        {/* SOP Playbooks Button (Administration Manager) */}
        <button
          type="button"
          onClick={() => onSelectView("sop")}
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center transition-all cursor-pointer relative group",
            isTabActive("sop")
              ? "text-white bg-[var(--bg-hover)] shadow-xs"
              : "text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]/60"
          )}
          title={t("sopPlaybooks", "SOP Playbooks")}
          aria-label={t("sopPlaybooks", "SOP Playbooks")}
        >
          {isTabActive("sop") && (
            <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-white rounded-r" />
          )}
          <ClipboardCheck className="w-5 h-5 stroke-[1.6]" />
        </button>
      </div>
    </aside>
  );
});
