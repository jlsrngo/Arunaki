import { useMemo, useRef, memo } from "react";
import { GitCompare, RotateCcw, Check, FileText } from "lucide-react";
import { computeSideBySideDiff } from "./diffUtils";
import { cn } from "../../../lib/utils";

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
    <div className="flex-1 flex flex-col h-full w-full bg-[#181818] text-[#cccccc] select-text overflow-hidden">
      {/* Top Diff Action & Info Bar */}
      <div className="h-9 px-3 bg-[#1e1e1e] border-b border-[#2d2d2d] flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <GitCompare className="w-3.5 h-3.5 text-white shrink-0" strokeWidth={1.5} />
          <span className="text-xs font-medium text-white truncate flex items-center gap-1.5 font-mono">
            <FileText className="w-3.5 h-3.5 text-[#858585]" />
            <span>{fileName}</span>
            <span className="text-[#858585] font-normal">(Working Tree)</span>
            <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">
              M
            </span>
          </span>
          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#2ea043]/20 text-[#3fb950] border border-[#2ea043]/30">
              +{stats.added}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#f85149]/20 text-[#f85149] border border-[#f85149]/30">
              -{stats.deleted}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onRevert && (
            <button
              type="button"
              onClick={onRevert}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-[#cccccc] hover:text-white hover:bg-[#2a2a2a] border border-[#3c3c3c] transition-colors cursor-pointer"
              title="Discard working changes and restore last saved version on disk"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#f85149]" />
              <span>Discard Changes</span>
            </button>
          )}

          {onAccept && (
            <button
              type="button"
              onClick={onAccept}
              className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold bg-[#0e639c] text-white hover:bg-[#1177bb] transition-colors shadow-xs cursor-pointer"
              title="Save working changes to disk"
            >
              <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
              <span>Save to Disk</span>
            </button>
          )}
        </div>
      </div>

      {/* Subheader: File path & Breadcrumbs */}
      <div className="h-6 px-3 bg-[#1e1e1e]/60 border-b border-[#2d2d2d] flex items-center justify-between text-[11px] text-[#858585] font-mono shrink-0 select-none">
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
