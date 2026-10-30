import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { CenterTab } from "../tabs/types";
import { DiffLine, computeLineDiff } from "../tabs/diffUtils";
import { isArtCraftBinaryTab } from "../tabs/centerUtils";

interface UseCenterPanelEditorOptions {
  tabs: CenterTab[];
  activeTab: CenterTab | undefined;
  onUpdateTabContent?: (tabId: string, newContent: string) => void;
  onSaveTabContent?: (tabId: string, content: string) => Promise<void> | void;
}

export function useCenterPanelEditor({
  tabs,
  activeTab,
  onUpdateTabContent,
  onSaveTabContent,
}: UseCenterPanelEditorOptions) {
  const [editedContents, setEditedContents] = useState<Record<string, string>>({});
  const [previousContents, setPreviousContents] = useState<Record<string, string>>({});
  const [unsavedTabs, setUnsavedTabs] = useState<Record<string, boolean>>({});
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

  useEffect(() => {
    const handleDiffCleared = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      const targetName = String(detail?.fileName || detail?.filePath || "").split(/[/\\]/).pop()?.toLowerCase();
      if (!targetName) return;

      for (const t of tabs) {
        const tName = (t.title || "").toLowerCase();
        const tPathName = (t.path || "").split(/[/\\]/).pop()?.toLowerCase();
        if (tName === targetName || tPathName === targetName) {
          setActiveDiffs((prev) => ({ ...prev, [t.id]: null }));
          setUnsavedTabs((prev) => ({ ...prev, [t.id]: false }));
          if (typeof detail?.content === "string" && detail.content.length > 0) {
            setEditedContents((prev) => ({ ...prev, [t.id]: detail.content }));
            setPreviousContents((prev) => ({ ...prev, [t.id]: detail.content }));
          }
        }
      }
    };
    window.addEventListener("arunaki:diff-cleared", handleDiffCleared);
    return () => window.removeEventListener("arunaki:diff-cleared", handleDiffCleared);
  }, [tabs]);

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
      if (activeTab.type === "file" || activeTab.type === "app") {
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

      if (onUpdateTabContent) {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
          onUpdateTabContent(activeTab.id, newText);
        }, 150);
      }
    },
    [activeTab?.id, onUpdateTabContent]
  );

  const handleSave = useCallback(async () => {
    if (!activeTab?.id) return;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (isArtCraftBinaryTab(activeTab)) {
      window.dispatchEvent(
        new CustomEvent("arunaki:artcraft-trigger-save", {
          detail: {
            tabId: activeTab.id,
            filePath: activeTab.path,
            title: activeTab.title,
          },
        })
      );
      return;
    }
    if (onUpdateTabContent) {
      onUpdateTabContent(activeTab.id, currentContent);
    }
    if (onSaveTabContent) {
      await onSaveTabContent(activeTab.id, currentContent);
    }
    setUnsavedTabs((prev) => ({ ...prev, [activeTab.id]: false }));
    setPreviousContents((prev) => ({ ...prev, [activeTab.id]: currentContent }));
  }, [activeTab, currentContent, onSaveTabContent, onUpdateTabContent]);

  const handleTextChangeForTab = useCallback(
    (tabId: string, newText: string) => {
      setEditedContents((prev) => ({ ...prev, [tabId]: newText }));
      setUnsavedTabs((prev) => ({ ...prev, [tabId]: true }));
      if (onUpdateTabContent) {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
          onUpdateTabContent(tabId, newText);
        }, 150);
      }
    },
    [onUpdateTabContent]
  );

  const handleSaveForTab = useCallback(
    async (tabId: string) => {
      const targetTab = tabs.find((t) => t.id === tabId);
      if (isArtCraftBinaryTab(targetTab)) {
        window.dispatchEvent(
          new CustomEvent("arunaki:artcraft-trigger-save", {
            detail: {
              tabId,
              filePath: targetTab?.path,
              title: targetTab?.title,
            },
          })
        );
        return;
      }
      const contentToSave = editedContents[tabId] ?? targetTab?.content ?? "";
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (onUpdateTabContent) {
        onUpdateTabContent(tabId, contentToSave);
      }
      if (onSaveTabContent) {
        await onSaveTabContent(tabId, contentToSave);
      }
      setUnsavedTabs((prev) => ({ ...prev, [tabId]: false }));
      setPreviousContents((prev) => ({ ...prev, [tabId]: contentToSave }));
    },
    [editedContents, tabs, onSaveTabContent, onUpdateTabContent]
  );

  const handleScroll = () => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
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

  const handleClearDiff = useCallback(() => {
    if (activeTab?.id) {
      setActiveDiffs((prev) => ({ ...prev, [activeTab.id]: null }));
    }
  }, [activeTab?.id]);

  return {
    editedContents,
    setEditedContents,
    unsavedTabs,
    setUnsavedTabs,
    activeDiffs,
    setActiveDiffs,
    currentContent,
    activeDiff,
    isUnsaved,
    copied,
    cursorPos,
    textareaRef,
    gutterRef,
    lineCount,
    addedLineNums,
    handleClearDiff,
    updateCursorPos,
    handleTextChange,
    handleTextChangeForTab,
    handleSave,
    handleSaveForTab,
    handleScroll,
    handleKeyDown,
    handleCopyContent,
    handleDownloadTxt,
  };
}
