import { useRef, useEffect } from "react";
import { cn } from "../../lib/utils";

interface TreeNodeRenameInputProps {
  value: string;
  isDir: boolean;
  onChange: (val: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  className?: string;
}

export function TreeNodeRenameInput({
  value,
  isDir,
  onChange,
  onCommit,
  onCancel,
  className,
}: TreeNodeRenameInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Pre-select basename (without extension) when entering rename mode
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      const dotIndex = value.lastIndexOf(".");
      if (dotIndex > 0 && !isDir) {
        inputRef.current.setSelectionRange(0, dotIndex);
      } else {
        inputRef.current.select();
      }
    }
  }, []); // Run on mount

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          onCommit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
      }}
      onBlur={onCommit}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "px-1.5 py-0.5 bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--text-primary)] rounded text-xs w-full focus:outline-none select-text",
        isDir ? "font-medium" : "font-normal",
        className
      )}
      autoFocus
    />
  );
}
