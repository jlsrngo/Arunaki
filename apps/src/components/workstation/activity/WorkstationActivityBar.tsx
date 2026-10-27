import { memo } from "react";
import { Files, GitBranch, Search, Settings } from "lucide-react";
import { cn } from "../../../lib/utils";

export type SidebarView = "explorer" | "source-control" | "search";

interface WorkstationActivityBarProps {
  activeView: SidebarView;
  isCollapsed: boolean;
  onSelectView: (view: SidebarView) => void;
  changesCount?: number;
  onOpenSettings?: () => void;
}

export const WorkstationActivityBar = memo(function WorkstationActivityBar({
  activeView,
  isCollapsed,
  onSelectView,
  changesCount = 0,
  onOpenSettings,
}: WorkstationActivityBarProps) {
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

        {/* Source Control Button */}
        <button
          type="button"
          onClick={() => onSelectView("source-control")}
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center transition-all cursor-pointer relative group",
            isTabActive("source-control")
              ? "text-white bg-[var(--bg-hover)] shadow-xs"
              : "text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]/60"
          )}
          title="Source Control"
          aria-label="Source Control"
        >
          {isTabActive("source-control") && (
            <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-white rounded-r" />
          )}
          <GitBranch className="w-5 h-5 stroke-[1.6]" />
          {changesCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-white text-[9px] font-bold font-mono flex items-center justify-center shadow-xs pointer-events-none">
              {changesCount > 99 ? "99+" : changesCount}
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
      </div>

      {/* Bottom Settings Icon */}
      <div className="flex flex-col items-center pb-2 w-full">
        <button
          type="button"
          onClick={onOpenSettings}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)] transition-all cursor-pointer"
          title="Settings"
          aria-label="Settings"
        >
          <Settings className="w-4 h-4 stroke-[1.6]" />
        </button>
      </div>
    </aside>
  );
});
