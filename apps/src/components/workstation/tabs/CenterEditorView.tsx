import { memo, useMemo, useState, useRef, useEffect, useLayoutEffect, type RefObject, type KeyboardEvent } from "react";
import { cn } from "../../../lib/utils";
import { useWordWrap } from "../../../lib/wordWrap";

interface CenterEditorGutterProps {
  lineCount: number;
  cursorLine: number;
  addedLineNums: Set<number>;
  gutterRef: RefObject<HTMLDivElement | null>;
  lineHeights?: number[] | null;
}

const CenterEditorGutter = memo(function CenterEditorGutter({
  lineCount,
  cursorLine,
  addedLineNums,
  gutterRef,
  lineHeights,
}: CenterEditorGutterProps) {
  const items = useMemo(() => {
    const arr = new Array(lineCount);
    for (let i = 0; i < lineCount; i++) {
      arr[i] = i + 1;
    }
    return arr;
  }, [lineCount]);

  return (
    <div
      ref={gutterRef}
      className="w-[50px] shrink-0 select-none bg-[var(--bg-panel)] border-r border-[var(--border-color)] overflow-hidden text-right py-2 pr-3.5 font-mono text-[12px] text-[var(--text-dim)] transition-colors pointer-events-none"
    >
      {items.map((lineNum) => {
        const isAdded = addedLineNums.has(lineNum);
        const isCurrentLine = cursorLine === lineNum;
        const lineH = lineHeights && lineHeights[lineNum - 1] ? lineHeights[lineNum - 1] : 20;

        return (
          <div
            key={lineNum}
            style={{ height: `${lineH}px`, lineHeight: "20px" }}
            className={cn(
              "relative",
              isCurrentLine && "text-[var(--text-primary)] font-medium"
            )}
          >
            {isAdded && (
              <span
                className="absolute left-0 top-0 bottom-0 w-[3px] bg-[var(--text-muted)]"
                title="Line added / updated by AI"
              />
            )}
            <span>{lineNum}</span>
          </div>
        );
      })}
    </div>
  );
});

interface CenterEditorViewProps {
  currentContent: string;
  lineCount: number;
  addedLineNums: Set<number>;
  cursorPos: { line: number; col: number };
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  gutterRef: RefObject<HTMLDivElement | null>;
  onTextChange: (val: string) => void;
  updateCursorPos: () => void;
  onScroll: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
}

export const CenterEditorView = memo(function CenterEditorView({
  currentContent,
  lineCount,
  addedLineNums,
  cursorPos,
  textareaRef,
  gutterRef,
  onTextChange,
  updateCursorPos,
  onScroll,
  onKeyDown,
}: CenterEditorViewProps) {
  const { wordWrap } = useWordWrap();
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [lineHeights, setLineHeights] = useState<number[] | null>(null);
  const [textareaWidth, setTextareaWidth] = useState<number>(0);

  const lines = useMemo(() => {
    if (!wordWrap) return [];
    return currentContent.split("\n");
  }, [wordWrap, currentContent]);

  // Track textarea clientWidth
  useEffect(() => {
    if (!wordWrap) {
      setLineHeights(null);
      return;
    }

    const el = textareaRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      setTextareaWidth(el.clientWidth);
    });
    ro.observe(el);
    setTextareaWidth(el.clientWidth);

    return () => ro.disconnect();
  }, [wordWrap, textareaRef]);

  // Synchronize line heights when content or width changes
  useLayoutEffect(() => {
    if (!wordWrap || !mirrorRef.current || lines.length === 0) {
      setLineHeights(null);
      return;
    }

    // Only compute heights if lines count is within reasonable threshold (< 1000)
    if (lines.length > 1000) {
      setLineHeights(null);
      return;
    }

    const children = mirrorRef.current.children;
    const heights = new Array(children.length);
    for (let i = 0; i < children.length; i++) {
      const h = (children[i] as HTMLElement).offsetHeight;
      heights[i] = h > 0 ? h : 20;
    }
    setLineHeights(heights);
  }, [wordWrap, lines, textareaWidth]);

  return (
    <div className="h-full w-full flex flex-col bg-[var(--bg-card)] overflow-hidden transition-colors">
      <div className="flex-1 min-w-0 flex overflow-hidden bg-[var(--bg-card)] relative font-mono text-[13px]">
        {/* Memoized gutter that only re-renders when lineCount or active line changes */}
        <CenterEditorGutter
          lineCount={lineCount}
          cursorLine={cursorPos.line}
          addedLineNums={addedLineNums}
          gutterRef={gutterRef}
          lineHeights={lineHeights}
        />

        {/* Hidden mirror element to measure line heights for gutter alignment */}
        {wordWrap && lines.length <= 1000 && (
          <div
            ref={mirrorRef}
            aria-hidden="true"
            className="invisible pointer-events-none absolute left-[-9999px] top-0 font-mono text-[13px] leading-[20px] py-2 px-3 whitespace-pre-wrap [overflow-wrap:anywhere] break-words"
            style={{
              fontFamily: "Consolas, 'Cascadia Code', 'Courier New', monospace",
              width: textareaWidth > 0 ? `${textareaWidth}px` : "100%",
              boxSizing: "border-box",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              overflowWrap: "anywhere",
            }}
          >
            {lines.map((line, idx) => (
              <div key={idx}>{line || "\u00A0"}</div>
            ))}
          </div>
        )}

        {/* Editable live document area */}
        <textarea
          ref={textareaRef}
          value={currentContent}
          wrap={wordWrap ? "soft" : "off"}
          onChange={(e) => {
            onTextChange(e.target.value);
            updateCursorPos();
          }}
          onClick={updateCursorPos}
          onKeyUp={updateCursorPos}
          onSelect={updateCursorPos}
          onScroll={onScroll}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          placeholder="Empty document..."
          className={cn(
            "flex-1 min-w-0 w-full h-full py-2 px-3 bg-transparent font-mono text-[13px] text-[var(--text-primary)] leading-[20px] resize-none focus:outline-none select-text cursor-text border-none tab-4 selection:bg-[var(--bg-hover)] selection:text-[var(--text-primary)] caret-[var(--text-primary)] placeholder-[var(--text-dim)]",
            wordWrap
              ? "whitespace-pre-wrap [overflow-wrap:anywhere] break-words overflow-x-hidden overflow-y-auto"
              : "whitespace-pre overflow-auto"
          )}
          style={{
            fontFamily: "Consolas, 'Cascadia Code', 'Courier New', monospace",
            whiteSpace: wordWrap ? "pre-wrap" : "pre",
            wordBreak: wordWrap ? "break-word" : "normal",
            overflowWrap: wordWrap ? "anywhere" : "normal",
            minWidth: 0,
            width: "100%",
          }}
        />
      </div>
    </div>
  );
});
