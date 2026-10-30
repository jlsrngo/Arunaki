import { useState, useRef, useEffect } from "react";
import { MoreVertical, Pencil, Copy, Trash2, Sparkles } from "lucide-react";
import { TreeNode } from "./tree-utils";
import { cn } from "../../lib/utils";
import { toast } from "sonner";

interface TreeNodeActionMenuProps {
  node: TreeNode;
  canRename: boolean;
  canDelete: boolean;
  onStartRename: () => void;
  onDelete: () => void;
  onAnalyze?: () => void;
}

export function TreeNodeActionMenu({
  node,
  canRename,
  canDelete,
  onStartRename,
  onDelete,
  onAnalyze,
}: TreeNodeActionMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleCopyPath = () => {
    setMenuOpen(false);
    const pathStr = node.nativePath || node.name;
    navigator.clipboard.writeText(pathStr);
    toast.success(
      node.isDir
        ? "Folder path copied to clipboard."
        : "File path copied to clipboard."
    );
  };

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button
        type="button"
        title={node.isDir ? "Folder Actions" : "File Actions"}
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((prev) => !prev);
        }}
        className={cn(
          "p-1 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] rounded text-[var(--text-muted)] cursor-pointer transition-colors",
          menuOpen
            ? "opacity-100 text-[var(--text-primary)] bg-[var(--bg-hover)]"
            : "opacity-0 group-hover:opacity-100"
        )}
      >
        <MoreVertical className="w-3.5 h-3.5" strokeWidth={1.5} />
      </button>

      {menuOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full mt-1 w-44 rounded-xl bg-[var(--bg-card)] border border-[var(--border-strong)] p-1 z-50 animate-in fade-in duration-100 text-xs space-y-0.5"
        >
          {canRename && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onStartRename();
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] flex items-center gap-2 text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            >
              <Pencil className="w-3 h-3 text-[var(--text-muted)]" />
              <span>Rename / Edit</span>
            </button>
          )}

          {!node.isDir && onAnalyze && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onAnalyze();
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] flex items-center gap-2 text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            >
              <Sparkles className="w-3 h-3 text-purple-400" />
              <span>Ask AI to Analyze</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCopyPath}
            className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] flex items-center gap-2 text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <Copy className="w-3 h-3 text-[var(--text-muted)]" />
            <span>Copy Path</span>
          </button>

          {canDelete && (
            <>
              <div className="h-px bg-[var(--border-color)] my-1" />
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] flex items-center gap-2 text-rose-400 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer"
              >
                <Trash2 className="w-3 h-3 text-red-400" />
                <span>{node.isDir ? "Delete Folder" : "Delete File"}</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
