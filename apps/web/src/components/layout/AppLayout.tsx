import { lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { cn } from "../../lib/utils";
import { UnifiedWorkstationPage } from "../../pages/UnifiedWorkstationPage";
import { AppHeader } from "./AppHeader";
import { AppFooter } from "./AppFooter";
import { useAppNetworkStatus } from "./hooks/useAppNetworkStatus";
import { useActiveFolderSync } from "./hooks/useActiveFolderSync";

const KnowledgePage = lazy(() =>
  import("../../pages/KnowledgePage").then((m) => ({ default: m.KnowledgePage }))
);
const HistoryPage = lazy(() =>
  import("../../pages/HistoryPage").then((m) => ({ default: m.HistoryPage }))
);
const SettingsPage = lazy(() =>
  import("../../pages/SettingsPage").then((m) => ({ default: m.SettingsPage }))
);

export function AppLayout() {
  const location = useLocation();
  const { isOnline } = useAppNetworkStatus();
  const {
    activeFolder,
    handleOpenFolder,
    handleCloseFolder,
  } = useActiveFolderSync();

  const isWorkstationRoute =
    location.pathname === "/" || location.pathname.startsWith("/workspace");

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)] select-none">
      {/* 1. Header Bar */}
      <AppHeader
        activeFolder={activeFolder}
        onOpenFolder={handleOpenFolder}
        onCloseFolder={handleCloseFolder}
      />

      {/* 2. Main Keep-Alive Container */}
      <main className="flex-1 min-h-0 w-full overflow-hidden flex flex-col relative bg-[var(--bg-app)]">
        <div
          className={cn(
            "w-full h-full flex flex-col flex-1",
            !isWorkstationRoute && "hidden"
          )}
        >
          <UnifiedWorkstationPage />
        </div>

        <Suspense fallback={<div className="w-full h-full flex-1 bg-[var(--bg-app)]" />}>
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
        </Suspense>
      </main>

      {/* 3. Footer Bar */}
      <AppFooter activeFolder={activeFolder} isOnline={isOnline} />
    </div>
  );
}
