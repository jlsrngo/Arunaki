import { memo } from "react";
import {
  PanelLeft,
  PanelRight,
  WrapText,
  Sun,
  Moon,
  Laptop,
  Maximize,
  RotateCcw,
  Check,
  Languages,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { useTheme } from "../../../lib/theme";
import { useI18n } from "../../../lib/i18n";
import { useWordWrap } from "../../../lib/wordWrap";
import { usePanels } from "../../../lib/panels";
import { BaseMenuProps } from "./types";
import { getEffectiveShortcut } from "./shortcutsConfig";
import { menuAutoFocus, menuKeyDown, menuTriggerProps } from "./menuA11y";

export const ViewMenu = memo(function ViewMenu({
  isOpen,
  onToggle,
  onMouseEnter,
  onClose,
}: BaseMenuProps) {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useI18n();
  const { wordWrap, toggleWordWrap } = useWordWrap();
  const { explorerOpen, chatOpen } = usePanels();

  const handleToggleExplorer = () => {
    window.dispatchEvent(new CustomEvent("arunaki-toggle-explorer"));
    onClose();
  };

  const handleToggleChat = () => {
    window.dispatchEvent(new CustomEvent("arunaki-toggle-chat"));
    onClose();
  };

  const handleToggleWordWrap = () => {
    toggleWordWrap();
    onClose();
  };

  const handleToggleFullscreen = () => {
    onClose();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleResetZoom = () => {
    onClose();
    const desktop = typeof window !== "undefined" ? (window as any).arunakiDesktop : null;
    // Page zoom lives on webContents. The previous document.body.style.zoom = "1" reset a CSS
    // property nothing in this app ever sets, so the item did nothing at all.
    if (desktop?.resetZoom) void desktop.resetZoom();
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
        {t("view", "View")}
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={t("view", "View")}
          onKeyDown={menuKeyDown}
          ref={menuAutoFocus}
          className="absolute top-full left-0 mt-1 min-w-[245px] max-w-[300px] bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl py-1.5 z-50 max-h-[70vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
          <button
            type="button"
            role="menuitem"
            onClick={handleToggleExplorer}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between gap-3 whitespace-nowrap transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <PanelLeft className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("explorerPanel", "Explorer Panel")}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="shrink-0 pl-2 text-[11px] text-[var(--text-muted)] font-mono">
                {getEffectiveShortcut("toggle-explorer") || "Ctrl+B"}
              </span>
              {explorerOpen && <Check className="w-4 h-4 text-[var(--text-primary)]" strokeWidth={2.25} />}
            </div>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={handleToggleChat}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between gap-3 whitespace-nowrap transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <PanelRight className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("chatPanel", "Chat Panel")}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="shrink-0 pl-2 text-[11px] text-[var(--text-muted)] font-mono">
                {getEffectiveShortcut("toggle-chat") || "Ctrl+J"}
              </span>
              {chatOpen && <Check className="w-4 h-4 text-[var(--text-primary)]" strokeWidth={2.25} />}
            </div>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={handleToggleWordWrap}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between gap-3 whitespace-nowrap transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <WrapText className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("wrapText", "Wrap Text")}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="shrink-0 pl-2 text-[11px] text-[var(--text-muted)] font-mono">
                {getEffectiveShortcut("toggle-word-wrap") || "Alt+Z"}
              </span>
              {wordWrap && <Check className="w-4 h-4 text-[var(--text-primary)]" strokeWidth={2.25} />}
            </div>
          </button>

          <div className="h-px my-1.5 bg-[var(--border-color)]" />

          <div className="px-3.5 py-1 text-xs font-medium text-[var(--text-muted)]">
            {t("theme", "Theme")}
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setTheme("light");
              onClose();
            }}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between gap-3 whitespace-nowrap transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <Sun className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("light", "Light")}</span>
            </div>
            {theme === "light" && <Check className="w-4 h-4 text-[var(--text-primary)]" strokeWidth={2.25} />}
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setTheme("dark");
              onClose();
            }}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between gap-3 whitespace-nowrap transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <Moon className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("dark", "Dark")}</span>
            </div>
            {theme === "dark" && <Check className="w-4 h-4 text-[var(--text-primary)]" strokeWidth={2.25} />}
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setTheme("system");
              onClose();
            }}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between gap-3 whitespace-nowrap transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <Laptop className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("systemTheme", "System Theme")}</span>
            </div>
            {theme === "system" && <Check className="w-4 h-4 text-[var(--text-primary)]" strokeWidth={2.25} />}
          </button>

          <div className="h-px my-1.5 bg-[var(--border-color)]" />

          {/* Language Selection */}
          <div className="px-3.5 py-1 text-xs font-medium text-[var(--text-muted)] flex items-center gap-2">
            <Languages className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>{t("language", "Language")}</span>
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setLanguage("en");
              onClose();
            }}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between gap-3 whitespace-nowrap transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-[var(--bg-panel)] text-[var(--text-muted)] border border-[var(--border-color)]">
                EN
              </span>
              <span>{t("english", "English")}</span>
            </div>
            {language === "en" && <Check className="w-4 h-4 text-[var(--text-primary)]" strokeWidth={2.25} />}
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setLanguage("id");
              onClose();
            }}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between gap-3 whitespace-nowrap transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-[var(--bg-panel)] text-[var(--text-muted)] border border-[var(--border-color)]">
                ID
              </span>
              <span>{t("indonesian", "Bahasa Indonesia")}</span>
            </div>
            {language === "id" && <Check className="w-4 h-4 text-[var(--text-primary)]" strokeWidth={2.25} />}
          </button>

          <div className="h-px my-1.5 bg-[var(--border-color)]" />

          <button
            type="button"
            role="menuitem"
            onClick={handleToggleFullscreen}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between gap-3 whitespace-nowrap transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <Maximize className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("toggleFullscreen", "Toggle Fullscreen")}</span>
            </div>
            <span className="shrink-0 pl-2 text-[11px] text-[var(--text-muted)] font-mono">
              {getEffectiveShortcut("fullscreen") || "F11"}
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={handleResetZoom}
            className="w-full px-3.5 py-2 text-[13px] flex items-center justify-between gap-3 whitespace-nowrap transition-colors cursor-pointer hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <RotateCcw className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
              <span>{t("resetZoom", "Reset Zoom")}</span>
            </div>
            <span className="shrink-0 pl-2 text-[11px] text-[var(--text-muted)] font-mono">
              {getEffectiveShortcut("reset-zoom") || "Ctrl+0"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
});
