import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  MessageSquare,
  BookOpen,
  History,
  Settings,
  User,
  Sun,
  Moon,
  Folder,
  Wifi,
  WifiOff,
} from "lucide-react";
import { ArunakiLogo } from "../common/ArunakiLogo";
import { cn } from "../../lib/utils";
import { useTheme } from "../../lib/theme";
import { useI18n } from "../../lib/i18n";
import { TopMenuBar } from "./TopMenuBar";
import { toast } from "sonner";
import { UnifiedWorkstationPage } from "../../pages/UnifiedWorkstationPage";
import { KnowledgePage } from "../../pages/KnowledgePage";
import { HistoryPage } from "../../pages/HistoryPage";
import { SettingsPage } from "../../pages/SettingsPage";
import { triggerKnowledgeSync, triggerKnowledgeSyncIfStale } from "../../lib/knowledgeSync";

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setTheme, isLight } = useTheme();
  const { t } = useI18n();

  const [activeFolder, setActiveFolder] = useState<string>(() => {
    return localStorage.getItem("arunaki_active_folder") || "";
  });

  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== "undefined" ? navigator.onLine : true;
  });

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success("Network connected", {
        description: "Internet connection restored.",
        duration: 3000,
      });
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.error("Network offline", {
        description: "Computer is disconnected from the network.",
        duration: 5000,
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    function loadActiveFolder() {
      setActiveFolder(localStorage.getItem("arunaki_active_folder") || "");
    }

    window.addEventListener("arunaki-folder-change", loadActiveFolder);
    window.addEventListener("storage", loadActiveFolder);
    return () => {
      window.removeEventListener("arunaki-folder-change", loadActiveFolder);
      window.removeEventListener("storage", loadActiveFolder);
    };
  }, []);

  // Trigger 2: Workspace Switch — auto-sync knowledge sources on folder change
  useEffect(() => {
    if (activeFolder) {
      triggerKnowledgeSync(activeFolder);
    }
  }, [activeFolder]);

  // Trigger 3: Periodic Background Interval & Window Focus
  useEffect(() => {
    if (!activeFolder) return;

    // Periodic sync every 30 minutes
    const interval = setInterval(() => {
      triggerKnowledgeSync(activeFolder);
    }, 30 * 60 * 1000);

    // Auto-sync on window focus if last sync was > 15 minutes ago
    const handleFocus = () => {
      triggerKnowledgeSyncIfStale(15 * 60 * 1000, activeFolder);
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [activeFolder]);

  const handleOpenFolder = async () => {
    const desktop = typeof window !== "undefined" && (window as any).arunakiDesktop;
    if (desktop?.pickFolder) {
      try {
        const result = await desktop.pickFolder();
        if (result?.path) {
          localStorage.setItem("arunaki_active_folder", result.path);
          setActiveFolder(result.path);

          // Strictly isolate active chat per folder
          const folderChatId = localStorage.getItem(`arunaki_active_chat_id_${result.path}`) || "";
          if (folderChatId) {
            localStorage.setItem("arunaki_active_chat_id", folderChatId);
          } else {
            localStorage.removeItem("arunaki_active_chat_id");
          }

          window.dispatchEvent(new Event("arunaki-folder-change"));
          window.dispatchEvent(new Event("arunaki-session-change"));

          const params = new URLSearchParams();
          params.set("folder", result.path);
          if (folderChatId) params.set("chatId", folderChatId);
          navigate(`/?${params.toString()}`);
        }
      } catch (err) {
        console.error("Open folder error:", err);
      }
    }
  };

  const handleCloseFolder = () => {
    localStorage.removeItem("arunaki_active_folder");
    localStorage.removeItem("arunaki_active_chat_id");
    setActiveFolder("");
    window.dispatchEvent(new Event("arunaki-folder-change"));
    window.dispatchEvent(new Event("arunaki-session-change"));
    navigate("/");
    toast.info("Folder closed. Agent is now in sandbox mode.");
  };

  const toggleQuickTheme = () => {
    if (isLight) {
      setTheme("dark");
    } else {
      setTheme("light");
    }
  };

  const navItems = [
    { label: t("navWorkstation", "Workstation"), path: "/", icon: MessageSquare },
    { label: t("navKnowledge", "Knowledge"), path: "/knowledge", icon: BookOpen },
    { label: t("navHistory", "History"), path: "/history", icon: History },
    { label: t("navSettings", "Settings"), path: "/settings", icon: Settings },
  ];

  const handleNavigateWorkstation = useCallback(() => {
    const savedFolder = localStorage.getItem("arunaki_active_folder") || "";
    const savedChatId = savedFolder
      ? (localStorage.getItem(`arunaki_active_chat_id_${savedFolder}`) || "")
      : (localStorage.getItem("arunaki_active_chat_id") || "");
    const params = new URLSearchParams();
    if (savedFolder) params.set("folder", savedFolder);
    if (savedChatId) params.set("chatId", savedChatId);
    const query = params.toString();
    navigate(query ? `/?${query}` : "/");
  }, [navigate]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)] select-none">
      {/* 1. HEADER ATAS (Native Minimalist Mac/Win Topbar) */}
      <header
        className="h-10 bg-[var(--bg-header)] border-b border-[var(--border-color)] flex items-center justify-between px-3 shrink-0 transition-colors duration-150 select-none z-30"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        {/* Left side: Brand Logo + Classic File/View/Help Menus */}
        <div className="flex items-center gap-4">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={handleNavigateWorkstation}
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <ArunakiLogo size={20} />
            <span className="font-semibold text-xs tracking-tight text-[var(--text-primary)]">Arunaki</span>
          </div>

          {/* Clean Dropdown Menus */}
          <div className="flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            <TopMenuBar
              activeFolder={activeFolder}
              onOpenFolder={handleOpenFolder}
              onCloseFolder={handleCloseFolder}
            />
          </div>
        </div>

        {/* Right side: Quick Theme Switch & User Avatar */}
        <div
          className="flex items-center gap-2"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          {/* Quick 1-Click Theme Switcher Button */}
          <button
            onClick={toggleQuickTheme}
            className="w-7 h-7 rounded-full bg-[var(--bg-hover)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-color)] transition-colors cursor-pointer"
            title={isLight ? t("switchToDark", "Switch to Dark Mode") : t("switchToLight", "Switch to Light Mode")}
          >
            {isLight ? (
              <Moon className="w-3.5 h-3.5 text-[var(--text-primary)]" strokeWidth={2.25} />
            ) : (
              <Sun className="w-3.5 h-3.5 text-[var(--text-primary)]" strokeWidth={2.25} />
            )}
          </button>

          <button
            onClick={() => navigate("/settings")}
            className="w-7 h-7 rounded-full bg-[var(--bg-hover)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-color)] transition-colors cursor-pointer"
            title={t("userProfileSettings", "User Profile & Settings")}
          >
            <User className="w-3.5 h-3.5 text-[var(--text-primary)]" strokeWidth={2.25} />
          </button>
        </div>
      </header>

      {/* 2. MAIN CONTENT CONTAINER WITH ZERO-LATENCY KEEP-ALIVE */}
      <main className="flex-1 min-h-0 w-full overflow-hidden flex flex-col relative bg-[var(--bg-app)]">
        {/* Workstation View: Kept alive in memory */}
        <div
          className={cn(
            "w-full h-full flex flex-col flex-1",
            !(location.pathname === "/" || location.pathname.startsWith("/workspace")) && "hidden"
          )}
        >
          <UnifiedWorkstationPage />
        </div>

        {/* Sub-pages: Rendered when active so ReactFlow and layout dimensions measure accurately */}
        {location.pathname === "/knowledge" && (
          <div className="w-full h-full flex flex-col flex-1 animate-in fade-in duration-100">
            <KnowledgePage />
          </div>
        )}
        {location.pathname === "/history" && (
          <div className="w-full h-full flex flex-col flex-1 animate-in fade-in duration-100">
            <HistoryPage />
          </div>
        )}
        {location.pathname === "/settings" && (
          <div className="w-full h-full flex flex-col flex-1 animate-in fade-in duration-100">
            <SettingsPage />
          </div>
        )}
      </main>

      {/* 3. FOOTER BAWAH: Left Path Info, Center Capsule Nav, Right Status */}
      <footer className="h-12 bg-[var(--bg-header)] px-4 flex items-center justify-between shrink-0 border-t border-[var(--border-color)] transition-colors duration-150 text-xs">
        {/* Left: Active Folder Display (Read-Only Info) */}
        <div className="flex items-center gap-2 min-w-0 max-w-[280px] sm:max-w-[380px]">
          <div
            title={activeFolder ? `Active Folder: ${activeFolder}` : t("noFolderOpened", "No folder opened")}
            className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] truncate max-w-full"
          >
            <Folder className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
            <span className="text-[11px] truncate text-[var(--text-primary)]">
              {activeFolder ? activeFolder.split(/[\\/]/).filter(Boolean).pop() || activeFolder : t("noFolderOpened", "No folder opened")}
            </span>
          </div>
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

        {/* Right: Status Indicator (Network Online/Offline) */}
        <div className="flex items-center gap-2 min-w-0 max-w-[280px] sm:max-w-[340px] justify-end">
          <div
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] transition-colors select-none shadow-xs",
              isOnline
                ? "bg-[var(--bg-card)] border-[var(--border-strong)] text-white"
                : "bg-rose-500/10 border-rose-500/30 text-rose-400 font-medium"
            )}
            title={isOnline ? t("networkConnected", "Computer is connected to the network") : t("networkOffline", "Computer is offline")}
          >
            {isOnline ? (
              <Wifi className="w-3.5 h-3.5 text-white shrink-0" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            )}
            <span className={cn("text-[11px] font-medium", isOnline ? "text-white" : "text-rose-400")}>
              {isOnline ? t("online", "Online") : t("offline", "Offline")}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
