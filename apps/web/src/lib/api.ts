// Centralized API configuration
// Vite proxy forwards /api → http://localhost:4096 (OpenCode engine)

export const API_BASE = "/api";

function withDirectory(url: string): string {
  if (!url.startsWith(`${API_BASE}/`)) return url;
  const folder = localStorage.getItem("arunaki_active_folder");
  if (!folder || url.includes("directory=")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}directory=${encodeURIComponent(folder)}`;
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  // The engine authenticates with HTTP Basic (engine/src/server/auth.ts), not with x-api-key. That
  // header was being sent here and never read by anything, so every caller was unauthenticated
  // until the launcher started passing a password.
  const password = import.meta.env.VITE_ARUNAKI_SERVER_PASSWORD;
  if (password) {
    const user = import.meta.env.VITE_ARUNAKI_SERVER_USER || "arunaki";
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
