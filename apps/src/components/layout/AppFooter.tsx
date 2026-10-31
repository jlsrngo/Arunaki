import { memo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  MessageSquare,
  Kanban,
  BookOpen,
  History,
  Settings,
  Folder,
  Wifi,
  WifiOff,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useI18n } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";

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
  const { isNeobrutalism } = useTheme();

  const navItems = [
    { label: t("navWorkstation", "Workstation"), path: "/", icon: MessageSquare, neoColor: "bg-[#CCFF00]", neoInactive: "bg-[#F0FDF4]", neoHover: "hover:bg-[#CCFF00]" },
    { label: t("navTasks", "Tasks"), path: "/tasks", icon: Kanban, neoColor: "bg-[#FF9F43]", neoInactive: "bg-[#FFF7ED]", neoHover: "hover:bg-[#FF9F43]" },
    { label: t("navKnowledge", "Knowledge"), path: "/knowledge", icon: BookOpen, neoColor: "bg-[#B388FF]", neoInactive: "bg-[#FAF5FF]", neoHover: "hover:bg-[#B388FF]" },
    { label: t("navHistory", "History"), path: "/history", icon: History, neoColor: "bg-[#A3E635]", neoInactive: "bg-[#F7FEE7]", neoHover: "hover:bg-[#A3E635]" },
    { label: t("navSettings", "Settings"), path: "/settings", icon: Settings, neoColor: "bg-[#FFD166]", neoInactive: "bg-[#FEFCE8]", neoHover: "hover:bg-[#FFD166]" },
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
            "flex items-center gap-2 px-2.5 py-1 rounded-xl truncate max-w-full transition-all cursor-pointer",
            isNeobrutalism
              ? "bg-[#FEF08A] text-[#141413] border-2 border-[#141413] shadow-[2px_2px_0px_#141413] hover:bg-[#FDE047] font-semibold"
              : "bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          )}
        >
          <Folder
            className={cn(
              "w-3.5 h-3.5 shrink-0",
              isNeobrutalism ? "text-[#141413]" : "text-[var(--text-muted)]"
            )}
          />
          <span
            className={cn(
              "text-[11px] truncate",
              isNeobrutalism ? "text-[#141413] font-bold" : "text-[var(--text-primary)]"
            )}
          >
            {activeFolder
              ? activeFolder.split(/[\\/]/).filter(Boolean).pop() || activeFolder
              : t("noFolderOpened", "No folder opened")}
          </span>
        </button>
      </div>

      {/* Center: Main Navigation Floating Capsule (Spacious & Modern) */}
      <div
        className={cn(
          "flex items-center gap-1.5 p-1 rounded-full",
          isNeobrutalism
            ? "bg-[#FFFDFB] border-2 border-[#141413] shadow-[3px_3px_0px_#141413]"
            : "bg-[var(--bg-card)] border border-[var(--border-strong)]"
        )}
      >
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
                "flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs transition-all cursor-pointer",
                isActive
                  ? isNeobrutalism
                    ? `${item.neoColor} text-[#141413] border-2 border-[#141413] shadow-[2px_2px_0px_#141413] font-bold`
                    : "bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-strong)] font-medium"
                  : isNeobrutalism
                  ? `${item.neoInactive} text-[#141413] border border-[#141413]/35 ${item.neoHover} font-semibold`
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] font-medium"
              )}
            >
              <Icon
                className={cn("w-3.5 h-3.5", isNeobrutalism && "neo-icon-drop")}
                strokeWidth={isNeobrutalism ? 2 : 1.75}
              />
              <span className="leading-none">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right: Status Indicator (Network Online/Offline - Strict Monochrome) */}
      <div className="flex items-center gap-2 min-w-0 max-w-[280px] sm:max-w-[340px] justify-end">
        <div
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] transition-all select-none",
            isOnline
              ? isNeobrutalism
                ? "bg-[#CCFF00] text-[#141413] border-2 border-[#141413] shadow-[2px_2px_0px_#141413] font-bold"
                : "bg-[var(--bg-card)] border border-[var(--border-strong)] text-[var(--text-primary)]"
              : isNeobrutalism
              ? "bg-[#FF6B6B] text-[#141413] border-2 border-[#141413] shadow-[2px_2px_0px_#141413] font-bold"
              : "bg-rose-600 border border-rose-600 text-white font-medium"
          )}
          title={
            isOnline
              ? t("networkConnected", "Computer is connected to the network")
              : t("networkOffline", "Computer is offline")
          }
        >
          {isOnline ? (
            isNeobrutalism ? (
              <svg
                className="w-4 h-4 shrink-0 neo-icon-drop"
                viewBox="0 0 24 24"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {/* Outer Arc - Warm Orange */}
                <path d="M2 8.82a15 15 0 0 1 20 0" stroke="#141413" strokeWidth="3.5" />
                <path d="M2 8.82a15 15 0 0 1 20 0" stroke="#FF9F43" strokeWidth="2" />
                {/* Middle Arc - Lavender Purple */}
                <path d="M5 12.859a10 10 0 0 1 14 0" stroke="#141413" strokeWidth="3.5" />
                <path d="M5 12.859a10 10 0 0 1 14 0" stroke="#B388FF" strokeWidth="2" />
                {/* Inner Arc - Acid Lime */}
                <path d="M8.5 16.429a5 5 0 0 1 7 0" stroke="#141413" strokeWidth="3.5" />
                <path d="M8.5 16.429a5 5 0 0 1 7 0" stroke="#CCFF00" strokeWidth="2" />
                {/* Bottom Dot - Acid Lime with Ink Ring */}
                <circle cx="12" cy="20" r="1.6" fill="#CCFF00" stroke="#141413" strokeWidth="1.2" />
              </svg>
            ) : (
              <Wifi className="w-3.5 h-3.5 text-[var(--text-primary)] shrink-0" />
            )
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-white shrink-0" />
          )}
          <span
            className={cn(
              "text-[11px]",
              isNeobrutalism ? "text-[#141413] font-bold" : isOnline ? "text-[var(--text-primary)]" : "text-white"
            )}
          >
            {isOnline ? t("online", "Online") : t("offline", "Offline")}
          </span>
        </div>
      </div>
    </footer>
  );
});
