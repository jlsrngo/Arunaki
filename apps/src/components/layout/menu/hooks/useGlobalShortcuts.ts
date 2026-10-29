import { useEffect } from "react";
import { getEffectiveShortcut, matchesShortcut } from "../shortcutsConfig";
import { AppCommands } from "./useAppCommands";

interface UseGlobalShortcutsOptions {
  commands: AppCommands;
  onCloseMenus: () => void;
  onCloseModals: () => void;
  onOpenShortcutsModal: () => void;
}

export function useGlobalShortcuts({
  commands,
  onCloseMenus,
  onCloseModals,
  onOpenShortcutsModal,
}: UseGlobalShortcutsOptions) {
  useEffect(() => {
    async function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseMenus();
        onCloseModals();
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
        onOpenShortcutsModal();
      } else if (matchesShortcut(e, getEffectiveShortcut("settings"))) {
        e.preventDefault();
        commands.openSettings();
      } else if (
        matchesShortcut(e, getEffectiveShortcut("quick-open-file")) ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p")
      ) {
        e.preventDefault();
        e.stopPropagation();
        commands.quickOpenFile();
      } else if (matchesShortcut(e, getEffectiveShortcut("workspace-search"))) {
        e.preventDefault();
        e.stopPropagation();
        commands.workspaceSearch();
      } else if (matchesShortcut(e, getEffectiveShortcut("open-folder"))) {
        e.preventDefault();
        commands.openFolder?.();
      } else if (matchesShortcut(e, getEffectiveShortcut("save-file"))) {
        e.preventDefault();
        if (target.tagName === "TEXTAREA" || target.isContentEditable) {
          return;
        }
        commands.saveFile();
      } else if (matchesShortcut(e, getEffectiveShortcut("new-session"))) {
        e.preventDefault();
        commands.newSession();
      } else if (matchesShortcut(e, getEffectiveShortcut("find-session"))) {
        e.preventDefault();
        commands.findSession();
      } else if (matchesShortcut(e, getEffectiveShortcut("toggle-explorer"))) {
        e.preventDefault();
        commands.toggleExplorer();
      } else if (matchesShortcut(e, getEffectiveShortcut("toggle-chat"))) {
        e.preventDefault();
        commands.toggleChat();
      } else if (matchesShortcut(e, getEffectiveShortcut("toggle-word-wrap"))) {
        e.preventDefault();
        commands.toggleWordWrap();
      } else if (matchesShortcut(e, getEffectiveShortcut("undo"))) {
        e.preventDefault();
        commands.undo();
      } else if (matchesShortcut(e, getEffectiveShortcut("redo"))) {
        e.preventDefault();
        commands.redo();
      } else if (matchesShortcut(e, getEffectiveShortcut("cut"))) {
        e.preventDefault();
        commands.cut();
      } else if (matchesShortcut(e, getEffectiveShortcut("copy"))) {
        e.preventDefault();
        commands.copy();
      } else if (matchesShortcut(e, getEffectiveShortcut("paste"))) {
        e.preventDefault();
        await commands.paste();
      } else if (matchesShortcut(e, getEffectiveShortcut("select-all"))) {
        e.preventDefault();
        commands.selectAll();
      } else if (matchesShortcut(e, getEffectiveShortcut("fullscreen"))) {
        e.preventDefault();
        commands.toggleFullscreen();
      } else if (matchesShortcut(e, getEffectiveShortcut("reset-zoom"))) {
        e.preventDefault();
        commands.resetZoom();
      }
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [commands, onCloseMenus, onCloseModals, onOpenShortcutsModal]);
}
