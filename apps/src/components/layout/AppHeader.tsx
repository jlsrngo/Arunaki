import { memo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { User, Sun, Moon, Box, Minus, Square, X } from "lucide-react";
import { ArunakiLogo } from "../common/ArunakiLogo";
import { useTheme } from "../../lib/theme";
import { useI18n } from "../../lib/i18n";
import { TopMenuBar } from "./TopMenuBar";

interface AppHeaderProps {
  activeFolder: string;
  onOpenFolder: () => void;
  onCloseFolder: () => void;
}

const invokeTauri = async (cmd: string, pluginCmd?: string): Promise<boolean> => {
  const tauri = (window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__;
  if (tauri?.invoke) {
    try {
      await tauri.invoke(cmd);
      return true;
    } catch {
      if (pluginCmd) {
        try {
          await tauri.invoke(pluginCmd);
          return true;
        } catch {}
      }
    }
  }
  return false;
};

export const AppHeader = memo(function AppHeader({
  activeFolder,
  onOpenFolder,
  onCloseFolder,
}: AppHeaderProps) {
  const navigate = useNavigate();
  const { theme, setTheme, isLight, isNeobrutalism } = useTheme();
  const { t } = useI18n();

  const handleNavigateWorkstation = useCallback(() => {
    const savedFolder = localStorage.getItem("arunaki_active_folder") || "";
    const savedChatId = savedFolder
      ? localStorage.getItem(`arunaki_active_chat_id_${savedFolder}`) || ""
      : localStorage.getItem("arunaki_active_chat_id") || "";
    const params = new URLSearchParams();
    if (savedFolder) params.set("folder", savedFolder);
    if (savedChatId) params.set("chatId", savedChatId);
    const query = params.toString();
    navigate(query ? `/?${query}` : "/");
  }, [navigate]);

  const toggleQuickTheme = useCallback(() => {
    if (theme === "dark") {
      setTheme("light");
    } else if (theme === "light") {
      setTheme("neobrutalism");
    } else {
      setTheme("dark");
    }
  }, [theme, setTheme]);

  const handleMinimize = useCallback(async () => {
    if ((window as any).arunakiDesktop?.minimize) {
      (window as any).arunakiDesktop.minimize();
      return;
    }
    await invokeTauri("window_minimize", "plugin:window|minimize");
  }, []);

  const handleMaximize = useCallback(async () => {
    if ((window as any).arunakiDesktop?.maximize) {
      (window as any).arunakiDesktop.maximize();
      return;
    }
    await invokeTauri("window_toggle_maximize", "plugin:window|toggle_maximize");
  }, []);

  const handleClose = useCallback(async () => {
    if ((window as any).arunakiDesktop?.close) {
      (window as any).arunakiDesktop.close();
      return;
    }
    await invokeTauri("window_close", "plugin:window|close");
  }, []);

  const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[style*="no-drag"], [data-tauri-drag-region="false"], button, nav, a, input')) return;
    invokeTauri("plugin:window|start_dragging");
    (window as any).arunakiDesktop?.startDrag?.();
  }, []);

  const handleHeaderDoubleClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[style*="no-drag"], [data-tauri-drag-region="false"], button, nav, a, input')) return;
    handleMaximize();
  }, [handleMaximize]);

  return (
    <header
      data-tauri-drag-region
      onMouseDown={handleHeaderMouseDown}
      onDoubleClick={handleHeaderDoubleClick}
      className="h-10 bg-[var(--bg-header)] border-b border-[var(--border-color)] flex items-center justify-between px-3 shrink-0 transition-colors duration-150 select-none z-30"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Left side: Brand Logo + Classic File/Edit/View/Help Menus */}
      <div className="flex items-center gap-4" data-tauri-drag-region="false">
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={handleNavigateWorkstation}
          data-tauri-drag-region="false"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <ArunakiLogo size={20} />
          <span className="font-semibold text-xs tracking-tight text-[var(--text-primary)]">
            Arunaki
          </span>
        </div>

        {/* Clean Dropdown Menus */}
        <div
          className="flex items-center gap-1"
          data-tauri-drag-region="false"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <TopMenuBar
            activeFolder={activeFolder}
            onOpenFolder={onOpenFolder}
            onCloseFolder={onCloseFolder}
          />
        </div>
      </div>

      {/* Right side: Quick Theme Switch, User Avatar & Frameless Window Controls */}
      <div
        className="flex items-center gap-2"
        data-tauri-drag-region="false"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={toggleQuickTheme}
          data-tauri-drag-region="false"
          className={
            isNeobrutalism
              ? "neo-icon-badge w-7 h-7 rounded-full bg-[#B388FF] flex items-center justify-center text-[#141413] border border-[#141413] hover:bg-[#CCFF00] transition-colors cursor-pointer"
              : "w-7 h-7 rounded-full bg-[var(--bg-hover)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-color)] transition-colors cursor-pointer"
          }
          title={
            isNeobrutalism
              ? t("switchToDark", "Switch to Dark Mode")
              : isLight
              ? t("switchToNeobrutalism", "Switch to Neo-Brutalism")
              : t("switchToLight", "Switch to Light Mode")
          }
        >
          {isNeobrutalism ? (
            <Box className="w-3.5 h-3.5 text-[#141413]" strokeWidth={2.25} />
          ) : isLight ? (
            <Sun className="w-3.5 h-3.5 text-[var(--text-primary)]" strokeWidth={2.25} />
          ) : (
            <Moon className="w-3.5 h-3.5 text-[var(--text-primary)]" strokeWidth={2.25} />
          )}
        </button>

        <button
          type="button"
          onClick={() => navigate("/settings")}
          data-tauri-drag-region="false"
          className={
            isNeobrutalism
              ? "neo-icon-badge w-7 h-7 rounded-full bg-[#FF9F43] flex items-center justify-center text-[#141413] border border-[#141413] hover:bg-[#CCFF00] transition-colors cursor-pointer"
              : "w-7 h-7 rounded-full bg-[var(--bg-hover)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-color)] transition-colors cursor-pointer"
          }
          title={t("userProfileSettings", "User Profile & Settings")}
        >
          <User className="w-3.5 h-3.5 text-[var(--text-primary)]" strokeWidth={2.25} />
        </button>

        {/* Seamless Window Controls */}
        <div
          data-tauri-drag-region="false"
          className="flex items-center ml-1 border-l border-[var(--border-color)] pl-1.5 gap-0.5"
        >
          <button
            type="button"
            onClick={handleMinimize}
            data-tauri-drag-region="false"
            className="w-7 h-7 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            title="Minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleMaximize}
            data-tauri-drag-region="false"
            className="w-7 h-7 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            title="Maximize / Restore"
          >
            <Square className="w-2.5 h-2.5" />
          </button>
          <button
            type="button"
            onClick={handleClose}
            data-tauri-drag-region="false"
            className="w-7 h-7 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-rose-600 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
});
