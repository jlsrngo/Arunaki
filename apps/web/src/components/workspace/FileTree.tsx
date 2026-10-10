import { useState, useMemo, useRef } from "react";
import {
  ChevronDown,
  ChevronRight,
  FilePlus,
  FolderPlus,
  RotateCw,
  ChevronsUp,
  Folder,
  FileText,
} from "lucide-react";
import {
  FileItem,
  NativeNode,
  buildTree,
  nativeToTreeNodes,
} from "./tree-utils";
import { TreeNodeItem } from "./TreeNodeItem";

export interface FileTreeProps {
  files: FileItem[];
  workspaceName: string;
  workspaceFolderPath?: string;
  nativeTree?: NativeNode[];
  onFileClick?: (path: string, name: string, content?: string) => void;
  onRefresh?: () => void;
  onCreateFile?: (fileName: string) => void;
  onCreateFolder?: (folderName: string) => void;
  onDeletePath?: (path: string, name: string) => void;
  onRenamePath?: (oldPath: string, oldName: string, newName: string) => void;
  onAnalyzeFile?: (name: string, path?: string) => void;
  activeAgentAction?: { toolName: string; args?: any } | null;
}

export default function FileTree({
  files,
  workspaceName,
  nativeTree,
  onFileClick,
  onRefresh,
  onCreateFile,
  onCreateFolder,
  onDeletePath,
  onRenamePath,
  onAnalyzeFile,
  activeAgentAction,
}: FileTreeProps) {
  const [isRootExpanded, setIsRootExpanded] = useState(true);
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [inlineCreating, setInlineCreating] = useState<"file" | "folder" | null>(null);
  const [inlineName, setInlineName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const tree = useMemo(() => {
    if (nativeTree && nativeTree.length > 0) {
      return nativeToTreeNodes(nativeTree);
    }
    return buildTree(files);
  }, [nativeTree, files]);

  const handleItemClick = async (filePath: string, fileName: string) => {
    try {
      // One path, not two. This used to fall back to apiFetch(`/files/:id/content`) when the desktop
      // bridge was missing - a route the engine has never had. It 500'd, was swallowed by an empty
      // catch, and produced an empty document indistinguishable from an empty file. The fallback
      // guarded a path with a different rule than the IPC one (resolveInsideWorkspace), so leaving
      // both in place meant two sources of truth about what may be read.
      const desktop = (window as any).arunakiDesktop;
      if (!desktop?.readFile) {
        console.error("No desktop bridge available; cannot read", filePath);
        onFileClick?.(filePath, fileName, "");
        return;
      }

      const res = await desktop.readFile(filePath);
      if (res?.error) {
        console.error("Read failed:", res.error);
        onFileClick?.(filePath, fileName, "");
        return;
      }
      onFileClick?.(filePath, fileName, res?.content ?? "");
    } catch (err: any) {
      console.error("Error opening file:", err);
    }
  };

  const commitInlineCreate = () => {
    const val = inlineName.trim();
    if (val) {
      if (inlineCreating === "file" && onCreateFile) onCreateFile(val);
      else if (inlineCreating === "folder" && onCreateFolder) onCreateFolder(val);
    }
    setInlineCreating(null);
    setInlineName("");
  };

  const handleCollapseAll = () => {
    setCollapseSignal((prev) => prev + 1);
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-panel)] overflow-hidden text-xs select-none transition-colors duration-150">
      {/* 1. PROJECT ROOT BAR: Root Name + Chevron Toggle (Left) + 4 Quick Actions (Right) */}
      <div className="flex items-center justify-between px-3 h-8 bg-[var(--bg-panel-sub)] shrink-0 border-b border-[var(--border-color)] transition-colors duration-150">
        <button
          onClick={() => setIsRootExpanded(!isRootExpanded)}
          className="flex items-center gap-1.5 min-w-0 text-left hover:text-[var(--text-primary)] transition-colors cursor-pointer group"
          title="Toggle Project Root"
        >
          <span className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] shrink-0">
            {isRootExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.75} />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.75} />
            )}
          </span>
          <span className="text-[var(--text-primary)] font-semibold text-xs tracking-wide truncate">
            {workspaceName || "Workspace"}
          </span>
        </button>

        {/* 4 Quick Action Buttons */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            title="New File"
            onClick={() => {
              setIsRootExpanded(true);
              setInlineCreating("file");
              setInlineName("");
              setTimeout(() => inputRef.current?.focus(), 30);
            }}
            className="p-1 hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded transition-colors cursor-pointer"
          >
            <FilePlus className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>

          <button
            type="button"
            title="New Folder"
            onClick={() => {
              setIsRootExpanded(true);
              setInlineCreating("folder");
              setInlineName("");
              setTimeout(() => inputRef.current?.focus(), 30);
            }}
            className="p-1 hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded transition-colors cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>

          {onRefresh && (
            <button
              type="button"
              title="Refresh Explorer"
              onClick={onRefresh}
              className="p-1 hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded transition-colors cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          )}

          <button
            type="button"
            title="Collapse All Folders"
            onClick={handleCollapseAll}
            className="p-1 hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded transition-colors cursor-pointer"
          >
            <ChevronsUp className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* 2. FLAT TREE LIST (Direct Hierarchy List with Compact Indentation) */}
      {isRootExpanded && (
        <div className="flex-1 overflow-y-auto py-1 min-h-0">
          {/* Inline New File / Folder Input (VS Code Parity) */}
          {inlineCreating && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-[var(--bg-hover)] rounded border border-[var(--border-strong)] mx-1 mb-1 select-none animate-in fade-in duration-100">
              {inlineCreating === "folder" ? (
                <Folder className="w-3.5 h-3.5 text-[var(--text-primary)] shrink-0 opacity-95" strokeWidth={2} />
              ) : (
                <FileText className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" strokeWidth={1.5} />
              )}
              <input
                ref={inputRef}
                type="text"
                value={inlineName}
                onChange={(e) => setInlineName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    commitInlineCreate();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    setInlineCreating(null);
                    setInlineName("");
                  }
                }}
                onBlur={() => {
                  commitInlineCreate();
                }}
                placeholder={inlineCreating === "file" ? "example.txt" : "folder_name"}
                className="w-full bg-[var(--bg-input)] text-xs text-[var(--text-primary)] px-1.5 py-0.5 rounded border border-[var(--border-color)] focus:outline-none focus:border-sky-500 font-sans"
              />
            </div>
          )}

          {tree.length === 0 && !inlineCreating ? (
            <p className="text-xs text-[var(--text-dim)] text-center py-6 font-mono">
              No files found in this workspace
            </p>
          ) : (
            <div className="space-y-0.5">
              {tree.map((node, i) => (
                <TreeNodeItem
                  key={`${node.name}-${i}`}
                  node={node}
                  depth={0}
                  collapseSignal={collapseSignal}
                  onFileClick={(p, n) => handleItemClick(p, n)}
                  onDeletePath={onDeletePath}
                  onRenamePath={onRenamePath}
                  onAnalyzeFile={onAnalyzeFile}
                  activeAgentAction={activeAgentAction}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
