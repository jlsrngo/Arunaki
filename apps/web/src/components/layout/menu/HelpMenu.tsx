import { memo } from "react";
import {
  BookOpen,
  Keyboard,
  BookText,
  ExternalLink,
  Bug,
  Info,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { useI18n } from "../../../lib/i18n";
import { BaseMenuProps } from "./types";
import { useNavigate } from "react-router-dom";
import { getEffectiveShortcut } from "./shortcutsConfig";
import { menuAutoFocus, menuKeyDown, menuTriggerProps } from "./menuA11y";

interface HelpMenuProps extends BaseMenuProps {
  onOpenShortcuts: () => void;
  onOpenAbout: () => void;
}

export const HelpMenu = memo(function HelpMenu({
  isOpen,
  onToggle,
  onMouseEnter,
  onClose,
  onOpenShortcuts,
  onOpenAbout,
}: HelpMenuProps) {
  const { t } = useI18n();
  const navigate = useNavigate();

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
        {t("help", "Help")}
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
            onClick={() => {
              onClose();
              // window.location.hash only routes under HashRouter, which is picked for the file:// build
      // (main.cjs loadFile). Under the dev server App.tsx picks BrowserRouter, where setting the
      // hash does nothing at all and this item was silently dead. navigate works under both.
      navigate("/knowledge");
            }}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <BookOpen className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("knowledgeRules", "Knowledge & Rules")}</span>
            </div>
          </button>

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

          <div className="h-px my-1.5 bg-[var(--border-color)]" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              window.open("https://juliosiringoringo.space/id/arunaki", "_blank");
            }}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <BookText className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("documentation", "Documentation")}</span>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-[var(--text-muted)]" strokeWidth={1.5} />
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              window.open("https://github.com/jlsrngo/Arunaki", "_blank");
            }}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <ExternalLink className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("githubRepo", "GitHub Repository")}</span>
            </div>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              window.open("https://github.com/jlsrngo/Arunaki/issues", "_blank");
            }}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <Bug className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("reportIssue", "Report an Issue")}</span>
            </div>
          </button>

          <div className="h-px my-1.5 bg-[var(--border-color)]" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              onOpenAbout();
            }}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <Info className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("aboutArunaki", "About Arunaki")}</span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
});
