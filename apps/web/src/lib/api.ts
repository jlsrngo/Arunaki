// Centralized API configuration
// Dev: Vite proxy forwards /api -> engine :4096, so a relative path is correct.
// Production: Electron loads the built bundle over file://, where "/api" would resolve to
// file:///api. There the base has to be absolute, or every call fails before it leaves the page.

function desktopCredentials() {
  return (globalThis as any).arunakiDesktop?.credentials?.();
}

export const API_BASE = (() => {
  if (typeof location !== "undefined" && location.protocol === "file:") {
    return `${desktopCredentials()?.engineUrl ?? "http://127.0.0.1:4096"}/api`;
  }
  return "/api";
})();

function withDirectory(url: string): string {
  const prefix = location?.protocol === "file:" ? `${desktopCredentials()?.engineUrl ?? "http://127.0.0.1:4096"}/api` : API_BASE;
  if (!url.startsWith(`${API_BASE}/`)) return url;
  const rest = url.slice(API_BASE.length);
  const folder = localStorage.getItem("arunaki_active_folder");
  if (!folder || url.includes("directory=")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${prefix}${rest}${separator}directory=${encodeURIComponent(folder)}`;
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  // The engine authenticates with HTTP Basic (engine/src/server/auth.ts), not with x-api-key. That
  // header was being sent here and never read by anything, so every caller was unauthenticated
  // until the launcher started passing a password.
  //
  // Prefer the desktop shell's runtime credentials. Baking them into the bundle would put the
  // password in a file on disk, which is the same place the local trust boundary already is.
  const creds = desktopCredentials();
  const password = creds?.password ?? import.meta.env.VITE_ARUNAKI_SERVER_PASSWORD;
  if (password) {
    const user = creds?.user ?? import.meta.env.VITE_ARUNAKI_SERVER_USER ?? "arunaki";
    headers.set("Authorization", `Basic ${btoa(`${user}:${password}`)}`);
  }
  if (init?.body && typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const resolved = typeof input === "string" ? withDirectory(input) : input;
  return fetch(resolved, { ...init, headers });
}

export function directoryQuery(): string {
  const folder = localStorage.getItem("arunaki_active_folder");
  return folder ? `?directory=${encodeURIComponent(folder)}` : "";
}
