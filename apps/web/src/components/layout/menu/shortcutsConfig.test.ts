import { describe, it, expect } from "vitest";
import {
  normalizeShortcutString,
  parseEventToShortcut,
  matchesShortcut,
  getEffectiveShortcut,
} from "./shortcutsConfig";

function mockKeyEvent(init: {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
}): KeyboardEvent {
  return {
    key: init.key,
    ctrlKey: !!init.ctrlKey,
    altKey: !!init.altKey,
    shiftKey: !!init.shiftKey,
    metaKey: !!init.metaKey,
  } as unknown as KeyboardEvent;
}

describe("shortcutsConfig", () => {
  describe("normalizeShortcutString", () => {
    it("removes whitespace and converts to lowercase", () => {
      expect(normalizeShortcutString("Ctrl + B")).toBe("ctrl+b");
      expect(normalizeShortcutString("CTRL + SHIFT + P")).toBe("ctrl+shift+p");
      expect(normalizeShortcutString("Alt + Z")).toBe("alt+z");
    });

    it("normalizes 'control' to 'ctrl'", () => {
      expect(normalizeShortcutString("Control + Z")).toBe("ctrl+z");
    });
  });

  describe("parseEventToShortcut", () => {
    it("returns null for standalone modifier keys", () => {
      const e = mockKeyEvent({ key: "Control" });
      expect(parseEventToShortcut(e)).toBeNull();
    });

    it("parses Ctrl+key correctly", () => {
      const e = mockKeyEvent({ key: "b", ctrlKey: true });
      expect(parseEventToShortcut(e)).toBe("Ctrl + B");
    });

    it("parses Ctrl+Shift+key correctly", () => {
      const e = mockKeyEvent({ key: "p", ctrlKey: true, shiftKey: true });
      expect(parseEventToShortcut(e)).toBe("Ctrl + Shift + P");
    });

    it("parses Alt+Z correctly", () => {
      const e = mockKeyEvent({ key: "z", altKey: true });
      expect(parseEventToShortcut(e)).toBe("Alt + Z");
    });

    it("formats Space key nicely", () => {
      const e = mockKeyEvent({ key: " ", ctrlKey: true });
      expect(parseEventToShortcut(e)).toBe("Ctrl + Space");
    });
  });

  describe("matchesShortcut", () => {
    it("matches normalized keyboard event with target shortcut string", () => {
      const e = mockKeyEvent({ key: "z", ctrlKey: true });
      expect(matchesShortcut(e, "Ctrl + Z")).toBe(true);
      expect(matchesShortcut(e, "ctrl+z")).toBe(true);
      expect(matchesShortcut(e, "Ctrl + Y")).toBe(false);
    });

    it("returns false if shortcut string is empty", () => {
      const e = mockKeyEvent({ key: "z", ctrlKey: true });
      expect(matchesShortcut(e, "")).toBe(false);
    });
  });

  describe("getEffectiveShortcut", () => {
    it("returns default key for known shortcut id", () => {
      expect(getEffectiveShortcut("undo")).toBe("Ctrl + Z");
      expect(getEffectiveShortcut("redo")).toBe("Ctrl + Y");
      expect(getEffectiveShortcut("toggle-explorer")).toBe("Ctrl + B");
      expect(getEffectiveShortcut("toggle-chat")).toBe("Ctrl + J");
    });

    it("returns empty string for unknown shortcut id", () => {
      expect(getEffectiveShortcut("non-existent-action")).toBe("");
    });
  });
});
