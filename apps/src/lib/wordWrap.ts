import { useState, useEffect, useCallback } from "react";

const WORD_WRAP_STORAGE_KEY = "arunaki_word_wrap";
const WORD_WRAP_EVENT = "arunaki-word-wrap-change";

export function getStoredWordWrap(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = localStorage.getItem(WORD_WRAP_STORAGE_KEY);
    if (stored === null) {
      // Default to true so documents wrap out of the box
      return true;
    }
    return stored === "true";
  } catch {
    return true;
  }
}

export function setStoredWordWrap(enabled: boolean): void {
  try {
    localStorage.setItem(WORD_WRAP_STORAGE_KEY, String(enabled));
    window.dispatchEvent(new CustomEvent(WORD_WRAP_EVENT, { detail: enabled }));
  } catch (err) {
    console.error("Failed to save word wrap setting:", err);
  }
}

export function toggleStoredWordWrap(): boolean {
  const next = !getStoredWordWrap();
  setStoredWordWrap(next);
  return next;
}

export function useWordWrap() {
  const [wordWrap, setWordWrapState] = useState<boolean>(() => getStoredWordWrap());

  useEffect(() => {
    // Initial sync
    setWordWrapState(getStoredWordWrap());

    const handleEvent = (e: Event) => {
      const customEvent = e as CustomEvent<boolean>;
      if (typeof customEvent.detail === "boolean") {
        setWordWrapState(customEvent.detail);
      } else {
        setWordWrapState(getStoredWordWrap());
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === WORD_WRAP_STORAGE_KEY) {
        setWordWrapState(e.newValue !== "false");
      }
    };

    window.addEventListener(WORD_WRAP_EVENT, handleEvent);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(WORD_WRAP_EVENT, handleEvent);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const setWordWrap = useCallback((val: boolean) => {
    setStoredWordWrap(val);
    setWordWrapState(val);
  }, []);

  const toggleWordWrap = useCallback(() => {
    const next = toggleStoredWordWrap();
    setWordWrapState(next);
  }, []);

  return { wordWrap, setWordWrap, toggleWordWrap };
}
