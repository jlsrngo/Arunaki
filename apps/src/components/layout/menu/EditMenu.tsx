import { memo } from "react";
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
import { MenuItem } from "./items/MenuItem";
import { MenuSeparator } from "./items/MenuSeparator";
import { AppCommands } from "./hooks/useAppCommands";

interface EditMenuProps extends BaseMenuProps {
  commands: AppCommands;
}

export const EditMenu = memo(function EditMenu({
  isOpen,
  onToggle,
  onMouseEnter,
  onClose,
  commands,
}: EditMenuProps) {
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
        {t("edit", "Edit")}
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={t("edit", "Edit")}
          onKeyDown={menuKeyDown}
          ref={menuAutoFocus}
          className="absolute top-full left-0 mt-1 min-w-[245px] max-w-[300px] bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl py-1.5 z-50 max-h-[70vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-100"
        >
          <MenuItem
            icon={Undo2}
            label={t("undo", "Undo")}
            shortcut={getEffectiveShortcut("undo") || "Ctrl+Z"}
            onClick={() => {
              commands.undo();
              onClose();
            }}
          />

          <MenuItem
            icon={Redo2}
            label={t("redo", "Redo")}
            shortcut={getEffectiveShortcut("redo") || "Ctrl+Y"}
            onClick={() => {
              commands.redo();
              onClose();
            }}
          />

          <MenuSeparator />

          <MenuItem
            icon={Scissors}
            label={t("cut", "Cut")}
            shortcut={getEffectiveShortcut("cut") || "Ctrl+X"}
            onClick={() => {
              commands.cut();
              onClose();
            }}
          />

          <MenuItem
            icon={Copy}
            label={t("copy", "Copy")}
            shortcut={getEffectiveShortcut("copy") || "Ctrl+C"}
            onClick={() => {
              commands.copy();
              onClose();
            }}
          />

          <MenuItem
            icon={Clipboard}
            label={t("paste", "Paste")}
            shortcut={getEffectiveShortcut("paste") || "Ctrl+V"}
            onClick={async () => {
              await commands.paste();
              onClose();
            }}
          />

          <MenuItem
            icon={CheckSquare}
            label={t("selectAll", "Select All")}
            shortcut={getEffectiveShortcut("select-all") || "Ctrl+A"}
            onClick={() => {
              commands.selectAll();
              onClose();
            }}
          />

          <MenuSeparator />

          <MenuItem
            icon={Search}
            label={t("findInSession", "Find in Session...")}
            shortcut={getEffectiveShortcut("find-session") || "Ctrl+F"}
            onClick={() => {
              commands.findSession();
              onClose();
            }}
          />

          <MenuItem
            icon={Search}
            label="Search in Workspace..."
            shortcut={getEffectiveShortcut("workspace-search") || "Ctrl+Shift+F"}
            onClick={() => {
              commands.workspaceSearch();
              onClose();
            }}
          />

          <MenuSeparator />

          <MenuItem
            icon={Keyboard}
            label={t("keyboardShortcuts", "Keyboard Shortcuts")}
            shortcut={getEffectiveShortcut("shortcuts") || "Ctrl+/"}
            onClick={() => {
              onClose();
              commands.openShortcuts?.();
            }}
          />

          <MenuItem
            icon={Settings}
            label={t("preferencesSettings", "Preferences & Settings...")}
            shortcut={getEffectiveShortcut("settings") || "Ctrl+,"}
            onClick={() => {
              onClose();
              commands.openSettings();
            }}
          />
        </div>
      )}
    </div>
  );
});
