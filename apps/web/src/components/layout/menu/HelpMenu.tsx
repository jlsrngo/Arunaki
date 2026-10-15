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
import { getEffectiveShortcut } from "./shortcutsConfig";
import { menuAutoFocus, menuKeyDown, menuTriggerProps } from "./menuA11y";
import { MenuItem } from "./items/MenuItem";
import { MenuSeparator } from "./items/MenuSeparator";
import { AppCommands } from "./hooks/useAppCommands";

interface HelpMenuProps extends BaseMenuProps {
  commands: AppCommands;
}

export const HelpMenu = memo(function HelpMenu({
  isOpen,
  onToggle,
  onMouseEnter,
  onClose,
  commands,
}: HelpMenuProps) {
  const { t } = useI18n();

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
          aria-label={t("help", "Help")}
          onKeyDown={menuKeyDown}
          ref={menuAutoFocus}
          className="absolute top-full left-0 mt-1 min-w-[245px] max-w-[300px] bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl py-1.5 z-50 max-h-[70vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-100"
        >
          <MenuItem
            icon={BookOpen}
            label={t("knowledgeRules", "Knowledge & Rules")}
            onClick={() => {
              onClose();
              commands.openKnowledge();
            }}
          />

          <MenuItem
            icon={Keyboard}
            label={t("keyboardShortcuts", "Keyboard Shortcuts")}
            shortcut={getEffectiveShortcut("shortcuts") || "Ctrl+/"}
            onClick={() => {
              onClose();
              commands.openShortcuts?.();
            }}
          />

          <MenuSeparator />

          <MenuItem
            icon={BookText}
            label={t("documentation", "Documentation")}
            rightIcon={ExternalLink}
            onClick={() => {
              onClose();
              window.open("https://juliosiringoringo.space/id/arunaki", "_blank");
            }}
          />

          <MenuItem
            icon={ExternalLink}
            label={t("githubRepo", "GitHub Repository")}
            onClick={() => {
              onClose();
              window.open("https://github.com/jlsrngo/Arunaki", "_blank");
            }}
          />

          <MenuItem
            icon={Bug}
            label={t("reportIssue", "Report an Issue")}
            onClick={() => {
              onClose();
              window.open("https://github.com/jlsrngo/Arunaki/issues", "_blank");
            }}
          />

          <MenuSeparator />

          <MenuItem
            icon={Info}
            label={t("aboutArunaki", "About Arunaki")}
            onClick={() => {
              onClose();
              commands.openAbout?.();
            }}
          />
        </div>
      )}
    </div>
  );
});
