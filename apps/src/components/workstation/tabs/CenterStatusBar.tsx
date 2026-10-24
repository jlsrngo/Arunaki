import { memo } from "react";
import { GitBranch, AlertTriangle } from "lucide-react";
import { useWordWrap } from "../../../lib/wordWrap";
import { getEffectiveShortcut } from "../../layout/menu/shortcutsConfig";

interface CenterStatusBarProps {
  cursorPos: { line: number; col: number };
  langMode: string;
}

export const CenterStatusBar = memo(function CenterStatusBar({
  cursorPos,
  langMode,
}: CenterStatusBarProps) {
  const { wordWrap, toggleWordWrap } = useWordWrap();
  const shortcut = getEffectiveShortcut("toggle-word-wrap") || "Alt+Z";

  return (
    <footer className="h-[22px] bg-[var(--bg-panel)] text-[var(--text-muted)] border-t border-[var(--border-color)] px-3 flex items-center justify-between text-[11px] font-sans select-none shrink-0 font-medium transition-colors">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1 hover:bg-[var(--bg-hover)] px-1.5 py-0.5 rounded cursor-pointer text-[var(--text-primary)] transition-colors">
          <GitBranch className="w-3 h-3 text-[var(--text-muted)]" />
          <span>main*</span>
        </span>
        <span className="flex items-center gap-1 hover:bg-[var(--bg-hover)] px-1.5 py-0.5 rounded cursor-pointer text-[var(--text-primary)] transition-colors">
          <AlertTriangle className="w-3 h-3 text-[var(--text-muted)]" />
          <span>0</span>
        </span>
      </div>

      <div className="flex items-center gap-3 text-[var(--text-muted)]">
        <span className="hover:bg-[var(--bg-hover)] px-1.5 py-0.5 rounded cursor-pointer text-[var(--text-primary)] transition-colors">
          Ln {cursorPos.line}, Col {cursorPos.col}
        </span>
        <span className="hover:bg-[var(--bg-hover)] px-1.5 py-0.5 rounded cursor-pointer text-[var(--text-primary)] transition-colors">Spaces: 4</span>
        <span className="hover:bg-[var(--bg-hover)] px-1.5 py-0.5 rounded cursor-pointer text-[var(--text-primary)] transition-colors">UTF-8</span>
        <span className="hover:bg-[var(--bg-hover)] px-1.5 py-0.5 rounded cursor-pointer text-[var(--text-primary)] transition-colors">CRLF</span>
        <button
          type="button"
          onClick={toggleWordWrap}
          title={`Toggle Word Wrap (${shortcut})`}
          className="hover:bg-[var(--bg-hover)] px-1.5 py-0.5 rounded cursor-pointer text-[var(--text-primary)] transition-colors bg-transparent border-none text-[11px] font-sans"
        >
          {wordWrap ? "Wrap" : "No Wrap"}
        </button>
        <span className="hover:bg-[var(--bg-hover)] px-1.5 py-0.5 rounded cursor-pointer font-semibold text-[var(--text-primary)] transition-colors">
          {langMode}
        </span>
      </div>
    </footer>
  );
});
