import { memo, useCallback } from "react";
import { CenterTab } from "./tabs/types";
import { CenterTabHeader } from "./tabs/CenterTabHeader";
import { CenterBreadcrumbs } from "./tabs/CenterBreadcrumbs";
import { CenterEmptyState } from "./tabs/CenterEmptyState";
import { CenterStatusBar } from "./tabs/CenterStatusBar";
import { CenterTabRenderer } from "./tabs/CenterTabRenderer";
import { getLanguageMode } from "./tabs/centerUtils";
import { useCenterPanelEditor } from "./hooks/useCenterPanelEditor";

export type { CenterTab };

export interface WorkstationCenterPanelProps {
  tabs: CenterTab[];
  activeTabId: string | null;
  activeFolder?: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onUpdateTabContent?: (tabId: string, newContent: string) => void;
  onSaveTabContent?: (tabId: string, content: string) => Promise<void> | void;
  onOpenFolder?: () => void;
  onRevertDiff?: (filePath: string) => void;
  onAcceptDiff?: (filePath: string) => void;
  onOpenFileTab?: (filePath: string) => void;
}

function WorkstationCenterPanelComponent({
  tabs,
  activeTabId,
  activeFolder,
  onSelectTab,
  onCloseTab,
  onUpdateTabContent,
  onSaveTabContent,
  onOpenFolder,
  onRevertDiff,
  onAcceptDiff,
  onOpenFileTab,
}: WorkstationCenterPanelProps) {
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const {
    editedContents,
    setUnsavedTabs,
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
  } = useCenterPanelEditor({
    tabs,
    activeTab,
    onUpdateTabContent,
    onSaveTabContent,
  });

  const handleDirtyChange = useCallback((tabId: string, dirty: boolean) => {
    setUnsavedTabs((prev) => ({ ...prev, [tabId]: dirty }));
  }, [setUnsavedTabs]);

  const langMode = getLanguageMode(activeTab);
  const folderName = activeFolder
    ? activeFolder.split(/[\\/]/).filter(Boolean).pop() || "workspace"
    : "workspace";

  return (
    <main className="flex-1 flex flex-col min-w-0 bg-[var(--bg-app)] overflow-hidden select-none border-r border-[var(--border-color)] transition-colors duration-150">
      {/* 1. TOP TABS BAR */}
      <CenterTabHeader
        tabs={tabs}
        activeTabId={activeTabId}
        activeTab={activeTab}
        unsavedTabs={{ [activeTab?.id || ""]: isUnsaved }}
        activeDiff={activeDiff}
        onClearDiff={handleClearDiff}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
        onSave={handleSave}
        onCopyContent={handleCopyContent}
        onDownloadTxt={handleDownloadTxt}
        isUnsaved={isUnsaved}
        copied={copied}
      />

      {/* 2. BREADCRUMBS BAR */}
      {activeTab && (
        <CenterBreadcrumbs
          folderName={folderName}
          tabTitle={activeTab.title}
          activeFolder={activeFolder}
          appName={
            activeTab.fileType === "wordcraft-app"
              ? "WordCraft"
              : activeTab.fileType === "gridcraft-app"
              ? "GridCraft"
              : activeTab.fileType === "pdfcraft-app"
              ? "PdfCraft"
              : activeTab.fileType === "deckcraft-app"
              ? "DeckCraft"
              : undefined
          }
        />
      )}

      {/* 3. DYNAMIC CONTENT BODY (KEEP-ALIVE MULTI-TAB ENGINE) */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 relative overflow-hidden bg-[var(--bg-card)]">
        {tabs.length > 0 ? (
          tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const tabContent = editedContents[tab.id] ?? tab.content ?? "";

            return (
              <CenterTabRenderer
                key={tab.id}
                tab={tab}
                isActive={isActive}
                tabContent={tabContent}
                activeFolder={activeFolder}
                lineCount={lineCount}
                addedLineNums={addedLineNums}
                cursorPos={cursorPos}
                textareaRef={textareaRef}
                gutterRef={gutterRef}
                onTextChange={handleTextChange}
                updateCursorPos={updateCursorPos}
                onScroll={handleScroll}
                onKeyDown={handleKeyDown}
                onTextChangeForTab={handleTextChangeForTab}
                onSaveForTab={handleSaveForTab}
                onDirtyChange={handleDirtyChange}
                onOpenFileTab={onOpenFileTab}
                onCloseTab={onCloseTab}
                onRevertDiff={onRevertDiff}
                onAcceptDiff={onAcceptDiff}
              />
            );
          })
        ) : (
          <CenterEmptyState
            onOpenFolder={onOpenFolder}
            hasOpenFolder={!!activeFolder}
          />
        )}
      </div>

      {/* 4. MONOCHROME BOTTOM STATUS BAR */}
      {activeTab && <CenterStatusBar cursorPos={cursorPos} langMode={langMode} />}
    </main>
  );
}

export const WorkstationCenterPanel = memo(WorkstationCenterPanelComponent);
