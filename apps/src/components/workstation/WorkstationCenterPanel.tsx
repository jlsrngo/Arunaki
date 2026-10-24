import { memo, lazy, Suspense, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { CenterTab } from "./tabs/types";
import { DiffLine, computeLineDiff } from "./tabs/diffUtils";
import { CenterTabHeader } from "./tabs/CenterTabHeader";
import { CenterBreadcrumbs } from "./tabs/CenterBreadcrumbs";
import { CenterEditorView } from "./tabs/CenterEditorView";
import { CenterEmptyState } from "./tabs/CenterEmptyState";
import { CenterStatusBar } from "./tabs/CenterStatusBar";

const SpreadsheetViewer = lazy(() =>
  import("./canvas/SpreadsheetViewer").then((m) => ({ default: m.SpreadsheetViewer }))
);

export type { CenterTab };

export interface WorkstationCenterPanelProps {
  tabs: CenterTab[];
  activeTabId: string | null;
  activeFolder?: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onUpdateTabContent?: (tabId: string, newContent: string) => void;
  onSaveTabContent?: (tabId: string, content: string) => Promise<void> | void;
}

function WorkstationCenterPanelComponent({
  tabs,
  activeTabId,
  activeFolder,
  onSelectTab,
  onCloseTab,
  onUpdateTabContent,
  onSaveTabContent,
}: WorkstationCenterPanelProps) {
  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Per-tab local edited content state to allow live editing
  const [editedContents, setEditedContents] = useState<Record<string, string>>({});
  // Track previous content per tab to compute diffs when AI updates files
  const [previousContents, setPreviousContents] = useState<Record<string, string>>({});
  // Track unsaved status per tab
  const [unsavedTabs, setUnsavedTabs] = useState<Record<string, boolean>>({});
  // State to hold active diff highlighting per tab
  const [activeDiffs, setActiveDiffs] = useState<
    Record<
      string,
      {
        diffLines: DiffLine[];
        addedCount: number;
        deletedCount: number;
      } | null
    >
  >({});

  const [copied, setCopied] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [activeTab?.id]);

  // Sync tab content when parent updates tab.content (only when user does not have local unsaved edits)
  useEffect(() => {
    if (!activeTab?.id) return;
    const incomingContent = activeTab.content ?? "";
    const existingContent = editedContents[activeTab.id];

    if (existingContent === undefined) {
      setEditedContents((prev) => ({ ...prev, [activeTab.id]: incomingContent }));
      setPreviousContents((prev) => ({ ...prev, [activeTab.id]: incomingContent }));
    } else if (
      !unsavedTabs[activeTab.id] &&
      incomingContent !== existingContent &&
      incomingContent !== previousContents[activeTab.id]
    ) {
      if (activeTab.type === "file") {
        const prevText = previousContents[activeTab.id] ?? existingContent;
        const diffLines = computeLineDiff(prevText, incomingContent);
        const added = diffLines.filter((l) => l.type === "added").length;
        const deleted = diffLines.filter((l) => l.type === "deleted").length;

        if (added > 0 || deleted > 0) {
          setActiveDiffs((prev) => ({
            ...prev,
            [activeTab.id]: {
              diffLines,
              addedCount: added,
              deletedCount: deleted,
            },
          }));

          // Automatically clear highlights after 10 seconds, or user can dismiss manually
          const timer = setTimeout(() => {
            setActiveDiffs((prev) => ({ ...prev, [activeTab.id]: null }));
          }, 10000);

          setEditedContents((prev) => ({ ...prev, [activeTab.id]: incomingContent }));
          setPreviousContents((prev) => ({ ...prev, [activeTab.id]: incomingContent }));
          setUnsavedTabs((prev) => ({ ...prev, [activeTab.id]: false }));

          return () => clearTimeout(timer);
        }
      }

      setEditedContents((prev) => ({ ...prev, [activeTab.id]: incomingContent }));
      setPreviousContents((prev) => ({ ...prev, [activeTab.id]: incomingContent }));
    }
  }, [activeTab?.id, activeTab?.content, activeTab?.type, unsavedTabs]);

  const currentContent = activeTab ? (editedContents[activeTab.id] ?? activeTab.content ?? "") : "";
  const activeDiff = activeTab ? activeDiffs[activeTab.id] : null;
  const isUnsaved = activeTab ? !!unsavedTabs[activeTab.id] : false;

  const updateCursorPos = useCallback(() => {
    if (!textareaRef.current) return;
    const pos = textareaRef.current.selectionStart || 0;
    const val = textareaRef.current.value || "";
    const linesUpToPos = val.substring(0, pos).split("\n");
    const line = linesUpToPos.length;
    const col = linesUpToPos[linesUpToPos.length - 1].length + 1;
    setCursorPos((prev) => (prev.line === line && prev.col === col ? prev : { line, col }));
  }, []);

  const handleTextChange = useCallback(
    (newText: string) => {
      if (!activeTab?.id) return;
      setEditedContents((prev) => ({ ...prev, [activeTab.id]: newText }));
      setUnsavedTabs((prev) => ({ ...prev, [activeTab.id]: true }));

      // Debounce notifying parent tabs state so live keystrokes never trigger full-page re-renders
      if (onUpdateTabContent) {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
          onUpdateTabContent(activeTab.id, newText);
        }, 500);
      }
    },
    [activeTab?.id, onUpdateTabContent]
  );

  const handleSave = useCallback(async () => {
    if (!activeTab?.id) return;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (onUpdateTabContent) {
      onUpdateTabContent(activeTab.id, currentContent);
    }
    if (onSaveTabContent) {
      await onSaveTabContent(activeTab.id, currentContent);
    }
    setUnsavedTabs((prev) => ({ ...prev, [activeTab.id]: false }));
    setPreviousContents((prev) => ({ ...prev, [activeTab.id]: currentContent }));
  }, [activeTab?.id, currentContent, onSaveTabContent, onUpdateTabContent]);

  const handleScroll = () => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const val = target.value;
      const nextVal = val.substring(0, start) + "    " + val.substring(end);
      handleTextChange(nextVal);
      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = start + 4;
        updateCursorPos();
      });
    }
  };

  const handleCopyContent = () => {
    if (!currentContent) return;
    navigator.clipboard.writeText(currentContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadTxt = () => {
    if (!currentContent) return;
    const element = document.createElement("a");
    const file = new Blob([currentContent], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = `${activeTab?.title || "document"}-${Date.now()}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    setTimeout(() => URL.revokeObjectURL(element.href), 1000);
  };

  // Build line gutter metadata efficiently without array allocations
  const lineCount = useMemo(() => {
    if (!currentContent) return 1;
    let count = 1;
    for (let i = 0; i < currentContent.length; i++) {
      if (currentContent.charCodeAt(i) === 10) count++;
    }
    return count;
  }, [currentContent]);

  const addedLineNums = useMemo(() => {
    const set = new Set<number>();
    if (activeDiff?.diffLines) {
      for (const dl of activeDiff.diffLines) {
        if (dl.type === "added" && dl.newLineNumber) {
          set.add(dl.newLineNumber);
        }
      }
    }
    return set;
  }, [activeDiff]);

  // Detect language mode for VSCode status bar
  const langMode = activeTab
    ? activeTab.title.endsWith(".txt")
      ? "Plain Text"
      : activeTab.title.endsWith(".md")
      ? "Markdown"
      : activeTab.title.endsWith(".json")
      ? "JSON"
      : activeTab.title.endsWith(".csv")
      ? "CSV"
      : (/\.(xlsx|xls|xlsm|xlsb)$/i).test(activeTab.title)
      ? "Excel"
      : activeTab.title.split(".").pop()?.toUpperCase() || "Plain Text"
    : "Plain Text";

  const folderName = activeFolder
    ? activeFolder.split(/[\\/]/).filter(Boolean).pop() || "workspace"
    : "workspace";

  const isSpreadsheet = activeTab
    ? Boolean(
        ["xlsx", "xls", "xlsm", "xlsb", "csv", "tsv"].includes(activeTab.fileType?.toLowerCase() || "") ||
        (/\.(xlsx|xls|xlsm|xlsb|csv|tsv)$/i).test(activeTab.title) ||
        (activeTab.type === "canvas" && Boolean(activeTab.content && activeTab.content.includes("|") && activeTab.content.includes("\n")))
      )
    : false;

  return (
    <main className="flex-1 flex flex-col min-w-0 bg-[var(--bg-app)] overflow-hidden select-none border-r border-[var(--border-color)] transition-colors duration-150">
      {/* 1. TOP TABS BAR */}
      <CenterTabHeader
        tabs={tabs}
        activeTabId={activeTabId}
        activeTab={activeTab}
        unsavedTabs={unsavedTabs}
        activeDiff={activeDiff}
        onClearDiff={() => {
          if (activeTab?.id) {
            setActiveDiffs((prev) => ({ ...prev, [activeTab.id]: null }));
          }
        }}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
        onSave={handleSave}
        onCopyContent={handleCopyContent}
        onDownloadTxt={handleDownloadTxt}
        isUnsaved={isUnsaved}
        copied={copied}
      />

      {/* 2. BREADCRUMBS BAR */}
      {activeTab && <CenterBreadcrumbs folderName={folderName} tabTitle={activeTab.title} />}

      {/* 3. DYNAMIC CONTENT BODY (SPREADSHEET / FILE EDITOR) */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 relative overflow-hidden bg-[var(--bg-card)]">
        {activeTab ? (
          isSpreadsheet ? (
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center text-xs text-[var(--text-muted)] font-mono">
                  Loading spreadsheet viewer...
                </div>
              }
            >
              <SpreadsheetViewer
                content={currentContent}
                filePath={activeTab.path}
                title={activeTab.title}
              />
            </Suspense>
          ) : (
            <CenterEditorView
              currentContent={currentContent}
              lineCount={lineCount}
              addedLineNums={addedLineNums}
              cursorPos={cursorPos}
              textareaRef={textareaRef}
              gutterRef={gutterRef}
              onTextChange={handleTextChange}
              updateCursorPos={updateCursorPos}
              onScroll={handleScroll}
              onKeyDown={handleKeyDown}
            />
          )
        ) : (
          <CenterEmptyState />
        )}
      </div>

      {/* 4. MONOCHROME BOTTOM STATUS BAR */}
      {activeTab && <CenterStatusBar cursorPos={cursorPos} langMode={langMode} />}
    </main>
  );
}

export const WorkstationCenterPanel = memo(WorkstationCenterPanelComponent);
