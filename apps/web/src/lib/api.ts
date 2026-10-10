// Centralized engine access.
//
// Dev: the Vite proxy forwards /api to the engine on :4096, so a relative path is correct.
// Production: Electron loads the built bundle over file://, where "/api" would resolve to
// file:///api. There the base has to be absolute or every call fails before leaving the page.
//
// The base, the credentials and the directory resolution lived in two files. That duplication is
// not cosmetic: engineFetch had its own copy, never gained the credentials, and would have broken
// all 19 of its call sites the moment the engine started requiring a password. One place now.

const ENGINE_URL = "http://127.0.0.1:4096";

/** The bridge is a separate process on its own port with its own auth; it is not the engine. */
export const BRIDGE_URL = "http://127.0.0.1:20188";

function desktopCredentials() {
  return (globalThis as any).arunakiDesktop?.credentials?.();
}

/** True when the UI came off disk rather than off the dev server. */
export function isDesktopBundle() {
  return typeof location !== "undefined" && location.protocol === "file:";
}

export function engineUrl() {
  return desktopCredentials()?.engineUrl ?? ENGINE_URL;
}

// Stays a const so the 62 existing `${API_BASE}` call sites keep working. The preload script runs
// before any page script, so the desktop credentials are already there when this module evaluates.
export const API_BASE = isDesktopBundle() ? `${engineUrl()}/api` : "/api";

/** The active project folder, used to route the request to the right instance. */
export function activeDirectory(): string | undefined {
  if (typeof localStorage === "undefined") return undefined;
  return localStorage.getItem("arunaki_active_folder") || undefined;
}

/**
 * The engine authenticates with HTTP Basic (engine/src/server/auth.ts), not with x-api-key - that
 * header was sent for a long time and read by nothing.
 *
 * Prefer the desktop shell's runtime credentials. Baking them into the bundle would put the password
 * in a file on disk, and the local trust boundary already includes reading local files.
 */
export function authHeader(): Record<string, string> {
  const creds = desktopCredentials();
  const password = creds?.password ?? import.meta.env.VITE_ARUNAKI_SERVER_PASSWORD;
  if (!password) return {};
  const user = creds?.user ?? import.meta.env.VITE_ARUNAKI_SERVER_USER ?? "arunaki";
  return { Authorization: `Basic ${btoa(`${user}:${password}`)}` };
}

/**
 * Path for an engine route that is mounted at the root.
 *
 * Most of the UI talks to `/api/...`, but that prefix is a legacy alias covering only part of the
 * API. The file routes are not in it: `/file`, `/file/content` and `/file/status` answer at the root,
 * and under `/api` they fall through to the UI catch-all and come back 500 with an empty body. That
 * is why the workspace file list silently came back empty - the caller caught the failure and
 * rendered an empty array, which is indistinguishable from an empty folder.
 */
export function enginePath(path: string): string {
  return isDesktopBundle() ? `${engineUrl()}${path}` : path;
}

function withDirectory(url: string): string {
  if (!url.startsWith(`${API_BASE}/`)) return url;
  const folder = activeDirectory();
  if (!folder || url.includes("directory=")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}directory=${encodeURIComponent(folder)}`;
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  for (const [k, v] of Object.entries(authHeader())) headers.set(k, v);
  if (init?.body && typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const resolved = typeof input === "string" ? withDirectory(input) : input;
  return fetch(resolved, { ...init, headers });
}

export function directoryQuery(): string {
  const folder = activeDirectory();
  return folder ? `?directory=${encodeURIComponent(folder)}` : "";
}
