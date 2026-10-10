/**
 * Production launcher.
 *
 * `npm run dev:app` runs Vite and points Electron at it. That is fine while developing and it is
 * also why nothing ever noticed that the production path was broken: main.cjs falls back to
 * loadFile() on the built bundle, and that path had never been run. There, the page origin is
 * file://, so "/api" resolved to file:///api and the engine also rejected the "null" origin.
 *
 * This starts the engine with a password, waits for it, then launches Electron with no dev server
 * in sight. Electron falls through to loadFile() and loads the bundle off disk. Nothing serves the
 * UI over HTTP, so there is no localhost page a browser could open.
 *
 * Tracked rather than living in dev-app.cjs, which is skip-worktree because it holds machine-local
 * tuning. A control that only exists on one developer's machine is not a control.
 */
const { spawn, execSync } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const rootDir = path.join(__dirname, '..');
const serverAuth = require('./server-auth.cjs');

const ENGINE_PORT = Number(process.env.ARUNAKI_ENGINE_PORT ?? 4096);
const HEALTH = `http://127.0.0.1:${ENGINE_PORT}/api/health`;
const auth = serverAuth.create();

function freePort(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr :${port}`, { stdio: ['pipe', 'pipe', 'ignore'] })
        .toString()
        .split('\n');
      for (const line of out) {
        const m = line.trim().match(/LISTENING\s+(\d+)/);
        if (m) {
          try { process.kill(Number(m[1]), 0); execSync(`taskkill /F /PID ${m[1]}`, { stdio: 'ignore' }); } catch {}
        }
      }
    }
  } catch {}
}

function waitForEngine(timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      // Engine auth protects /api/health too, so an unauthenticated 401 here still means "up".
      const req = http.get(HEALTH, { headers: { Authorization: auth.authorization } }, (res) => {
        res.resume();
        resolve(res.statusCode && res.statusCode < 500);
      });
      req.on('error', () => retry());
      req.setTimeout(2000, () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() - started >= timeoutMs) return resolve(false);
      setTimeout(tick, 1000);
    };
    tick();
  });
}

async function main() {
  const distIndex = path.join(rootDir, 'apps', 'web', 'dist', 'index.html');
  if (!fs.existsSync(distIndex)) {
    console.error('[start] apps/web/dist/index.html not found. Run: npm run build');
    process.exit(1);
  }

  freePort(ENGINE_PORT);
  console.log(`[start] Arunaki engine on :${ENGINE_PORT} (auth required)`);
  const engine = spawn(
    'bun',
    ['run', '--conditions=browser', path.join(rootDir, 'packages', 'engine', 'engine', 'src', 'serve-only.ts'), 'serve', '--port', String(ENGINE_PORT)],
    { cwd: rootDir, env: { ...process.env, ...auth.engineEnv }, stdio: 'inherit', windowsHide: true },
  );

  const stop = () => { try { engine.kill('SIGKILL'); } catch {} };
  process.on('exit', stop);
  process.on('SIGINT', () => { stop(); process.exit(0); });

  console.log('[start] Waiting for engine...');
  if (!(await waitForEngine(90000))) {
    console.error('[start] Engine did not come up.');
    stop();
    process.exit(1);
  }

  // No ARUNAKI_WEB_URL: main.cjs waits for it, fails, and falls through to loadFile() on the bundle.
  console.log('[start] Launching Electron on the built bundle.');
  const electronBin = path.join(rootDir, 'node_modules', 'electron', 'dist', 'electron.exe');
  const exe = fs.existsSync(electronBin) ? electronBin : 'electron';
  const app = spawn(exe, ['.'], {
    cwd: path.join(rootDir, 'apps', 'desktop'),
    env: { ...process.env, ...auth.engineEnv, ARUNAKI_ENGINE_URL: `http://127.0.0.1:${ENGINE_PORT}` },
    stdio: 'inherit',
    windowsHide: false,
  });

  app.on('exit', () => { stop(); process.exit(0); });
}

main().catch((e) => { console.error('[start]', e); process.exit(1); });