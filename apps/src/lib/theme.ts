import { useState, useEffect } from "react";

export type ThemeMode = "dark" | "light" | "neobrutalism" | "system";

const THEME_STORAGE_KEY = "arunaki_theme";

export function getSystemTheme(): "dark" | "light" {
  if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return "dark";
}

export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
  if (stored === "dark" || stored === "light" || stored === "neobrutalism" || stored === "system") {
    return stored;
  }
  return "dark";
}

export function applyTheme(theme: ThemeMode): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const effectiveTheme = theme === "system" ? getSystemTheme() : theme;

  root.setAttribute("data-theme", effectiveTheme);
  root.classList.remove("light", "dark", "neobrutalism");
  if (effectiveTheme === "neobrutalism") {
    root.classList.add("light", "neobrutalism");
  } else if (effectiveTheme === "light") {
    root.classList.add("light");
  } else {
    root.classList.add("dark");
  }

  localStorage.setItem(THEME_STORAGE_KEY, theme);
  window.dispatchEvent(new CustomEvent("arunaki-theme-change", { detail: theme }));

  if (typeof (window as any).arunakiDesktop?.setTheme === "function") {
    const nativeTheme = effectiveTheme === "dark" ? "dark" : "light";
    (window as any).arunakiDesktop.setTheme(nativeTheme).catch(() => {});
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(theme);

    const handleThemeEvent = (e: Event) => {
      const customEvent = e as CustomEvent<ThemeMode>;
      if (customEvent.detail && customEvent.detail !== theme) {
        setThemeState(customEvent.detail);
      }
    };

    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const handleSystemChange = () => {
      if (theme === "system") {
        applyTheme("system");
      }
    };

    window.addEventListener("arunaki-theme-change", handleThemeEvent);
    mediaQuery.addEventListener("change", handleSystemChange);

    return () => {
      window.removeEventListener("arunaki-theme-change", handleThemeEvent);
      mediaQuery.removeEventListener("change", handleSystemChange);
    };
  }, [theme]);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    applyTheme(newTheme);
  };

  const effectiveTheme = theme === "system" ? getSystemTheme() : theme;
  return {
    theme,
    setTheme,
    isLight: effectiveTheme === "light" || effectiveTheme === "neobrutalism",
    isNeobrutalism: effectiveTheme === "neobrutalism",
  };
}
