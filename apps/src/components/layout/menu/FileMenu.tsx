import { memo } from "react";
import {
  MessageSquarePlus,
  FolderOpen,
  Save,
  Archive,
  FolderX,
  Settings,
  LogOut,
  FileSearch,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { useI18n } from "../../../lib/i18n";
import { BaseMenuProps } from "./types";
import { getEffectiveShortcut } from "./shortcutsConfig";
import { menuAutoFocus, menuKeyDown, menuTriggerProps } from "./menuA11y";
import { MenuItem } from "./items/MenuItem";
import { MenuSeparator } from "./items/MenuSeparator";
import { AppCommands } from "./hooks/useAppCommands";

interface FileMenuProps extends BaseMenuProps {
  activeFolder: string;
  commands: AppCommands;
}

export const FileMenu = memo(function FileMenu({
  isOpen,
  onToggle,
  onMouseEnter,
  onClose,
  activeFolder,
  commands,
}: FileMenuProps) {
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
        {t("file", "File")}
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={t("file", "File")}
          onKeyDown={menuKeyDown}
          ref={menuAutoFocus}
          className="absolute top-full left-0 mt-1 min-w-[245px] max-w-[300px] bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl py-1.5 z-50 max-h-[70vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-100"
        >
          <MenuItem
            icon={MessageSquarePlus}
            iconColor="bg-[#CCFF00] text-[#141413] border border-[#141413]"
            label={t("newSession", "New Session")}
            shortcut={getEffectiveShortcut("new-session") || "Ctrl+N"}
            onClick={() => {
              commands.newSession();
              onClose();
            }}
          />

          <MenuItem
            icon={FolderOpen}
            iconColor="bg-[#FF9F43] text-[#141413] border border-[#141413]"
            label={t("openFolder", "Open Folder...")}
            shortcut={getEffectiveShortcut("open-folder") || "Ctrl+O"}
            onClick={() => {
              onClose();
              commands.openFolder?.();
            }}
          />

          <MenuItem
            icon={FileSearch}
            iconColor="bg-[#B388FF] text-[#141413] border border-[#141413]"
            label="Quick Open File..."
            shortcut={getEffectiveShortcut("quick-open-file") || "Ctrl+P"}
            onClick={() => {
              onClose();
              commands.quickOpenFile();
            }}
          />

          <MenuItem
            icon={Save}
            iconColor="bg-[#CCFF00] text-[#141413] border border-[#141413]"
            label={t("saveDocument", "Save Document")}
            shortcut={getEffectiveShortcut("save-file") || "Ctrl+S"}
            onClick={() => {
              commands.saveFile();
              onClose();
            }}
          />

          <MenuSeparator />

          <MenuItem
            icon={Archive}
            iconColor="bg-[#FF9F43] text-[#141413] border border-[#141413]"
            label={t("backupWorkspace", "Backup Workspace (ZIP)")}
            onClick={() => {
              onClose();
              void commands.backupWorkspace();
            }}
          />

          <MenuItem
            icon={FolderX}
            iconColor="bg-[#B388FF] text-[#141413] border border-[#141413]"
            label={t("closeFolder", "Close Folder")}
            disabled={!activeFolder}
            onClick={() => {
              onClose();
              commands.closeFolder?.();
            }}
          />

          <MenuSeparator />

          <MenuItem
            icon={Settings}
            iconColor="bg-[#B388FF] text-[#141413] border border-[#141413]"
            label={t("preferencesSettings", "Preferences & Settings...")}
            shortcut={getEffectiveShortcut("settings") || "Ctrl+,"}
            onClick={() => {
              onClose();
              commands.openSettings();
            }}
          />

          <MenuItem
            icon={LogOut}
            iconColor="bg-[#FF5964] text-white border border-[#141413]"
            label={t("exitWindow", "Exit Arunaki")}
            className="text-rose-500 hover:text-white hover:bg-rose-600"
            onClick={() => {
              onClose();
              commands.exitApp();
            }}
          />
        </div>
      )}
    </div>
  );
});
