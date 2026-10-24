import { memo } from "react";
import { ChevronDown, PanelsTopLeft } from "lucide-react";
import { cn } from "../../../lib/utils";
import { CanvasItem } from "./types";

export function formatCanvasTitle(title: string): string {
  if (!title) return "Document Canvas";
  const clean = title.replace(/^#+\s*/, "").replace(/[`*|_]/g, "").trim();
  if (clean === clean.toUpperCase() && clean.length > 2) {
    return clean
      .toLowerCase()
      .split(" ")
      .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ""))
      .join(" ");
  }
  return clean;
}

interface ExplorerRecentCanvasesProps {
  recentCanvases: CanvasItem[];
  isOpen: boolean;
  onToggle: () => void;
  onOpenCanvasTab?: (item: CanvasItem) => void;
}

export const ExplorerRecentCanvases = memo(function ExplorerRecentCanvases({
  recentCanvases,
  isOpen,
  onToggle,
  onOpenCanvasTab,
}: ExplorerRecentCanvasesProps) {
  return (
    <div className="border-t border-[var(--border-color)] bg-[var(--bg-panel)] flex flex-col shrink-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full h-7 px-3 flex items-center justify-between text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors select-none cursor-pointer"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 transition-transform text-[var(--text-muted)]",
              !isOpen && "-rotate-90"
            )}
          />
          <PanelsTopLeft className="w-3.5 h-3.5 text-[var(--text-muted)]" strokeWidth={1.5} />
          <span className="font-semibold text-xs tracking-tight text-[var(--text-primary)]">
            Canvas
          </span>
          {recentCanvases.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[var(--bg-card)] text-[var(--text-dim)] border border-[var(--border-color)] font-mono">
              {recentCanvases.length}
            </span>
          )}
        </div>
        <span className="text-[10px] text-[var(--text-dim)] font-mono">top 5</span>
      </button>

      {isOpen && (
        <div className="p-1 space-y-0.5 max-h-44 overflow-y-auto overflow-x-hidden select-none">
          {recentCanvases.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-[var(--text-dim)] italic">
              No recent canvas
            </div>
          ) : (
            recentCanvases.slice(0, 5).map((item) => {
              const formattedTitle = formatCanvasTitle(item.title);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenCanvasTab?.(item)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors group cursor-pointer"
                  title={`Open Canvas: ${formattedTitle}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <PanelsTopLeft
                      className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] shrink-0 transition-colors"
                      strokeWidth={1.5}
                    />
                    <span className="truncate text-[11px] font-normal text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                      {formattedTitle}
                    </span>
                  </div>
                  <span className="text-[10px] text-[var(--text-dim)] shrink-0 ml-2 font-mono">
                    {item.timeStr || "open"}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
});
