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

const LAUNCH_START_MS = Date.now();
function formatElapsed(fromMs = LAUNCH_START_MS) {
  const elapsedMs = Date.now() - fromMs;
  const totalSec = (elapsedMs / 1000).toFixed(2);
  const mins = Math.floor(elapsedMs / 60000);
  const remSec = ((elapsedMs % 60000) / 1000).toFixed(2);
  return mins > 0
    ? `${totalSec}s (${mins}m ${remSec}s)`
    : `${totalSec}s (${(elapsedMs / 60000).toFixed(2)} menit)`;
}

const rootDir = path.join(__dirname, '..');
const serverAuth = require('./server-auth.cjs');

function getHealthUrl() {
  if (process.env.ARUNAKI_HEALTH) return process.env.ARUNAKI_HEALTH;
  try {
    const infoPath = path.join(require('node:os').homedir(), '.arunaki', 'engine-info.json');
    if (fs.existsSync(infoPath)) {
      const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
      if (info && info.url) return `${info.url}/api/health`;
    }
  } catch {}
  const port = Number(process.env.ARUNAKI_ENGINE_PORT ?? 4096);
  return `http://127.0.0.1:${port}/api/health`;
}

const auth = serverAuth.create();
const ENGINE_PORT = Number(process.env.ARUNAKI_ENGINE_PORT ?? 4096);

function cleanStaleEngineProcesses(repoDir) {
  const isWin = process.platform === 'win32';
  const normalizedRepo = (repoDir || process.cwd()).replace(/\\/g, '/').toLowerCase();

  if (isWin) {
    try {
      const script = "Get-CimInstance Win32_Process -Filter \\\"Name = 'bun.exe'\\\" | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress";
      const stdout = execSync(`powershell -NoProfile -NonInteractive -Command "${script}"`, {
        stdio: ['pipe', 'pipe', 'ignore'],
        windowsHide: true,
        encoding: 'utf8',
        timeout: 10000,
      }).trim();
      if (!stdout) return;
      const parsed = JSON.parse(stdout);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      let killedAny = false;
      for (const item of list) {
        if (!item || !item.ProcessId || !item.CommandLine) continue;
        const pid = Number(item.ProcessId);
        if (pid === process.pid) continue;
        const cmd = item.CommandLine.replace(/\\/g, '/').toLowerCase();
        if (cmd.includes(normalizedRepo) || cmd.includes('serve-only.ts')) {
          console.log(`[start] Cleaning stale Arunaki engine process (PID ${pid})...`);
          try {
            execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore', windowsHide: true });
            killedAny = true;
          } catch {}
        }
      }
      if (killedAny) {
        try { execSync('powershell -NoProfile -Command "Start-Sleep -Milliseconds 1000"', { stdio: 'ignore', windowsHide: true }); } catch {}
      }
    } catch {}
  } else {
    try {
      const stdout = execSync('ps -eo pid,command', { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf8', timeout: 5000 });
      for (const line of stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split(/\s+/);
        const pid = parseInt(parts[0], 10);
        if (pid === process.pid) continue;
        const cmd = parts.slice(1).join(' ').toLowerCase();
        if (cmd.includes('bun') && (cmd.includes(normalizedRepo) || cmd.includes('serve-only.ts'))) {
          console.log(`[start] Cleaning stale Arunaki engine process (PID ${pid})...`);
          try { process.kill(pid, 'SIGKILL'); } catch {}
        }
      }
    } catch {}
  }
}

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
      const req = http.get(getHealthUrl(), { headers: { Authorization: auth.authorization } }, (res) => {
        res.resume();
        resolve(res.statusCode && res.statusCode < 500);
      });
      req.on('error', () => retry());
      req.setTimeout(2000, () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() - started >= timeoutMs) return resolve(false);
      setTimeout(tick, 400);
    };
    tick();
  });
}

async function main() {
  console.log(`\n================================================================`);
  console.log(`[⏱️ 0.00s] [start] Memulai perhitungan waktu launch Arunaki (Production)...`);
  console.log(`================================================================`);

  const distIndex = path.join(rootDir, 'apps', 'web', 'dist', 'index.html');
  if (!fs.existsSync(distIndex)) {
    console.error('[start] apps/web/dist/index.html not found. Run: npm run build');
    process.exit(1);
  }

  const cleanStartMs = Date.now();
  cleanStaleEngineProcesses(rootDir);
  freePort(ENGINE_PORT);
  console.log(`[⏱️ +${formatElapsed()}] [start] Pembersihan proses & port selesai (durasi tahap: ${formatElapsed(cleanStartMs)})`);

  const engineStartMs = Date.now();
  const useBunFallback = process.env.ARUNAKI_USE_BUN_ENGINE === '1';
  const exeExt = process.platform === 'win32' ? '.exe' : '';
  const rustCandidates = [
    path.join(rootDir, 'apps', 'desktop', 'resources', `engine${exeExt}`),
    path.join(rootDir, 'target', 'release', `arunaki-engine${exeExt}`),
    path.join(rootDir, 'target', 'debug', `arunaki-engine${exeExt}`),
  ];
  const rustBin = !useBunFallback ? rustCandidates.find((p) => fs.existsSync(p)) : null;

  let engine;
  if (rustBin) {
    console.log(`[?? +${formatElapsed()}] [start] Menjalankan Native Rust Arunaki Engine (${path.basename(rustBin)}) pada :${ENGINE_PORT}...`);
    engine = spawn(
      rustBin,
      ['serve', '--port', String(ENGINE_PORT)],
      { cwd: rootDir, env: { ...process.env, ...auth.engineEnv, ARUNAKI_ENGINE_PORT: String(ENGINE_PORT) }, stdio: 'inherit', windowsHide: true },
    );
  } else {
    console.log(`[?? +${formatElapsed()}] [start] Menjalankan Arunaki Engine (Bun fallback) pada :${ENGINE_PORT}...`);
    engine = spawn(
      'bun',
      ['run', '--conditions=browser', path.join(rootDir, 'target', 'release', 'arunaki-engine.exe'), 'serve', '--port', String(ENGINE_PORT)],
      { cwd: rootDir, env: { ...process.env, ...auth.engineEnv }, stdio: 'inherit', windowsHide: true },
    );
  }

  const stop = () => {
    if (engine && engine.pid && !engine.killed) {
      if (process.platform === 'win32') {
        try { execSync(`taskkill /F /T /PID ${engine.pid}`, { stdio: 'ignore', windowsHide: true }); } catch {}
      } else {
        try { engine.kill('SIGKILL'); } catch {}
      }
    }
    cleanStaleEngineProcesses(rootDir);
  };
  process.on('exit', stop);
  process.on('SIGINT', () => { stop(); process.exit(0); });
  process.on('SIGTERM', () => { stop(); process.exit(0); });

  console.log(`[⏱️ +${formatElapsed()}] [start] Menunggu Engine siap...`);
  if (!(await waitForEngine(90000))) {
    console.error(`[⏱️ +${formatElapsed()}] [start] Engine did not come up.`);
    stop();
    process.exit(1);
  }
  console.log(`[⏱️ +${formatElapsed()}] [start] ✅ Engine (:4096) siap! (durasi tahap: ${formatElapsed(engineStartMs)})`);

  console.log('[start] Menjalankan Native Rust Desktop (WebView2)...');
  const exeExt = process.platform === 'win32' ? '.exe' : '';
  const rustDesktopCandidates = [
    path.join(rootDir, 'target', 'release', 'arunaki' + exeExt),
    path.join(rootDir, 'target', 'release', 'arunaki-engine' + exeExt),
    path.join(rootDir, 'target', 'debug', 'arunaki' + exeExt),
  ];
  const desktopBin = rustDesktopCandidates.find((p) => fs.existsSync(p));
  if (!desktopBin) {
    console.error('[start] Binary native desktop tidak ditemukan. Silakan jalankan: cargo build --release -p arunaki-engine');
    stop();
    process.exit(1);
  }

  const app = spawn(desktopBin, [], {
    cwd: rootDir,
    env: {
      ...process.env,
      ...auth.engineEnv,
      ARUNAKI_ENGINE_PORT: String(ENGINE_PORT),
      ARUNAKI_LAUNCH_START_MS: String(LAUNCH_START_MS),
    },
    stdio: 'inherit',
    windowsHide: false,
  });

  app.on('exit', () => { stop(); process.exit(0); });
}

main().catch((e) => { console.error('[start]', e); process.exit(1); });
