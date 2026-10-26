import { memo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  MessageSquare,
  BookOpen,
  History,
  Settings,
  Folder,
  Wifi,
  WifiOff,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";

interface AppFooterProps {
  activeFolder: string;
  isOnline: boolean;
  onOpenFolder?: () => void;
}

export const AppFooter = memo(function AppFooter({
  activeFolder,
  isOnline,
  onOpenFolder,
}: AppFooterProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  const navItems = [
    { label: t("navWorkstation", "Workstation"), path: "/", icon: MessageSquare },
    { label: t("navKnowledge", "Knowledge"), path: "/knowledge", icon: BookOpen },
    { label: t("navHistory", "History"), path: "/history", icon: History },
    { label: t("navSettings", "Settings"), path: "/settings", icon: Settings },
  ];

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

  return (
    <footer className="h-12 bg-[var(--bg-header)] px-4 flex items-center justify-between shrink-0 border-t border-[var(--border-color)] transition-colors duration-150 text-xs">
      {/* Left: Active Folder Display (Click to open/switch folder) */}
      <div className="flex items-center gap-2 min-w-0 max-w-[280px] sm:max-w-[380px]">
        <button
          type="button"
          onClick={onOpenFolder}
          title={
            activeFolder
              ? `Active Folder: ${activeFolder} (Click to switch)`
              : `${t("noFolderOpened", "No folder opened")} (${t("openFolder", "Open Folder...")})`
          }
          className={cn(
            "flex items-center gap-2 px-2.5 py-1 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] truncate max-w-full transition-colors cursor-pointer hover:border-[var(--border-strong)] hover:text-white"
          )}
        >
          <Folder className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
          <span className="text-[11px] truncate text-[var(--text-primary)]">
            {activeFolder
              ? activeFolder.split(/[\\/]/).filter(Boolean).pop() || activeFolder
              : t("noFolderOpened", "No folder opened")}
          </span>
        </button>
      </div>

      {/* Center: Main Navigation Floating Capsule (Spacious & Modern) */}
      <div className="flex items-center gap-1.5 p-1 rounded-full bg-[var(--bg-card)] border border-[var(--border-strong)] shadow-sm">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.path === "/"
              ? location.pathname === "/" || location.pathname.startsWith("/workspace")
              : location.pathname === item.path;
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => {
                if (item.path === "/") {
                  handleNavigateWorkstation();
                } else {
                  navigate(item.path);
                }
              }}
              title={item.label}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer",
                isActive
                  ? "bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-strong)] shadow-xs"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              )}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span className="leading-none">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right: Status Indicator (Network Online/Offline - Strict Monochrome) */}
      <div className="flex items-center gap-2 min-w-0 max-w-[280px] sm:max-w-[340px] justify-end">
        <div
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] transition-colors select-none shadow-xs",
            isOnline
              ? "bg-[var(--bg-card)] border-[var(--border-strong)] text-white"
              : "bg-rose-500/10 border-rose-500/30 text-rose-400 font-medium"
          )}
          title={
            isOnline
              ? t("networkConnected", "Computer is connected to the network")
              : t("networkOffline", "Computer is offline")
          }
        >
          {isOnline ? (
            <Wifi className="w-3.5 h-3.5 text-white shrink-0" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          )}
          <span
            className={cn(
              "text-[11px] font-medium",
              isOnline ? "text-white" : "text-rose-400"
            )}
          >
            {isOnline ? t("online", "Online") : t("offline", "Offline")}
          </span>
        </div>
      </div>
    </footer>
  );
});
