import { memo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Undo2,
  Redo2,
  Scissors,
  Copy,
  Clipboard,
  CheckSquare,
  Search,
  Settings,
  Keyboard,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { useI18n } from "../../../lib/i18n";
import { BaseMenuProps } from "./types";
import { getEffectiveShortcut } from "./shortcutsConfig";
import { menuAutoFocus, menuKeyDown, menuTriggerProps } from "./menuA11y";

interface EditMenuProps extends BaseMenuProps {
  onOpenShortcuts?: () => void;
}

export const EditMenu = memo(function EditMenu({
  isOpen,
  onToggle,
  onMouseEnter,
  onClose,
  onOpenShortcuts,
}: EditMenuProps) {
  const navigate = useNavigate();
  const { t } = useI18n();

  const handleUndo = () => {
    document.execCommand("undo");
    onClose();
  };

  const handleRedo = () => {
    document.execCommand("redo");
    onClose();
  };

  const handleCut = () => {
    document.execCommand("cut");
    onClose();
  };

  const handleCopy = () => {
    document.execCommand("copy");
    onClose();
  };

  const handlePaste = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        document.execCommand("insertText", false, text);
      } else {
        document.execCommand("paste");
      }
    } catch {
      document.execCommand("paste");
    }
    onClose();
  };

  const handleSelectAll = () => {
    document.execCommand("selectAll");
    onClose();
  };

  const handleFind = () => {
    window.dispatchEvent(new CustomEvent("arunaki-search-session"));
    onClose();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        onMouseEnter={onMouseEnter}
        {...menuTriggerProps(isOpen)}
        className={cn(
          "text-[var(--text-muted)] hover:text-[var(--text-primary)] text-[13px] font-medium px-3 py-1.5 rounded-md transition-colors cursor-pointer",
          isOpen && "bg-[var(--bg-hover)] text-[var(--text-primary)]"
        )}
      >
        {t("edit", "Edit")}
      </button>

      {isOpen && (
        <div
          role="menu"
          onKeyDown={menuKeyDown}
          ref={menuAutoFocus}
          className="absolute top-full left-0 mt-1 min-w-[245px] bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
          <button
            type="button"
            role="menuitem"
            onClick={handleUndo}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <Undo2 className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("undo", "Undo")}</span>
            </div>
            <span className="text-[11px] text-[var(--text-muted)] font-mono">
              {getEffectiveShortcut("undo") || "Ctrl+Z"}
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={handleRedo}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <Redo2 className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("redo", "Redo")}</span>
            </div>
            <span className="text-[11px] text-[var(--text-muted)] font-mono">
              {getEffectiveShortcut("redo") || "Ctrl+Y"}
            </span>
          </button>

          <div className="h-px my-1.5 bg-[var(--border-color)]" />

          <button
            type="button"
            role="menuitem"
            onClick={handleCut}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <Scissors className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("cut", "Cut")}</span>
            </div>
            <span className="text-[11px] text-[var(--text-muted)] font-mono">
              {getEffectiveShortcut("cut") || "Ctrl+X"}
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={handleCopy}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <Copy className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("copy", "Copy")}</span>
            </div>
            <span className="text-[11px] text-[var(--text-muted)] font-mono">
              {getEffectiveShortcut("copy") || "Ctrl+C"}
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={handlePaste}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <Clipboard className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("paste", "Paste")}</span>
            </div>
            <span className="text-[11px] text-[var(--text-muted)] font-mono">
              {getEffectiveShortcut("paste") || "Ctrl+V"}
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={handleSelectAll}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <CheckSquare className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("selectAll", "Select All")}</span>
            </div>
            <span className="text-[11px] text-[var(--text-muted)] font-mono">
              {getEffectiveShortcut("select-all") || "Ctrl+A"}
            </span>
          </button>

          <div className="h-px my-1.5 bg-[var(--border-color)]" />

          <button
            type="button"
            role="menuitem"
            onClick={handleFind}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <Search className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("findInSession", "Find in Session...")}</span>
            </div>
            <span className="text-[11px] text-[var(--text-muted)] font-mono">
              {getEffectiveShortcut("find-session") || "Ctrl+F"}
            </span>
          </button>

          <div className="h-px my-1.5 bg-[var(--border-color)]" />

          {onOpenShortcuts && (
            <button
              type="button"
            role="menuitem"
              onClick={() => {
                onClose();
                onOpenShortcuts();
              }}
              className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
            >
              <div className="flex items-center gap-2.5">
                <Keyboard className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
                <span>{t("keyboardShortcuts", "Keyboard Shortcuts")}</span>
              </div>
              <span className="text-[11px] text-[var(--text-muted)] font-mono">
                {getEffectiveShortcut("shortcuts") || "Ctrl+/"}
              </span>
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              navigate("/settings");
            }}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <Settings className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("preferencesSettings", "Preferences / Settings")}</span>
            </div>
            <span className="text-[11px] text-[var(--text-muted)] font-mono">
              {getEffectiveShortcut("settings") || "Ctrl+,"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
});
