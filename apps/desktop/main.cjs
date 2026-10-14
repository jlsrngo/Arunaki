const { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme, Notification, nativeImage, clipboard } = require('electron');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');

// Single instance lock to prevent multi-process cache collisions and network service crashes
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// Windows requires explicit AppUserModelId for desktop notifications in Action Center and taskbar icon
if (process.platform === 'win32') {
  app.setAppUserModelId('Arunaki');
  try {
    const icoPath = path.join(__dirname, 'resources', 'icon.ico');
    if (fsSync.existsSync(icoPath) && typeof shell?.writeShortcutLink === 'function') {
      const shortcutDir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
      const shortcutFile = path.join(shortcutDir, 'Arunaki.lnk');
      const op = fsSync.existsSync(shortcutFile) ? 'replace' : 'create';
      shell.writeShortcutLink(shortcutFile, op, {
        target: process.execPath,
        args: `"${path.join(__dirname, 'main.cjs')}"`,
        appUserModelId: 'Arunaki',
        icon: icoPath,
        iconIndex: 0,
        description: 'Arunaki - Desktop Document Agent',
      });
    }
  } catch (err) {
    // Non-fatal if shortcut cannot be written
  }
}

// Gracefully handle Chromium network service or GPU helper process restarts without terminating Electron
app.on('child-process-gone', (_event, details) => {
  console.warn('[main] Child process gone (recovering):', details.type, details.reason);
});

// Load .env manually since dotenv might not be installed
try {
  // Try apps/desktop/.env first, then root .env
  const candidatePaths = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '..', '..', '.env'),
  ];
  for (const envPath of candidatePaths) {
    try {
      const envContent = fsSync.readFileSync(envPath, 'utf-8');
      envContent.split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let value = match[2] || '';
          value = value.replace(/^['"]|['"]$/g, '');
          if (!process.env[key]) process.env[key] = value;
        }
      });
      break;
    } catch (e) {
      // Try next path
    }
  }
} catch (e) {
  // Ignore if .env doesn't exist
}

// Dev mode only. npm run dev:app sets this to the Vite server; npm start does not set it, and the
// app then loads the built bundle straight off disk.
//
// This used to default to 127.0.0.1:5173 unconditionally, so a production run sat on a "waiting for
// the web app" screen for the full 15s timeout before falling back to the bundle it already had -
// and the message named a dev server that was never going to answer.
const WEB_URL = process.env.ARUNAKI_WEB_URL || null;
const WAIT_TIMEOUT_MS = 15000;
const WAIT_INTERVAL_MS = 500;

// ── IPC Engine Relay ─────────────────────────────────────────────────────────
// The renderer never talks to the engine over HTTP directly. All engine
// communication is relayed through IPC so that no localhost port is exposed to
// the Chromium sandbox and no auth credentials need to leave the main process.

function getEngineUrl() {
  if (process.env.ARUNAKI_ENGINE_URL) return process.env.ARUNAKI_ENGINE_URL;
  try {
    const infoPath = path.join(os.homedir(), '.arunaki', 'engine-info.json');
    if (fsSync.existsSync(infoPath)) {
      const info = JSON.parse(fsSync.readFileSync(infoPath, 'utf8'));
      if (info && info.url) return info.url;
    }
  } catch {}
  return 'http://127.0.0.1:4096';
}
const BRIDGE_URL = process.env.ARUNAKI_BRIDGE_URL || 'http://127.0.0.1:20188';

// ── Engine Process & Credentials Lifecycle ──────────────────────────────────
let engineChildProcess = null;

function getEngineCredentials() {
  let user = process.env.ARUNAKI_SERVER_USERNAME || process.env.Arunaki_SERVER_USERNAME || 'arunaki';
  let password = process.env.ARUNAKI_SERVER_PASSWORD || process.env.Arunaki_SERVER_PASSWORD;
  if (!password) {
    try {
      const passPath = path.join(os.homedir(), '.arunaki', 'dev-server-password');
      if (fsSync.existsSync(passPath)) {
        const parts = fsSync.readFileSync(passPath, 'utf8').trim().split(':');
        if (parts.length === 2) {
          user = parts[0];
          password = parts[1];
        }
      }
    } catch {}
  }
  return { user, password, engineUrl: getEngineUrl() };
}

function engineAuthHeader() {
  const creds = getEngineCredentials();
  if (!creds.password) return {};
  return { Authorization: `Basic ${Buffer.from(`${creds.user}:${creds.password}`).toString('base64')}` };
}

function isEngineUp(url) {
  return new Promise((resolve) => {
    const healthUrl = `${(url || getEngineUrl()).replace(/\/$/, '')}/api/health`;
    const req = http.get(healthUrl, {
      headers: engineAuthHeader(),
    }, (res) => {
      res.resume();
      resolve(res.statusCode && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function findEngineBinary() {
  const candidatePaths = [
    // 1. Packaged Electron resources (resources/engine/engine.exe or resources/engine.exe)
    path.join(process.resourcesPath || '', 'engine', 'engine.exe'),
    path.join(process.resourcesPath || '', 'engine.exe'),
    // 2. Bundled inside desktop app directory (apps/desktop/resources/engine.exe)
    path.join(__dirname, 'resources', 'engine.exe'),
    path.join(__dirname, 'resources', 'engine', 'engine.exe'),
    // 3. Monorepo root directory
    path.join(__dirname, '..', '..', 'engine.exe'),
  ];
  for (const p of candidatePaths) {
    if (fsSync.existsSync(p)) return p;
  }
  return null;
}

async function ensureEngineRunning() {
  const engineUrl = getEngineUrl();
  const up = await isEngineUp(engineUrl);
  if (up) {
    console.log(`[main] Engine already running and healthy at ${engineUrl}`);
    return true;
  }

  const binPath = findEngineBinary();
  if (!binPath) {
    console.log('[main] No bundled engine binary found; expecting external engine daemon.');
    return false;
  }

  console.log(`[main] Spawning bundled engine binary: ${binPath}`);
  const { spawn } = require('node:child_process');
  const port = process.env.ARUNAKI_ENGINE_PORT || '4096';

  try {
    engineChildProcess = spawn(binPath, ['serve', '--port', port], {
      cwd: path.dirname(binPath),
      env: { ...process.env, ARUNAKI_ENGINE_PORT: port },
      stdio: 'ignore',
      windowsHide: true,
    });

    engineChildProcess.on('error', (err) => {
      console.error('[main] Failed to spawn engine process:', err);
    });

    // Wait up to 12s for engine to come up
    const start = Date.now();
    while (Date.now() - start < 12000) {
      await wait(500);
      if (await isEngineUp(engineUrl)) {
        console.log(`[main] Bundled engine successfully started on ${engineUrl}`);
        return true;
      }
    }
    console.warn('[main] Engine spawned but did not respond within 12s');
  } catch (e) {
    console.error('[main] Error starting engine binary:', e);
  }
  return false;
}

function cleanupEngine() {
  if (engineChildProcess && !engineChildProcess.killed) {
    console.log('[main] Cleaning up child engine process...');
    try {
      if (process.platform === 'win32') {
        const { execSync } = require('node:child_process');
        execSync(`taskkill /F /T /PID ${engineChildProcess.pid}`, { stdio: 'ignore', windowsHide: true });
      } else {
        engineChildProcess.kill('SIGKILL');
      }
    } catch {}
    engineChildProcess = null;
  }
}

app.on('before-quit', cleanupEngine);
app.on('will-quit', cleanupEngine);
process.on('exit', cleanupEngine);

// Active SSE subscriptions keyed by a client-chosen channel name.
// Each entry: { reader, aborted }
const activeSseSubscriptions = new Map();

function loadBundle(win) {
  const candidatePaths = [
    // 1. Packaged Electron resources (resources/web/index.html)
    path.join(process.resourcesPath || '', 'web', 'index.html'),
    // 2. Bundled inside app directory (apps/desktop/web/index.html or apps/desktop/dist/index.html)
    path.join(__dirname, 'web', 'index.html'),
    path.join(__dirname, 'dist', 'index.html'),
    // 3. Monorepo dev sibling path (apps/web/dist/index.html)
    path.join(__dirname, '../web/dist/index.html'),
  ];

  for (const p of candidatePaths) {
    if (fsSync.existsSync(p)) {
      void win.loadFile(p);
      return true;
    }
  }
  return false;
}

// Workspace root, learned from the first fs:getFolderTree call (folder picked by user).
// All fs/office IPC handlers must stay inside it.
let workspaceRoot = null;

function resolveInsideWorkspace(p) {
  // Fail closed. This used to return the path unchecked whenever no workspace had been picked yet,
  // on the theory that an empty workspace is "dev mode". It is not: workspaceRoot is only ever set by
  // fs:getFolderTree (L302), so every readFile/writeFile/deletePath/renamePath between app start and
  // the first folder scan was reaching any path on the machine. BOUNDARIES.md says the agent cannot
  // touch files outside the active folder - that was enforced in the engine and not here.
  if (!workspaceRoot) throw new Error('No workspace selected');
  const resolved = !path.isAbsolute(p) ? path.resolve(workspaceRoot, p) : path.resolve(p);
  const rel = path.relative(workspaceRoot, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Path outside workspace is not allowed');
  }
  return resolved;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkUrl(url) {
  if (url.startsWith('file:')) return Promise.resolve(true);
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode && res.statusCode < 500);
    });

    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForWebApp(url) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < WAIT_TIMEOUT_MS) {
    if (await checkUrl(url)) {
      return true;
    }
    await wait(WAIT_INTERVAL_MS);
  }
  return false;
}

let mainWindow = null;

// "Exit Window" in the File menu called window.close() from the renderer and hoped Electron
// honoured it. Chromium ignores window.close() for a window it did not open itself, so this is
// the channel that makes the menu item actually close the app rather than silently doing nothing.
ipcMain.handle('app:quit', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  return { success: true };
});

// Ctrl+0 used to be handled with document.body.style.zoom = "1". Nothing in the app ever sets a
// CSS zoom, so that reset a property nobody touched - and its preventDefault() had meanwhile
// blocked Chromium's own Ctrl+0, which does work. Page zoom lives on webContents.
ipcMain.handle('app:resetZoom', (event) => {
  const target = BrowserWindow.fromWebContents(event.sender);
  target?.webContents.setZoomLevel(0);
  return { success: true };
});

function createWindow() {
  const isDark = nativeTheme ? nativeTheme.shouldUseDarkColors : true;
  const candidateIcons = [
    path.join(process.resourcesPath || '', 'icon.ico'),
    path.join(process.resourcesPath || '', 'icon.png'),
    path.join(__dirname, 'resources', 'icon.ico'),
    path.join(__dirname, 'resources', 'icon.png'),
    path.join(__dirname, '../web/public/favicon.svg'),
  ];
  const appIconPath = candidateIcons.find(p => fsSync.existsSync(p));
  const appIcon = appIconPath ? nativeImage.createFromPath(appIconPath) : undefined;

  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    icon: (appIcon && !appIcon.isEmpty()) ? appIcon : (appIconPath || undefined),
    backgroundColor: isDark ? '#0A0A0A' : '#FFFFFF',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: isDark ? '#121214' : '#FFFFFF',
      symbolColor: isDark ? '#FFFFFF' : '#111827',
      height: 35,
    },
    webPreferences: {
      backgroundThrottling: false,
      spellcheck: false,
      contextIsolation: true,
      nodeIntegration: false,
      // The second of these two used to be preceded by "sandbox: false", so the last key won and
      // the value was right by accident. The comment below depends on it being true.
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
      // A sandboxed preload does not get a full process object, so the engine credentials travel in
      // on argv instead of through process.env. They are minted per start by scripts/server-auth.cjs
      // and reach this process through the launcher.
      additionalArguments: (() => {
        const creds = getEngineCredentials();
        if (creds.password) {
          return [
            `--arunaki-server-user=${creds.user}`,
            `--arunaki-server-password=${creds.password}`,
            `--arunaki-engine-url=${creds.engineUrl}`,
          ];
        }
        return [];
      })(),
    },
  });

  mainWindow = win;
  if (appIcon && !appIcon.isEmpty()) {
    try {
      win.setIcon(appIcon);
    } catch {}
  } else if (appIconPath) {
    try {
      win.setIcon(appIconPath);
    } catch {}
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    // Only web links leave the app. Passing every scheme straight to the OS lets anything the
    // renderer renders open file:// paths or whatever else the machine has registered.
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Guard against in-window navigation away from the local bundle or dev server.
  // setWindowOpenHandler only handles target="_blank" and window.open.
  // will-navigate prevents standard <a> links or location.href changes from navigating the
  // main window away to an external untrusted URL while retaining preload script IPC privileges.
  win.webContents.on('will-navigate', (event, url) => {
    const isLocal = url.startsWith('file:') || url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:');
    if (!isLocal) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  // A renderer crash used to trigger a blind win.reload() a second later. In an editor that throws
  // away whatever was in the message box and whatever was unsaved in the open document, with no
  // prompt first. Reload only when the crash left the process unusable, and back off for the ones
  // it did not - a repeated reload can also turn a recoverable hiccup into a reload loop.
  let rendererGoneAt = 0;
  win.webContents.on('render-process-gone', (_event, details) => {
    const now = Date.now();
    if (now - rendererGoneAt < 10000) {
      console.warn('[main] Render process crashed again within 10s, not reloading:', details.reason);
      return;
    }
    rendererGoneAt = now;
    // 'clean-exit' means it went away on purpose; 'killed' and OOM/crashes are the cases worth
    // recovering from automatically.
    const recoverable = details.reason !== 'clean-exit';
    if (!recoverable) return;
    console.warn('[main] Render process gone, reloading:', details.reason);
    setTimeout(() => {
      try { if (!win.isDestroyed()) win.reload(); } catch {}
    }, 1000);
  });

  // Same problem on the load path: a server that is simply not running produced a retry every
  // 1.5s forever. Bounded backoff, and give up rather than spin.
  let loadRetries = 0;
  let loadRetryTimer = null;
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    if (loadRetryTimer) clearTimeout(loadRetryTimer);
    if (loadRetries >= 6) {
      console.error(`[main] gave up loading after ${loadRetries} attempts (${errorCode}: ${errorDescription})`);
      return;
    }
    const delay = Math.min(1000 * 2 ** loadRetries, 15000);
    loadRetries++;
    console.warn(`[main] did-fail-load (${errorCode}: ${errorDescription}), retry ${loadRetries} in ${delay}ms`);
    loadRetryTimer = setTimeout(() => {
      try { if (!win.isDestroyed()) void win.loadURL(WEB_URL); } catch {}
    }, delay);
  });

  win.webContents.on('did-finish-load', () => { loadRetries = 0; loadRetryTimer = null; });

  // Production: no dev server was ever going to answer, so go straight to the bundle instead of
  // showing a waiting screen for a server nobody started.
  if (!WEB_URL) {
    if (!loadBundle(win)) {
      void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent('<html><body style="margin:0;display:grid;place-items:center;background:#F4EFE6;color:#1A191B;font:16px system-ui"><div>Bundle belum dibangun. Jalankan npm run build lalu buka ulang.</div></body></html>')}`);
    }
    return;
  }

  checkUrl(WEB_URL).then((alreadyUp) => {
    if (alreadyUp) {
      void win.loadURL(WEB_URL);
      return;
    }
    // Only show waiting screen if web dev server is not ready yet
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<html><body style="margin:0;display:grid;place-items:center;background:#F4EFE6;color:#1A191B;font:16px system-ui"><div>Menunggu Arunaki Web di ${WEB_URL}...</div></body></html>`)}`);

    waitForWebApp(WEB_URL).then((isReady) => {
      if (isReady) {
        void win.loadURL(WEB_URL);
        return;
      }
      if (loadBundle(win)) return;
      void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<html><body style="margin:0;display:grid;place-items:center;background:#F4EFE6;color:#1A191B;font:16px system-ui"><div>Arunaki Web belum aktif. Jalankan npm run dev:web lalu buka ulang desktop.</div></body></html>`)}`);
    }).catch((err) => {
      console.error('[main] Error loading web app:', err);
      void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<html><body style="margin:0;display:grid;place-items:center;background:#F4EFE6;color:#FF5E38;font:16px system-ui"><div>Gagal memuat aplikasi: ${err.message}</div></body></html>`)}`);
    });
  });
}


app.whenReady().then(async () => {
  // Ensure engine daemon is responsive or spawn bundled engine binary
  await ensureEngineRunning();

  ipcMain.handle('app:ping', () => 'desktop');

  // ── Engine IPC Relay ─────────────────────────────────────────────────────
  // Generic HTTP relay: renderer calls engine:fetch(path, serializableInit)
  // and receives { status, statusText, headers, body, ok }.
  ipcMain.handle('engine:fetch', async (_event, relPath, init) => {
    try {
      let cleanPath = typeof relPath === 'string' && relPath.startsWith('/') ? relPath : `/${relPath || ''}`;
      if (cleanPath.startsWith('/api/messaging/')) {
        cleanPath = cleanPath.replace(/^\/api\/messaging/, '/messaging');
      }
      const url = `${getEngineUrl()}${cleanPath}`;
      const method = init?.method || 'GET';
      const outHeaders = {
        ...engineAuthHeader(),
        ...(init?.headers || {}),
      };
      if (init?.body && !outHeaders['Content-Type'] && !outHeaders['content-type']) {
        outHeaders['Content-Type'] = 'application/json';
      }
      const fetchOpts = { method, headers: outHeaders };
      if (init?.body) fetchOpts.body = init.body;
      const res = await fetch(url, fetchOpts);
      const body = await res.text();
      const resHeaders = {};
      res.headers.forEach((v, k) => { resHeaders[k] = v; });
      return { status: res.status, statusText: res.statusText, headers: resHeaders, body, ok: res.ok };
    } catch (err) {
      return { status: 0, statusText: 'IPC relay error', headers: {}, body: JSON.stringify({ error: err.message }), ok: false };
    }
  });

  // Bridge relay (separate server, e.g. model validation on :20188)
  ipcMain.handle('bridge:fetch', async (_event, relPath, init) => {
    try {
      const cleanPath = typeof relPath === 'string' && relPath.startsWith('/') ? relPath : `/${relPath || ''}`;
      const url = `${BRIDGE_URL}${cleanPath}`;
      const method = init?.method || 'GET';
      const outHeaders = { ...engineAuthHeader(), ...(init?.headers || {}) };
      if (init?.body && !outHeaders['Content-Type'] && !outHeaders['content-type']) {
        outHeaders['Content-Type'] = 'application/json';
      }
      const fetchOpts = { method, headers: outHeaders };
      if (init?.body) fetchOpts.body = init.body;
      const res = await fetch(url, fetchOpts);
      const body = await res.text();
      const resHeaders = {};
      res.headers.forEach((v, k) => { resHeaders[k] = v; });
      return { status: res.status, statusText: res.statusText, headers: resHeaders, body, ok: res.ok };
    } catch (err) {
      return { status: 0, statusText: 'IPC bridge relay error', headers: {}, body: JSON.stringify({ error: err.message }), ok: false };
    }
  });

  // SSE relay: main process opens the EventSource-style connection and
  // forwards parsed events to the renderer via webContents.send.
  ipcMain.handle('engine:sse:start', async (_event, channel, relPath, extraHeaders) => {
    const sender = _event.sender;
    // Stop any existing subscription on this channel first
    const existing = activeSseSubscriptions.get(channel);
    if (existing) {
      existing.aborted = true;
      try { existing.controller?.abort(); } catch {}
      activeSseSubscriptions.delete(channel);
    }

    const sub = { aborted: false, controller: null };
    activeSseSubscriptions.set(channel, sub);

    // Auto-abort if the calling webContents is destroyed (e.g. reload or window closed)
    if (sender && !sender.isDestroyed()) {
      sender.once('destroyed', () => {
        sub.aborted = true;
        try { sub.controller?.abort(); } catch {}
        activeSseSubscriptions.delete(channel);
      });
    }

    // Run the SSE loop in the background (not awaited)
    (async () => {
      const cleanPath = typeof relPath === 'string' && relPath.startsWith('/') ? relPath : `/${relPath || ''}`;
      while (!sub.aborted) {
        const ac = new AbortController();
        sub.controller = ac;
        try {
          const url = `${getEngineUrl()}${cleanPath}`;
          const res = await fetch(url, {
            headers: {
              Accept: 'text/event-stream',
              ...engineAuthHeader(),
              ...(extraHeaders || {}),
            },
            signal: ac.signal,
          });
          if (!res.body) {
            if (!sub.aborted) await new Promise(r => setTimeout(r, 1500));
            continue;
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (!sub.aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const messages = buffer.split(/\r?\n\r?\n/);
            buffer = messages.pop() || '';
            for (const msg of messages) {
              const lines = msg.split(/\r?\n/);
              let eventData = '';
              let eventType = '';
              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('data:')) {
                  const slice = trimmed.slice(5).trim();
                  eventData += (eventData ? '\n' : '') + slice;
                } else if (trimmed.startsWith('event:')) {
                  eventType = trimmed.slice(6).trim();
                }
              }
              const target = sender && !sender.isDestroyed() ? sender : (mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null);
              if (eventData && target) {
                try {
                  const parsed = JSON.parse(eventData);
                  if (eventType && !parsed.type) parsed.type = eventType;
                  target.send(`engine:sse:event:${channel}`, parsed);
                } catch {
                  // Forward raw lines if JSON parse fails
                  for (const line of lines) {
                    const t = line.trim();
                    if (t.startsWith('data:')) {
                      try {
                        const single = JSON.parse(t.slice(5).trim());
                        target.send(`engine:sse:event:${channel}`, single);
                      } catch {}
                    }
                  }
                }
              }
            }
          }
          try { reader.cancel(); } catch {}
        } catch {
          // Connection dropped or aborted
        }
        if (!sub.aborted) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }
      activeSseSubscriptions.delete(channel);
    })();

    return { ok: true, channel };
  });

  ipcMain.handle('engine:sse:stop', async (_event, channel) => {
    const sub = activeSseSubscriptions.get(channel);
    if (sub) {
      sub.aborted = true;
      try { sub.controller?.abort(); } catch {}
      activeSseSubscriptions.delete(channel);
    }
    return { ok: true };
  });

  // Expose engine info to renderer (URL for display purposes only, no auth)
  ipcMain.handle('engine:info', () => ({
    url: getEngineUrl(),
    bridgeUrl: BRIDGE_URL,
  }));

  ipcMain.handle('theme:set', async (_event, theme) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const isLight = theme === 'light';
    try {
      if (nativeTheme) {
        nativeTheme.themeSource = isLight ? 'light' : 'dark';
      }
      mainWindow.setBackgroundColor(isLight ? '#FFFFFF' : '#0A0A0A');
      if (process.platform === 'win32' || process.platform === 'darwin') {
        mainWindow.setTitleBarOverlay({
          color: isLight ? '#FFFFFF' : '#121214',
          symbolColor: isLight ? '#111827' : '#FFFFFF',
          height: 35,
        });
      }
    } catch (e) {
      console.warn('[main] setTitleBarOverlay error:', e);
    }
  });

  ipcMain.handle('app:notify', async (_event, payload) => {
    try {
      const { title, body, silent } = payload || {};
      if (Notification && Notification.isSupported()) {
        const notif = new Notification({
          title: title || 'Arunaki Workstation',
          body: body || 'Tugas dokumen selesai.',
          silent: !!silent,
        });
        notif.on('click', () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
          }
        });
        notif.show();
        return { success: true };
      }
    } catch (e) {
      console.warn('[main] app:notify error:', e);
    }
    return { success: false };
  });

  ipcMain.handle('dialog:pickFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Pilih Folder Workspace',
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return { path: result.filePaths[0] };
    }
    return { path: null };
  });

  // VS Code-like: get full folder tree (structure only, no file content)
  ipcMain.handle('fs:getFolderTree', async (_event, folderPath) => {
    // Normalize the incoming path so Windows backslash paths work correctly
    const normalizedPath = path.normalize(folderPath);
    console.log(`[main] fs:getFolderTree called with: "${folderPath}" → normalized: "${normalizedPath}"`);

    // Verify the folder actually exists before scanning
    try {
      const stat = await fs.stat(normalizedPath);
      if (!stat.isDirectory()) {
        console.warn(`[main] fs:getFolderTree: path is not a directory: "${normalizedPath}"`);
        return { tree: [], folderName: path.basename(normalizedPath), folderPath: normalizedPath, error: 'Not a directory' };
      }
    } catch (err) {
      console.error(`[main] fs:getFolderTree: cannot stat path "${normalizedPath}":`, err.message);
      return { tree: [], folderName: path.basename(normalizedPath), folderPath: normalizedPath, error: err.message };
    }

    const IGNORED = new Set([
      'node_modules', '.git', 'dist', 'build', '.next', '.venv',
      '__pycache__', '.idea', '.vscode', 'coverage', '.cache', '.nuxt',
      'arunaki.json', 'arunaki.jsonc',
    ]);

    const buildTree = async (dir, depth = 0) => {
      if (depth > 6) return []; // max depth
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (err) {
        console.warn(`[main] readdir failed for "${dir}":`, err.message);
        return [];
      }

      const nodes = [];
      for (const entry of entries) {
        if (entry.name.startsWith('.') || IGNORED.has(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          const children = await buildTree(fullPath, depth + 1);
          nodes.push({
            name: entry.name,
            path: fullPath,
            type: 'directory',
            children,
          });
        } else if (entry.isFile()) {
          try {
            const stat = await fs.stat(fullPath);
            nodes.push({
              name: entry.name,
              path: fullPath,
              type: 'file',
              size: stat.size,
              ext: path.extname(entry.name).toLowerCase().replace('.', ''),
            });
          } catch {
            // skip unreadable files silently
          }
        }
      }

      // Sort: directories first, then files, alphabetical
      nodes.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return nodes;
    };

    const tree = await buildTree(normalizedPath);
    workspaceRoot = path.resolve(normalizedPath);
    console.log(`[main] fs:getFolderTree done — ${tree.length} root entries, workspaceRoot set to "${workspaceRoot}"`);
    return { tree, folderName: path.basename(normalizedPath), folderPath: normalizedPath };
  });

  // Read individual file content on demand
  ipcMain.handle('fs:readFile', async (_event, filePath) => {
    try {
      const safePath = resolveInsideWorkspace(filePath);
      const ext = path.extname(safePath).toLowerCase();
      const BINARY_EXT = new Set(['.pdf', '.doc', '.docx', '.xlsx', '.xls', '.xlsm', '.pptx', '.ppt', '.odt', '.ods', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.tiff', '.tif', '.zip', '.rar', '.7z', '.mp4', '.mp3']);
      if (BINARY_EXT.has(ext)) {
        const buf = await fs.readFile(safePath);
        return { content: buf.toString('base64'), encoding: 'base64' };
      }
      const content = await fs.readFile(safePath, 'utf-8');
      return { content, encoding: 'utf-8' };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('fs:writeFile', async (_event, filePath, content) => {
    try {
      const safePath = resolveInsideWorkspace(filePath);
      await fs.mkdir(path.dirname(safePath), { recursive: true });
      if (typeof content === 'string' && content.startsWith('data:')) {
        const base64Data = content.split(';base64,').pop();
        if (base64Data) {
          await fs.writeFile(safePath, Buffer.from(base64Data, 'base64'));
          return { success: true };
        }
      }
      await fs.writeFile(safePath, content, 'utf-8');
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('fs:createFolder', async (_event, folderPath) => {
    try {
      const safePath = resolveInsideWorkspace(folderPath);
      await fs.mkdir(safePath, { recursive: true });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('fs:backupFolder', async () => {
    try {
      if (!workspaceRoot) return { error: 'No folder is open' };
      const backupRoot = path.join(workspaceRoot, '.arunaki-backups');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dest = path.join(backupRoot, `backup-${stamp}`);
      await fs.mkdir(dest, { recursive: true });

      const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.name === '.arunaki' ||
          entry.name === '.arunaki-backups' ||
          entry.name === '.git' ||
          entry.name === 'node_modules'
        ) {
          continue;
        }
        const srcPath = path.join(workspaceRoot, entry.name);
        const destPath = path.join(dest, entry.name);
        await fs.cp(srcPath, destPath, { recursive: true, force: true });
      }
      return { success: true, path: dest };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('fs:deletePath', async (_event, targetPath) => {
    try {
      const safePath = resolveInsideWorkspace(targetPath);
      await fs.rm(safePath, { recursive: true, force: true });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('fs:renamePath', async (_event, oldPath, newPath) => {
    try {
      const safeOld = resolveInsideWorkspace(oldPath);
      const safeNew = resolveInsideWorkspace(newPath);
      await fs.rename(safeOld, safeNew);
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('app:openPath', async (_event, targetPath) => {
    try {
      const safePath = resolveInsideWorkspace(targetPath);
      const r = await shell.openPath(safePath);
      if (r) return { error: r };
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('excel:openNative', async (_event, filePath) => {
    try {
      const safePath = resolveInsideWorkspace(filePath);
      const winax = require('winax');
      const excel = new winax.Object('Excel.Application');
      excel.Visible = true;
      const workbook = excel.Workbooks.Open(safePath);
      const hwnd = excel.Hwnd;
      
      return { success: true, hwnd: hwnd.toString() };
    } catch (err) {
      console.warn('[main] Native Excel automation unavailable, falling back to shell.openPath:', err.message);
      try {
        const safePath = resolveInsideWorkspace(filePath);
        const r = await shell.openPath(safePath);
        if (r) return { error: r };
        return { success: true, fallback: 'shell' };
      } catch {
        return { error: err.message };
      }
    }
  });

  ipcMain.handle('word:openNative', async (_event, filePath) => {
    try {
      const safePath = resolveInsideWorkspace(filePath);
      const winax = require('winax');
      const word = new winax.Object('Word.Application');
      word.Visible = true;
      word.Documents.Open(safePath);
      return { success: true };
    } catch (err) {
      console.warn('[main] Native Word automation unavailable, falling back to shell.openPath:', err.message);
      try {
        const safePath = resolveInsideWorkspace(filePath);
        const r = await shell.openPath(safePath);
        if (r) return { error: r };
        return { success: true, fallback: 'shell' };
      } catch {
        return { error: err.message };
      }
    }
  });



  ipcMain.handle('fs:parseExcel', async (_event, filePath) => {
    try {
      const safePath = resolveInsideWorkspace(filePath);
      const xlsx = require('xlsx');
      const workbook = xlsx.readFile(safePath, { cellDates: true, cellStyles: true, cellNF: true, cellFormulas: true });
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        return { success: true, sheetName: '', sheets: [], rows: [] };
      }
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      if (!worksheet || !worksheet['!ref']) {
        return { success: true, sheetName: sheetName || '', sheets: workbook.SheetNames, rows: [] };
      }

      const range = xlsx.utils.decode_range(worksheet['!ref']);
      const rows = [];

      for (let R = range.s.r; R <= range.e.r; ++R) {
        const row = [];
        let hasData = false;
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = xlsx.utils.encode_cell({ r: R, c: C });
          const cell = worksheet[cellAddress];
          if (!cell) {
            row.push(null);
          } else {
            hasData = true;
            row.push({
              v: cell.v,
              w: cell.w !== undefined ? String(cell.w) : (cell.v !== undefined ? String(cell.v) : ''),
              t: cell.t,
              f: cell.f
            });
          }
        }
        rows.push(row);
      }

      return { success: true, sheetName, sheets: workbook.SheetNames, rows };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('fs:writeExcel', async (_event, filePath, rows) => {
    try {
      const safePath = resolveInsideWorkspace(filePath);
      const xlsx = require('xlsx');
      const worksheet = xlsx.utils.aoa_to_sheet(Array.isArray(rows) ? rows : []);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      xlsx.writeFile(workbook, safePath);
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('fs:readBinaryFile', async (_event, filePath) => {
    try {
      const safePath = resolveInsideWorkspace(filePath);
      const data = await fs.readFile(safePath);
      return { success: true, base64: data.toString('base64') };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('clipboard:readImage', async () => {
    try {
      const img = clipboard.readImage();
      if (!img || img.isEmpty()) return null;
      return img.toDataURL();
    } catch (err) {
      console.warn('[main] clipboard:readImage failed:', err.message);
      return null;
    }
  });

  createWindow();

  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});