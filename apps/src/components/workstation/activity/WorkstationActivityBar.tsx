import { memo } from "react";
import { Files, GitBranch, Search, ClipboardCheck } from "lucide-react";
import { cn } from "../../../lib/utils";
import { useI18n } from "../../../lib/i18n";
import { useTheme } from "../../../lib/theme";

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
  const { isNeobrutalism } = useTheme();
  const isTabActive = (view: SidebarView) => !isCollapsed && activeView === view;

  return (
    <aside
      className="w-12 h-full bg-[var(--bg-app)] border-r border-[var(--border-color)] flex flex-col justify-between shrink-0 select-none z-10"
      aria-label="Activity Bar"
    >
      {/* Top Navigation Icons */}
      <div className="flex flex-col items-center py-2 gap-1.5 w-full">
        {/* Explorer Button */}
        <button
          type="button"
          onClick={() => onSelectView("explorer")}
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center transition-all cursor-pointer relative group",
            isNeobrutalism
              ? isTabActive("explorer")
                ? "neo-icon-badge bg-[#CCFF00] text-[#141413] border border-[#141413]"
                : "neo-icon-badge bg-[#FFFDFB] text-[#141413] border border-[#141413] hover:bg-[#CCFF00]"
              : isTabActive("explorer")
              ? "text-[var(--text-primary)] bg-[var(--bg-hover)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]/60"
          )}
          title="Explorer"
          aria-label="Explorer"
        >
          {!isNeobrutalism && isTabActive("explorer") && (
            <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-[var(--text-primary)] rounded-r" />
          )}
          <Files className="w-4 h-4 stroke-[1.8]" />
        </button>

        {/* Document Changes Button */}
        <button
          type="button"
          onClick={() => onSelectView("source-control")}
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center transition-all cursor-pointer relative group",
            isNeobrutalism
              ? isTabActive("source-control")
                ? "neo-icon-badge bg-[#B388FF] text-[#141413] border border-[#141413]"
                : "neo-icon-badge bg-[#FFFDFB] text-[#141413] border border-[#141413] hover:bg-[#B388FF]"
              : isTabActive("source-control")
              ? "text-[var(--text-primary)] bg-[var(--bg-hover)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]/60"
          )}
          title={t("documentChanges", "Document Changes")}
          aria-label={t("documentChanges", "Document Changes")}
        >
          {!isNeobrutalism && isTabActive("source-control") && (
            <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-[var(--text-primary)] rounded-r" />
          )}
          <GitBranch className="w-4 h-4 stroke-[1.8]" />
          {changesCount > 0 && (
            <span
              className={cn(
                "absolute -top-1 -right-1 min-w-[17px] h-[17px] px-0.5 rounded-full text-[10px] font-bold leading-none flex items-center justify-center text-center pointer-events-none select-none",
                isNeobrutalism
                  ? "bg-[#FF9F43] text-[#141413] border border-[#141413]"
                  : "bg-[#0078d4] text-white"
              )}
            >
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
            "w-9 h-9 rounded-lg flex items-center justify-center transition-all cursor-pointer relative group",
            isNeobrutalism
              ? isTabActive("search")
                ? "neo-icon-badge bg-[#FF9F43] text-[#141413] border border-[#141413]"
                : "neo-icon-badge bg-[#FFFDFB] text-[#141413] border border-[#141413] hover:bg-[#FF9F43]"
              : isTabActive("search")
              ? "text-[var(--text-primary)] bg-[var(--bg-hover)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]/60"
          )}
          title="Search"
          aria-label="Search"
        >
          {!isNeobrutalism && isTabActive("search") && (
            <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-[var(--text-primary)] rounded-r" />
          )}
          <Search className="w-4 h-4 stroke-[1.8]" />
        </button>

        {/* SOP Playbooks Button (Administration Manager) */}
        <button
          type="button"
          onClick={() => onSelectView("sop")}
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center transition-all cursor-pointer relative group",
            isNeobrutalism
              ? isTabActive("sop")
                ? "neo-icon-badge bg-[#CCFF00] text-[#141413] border border-[#141413]"
                : "neo-icon-badge bg-[#FFFDFB] text-[#141413] border border-[#141413] hover:bg-[#CCFF00]"
              : isTabActive("sop")
              ? "text-[var(--text-primary)] bg-[var(--bg-hover)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]/60"
          )}
          title={t("sopPlaybooks", "SOP Playbooks")}
          aria-label={t("sopPlaybooks", "SOP Playbooks")}
        >
          {!isNeobrutalism && isTabActive("sop") && (
            <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-[var(--text-primary)] rounded-r" />
          )}
          <ClipboardCheck className="w-4 h-4 stroke-[1.8]" />
        </button>
      </div>
    </aside>
  );
});
