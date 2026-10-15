import { memo } from "react";
import {
  PanelLeft,
  PanelRight,
  WrapText,
  Maximize,
  RotateCcw,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { useI18n } from "../../../lib/i18n";
import { useWordWrap } from "../../../lib/wordWrap";
import { usePanels } from "../../../lib/panels";
import { BaseMenuProps } from "./types";
import { getEffectiveShortcut } from "./shortcutsConfig";
import { menuAutoFocus, menuKeyDown, menuTriggerProps } from "./menuA11y";
import { MenuItem } from "./items/MenuItem";
import { MenuSeparator } from "./items/MenuSeparator";
import { ThemeSubmenu } from "./submenus/ThemeSubmenu";
import { LanguageSubmenu } from "./submenus/LanguageSubmenu";
import { AppCommands } from "./hooks/useAppCommands";

interface ViewMenuProps extends BaseMenuProps {
  commands: AppCommands;
}

export const ViewMenu = memo(function ViewMenu({
  isOpen,
  onToggle,
  onMouseEnter,
  onClose,
  commands,
}: ViewMenuProps) {
  const { t } = useI18n();
  const { wordWrap } = useWordWrap();
  const { explorerOpen, chatOpen } = usePanels();

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
        {t("view", "View")}
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={t("view", "View")}
          onKeyDown={menuKeyDown}
          ref={menuAutoFocus}
          className="absolute top-full left-0 mt-1 min-w-[245px] max-w-[300px] bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl py-1.5 z-50 max-h-[70vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-100"
        >
          <MenuItem
            icon={PanelLeft}
            label={t("explorerPanel", "Explorer Panel")}
            shortcut={getEffectiveShortcut("toggle-explorer") || "Ctrl+B"}
            checked={explorerOpen}
            onClick={() => {
              commands.toggleExplorer();
              onClose();
            }}
          />

          <MenuItem
            icon={PanelRight}
            label={t("chatPanel", "Chat Panel")}
            shortcut={getEffectiveShortcut("toggle-chat") || "Ctrl+J"}
            checked={chatOpen}
            onClick={() => {
              commands.toggleChat();
              onClose();
            }}
          />

          <MenuItem
            icon={WrapText}
            label={t("wrapText", "Wrap Text")}
            shortcut={getEffectiveShortcut("toggle-word-wrap") || "Alt+Z"}
            checked={wordWrap}
            onClick={() => {
              commands.toggleWordWrap();
              onClose();
            }}
          />

          <MenuSeparator />

          {/* Dedicated Theme Submenu */}
          <ThemeSubmenu onClose={onClose} />

          <MenuSeparator />

          {/* Dedicated Language Submenu */}
          <LanguageSubmenu onClose={onClose} />

          <MenuSeparator />

          <MenuItem
            icon={Maximize}
            label={t("toggleFullscreen", "Toggle Fullscreen")}
            shortcut={getEffectiveShortcut("fullscreen") || "F11"}
            onClick={() => {
              onClose();
              commands.toggleFullscreen();
            }}
          />

          <MenuItem
            icon={RotateCcw}
            label={t("resetZoom", "Reset Zoom")}
            shortcut={getEffectiveShortcut("reset-zoom") || "Ctrl+0"}
            onClick={() => {
              onClose();
              commands.resetZoom();
            }}
          />
        </div>
      )}
    </div>
  );
});
