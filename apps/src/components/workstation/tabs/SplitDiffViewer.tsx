import { useMemo, useRef, memo } from "react";
import { GitCompare, RotateCcw, Check, FileText } from "lucide-react";
import { computeSideBySideDiff } from "./diffUtils";
import { cn } from "../../../lib/utils";
import { useI18n } from "../../../lib/i18n";

interface SplitDiffViewerProps {
  fileName: string;
  filePath?: string;
  beforeContent: string;
  afterContent: string;
  onRevert?: () => void;
  onAccept?: () => void;
}

const HATCHED_PATTERN =
  "repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(255, 255, 255, 0.035) 4px, rgba(255, 255, 255, 0.035) 8px)";

export const SplitDiffViewer = memo(function SplitDiffViewer({
  fileName,
  filePath,
  beforeContent,
  afterContent,
  onRevert,
  onAccept,
}: SplitDiffViewerProps) {
  const { t } = useI18n();
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  const rows = useMemo(
    () => computeSideBySideDiff(beforeContent || "", afterContent || ""),
    [beforeContent, afterContent]
  );

  const stats = useMemo(() => {
    let added = 0;
    let deleted = 0;
    for (const r of rows) {
      if (r.left.type === "deleted") deleted++;
      if (r.right.type === "added") added++;
    }
    return { added, deleted };
  }, [rows]);

  const handleLeftScroll = () => {
    if (isScrollingRef.current) return;
    isScrollingRef.current = true;
    if (rightScrollRef.current && leftScrollRef.current) {
      rightScrollRef.current.scrollTop = leftScrollRef.current.scrollTop;
      rightScrollRef.current.scrollLeft = leftScrollRef.current.scrollLeft;
    }
    requestAnimationFrame(() => {
      isScrollingRef.current = false;
    });
  };

  const handleRightScroll = () => {
    if (isScrollingRef.current) return;
    isScrollingRef.current = true;
    if (leftScrollRef.current && rightScrollRef.current) {
      leftScrollRef.current.scrollTop = rightScrollRef.current.scrollTop;
      leftScrollRef.current.scrollLeft = rightScrollRef.current.scrollLeft;
    }
    requestAnimationFrame(() => {
      isScrollingRef.current = false;
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full w-full bg-[var(--bg-app)] text-[var(--text-primary)] select-text overflow-hidden">
      {/* Top Diff Action & Info Bar */}
      <div className="h-10 px-4 bg-[var(--bg-app)] border-b border-[var(--border-color)] flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-2.5 min-w-0">
          <GitCompare className="w-4 h-4 text-white shrink-0" strokeWidth={1.6} />
          <span className="text-xs font-semibold text-white truncate flex items-center gap-1.5 font-mono">
            <FileText className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span>{fileName}</span>
            <span className="text-[var(--text-muted)] font-normal text-[11px]">(Working Tree)</span>
            {/* Solid Orange M Badge */}
            <span className="px-1.5 py-0.5 rounded bg-[#cf6613] text-white text-[10px] font-bold leading-none select-none">
              M
            </span>
          </span>
          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-white border border-[var(--border-strong)]">
              +{stats.added}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-white border border-[var(--border-strong)]">
              -{stats.deleted}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onRevert && (
            <button
              type="button"
              onClick={onRevert}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-muted)] hover:text-white bg-[var(--bg-hover)] border border-[var(--border-strong)] transition-all cursor-pointer shadow-xs active:scale-95"
              title={t("discardChanges", "Discard Changes")}
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
              <span>{t("discardChanges", "Discard Changes")}</span>
            </button>
          )}

          {onAccept && (
            <button
              type="button"
              onClick={onAccept}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white text-black hover:bg-neutral-200 transition-all cursor-pointer shadow-xs active:scale-95"
              title={t("saveToDisk", "Save to Disk")}
            >
              <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
              <span>{t("saveToDisk", "Save to Disk")}</span>
            </button>
          )}
        </div>
      </div>

      {/* Subheader: File path & Breadcrumbs */}
      <div className="h-7 px-4 bg-[var(--bg-panel)]/40 border-b border-[var(--border-color)] flex items-center justify-between text-[11px] text-[var(--text-muted)] font-mono shrink-0 select-none">
        <div className="truncate">
          {filePath || fileName}
        </div>
        <div className="flex items-center gap-6 shrink-0">
          <span>Original (Last Saved)</span>
          <span>Modified (Working Tree)</span>
        </div>
      </div>

      {/* Split Comparison Grid */}
      <div className="flex-1 grid grid-cols-2 min-h-0 overflow-hidden font-mono text-[12px] leading-[20px]">
        {/* Left Pane (Before / Original on Disk) */}
        <div
          ref={leftScrollRef}
          onScroll={handleLeftScroll}
          className="h-full overflow-y-auto overflow-x-auto border-r border-[#2d2d2d] bg-[#1e1e1e] select-text"
        >
          <div className="min-w-fit py-0.5">
            {rows.map((row) => {
              const isDel = row.left.type === "deleted";
              const isEmpty = row.left.type === "empty";

              return (
                <div
                  key={`left-${row.id}`}
                  className={cn(
                    "flex items-stretch min-h-[20px] px-0 relative",
                    isDel && "bg-[#da3633]/20 text-[#f85149]",
                    isEmpty && "select-none"
                  )}
                  style={isEmpty ? { backgroundImage: HATCHED_PATTERN } : undefined}
                >
                  {/* Line Number Gutter */}
                  <div
                    className={cn(
                      "w-12 text-right pr-2.5 select-none text-[11px] font-mono shrink-0 border-r border-transparent",
                      isDel ? "text-[#f85149] font-semibold" : "text-[#6e7681]"
                    )}
                  >
                    {row.left.lineNumber !== undefined
                      ? `${row.left.lineNumber}${isDel ? "-" : " "}`
                      : ""}
                  </div>

                  {/* Content line */}
                  <pre
                    className={cn(
                      "flex-1 font-mono text-[12px] pl-3 pr-2 whitespace-pre m-0 p-0 overflow-visible",
                      isDel ? "text-[#ffdcd7]" : "text-[#cccccc]"
                    )}
                  >
                    {row.left.content}
                  </pre>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Pane (After / Current Working Changes) */}
        <div
          ref={rightScrollRef}
          onScroll={handleRightScroll}
          className="h-full overflow-y-auto overflow-x-auto bg-[#1e1e1e] select-text"
        >
          <div className="min-w-fit py-0.5">
            {rows.map((row) => {
              const isAdd = row.right.type === "added";
              const isEmpty = row.right.type === "empty";

              return (
                <div
                  key={`right-${row.id}`}
                  className={cn(
                    "flex items-stretch min-h-[20px] px-0 relative",
                    isAdd && "bg-[#238636]/25 text-[#3fb950]",
                    isEmpty && "select-none"
                  )}
                  style={isEmpty ? { backgroundImage: HATCHED_PATTERN } : undefined}
                >
                  {/* Line Number Gutter */}
                  <div
                    className={cn(
                      "w-12 text-right pr-2.5 select-none text-[11px] font-mono shrink-0 border-r border-transparent",
                      isAdd ? "text-[#3fb950] font-semibold" : "text-[#6e7681]"
                    )}
                  >
                    {row.right.lineNumber !== undefined
                      ? `${row.right.lineNumber}${isAdd ? "+" : " "}`
                      : ""}
                  </div>

                  {/* Content line */}
                  <pre
                    className={cn(
                      "flex-1 font-mono text-[12px] pl-3 pr-2 whitespace-pre m-0 p-0 overflow-visible",
                      isAdd ? "text-[#aff5b4]" : "text-[#cccccc]"
                    )}
                  >
                    {row.right.content}
                  </pre>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});
