import { memo } from "react";
import {
  ClipboardCheck,
  RotateCw,
  PanelLeftClose,
  ChevronDown,
  ChevronRight,
  Wand2,
  Plus,
} from "lucide-react";
import { cn } from "../../../../lib/utils";
import { Button } from "../../../ui";

interface SopPlaybookHeaderProps {
  title: string;
  folderName: string;
  hasActiveFolder: boolean;
  loading: boolean;
  generating: boolean;
  isRootExpanded: boolean;
  onToggleRootExpanded: () => void;
  onRefresh: () => void;
  onGenerateFromFolder: () => void;
  onAddNewPlaybook: () => void;
  onClose?: () => void;
}

export const SopPlaybookHeader = memo(function SopPlaybookHeader({
  title,
  folderName,
  hasActiveFolder,
  loading,
  generating,
  isRootExpanded,
  onToggleRootExpanded,
  onRefresh,
  onGenerateFromFolder,
  onAddNewPlaybook,
  onClose,
}: SopPlaybookHeaderProps) {
  return (
    <>
      {/* 1. Panel Header (Exact Explorer Parity) */}
      <div className="h-9 px-3 box-border border-b border-[var(--border-color)] flex items-center justify-between shrink-0">
        <span className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-2 truncate">
          <ClipboardCheck
            className="w-3.5 h-3.5 text-[var(--text-primary)] shrink-0"
            strokeWidth={2}
          />
          {title}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onRefresh}
            disabled={loading}
            title="Refresh Playbooks"
          >
            <RotateCw
              className={cn("w-3.5 h-3.5", loading && "animate-spin")}
              strokeWidth={1.5}
            />
          </Button>
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onClose}
              title="Close Playbooks Panel"
            >
              <PanelLeftClose className="w-4 h-4" strokeWidth={1.5} />
            </Button>
          )}
        </div>
      </div>

      {/* 2. Project Sub-Header Bar (Exact FileTree Parity: Folder Name on Left + Subtle Icon Actions on Right) */}
      <div className="flex items-center justify-between px-3 h-8 bg-[var(--bg-panel-sub)] shrink-0 border-b border-[var(--border-color)] transition-colors duration-150">
        <button
          type="button"
          onClick={onToggleRootExpanded}
          className="flex items-center gap-1.5 min-w-0 text-left hover:text-[var(--text-primary)] transition-colors cursor-pointer group"
          title="Toggle Playbooks List"
        >
          <span className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] shrink-0">
            {isRootExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.75} />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.75} />
            )}
          </span>
          <span className="text-[var(--text-primary)] font-semibold text-xs tracking-wide truncate">
            {folderName}
          </span>
        </button>

        {/* Icon-Only Actions (Generate, Add Playbook, Refresh) */}
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={!hasActiveFolder || generating}
            onClick={onGenerateFromFolder}
            title="Generate Playbooks from Folder"
          >
            <Wand2
              className={cn(
                "w-3.5 h-3.5",
                generating && "animate-spin text-[#cf6613]"
              )}
              strokeWidth={1.75}
            />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={!hasActiveFolder}
            onClick={onAddNewPlaybook}
            title="Add New Playbook"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onRefresh}
            title="Refresh Playbooks"
          >
            <RotateCw className="w-3.5 h-3.5" strokeWidth={1.5} />
          </Button>
        </div>
      </div>
    </>
  );
});

