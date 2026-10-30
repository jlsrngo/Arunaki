import { memo, lazy, Suspense } from "react";
import { CenterTab } from "./types";
import { CenterEditorView } from "./CenterEditorView";
import { SplitDiffViewer } from "./SplitDiffViewer";
import { SopPlaybookCenterView } from "../sop/SopPlaybookCenterView";
import { cn } from "../../../lib/utils";

const SpreadsheetViewer = lazy(() =>
  import("../canvas/SpreadsheetViewer").then((m) => ({ default: m.SpreadsheetViewer }))
);

const WordCraft = lazy(() =>
  import("../canvas/WordCraft").then((m) => ({ default: m.WordCraft }))
);

const DeckCraft = lazy(() =>
  import("../canvas/DeckCraft").then((m) => ({ default: m.DeckCraft }))
);

const PdfCraft = lazy(() =>
  import("../canvas/PdfCraft").then((m) => ({ default: m.PdfCraft }))
);

const CanvasView = lazy(() =>
  import("../canvas/CanvasView").then((m) => ({ default: m.CanvasView }))
);

interface CenterTabRendererProps {
  tab: CenterTab;
  isActive: boolean;
  tabContent: string;
  activeFolder?: string;
  lineCount: number;
  addedLineNums: Set<number>;
  cursorPos: { line: number; col: number };
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  gutterRef: React.RefObject<HTMLDivElement | null>;
  onTextChange: (text: string) => void;
  updateCursorPos: () => void;
  onScroll: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onTextChangeForTab: (tabId: string, text: string) => void;
  onSaveForTab: (tabId: string) => void;
  onDirtyChange: (tabId: string, dirty: boolean) => void;
  onOpenFileTab?: (filePath: string) => void;
  onCloseTab: (tabId: string) => void;
  onRevertDiff?: (filePath: string) => void;
  onAcceptDiff?: (filePath: string) => void;
}

export const CenterTabRenderer = memo(function CenterTabRenderer({
  tab,
  isActive,
  tabContent,
  activeFolder,
  lineCount,
  addedLineNums,
  cursorPos,
  textareaRef,
  gutterRef,
  onTextChange,
  updateCursorPos,
  onScroll,
  onKeyDown,
  onTextChangeForTab,
  onSaveForTab,
  onDirtyChange,
  onOpenFileTab,
  onCloseTab,
  onRevertDiff,
  onAcceptDiff,
}: CenterTabRendererProps) {
  const isTabCanvas = tab.type === "canvas";

  const isTabPdf = Boolean(
    !isTabCanvas &&
      (["pdf"].includes(tab.fileType?.toLowerCase() || "") || (/\.pdf$/i).test(tab.title))
  );

  const isTabSpreadsheet = Boolean(
    !isTabCanvas &&
      !isTabPdf &&
      (tab.fileType === "gridcraft-app" ||
        ["xlsx", "xls", "xlsm", "xlsb", "csv", "tsv"].includes(tab.fileType?.toLowerCase() || "") ||
        (/\.(xlsx|xls|xlsm|xlsb|csv|tsv)$/i).test(tab.title))
  );

  const isTabDeck = Boolean(
    !isTabCanvas &&
      !isTabPdf &&
      !isTabSpreadsheet &&
      (tab.fileType === "deckcraft-app" ||
        ["pptx", "ppt", "odp"].includes(tab.fileType?.toLowerCase() || "") ||
        (/\.(pptx|ppt|odp)$/i).test(tab.title))
  );

  const isTabWordDoc = Boolean(
    !isTabCanvas &&
      !isTabPdf &&
      !isTabSpreadsheet &&
      !isTabDeck &&
      (tab.fileType === "wordcraft-app" ||
        ["docx", "doc", "odt", "rtf"].includes(tab.fileType?.toLowerCase() || "") ||
        (/\.(docx|doc|odt|rtf)$/i).test(tab.title))
  );

  const isTabSopPlaybook = Boolean(
    tab.fileType === "playbook" ||
      tab.fileType === "playbook-new" ||
      tab.fileType === "playbook-audit" ||
      tab.fileType === "playbook-exec"
  );

  return (
    <div
      className={cn("w-full h-full flex flex-col flex-1", !isActive && "hidden")}
      style={{ display: isActive ? "flex" : "none" }}
    >
      {isTabSopPlaybook ? (
        <SopPlaybookCenterView
          mode={
            tab.fileType === "playbook-new"
              ? "new-playbook"
              : tab.fileType === "playbook-audit"
              ? "reconcile"
              : tab.fileType === "playbook-exec"
              ? "executive"
              : "playbook"
          }
          playbookId={tab.path}
          initialContent={tab.content}
          activeFolder={activeFolder}
          onOpenFileTab={onOpenFileTab}
          onCloseCurrentTab={() => onCloseTab(tab.id)}
        />
      ) : isTabCanvas ? (
        <Suspense fallback={null}>
          <CanvasView
            content={tabContent}
            title={tab.title}
            tabId={tab.id}
            timeStr={tab.timeStr}
            createdAt={tab.createdAt}
            onContentChange={(newContent) => onTextChangeForTab(tab.id, newContent)}
            onSave={() => onSaveForTab(tab.id)}
          />
        </Suspense>
      ) : isTabPdf ? (
        <Suspense fallback={null}>
          <PdfCraft
            content={tabContent}
            filePath={tab.path}
            title={tab.title}
            onContentChange={(newContent) => onTextChangeForTab(tab.id, newContent)}
            onSave={() => onSaveForTab(tab.id)}
          />
        </Suspense>
      ) : isTabSpreadsheet ? (
        <Suspense fallback={null}>
          <SpreadsheetViewer
            content={tabContent}
            filePath={tab.path}
            activeFolder={activeFolder}
            tabId={tab.id}
            title={tab.title}
            onContentChange={(newContent) => onTextChangeForTab(tab.id, newContent)}
            onSave={() => onSaveForTab(tab.id)}
            onDirtyChange={(dirty) => onDirtyChange(tab.id, dirty)}
          />
        </Suspense>
      ) : isTabDeck ? (
        <Suspense fallback={null}>
          <DeckCraft
            content={tabContent}
            filePath={tab.path}
            activeFolder={activeFolder}
            tabId={tab.id}
            title={tab.title}
            onContentChange={(newContent) => onTextChangeForTab(tab.id, newContent)}
            onSave={() => onSaveForTab(tab.id)}
            onDirtyChange={(dirty) => onDirtyChange(tab.id, dirty)}
          />
        </Suspense>
      ) : tab.type === "diff" ? (
        <SplitDiffViewer
          fileName={tab.title.replace(" (Working Tree)", "")}
          filePath={tab.path}
          beforeContent={tab.beforeContent || ""}
          afterContent={tab.afterContent || tab.content || ""}
          onRevert={() => {
            if (tab.path && onRevertDiff) {
              onRevertDiff(tab.path);
            }
            onCloseTab(tab.id);
          }}
          onAccept={() => {
            if (tab.path && onAcceptDiff) {
              onAcceptDiff(tab.path);
            }
            onCloseTab(tab.id);
          }}
        />
      ) : isTabWordDoc ? (
        <Suspense fallback={null}>
          <WordCraft
            content={tabContent}
            filePath={tab.path}
            activeFolder={activeFolder}
            tabId={tab.id}
            title={tab.title}
            onContentChange={(newContent) => onTextChangeForTab(tab.id, newContent)}
            onSave={() => onSaveForTab(tab.id)}
            onDirtyChange={(dirty) => onDirtyChange(tab.id, dirty)}
          />
        </Suspense>
      ) : (
        isActive && (
          <CenterEditorView
            currentContent={tabContent}
            lineCount={lineCount}
            addedLineNums={addedLineNums}
            cursorPos={cursorPos}
            textareaRef={textareaRef}
            gutterRef={gutterRef}
            onTextChange={onTextChange}
            updateCursorPos={updateCursorPos}
            onScroll={onScroll}
            onKeyDown={onKeyDown}
          />
        )
      )}
    </div>
  );
});
