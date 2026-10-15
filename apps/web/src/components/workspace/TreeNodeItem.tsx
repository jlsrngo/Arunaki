import { useState, useEffect } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen } from "lucide-react";
import { TreeNode, getFileIcon, formatSize } from "./tree-utils";
import { TreeNodeActionMenu } from "./TreeNodeActionMenu";
import { TreeNodeRenameInput } from "./TreeNodeRenameInput";

interface TreeNodeItemProps {
  node: TreeNode;
  depth: number;
  collapseSignal?: number;
  onFileClick?: (path: string, name: string) => void;
  onDeletePath?: (path: string, name: string) => void;
  onRenamePath?: (oldPath: string, oldName: string, newName: string) => void;
  onAnalyzeFile?: (name: string, path?: string) => void;
  activeAgentAction?: { toolName: string; args?: any } | null;
}

export function TreeNodeItem({
  node,
  depth,
  collapseSignal,
  onFileClick,
  onDeletePath,
  onRenamePath,
  onAnalyzeFile,
  activeAgentAction,
}: TreeNodeItemProps) {
  const [open, setOpen] = useState(depth < 2);
  const [isRenaming, setIsRenaming] = useState(false);
  const [editName, setEditName] = useState(node.name);

  // Sync editName when node.name changes
  useEffect(() => {
    setEditName(node.name);
  }, [node.name]);

  // Auto-collapse when user triggers Collapse All Quick Action
  useEffect(() => {
    if (collapseSignal && collapseSignal > 0) {
      setOpen(false);
    }
  }, [collapseSignal]);

  const handleCommitRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== node.name && onRenamePath) {
      onRenamePath(node.nativePath || node.name, node.name, trimmed);
    }
    setIsRenaming(false);
  };

  const handleCancelRename = () => {
    setEditName(node.name);
    setIsRenaming(false);
  };

  const isAgentTarget = Boolean(
    activeAgentAction?.args?.filename &&
      (activeAgentAction.args.filename.endsWith(node.name) ||
        node.name.endsWith(activeAgentAction.args.filename))
  );

  if (node.isDir) {
    return (
      <div>
        <div
          className="group flex items-center justify-between py-[3px] px-1.5 hover:bg-[var(--bg-hover)] transition-colors text-xs text-[var(--text-primary)] select-none cursor-pointer border-l-2 border-transparent hover:border-[var(--border-strong)]"
          style={{ paddingLeft: `${depth * 12 + 12}px` }}
          onClick={() => {
            if (!isRenaming) setOpen(!open);
          }}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="shrink-0 text-[var(--text-muted)]">
              {open ? (
                <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.75} />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.75} />
              )}
            </span>
            {open ? (
              <FolderOpen className="w-3.5 h-3.5 text-[var(--text-primary)] shrink-0 opacity-95" strokeWidth={2} />
            ) : (
              <Folder className="w-3.5 h-3.5 text-[var(--text-primary)] shrink-0 opacity-95" strokeWidth={2} />
            )}
            {isRenaming ? (
              <TreeNodeRenameInput
                value={editName}
                isDir={true}
                onChange={setEditName}
                onCommit={handleCommitRename}
                onCancel={handleCancelRename}
              />
            ) : (
              <span className="truncate font-medium text-[var(--text-primary)] text-xs">
                {node.name}
              </span>
            )}
          </div>

          <TreeNodeActionMenu
            node={node}
            canRename={Boolean(node.nativePath && onRenamePath)}
            canDelete={Boolean(node.nativePath && onDeletePath)}
            onStartRename={() => {
              setEditName(node.name);
              setIsRenaming(true);
            }}
            onDelete={() => {
              if (node.nativePath && onDeletePath) {
                onDeletePath(node.nativePath, node.name);
              }
            }}
          />
        </div>

        {open && node.children.length > 0 && (
          <div>
            {node.children.map((child, i) => (
              <TreeNodeItem
                key={`${child.name}-${i}`}
                node={child}
                depth={depth + 1}
                collapseSignal={collapseSignal}
                onFileClick={onFileClick}
                onDeletePath={onDeletePath}
                onRenamePath={onRenamePath}
                onAnalyzeFile={onAnalyzeFile}
                activeAgentAction={activeAgentAction}
              />
            ))}
          </div>
        )}
        {open && node.children.length === 0 && (
          <div
            className="text-[11px] text-[var(--text-dim)] italic py-0.5"
            style={{ paddingLeft: `${(depth + 1) * 12 + 16}px` }}
          >
            (kosong)
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={() => {
        if (isRenaming) return;
        if (node.nativePath) onFileClick?.(node.nativePath, node.name);
        else onFileClick?.(node.name, node.name);
      }}
      className={`group flex items-center justify-between py-[3px] px-1.5 transition-all text-xs select-none cursor-pointer border-l-2 border-transparent ${
        isAgentTarget
          ? "bg-[var(--bg-hover)] text-[var(--text-primary)] font-semibold border-[var(--text-primary)] animate-pulse"
          : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      }`}
      style={{ paddingLeft: `${depth * 12 + 24}px` }}
    >
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {getFileIcon(node.name)}
        {isRenaming ? (
          <TreeNodeRenameInput
            value={editName}
            isDir={false}
            onChange={setEditName}
            onCommit={handleCommitRename}
            onCancel={handleCancelRename}
          />
        ) : (
          <span className="truncate text-[var(--text-primary)] font-normal">{node.name}</span>
        )}
        {isAgentTarget && (
          <span className="ml-1 px-1.5 py-0.5 rounded bg-[var(--text-primary)] text-[var(--bg-app)] text-[9px] font-bold shrink-0 animate-pulse">
            AI Working...
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[10px] text-[var(--text-dim)] font-mono group-hover:hidden pr-1">
          {node.size ? formatSize(node.size) : node.file ? formatSize(node.file.size) : ""}
        </span>

        <TreeNodeActionMenu
          node={node}
          canRename={Boolean(node.nativePath && onRenamePath)}
          canDelete={Boolean(node.nativePath && onDeletePath)}
          onStartRename={() => {
            setEditName(node.name);
            setIsRenaming(true);
          }}
          onDelete={() => {
            if (node.nativePath && onDeletePath) {
              onDeletePath(node.nativePath, node.name);
            }
          }}
          onAnalyze={
            onAnalyzeFile
              ? () => onAnalyzeFile(node.name, node.nativePath)
              : undefined
          }
        />
      </div>
    </div>
  );
}
