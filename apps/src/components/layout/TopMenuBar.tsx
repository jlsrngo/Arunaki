import { useState, useRef, useEffect, useCallback, memo } from "react";
import {
  FileMenu,
  EditMenu,
  ViewMenu,
  AppsMenu,
  HelpMenu,
  KeyboardShortcutsModal,
  AboutArunakiModal,
  useAppCommands,
  useGlobalShortcuts,
} from "./menu";

interface TopMenuBarProps {
  activeFolder: string;
  onOpenFolder: () => void;
  onCloseFolder: () => void;
}

export const TopMenuBar = memo(function TopMenuBar({
  activeFolder,
  onOpenFolder,
  onCloseFolder,
}: TopMenuBarProps) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const menuBarRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    setActiveMenu(null);
  }, []);

  const handleCloseModals = useCallback(() => {
    setShowShortcutsModal(false);
    setShowAboutModal(false);
  }, []);

  // 1. Centralized Command Bus
  const commands = useAppCommands({
    onOpenFolder,
    onCloseFolder,
    onOpenShortcuts: () => setShowShortcutsModal(true),
    onOpenAbout: () => setShowAboutModal(true),
  });

  // 2. Centralized Global Keyboard Shortcut Listener
  useGlobalShortcuts({
    commands,
    onCloseMenus: handleClose,
    onCloseModals: handleCloseModals,
    onOpenShortcutsModal: () => setShowShortcutsModal(true),
  });

  // 3. Close menus on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuBarRef.current && !menuBarRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    }
    if (activeMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [activeMenu]);

  const toggleMenu = useCallback((menuName: string) => {
    setActiveMenu((prev) => (prev === menuName ? null : menuName));
  }, []);

  const handleMouseEnter = useCallback((menuName: string) => {
    setActiveMenu((prev) => (prev ? menuName : null));
  }, []);

  return (
    <>
      <nav
        ref={menuBarRef}
        className="flex items-center gap-1 relative select-none"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <FileMenu
          isOpen={activeMenu === "file"}
          onToggle={() => toggleMenu("file")}
          onMouseEnter={() => handleMouseEnter("file")}
          onClose={handleClose}
          activeFolder={activeFolder}
          commands={commands}
        />

        <EditMenu
          isOpen={activeMenu === "edit"}
          onToggle={() => toggleMenu("edit")}
          onMouseEnter={() => handleMouseEnter("edit")}
          onClose={handleClose}
          commands={commands}
        />

        <ViewMenu
          isOpen={activeMenu === "view"}
          onToggle={() => toggleMenu("view")}
          onMouseEnter={() => handleMouseEnter("view")}
          onClose={handleClose}
          commands={commands}
        />

        <AppsMenu
          isOpen={activeMenu === "apps"}
          onToggle={() => toggleMenu("apps")}
          onMouseEnter={() => handleMouseEnter("apps")}
          onClose={handleClose}
          commands={commands}
        />

        <HelpMenu
          isOpen={activeMenu === "help"}
          onToggle={() => toggleMenu("help")}
          onMouseEnter={() => handleMouseEnter("help")}
          onClose={handleClose}
          commands={commands}
        />
      </nav>

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />

      {/* About Arunaki Modal */}
      <AboutArunakiModal
        isOpen={showAboutModal}
        onClose={() => setShowAboutModal(false)}
      />
    </>
  );
});
