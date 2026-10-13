import { memo } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageSquarePlus,
  FolderOpen,
  Save,
  Archive,
  FolderX,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { toast } from "sonner";
import { useI18n } from "../../../lib/i18n";
import { BaseMenuProps } from "./types";
import { getEffectiveShortcut } from "./shortcutsConfig";
import { menuAutoFocus, menuKeyDown, menuTriggerProps } from "./menuA11y";

interface FileMenuProps extends BaseMenuProps {
  activeFolder: string;
  onOpenFolder: () => void;
  onCloseFolder: () => void;
}

export const FileMenu = memo(function FileMenu({
  isOpen,
  onToggle,
  onMouseEnter,
  onClose,
  activeFolder,
  onOpenFolder,
  onCloseFolder,
}: FileMenuProps) {
  const navigate = useNavigate();
  const { t } = useI18n();

  const handleNewChat = () => {
    window.dispatchEvent(new CustomEvent("arunaki-new-chat"));
    onClose();
  };

  const handleSave = () => {
    window.dispatchEvent(new CustomEvent("arunaki-save-file"));
    onClose();
  };

  const handleBackup = async () => {
    onClose();
    const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
    if (desktop?.backupFolder) {
      try {
        const res = await desktop.backupFolder();
        if (res?.success) {
          toast.success(`Backup created: ${res.path}`);
        } else {
          toast.error(res?.error || "Failed to create backup");
        }
      } catch (err: any) {
        toast.error(err?.message || "Backup failed");
      }
    } else {
      toast.info("Workspace backup is active in Desktop mode.");
    }
  };

  const handleExit = () => {
    onClose();
    const desktop = typeof window !== "undefined" ? (window as any).arunakiDesktop : undefined;
    if (desktop?.quit) {
      desktop.quit().catch(() => window.close());
      return;
    }
    if (typeof window !== "undefined" && window.close) {
      window.close();
    }
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
        {t("file", "File")}
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={t("file", "File")}
          onKeyDown={menuKeyDown}
          ref={menuAutoFocus}
          className="absolute top-full left-0 mt-1 min-w-[245px] max-w-[300px] bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl py-1.5 z-50 max-h-[70vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-100"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleNewChat}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between gap-3 whitespace-nowrap transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <MessageSquarePlus className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("newSession", "New Session")}</span>
            </div>
            <span className="shrink-0 pl-2 text-[11px] text-[var(--text-muted)] font-mono">
              {getEffectiveShortcut("new-session") || "Ctrl+N"}
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              onOpenFolder();
            }}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between gap-3 whitespace-nowrap transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <FolderOpen className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("openFolder", "Open Folder...")}</span>
            </div>
            <span className="shrink-0 pl-2 text-[11px] text-[var(--text-muted)] font-mono">
              {getEffectiveShortcut("open-folder") || "Ctrl+O"}
            </span>
          </button>

          <div className="h-px my-1.5 bg-[var(--border-color)]" />

          <button
            type="button"
            role="menuitem"
            onClick={handleSave}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between gap-3 whitespace-nowrap transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <Save className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("saveDocument", "Save Document")}</span>
            </div>
            <span className="shrink-0 pl-2 text-[11px] text-[var(--text-muted)] font-mono">
              {getEffectiveShortcut("save-file") || "Ctrl+S"}
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={handleBackup}
            disabled={!activeFolder}
            className={cn(
              "w-full px-3.5 py-2 text-[13px] flex items-center justify-between transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]",
              !activeFolder && "opacity-40 cursor-not-allowed pointer-events-none"
            )}
          >
            <div className="flex items-center gap-2.5">
              <Archive className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("backupWorkspace", "Backup Workspace")}</span>
            </div>
          </button>

          <div className="h-px my-1.5 bg-[var(--border-color)]" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              onCloseFolder();
            }}
            disabled={!activeFolder}
            className={cn(
              "w-full px-3.5 py-2 text-[13px] flex items-center justify-between transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-red-400 hover:text-red-300",
              !activeFolder && "opacity-40 cursor-not-allowed pointer-events-none"
            )}
          >
            <div className="flex items-center gap-2.5">
              <FolderX className="w-4 h-4" strokeWidth={1.75} />
              <span>{t("closeFolder", "Close Folder")}</span>
            </div>
          </button>

          <div className="h-px my-1.5 bg-[var(--border-color)]" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              navigate("/settings");
            }}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between gap-3 whitespace-nowrap transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <Settings className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("preferencesSettings", "Preferences / Settings")}</span>
            </div>
            <span className="shrink-0 pl-2 text-[11px] text-[var(--text-muted)] font-mono">
              {getEffectiveShortcut("settings") || "Ctrl+,"}
            </span>
          </button>

          <div className="h-px my-1.5 bg-[var(--border-color)]" />

          <button
            type="button"
            role="menuitem"
            onClick={handleExit}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between gap-3 whitespace-nowrap transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <LogOut className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("exitWindow", "Exit Window")}</span>
            </div>
            <span className="shrink-0 pl-2 text-[11px] text-[var(--text-muted)] font-mono">Alt+F4</span>
          </button>
        </div>
      )}
    </div>
  );
});
