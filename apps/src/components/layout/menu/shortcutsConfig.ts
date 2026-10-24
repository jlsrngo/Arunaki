export interface ShortcutDefinition {
  id: string;
  category: "General & Navigation" | "Edit & Text" | "File & Workstation" | "Panels & Views";
  desc: string;
  defaultKey: string;
}

export const DEFAULT_SHORTCUTS: ShortcutDefinition[] = [
  // General & Navigation
  { id: "shortcuts", category: "General & Navigation", desc: "Show Keyboard Shortcuts", defaultKey: "Ctrl + /" },
  { id: "settings", category: "General & Navigation", desc: "Open Preferences & Settings", defaultKey: "Ctrl + ," },
  { id: "fullscreen", category: "General & Navigation", desc: "Toggle Fullscreen Mode", defaultKey: "F11" },
  { id: "reset-zoom", category: "General & Navigation", desc: "Reset Display Zoom", defaultKey: "Ctrl + 0" },
  
  // Edit & Text
  { id: "undo", category: "Edit & Text", desc: "Undo last change", defaultKey: "Ctrl + Z" },
  { id: "redo", category: "Edit & Text", desc: "Redo last change", defaultKey: "Ctrl + Y" },
  { id: "cut", category: "Edit & Text", desc: "Cut selected text", defaultKey: "Ctrl + X" },
  { id: "copy", category: "Edit & Text", desc: "Copy selected text", defaultKey: "Ctrl + C" },
  { id: "paste", category: "Edit & Text", desc: "Paste from clipboard", defaultKey: "Ctrl + V" },
  { id: "select-all", category: "Edit & Text", desc: "Select all text", defaultKey: "Ctrl + A" },

  // File & Workstation
  { id: "open-folder", category: "File & Workstation", desc: "Open Workspace Folder", defaultKey: "Ctrl + O" },
  { id: "save-file", category: "File & Workstation", desc: "Save Active Document", defaultKey: "Ctrl + S" },
  { id: "new-session", category: "File & Workstation", desc: "Start New Chat Session", defaultKey: "Ctrl + N" },
  { id: "find-session", category: "File & Workstation", desc: "Find Session in History", defaultKey: "Ctrl + F" },

  // Panels & Views
  { id: "toggle-explorer", category: "Panels & Views", desc: "Toggle Explorer Panel", defaultKey: "Ctrl + B" },
  { id: "toggle-chat", category: "Panels & Views", desc: "Toggle Chat Panel", defaultKey: "Ctrl + J" },
  { id: "toggle-word-wrap", category: "Panels & Views", desc: "Toggle Word Wrap", defaultKey: "Alt + Z" },
];

const STORAGE_KEY = "arunaki_custom_shortcuts";

export function getCustomShortcuts(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveCustomShortcut(id: string, newKey: string): void {
  try {
    const current = getCustomShortcuts();
    current[id] = newKey;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    window.dispatchEvent(new CustomEvent("arunaki-shortcuts-updated"));
  } catch (err) {
    console.error("Failed to save custom shortcut:", err);
  }
}

export function resetCustomShortcut(id: string): void {
  try {
    const current = getCustomShortcuts();
    delete current[id];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    window.dispatchEvent(new CustomEvent("arunaki-shortcuts-updated"));
  } catch (err) {
    console.error("Failed to reset shortcut:", err);
  }
}

export function resetAllShortcuts(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("arunaki-shortcuts-updated"));
  } catch (err) {
    console.error("Failed to reset all shortcuts:", err);
  }
}

export function getEffectiveShortcut(id: string): string {
  const custom = getCustomShortcuts();
  if (custom[id]) return custom[id];
  const def = DEFAULT_SHORTCUTS.find((s) => s.id === id);
  return def ? def.defaultKey : "";
}

/**
 * Normalizes a shortcut string for standardized comparison (e.g. "Ctrl+B" vs "ctrl + b")
 */
export function normalizeShortcutString(combo: string): string {
  return combo
    .replace(/\s+/g, "")
    .toLowerCase()
    .replace("control", "ctrl");
}

/**
 * Converts a KeyboardEvent into a readable shortcut string (e.g. "Ctrl + Shift + K")
 * Returns null if only modifier keys are pressed.
 */
export function parseEventToShortcut(e: KeyboardEvent): string | null {
  const key = e.key;

  // Ignore standalone modifier presses
  if (["Control", "Shift", "Alt", "Meta"].includes(key)) {
    return null;
  }

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  // Format special keys nicely
  let formattedKey = key;
  if (key === " ") formattedKey = "Space";
  else if (key.length === 1) formattedKey = key.toUpperCase();
  else if (key.startsWith("Arrow")) formattedKey = key.replace("Arrow", "");
  else formattedKey = key;

  parts.push(formattedKey);
  return parts.join(" + ");
}

/**
 * Checks whether a KeyboardEvent matches a given shortcut string (e.g. "Ctrl + B")
 */
export function matchesShortcut(e: KeyboardEvent, shortcutStr: string): boolean {
  if (!shortcutStr) return false;
  const current = parseEventToShortcut(e);
  if (!current) return false;
  return normalizeShortcutString(current) === normalizeShortcutString(shortcutStr);
}
