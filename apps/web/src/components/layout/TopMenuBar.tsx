import { useState, useRef, useEffect, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileMenu,
  EditMenu,
  ViewMenu,
  HelpMenu,
  KeyboardShortcutsModal,
  AboutArunakiModal,
  getEffectiveShortcut,
  matchesShortcut,
} from "./menu";
import { toggleStoredWordWrap } from "../../lib/wordWrap";

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
  const navigate = useNavigate();

  // Close menus on click outside
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

  // Global dynamic shortcut execution
  useEffect(() => {
    async function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setActiveMenu(null);
        setShowShortcutsModal(false);
        setShowAboutModal(false);
        return;
      }

      // If user is currently typing in an input/textarea, do not intercept regular keys
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // When typing, only allow specific shortcuts like Escape or modal openers
      if (isTyping && !e.ctrlKey && !e.metaKey) {
        return;
      }

      if (matchesShortcut(e, getEffectiveShortcut("shortcuts"))) {
        e.preventDefault();
        setShowShortcutsModal(true);
      } else if (matchesShortcut(e, getEffectiveShortcut("settings"))) {
        e.preventDefault();
        navigate("/settings");
      } else if (matchesShortcut(e, getEffectiveShortcut("open-folder"))) {
        e.preventDefault();
        onOpenFolder();
      } else if (matchesShortcut(e, getEffectiveShortcut("save-file"))) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("arunaki-save-file"));
      } else if (matchesShortcut(e, getEffectiveShortcut("new-session"))) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("arunaki-new-chat"));
      } else if (matchesShortcut(e, getEffectiveShortcut("find-session"))) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("arunaki-search-session"));
      } else if (matchesShortcut(e, getEffectiveShortcut("toggle-explorer"))) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("arunaki-toggle-explorer"));
      } else if (matchesShortcut(e, getEffectiveShortcut("toggle-chat"))) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("arunaki-toggle-chat"));
      } else if (matchesShortcut(e, getEffectiveShortcut("toggle-word-wrap"))) {
        e.preventDefault();
        toggleStoredWordWrap();
      } else if (matchesShortcut(e, getEffectiveShortcut("undo"))) {
        e.preventDefault();
        document.execCommand("undo");
      } else if (matchesShortcut(e, getEffectiveShortcut("redo"))) {
        e.preventDefault();
        document.execCommand("redo");
      } else if (matchesShortcut(e, getEffectiveShortcut("cut"))) {
        e.preventDefault();
        document.execCommand("cut");
      } else if (matchesShortcut(e, getEffectiveShortcut("copy"))) {
        e.preventDefault();
        document.execCommand("copy");
      } else if (matchesShortcut(e, getEffectiveShortcut("paste"))) {
        e.preventDefault();
        // Without this, a denied clipboard permission rejects inside an async listener and
        // surfaces as an unhandled rejection rather than a failed paste.
        try {
          const text = await navigator.clipboard?.readText?.();
          if (text !== undefined) document.execCommand("insertText", false, text);
        } catch {
          document.execCommand("paste");
        }
      } else if (matchesShortcut(e, getEffectiveShortcut("select-all"))) {
        e.preventDefault();
        document.execCommand("selectAll");
      } else if (matchesShortcut(e, getEffectiveShortcut("fullscreen"))) {
        e.preventDefault();
        // requestFullscreen rejects when the gesture is not trusted or the window is not
        // allowed; ViewMenu already swallowed that, this copy did not.
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        else void document.documentElement.requestFullscreen().catch(() => {});
      } else if (matchesShortcut(e, getEffectiveShortcut("reset-zoom"))) {
        e.preventDefault();
        const desktop = (window as any).arunakiDesktop;
        // Reset the real page zoom. This used to set document.body.style.zoom = "1", which
        // reset a property nothing sets - while the preventDefault above blocked Chromium's
        // own Ctrl+0, so the shortcut actively stopped working.
        if (desktop?.resetZoom) void desktop.resetZoom();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenFolder, navigate]);

  const toggleMenu = useCallback((menuName: string) => {
    setActiveMenu((prev) => (prev === menuName ? null : menuName));
  }, []);

  const handleMouseEnter = useCallback((menuName: string) => {
    setActiveMenu((prev) => (prev ? menuName : null));
  }, []);

  const handleClose = useCallback(() => {
    setActiveMenu(null);
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
          onOpenFolder={onOpenFolder}
          onCloseFolder={onCloseFolder}
        />

        <EditMenu
          isOpen={activeMenu === "edit"}
          onToggle={() => toggleMenu("edit")}
          onMouseEnter={() => handleMouseEnter("edit")}
          onClose={handleClose}
          onOpenShortcuts={() => setShowShortcutsModal(true)}
        />

        <ViewMenu
          isOpen={activeMenu === "view"}
          onToggle={() => toggleMenu("view")}
          onMouseEnter={() => handleMouseEnter("view")}
          onClose={handleClose}
        />

        <HelpMenu
          isOpen={activeMenu === "help"}
          onToggle={() => toggleMenu("help")}
          onMouseEnter={() => handleMouseEnter("help")}
          onClose={handleClose}
          onOpenShortcuts={() => setShowShortcutsModal(true)}
          onOpenAbout={() => setShowAboutModal(true)}
        />
      </nav>

      {/* Keyboard Shortcuts Modal (Interactive Rebinding & Modification) */}
      <KeyboardShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />

      {/* About Modal */}
      <AboutArunakiModal
        isOpen={showAboutModal}
        onClose={() => setShowAboutModal(false)}
      />
    </>
  );
});
