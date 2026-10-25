// Centralized engine access.
//
// Electron (production): all requests are relayed through IPC. The main process
// handles auth headers and proxies to the engine's localhost port.
//
// Tauri v2 (production/desktop): all requests are relayed through Native Tauri IPC
// (tauri_engine_fetch) directly across the native OS bridge without browser network sockets.
//
// Dev browser (no desktop shell): the Vite proxy forwards /api to the engine on :4096,
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

/** True when the UI is running inside Tauri v2 desktop shell or loaded off disk. */
export function isDesktopBundle(): boolean {
  if (typeof location === "undefined") return false;
  return (
    location.protocol === "file:" ||
    location.protocol === "tauri:" ||
    location.hostname === "tauri.localhost" ||
    (typeof window !== "undefined" && (
      "__TAURI_INTERNALS__" in window ||
      "__TAURI__" in window
    ))
  );
}

export function engineUrl(): string {
  return desktopCredentials()?.engineUrl ?? ENGINE_URL;
}

// In Tauri desktop, requests target the local engine directly on :4096.
// In browser dev mode, requests go through Vite proxy (/api -> :4096).
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
 * When running inside Electron or Tauri IPC, auth is handled by the main process IPC relay
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
 */
export function enginePath(path: string): string {
  if (isDesktop()) return path;
  if (isDesktopBundle()) {
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    return `${engineUrl()}${path.startsWith("/") ? "" : "/"}${path}`;
  }
  return path;
}

function withDirectory(url: string): string {
  if (!url.startsWith(`${API_BASE}/`) && !url.startsWith("/api/") && !url.includes(":4096/api/")) return url;
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

  // ── Native Tauri v2 IPC path (Zero Network / Direct Memory IPC) ──────
  const tauri = typeof window !== "undefined" ? ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__) : undefined;
  if (tauri?.invoke) {
    if (init?.signal?.aborted) {
      throw new DOMException("The user aborted a request.", "AbortError");
    }

    try {
      const rawPath = resolveApiPath(input);
      const resolved = withDirectory(rawPath);
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
      for (const [k, v] of Object.entries(authHeader())) {
        if (!h[k]) h[k] = v;
      }
      if (init?.body && typeof init.body === "string" && !h["Content-Type"] && !h["content-type"]) {
        h["Content-Type"] = "application/json";
      }
      const folder = activeDirectory();
      if (folder && !h["x-arunaki-directory"]) {
        h["x-arunaki-directory"] = folder;
      }

      const ipcRes = await tauri.invoke("tauri_engine_fetch", {
        req: {
          path: resolved,
          method: init?.method || "GET",
          headers: Object.keys(h).length > 0 ? h : undefined,
          body: typeof init?.body === "string" ? init.body : undefined,
        },
      });

      if (ipcRes && typeof (ipcRes as any).status === "number") {
        return wrapIpcResponse(ipcRes as any);
      }
    } catch (ipcErr) {
      console.warn("[tauri-ipc] Fallback to direct HTTP:", ipcErr);
    }
  }

  // ── HTTP path (dev browser or fallback) ──────────────────────────────
  const headers = new Headers(init?.headers);
  for (const [k, v] of Object.entries(authHeader())) headers.set(k, v);
  if (init?.body && typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const folder = activeDirectory();
  if (folder && !headers.has("x-arunaki-directory")) {
    headers.set("x-arunaki-directory", folder);
  }
  const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input);
  const targetUrl = (isDesktopBundle() && rawUrl.startsWith("/"))
    ? `${engineUrl()}${rawUrl}`
    : typeof input === "string" ? enginePath(input) : input;
  const resolved = withDirectory(typeof targetUrl === "string" ? targetUrl : targetUrl.toString());
  return fetch(resolved, { ...init, headers });
}

/**
 * Direct Tauri native command for Local-CLI operations.
 */
export async function tauriCliLogin(target: string): Promise<{ success: boolean; message: string }> {
  const tauri = typeof window !== "undefined" ? ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__) : undefined;
  if (tauri?.invoke) {
    try {
      const res: any = await tauri.invoke("tauri_cli_login", { target });
      return res?.data || res;
    } catch (e: any) {
      return { success: false, message: e?.message || String(e) };
    }
  }
  const res = await apiFetch(`${API_BASE}/providers/local-cli/login${directoryQuery()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target }),
  });
  const json = await res.json().catch(() => ({}));
  return json?.data || { success: false, message: "No response" };
}

/**
 * Direct Tauri native command for Local-CLI status.
 */
export async function tauriCliStatus(): Promise<any> {
  const tauri = typeof window !== "undefined" ? ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__) : undefined;
  if (tauri?.invoke) {
    try {
      const res: any = await tauri.invoke("tauri_cli_status");
      return res?.data || res;
    } catch {}
  }
  const res = await apiFetch(`${API_BASE}/providers/local-cli/status${directoryQuery()}`);
  const json = await res.json().catch(() => ({}));
  return json?.data || json;
}

/**
 * Native Tauri folder picker dialog.
 */
export async function tauriPickFolder(): Promise<string | null> {
  const tauri = typeof window !== "undefined" ? ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__) : undefined;
  if (tauri?.invoke) {
    try {
      const res = await tauri.invoke("pick_folder");
      return (res as string) || null;
    } catch (e) {
      console.error("[tauriPickFolder] Error:", e);
    }
  }
  const d = desktop();
  if (d?.pickFolder) {
    const res = await d.pickFolder();
    return res?.path || null;
  }
  return null;
}

/**
 * Native Tauri file picker dialog.
 */
export async function tauriPickFile(filter?: string): Promise<string | null> {
  const tauri = typeof window !== "undefined" ? ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__) : undefined;
  if (tauri?.invoke) {
    try {
      const res = await tauri.invoke("pick_file", { filter });
      return (res as string) || null;
    } catch (e) {
      console.error("[tauriPickFile] Error:", e);
    }
  }
  return null;
}

/**
 * Reveal path in Windows Explorer.
 */
export async function tauriShowInExplorer(path: string): Promise<void> {
  const tauri = typeof window !== "undefined" ? ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__) : undefined;
  if (tauri?.invoke) {
    try {
      await tauri.invoke("show_in_explorer", { path });
    } catch (e) {
      console.error("[tauriShowInExplorer] Error:", e);
    }
  }
}

/**
 * Fetch from the bridge server. In Electron, uses IPC relay.
 * In dev browser / Tauri, uses direct HTTP.
 */
export async function bridgeFetch(input: string, init?: RequestInit): Promise<Response> {
  const d = desktop();
  if (d?.bridgeFetch) {
    if (init?.signal?.aborted) {
      throw new DOMException("The user aborted a request.", "AbortError");
    }

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
