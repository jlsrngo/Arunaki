// Centralized engine access.
//
// Electron (production): all requests are relayed through IPC. The main process
// handles auth headers and proxies to the engine's localhost port. The renderer
// never opens a network connection to the engine directly.
//
// Dev browser (no Electron): the Vite proxy forwards /api to the engine on :4096,
// so a relative path is correct and requests go over HTTP as before.

const ENGINE_URL = "http://127.0.0.1:4096";

/** The bridge is a separate process on its own port with its own auth; it is not the engine. */
export const BRIDGE_URL = "http://127.0.0.1:20188";

function desktop(): any {
  return typeof globalThis !== "undefined" ? (globalThis as any).arunakiDesktop : undefined;
}

function desktopCredentials() {
  return desktop()?.credentials?.();
}

/** True when the renderer is running inside the Electron desktop shell. */
export function isDesktop(): boolean {
  return !!desktop()?.engineFetch;
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

/** Normalize Windows backslashes to forward slashes so SQLite directory queries always match. */
export function normalizeDirectoryPath(dir?: string | null): string | undefined {
  if (!dir) return undefined;
  const trimmed = dir.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\\/g, "/").replace(/\/+$/, "");
}

/** The active project folder, used to route the request to the right instance. */
export function activeDirectory(): string | undefined {
  if (typeof localStorage === "undefined") return undefined;
  return normalizeDirectoryPath(localStorage.getItem("arunaki_active_folder"));
}

/**
 * The engine authenticates with HTTP Basic (engine/src/server/auth.ts), not with x-api-key - that
 * header was sent for a long time and read by nothing.
 *
 * When running inside Electron, auth is handled by the main process IPC relay
 * and this function returns empty headers. Only used as fallback for dev browser mode.
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
  // In IPC mode, paths are always root-relative — main process prepends the engine URL
  if (isDesktop()) return path;
  return isDesktopBundle() ? `${engineUrl()}${path}` : path;
}

function withDirectory(url: string): string {
  if (!url.startsWith(`${API_BASE}/`) && !url.startsWith("/api/")) return url;
  const folder = activeDirectory();
  if (!folder || url.includes("directory=")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}directory=${encodeURIComponent(folder)}`;
}

/**
 * Wraps an IPC relay response into a fetch-Response-compatible object.
 * All existing call sites use .ok, .status, .json(), .text() — this provides those.
 */
function wrapIpcResponse(ipcRes: { status: number; statusText: string; headers: Record<string, string>; body: string; ok: boolean }): Response {
  const headers = new Headers(ipcRes.headers);
  return {
    ok: ipcRes.ok,
    status: ipcRes.status,
    statusText: ipcRes.statusText,
    headers,
    redirected: false,
    type: "basic" as ResponseType,
    url: "",
    body: null,
    bodyUsed: false,
    clone: () => wrapIpcResponse(ipcRes),
    json: () => Promise.resolve(JSON.parse(ipcRes.body)),
    text: () => Promise.resolve(ipcRes.body),
    arrayBuffer: () => Promise.resolve(new TextEncoder().encode(ipcRes.body).buffer),
    blob: () => Promise.resolve(new Blob([ipcRes.body])),
    formData: () => Promise.reject(new Error("formData not supported on IPC response")),
    bytes: () => Promise.resolve(new TextEncoder().encode(ipcRes.body)),
  } as Response;
}

/**
 * Resolve the URL for an engine API path. In IPC mode this extracts just the
 * path portion; in browser mode it produces a full URL.
 */
function resolveApiPath(input: RequestInfo | URL): string {
  if (typeof input !== "string") {
    return input instanceof URL ? input.pathname + input.search : String(input);
  }
  // If input is already an absolute URL to the engine, extract the path
  if (input.startsWith("http://127.0.0.1:") || input.startsWith("http://localhost:")) {
    try {
      const u = new URL(input);
      return u.pathname + u.search;
    } catch {
      return input;
    }
  }
  return input;
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const d = desktop();

  // ── IPC path (Electron desktop) ──────────────────────────────────────
  if (d?.engineFetch) {
    if (init?.signal?.aborted) {
      throw new DOMException("The user aborted a request.", "AbortError");
    }

    const rawPath = resolveApiPath(input);
    const resolved = withDirectory(rawPath);
    const serializableInit: Record<string, any> = {};
    if (init?.method) serializableInit.method = init.method;
    if (init?.body && typeof init.body === "string") serializableInit.body = init.body;
    // Merge headers (excluding auth — main process adds that)
    const h: Record<string, string> = {};
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => { h[k] = v; });
      } else if (Array.isArray(init.headers)) {
        for (const [k, v] of init.headers) h[k] = v;
      } else {
        Object.assign(h, init.headers);
      }
    }
    if (init?.body && typeof init.body === "string" && !h["Content-Type"] && !h["content-type"]) {
      h["Content-Type"] = "application/json";
    }
    // Add directory header
    const folder = activeDirectory();
    if (folder && !h["x-arunaki-directory"]) {
      h["x-arunaki-directory"] = folder;
    }
    if (Object.keys(h).length > 0) serializableInit.headers = h;

    let abortPromise: Promise<never> | undefined;
    if (init?.signal) {
      abortPromise = new Promise<never>((_, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("The user aborted a request.", "AbortError"));
        }, { once: true });
      });
    }

    const ipcFetchPromise = d.engineFetch(resolved, Object.keys(serializableInit).length ? serializableInit : undefined);
    const ipcRes = abortPromise ? await Promise.race([ipcFetchPromise, abortPromise]) : await ipcFetchPromise;
    return wrapIpcResponse(ipcRes);
  }

  // ── HTTP path (dev browser, no Electron) ─────────────────────────────
  const headers = new Headers(init?.headers);
  for (const [k, v] of Object.entries(authHeader())) headers.set(k, v);
  if (init?.body && typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const folder = activeDirectory();
  if (folder && !headers.has("x-arunaki-directory")) {
    headers.set("x-arunaki-directory", folder);
  }
  const url = typeof input === "string" ? enginePath(input) : input;
  const resolved = withDirectory(typeof url === "string" ? url : url.toString());
  return fetch(resolved, { ...init, headers });
}

/**
 * Fetch from the bridge server. In Electron, uses IPC relay.
 * In dev browser, falls back to direct HTTP.
 */
export async function bridgeFetch(input: string, init?: RequestInit): Promise<Response> {
  const d = desktop();
  if (d?.bridgeFetch) {
    if (init?.signal?.aborted) {
      throw new DOMException("The user aborted a request.", "AbortError");
    }

    // Extract path from full URL if needed
    let path = input;
    if (input.startsWith("http://")) {
      try { path = new URL(input).pathname + new URL(input).search; } catch {}
    }
    const serializableInit: Record<string, any> = {};
    if (init?.method) serializableInit.method = init.method;
    if (init?.body && typeof init.body === "string") serializableInit.body = init.body;
    if (init?.headers) {
      const h: Record<string, string> = {};
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => { h[k] = v; });
      } else {
        Object.assign(h, init.headers);
      }
      serializableInit.headers = h;
    }

    let abortPromise: Promise<never> | undefined;
    if (init?.signal) {
      abortPromise = new Promise<never>((_, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("The user aborted a request.", "AbortError"));
        }, { once: true });
      });
    }

    const ipcFetchPromise = d.bridgeFetch(path, Object.keys(serializableInit).length ? serializableInit : undefined);
    const ipcRes = abortPromise ? await Promise.race([ipcFetchPromise, abortPromise]) : await ipcFetchPromise;
    return wrapIpcResponse(ipcRes);
  }
  // Fallback: direct HTTP
  return fetch(input, init);
}

export function directoryQuery(): string {
  const folder = activeDirectory();
  return folder ? `?directory=${encodeURIComponent(folder)}` : "";
}

