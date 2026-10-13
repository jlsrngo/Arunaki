const { contextBridge, ipcRenderer } = require('electron');

// The engine authenticates with HTTP Basic. The password is minted per start by the launcher and
// arrives on argv rather than in process.env, because a sandboxed preload (webPreferences.sandbox =
// true) does not get a full process object.
//
// Returns undefined when there is no desktop shell (plain browser), which is the right answer
// there: with no shell there is no password, so the engine rejects the request.
function credentials() {
  const arg = (prefix) => {
    const hit = process.argv.find((a) => a.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : undefined;
  };
  const user = arg('--arunaki-server-user=');
  const password = arg('--arunaki-server-password=');
  if (!user || !password) return undefined;
  return { user, password, engineUrl: arg('--arunaki-engine-url=') || 'http://127.0.0.1:4096' };
}

contextBridge.exposeInMainWorld('arunakiDesktop', {
  credentials,
  ping: () => ipcRenderer.invoke('app:ping').catch(() => 'desktop'),
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  getFolderTree: (folderPath) => ipcRenderer.invoke('fs:getFolderTree', folderPath),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  createFolder: (folderPath) => ipcRenderer.invoke('fs:createFolder', folderPath),
  backupFolder: () => ipcRenderer.invoke('fs:backupFolder'),
  deletePath: (targetPath) => ipcRenderer.invoke('fs:deletePath', targetPath),
  renamePath: (oldPath, newPath) => ipcRenderer.invoke('fs:renamePath', oldPath, newPath),
  openPath: (targetPath) => ipcRenderer.invoke('app:openPath', targetPath),
  openExcelNative: (filePath) => ipcRenderer.invoke('excel:openNative', filePath),
  openWordNative: (filePath) => ipcRenderer.invoke('word:openNative', filePath),
  parseExcel: (filePath) => ipcRenderer.invoke('fs:parseExcel', filePath),
  writeExcel: (filePath, rows) => ipcRenderer.invoke('fs:writeExcel', filePath, rows),
  readBinaryFile: (filePath) => ipcRenderer.invoke('fs:readBinaryFile', filePath),
  setTheme: (theme) => ipcRenderer.invoke('theme:set', theme),
  notify: (payload) => ipcRenderer.invoke('app:notify', payload),
  getSystemInfo: () => ({
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    os: `${process.platform === 'win32' ? 'Windows_NT' : process.platform} ${process.arch} 10.0.26200`,
  }),

  // ── IPC Engine Relay ───────────────────────────────────────────────────
  // These methods replace direct HTTP fetch from the renderer. The main
  // process handles auth headers and proxies to the engine's localhost port.

  /**
   * Relay an HTTP request to the engine via the main process.
   * @param {string} path - Engine route, e.g. '/api/session'
   * @param {{ method?: string, headers?: Record<string,string>, body?: string }} init
   * @returns {Promise<{ status: number, statusText: string, headers: Record<string,string>, body: string, ok: boolean }>}
   */
  engineFetch: (path, init) => ipcRenderer.invoke('engine:fetch', path, init),

  /**
   * Relay an HTTP request to the bridge server via the main process.
   * @param {string} path - Bridge route, e.g. '/v1/models'
   * @param {{ method?: string, headers?: Record<string,string>, body?: string }} init
   * @returns {Promise<{ status: number, statusText: string, headers: Record<string,string>, body: string, ok: boolean }>}
   */
  bridgeFetch: (path, init) => ipcRenderer.invoke('bridge:fetch', path, init),

  /**
   * Start an SSE subscription via the main process.
   * Events are received on the 'engine:sse:event:<channel>' IPC channel.
   * @param {string} channel - Unique channel name for this subscription
   * @param {string} path - Engine SSE route, e.g. '/api/event?directory=...'
   * @param {Record<string,string>} [extraHeaders] - Additional headers
   * @returns {Promise<{ ok: boolean, channel: string }>}
   */
  startEngineSSE: (channel, path, extraHeaders) =>
    ipcRenderer.invoke('engine:sse:start', channel, path, extraHeaders),

  /**
   * Stop an SSE subscription.
   * @param {string} channel - The channel name used in startEngineSSE
   */
  stopEngineSSE: (channel) => ipcRenderer.invoke('engine:sse:stop', channel),

  /**
   * Listen for SSE events on a specific channel.
   * @param {string} channel - The channel name
   * @param {(data: any) => void} callback - Event handler
   * @returns {() => void} Cleanup function to remove the listener
   */
  onEngineSSE: (channel, callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on(`engine:sse:event:${channel}`, handler);
    return () => ipcRenderer.removeListener(`engine:sse:event:${channel}`, handler);
  },

  /** Get engine/bridge URLs (display only, no credentials) */
  getEngineInfo: () => ipcRenderer.invoke('engine:info'),
});

