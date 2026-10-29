/**
 * Arunika Native Desktop Bundle Preparation Script
 *
 * Prepares the pure native Rust desktop application:
 * 1. Builds the web frontend (apps) into production distribution (apps/dist).
 * 2. Compiles standalone native Rust binaries:
 *    - target/release/arunaki.exe (Desktop GUI with WebView2)
 *    - target/release/arunaki-engine.exe (CLI/Headless backend)
 *    - target/release/arunaki-docs.exe (COM/Doc extraction sidecar)
 * 3. Verifies all standalone packaging requirements are met.
 */
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.join(__dirname, '..');
const webDistDir = path.join(rootDir, 'apps', 'dist');
const targetReleaseDir = path.join(rootDir, 'target', 'release');
const desktopExePath = path.join(targetReleaseDir, 'arunaki.exe');
const engineExePath = path.join(targetReleaseDir, 'arunaki-engine.exe');
const docsExePath = path.join(targetReleaseDir, 'arunaki-docs.exe');
const injectScript = path.join(rootDir, 'scripts', 'inject-icon.ps1');
const mainIco = path.join(rootDir, 'core', 'arunaki-engine', 'arunaki.ico');
const gearIco = path.join(rootDir, 'core', 'arunaki-engine', 'gear.ico');
const docsIco = path.join(rootDir, 'core', 'arunaki-docs', 'arunaki.ico');

function log(step, msg) {
  console.log(`\x1b[36m[prepare-bundle]\x1b[0m \x1b[1m${step}\x1b[0m ${msg}`);
}

function error(step, msg) {
  console.error(`\x1b[31m[prepare-bundle:ERROR]\x1b[0m \x1b[1m${step}\x1b[0m ${msg}`);
}

function injectIcon(exePath, icoPath) {
  if (process.platform === 'win32' && fs.existsSync(exePath) && fs.existsSync(icoPath) && fs.existsSync(injectScript)) {
    try {
      execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${injectScript}" -ExePath "${exePath}" -IcoPath "${icoPath}"`, {
        stdio: 'pipe',
      });
      log('Icon', `Injected ${path.basename(icoPath)} -> ${path.basename(exePath)}`);
    } catch (e) {
      console.warn(`\x1b[33m[prepare-bundle:WARN]\x1b[0m Could not inject icon into ${path.basename(exePath)}: ${e.message}`);
    }
  }
}

function setPeSubsystem(exePath, subsystem) {
  if (process.platform === 'win32' && fs.existsSync(exePath)) {
    try {
      const buf = fs.readFileSync(exePath);
      const peOffset = buf.readUInt32LE(0x3c);
      const magic = buf.readUInt16LE(peOffset + 24);
      if (magic === 0x20b) {
        const subsystemOffset = peOffset + 24 + 68;
        buf.writeUInt16LE(subsystem, subsystemOffset);
        fs.writeFileSync(exePath, buf);
        log('PE', `Configured ${path.basename(exePath)} as ${subsystem === 3 ? 'Console CUI' : 'Desktop GUI'}`);
      }
    } catch (e) {
      console.warn(`\x1b[33m[prepare-bundle:WARN]\x1b[0m Could not configure subsystem for ${path.basename(exePath)}: ${e.message}`);
    }
  }
}

async function main() {
  const startTime = Date.now();
  console.log('====================================================');
  console.log('    ARUNAKI PURE NATIVE RUST BUNDLE PREPARATION     ');
  console.log('====================================================');

  // Step 1: Build Web Frontend
  log('Step 1/3', 'Building production web frontend (apps)...');
  try {
    execSync('npm run build -w apps', { cwd: rootDir, stdio: 'inherit' });
    // Touch src-tauri/build.rs and src-tauri/src/lib.rs so Cargo always re-embeds fresh ../apps/dist into arunaki-desktop.exe
    const now = new Date();
    for (const rel of ['src-tauri/build.rs', 'src-tauri/src/lib.rs']) {
      const p = path.join(rootDir, rel);
      if (fs.existsSync(p)) {
        fs.utimesSync(p, now, now);
      }
    }
  } catch (err) {
    error('Step 1/3', 'Web build failed.');
    process.exit(1);
  }

  // Step 2: Compile Native Rust Binaries
  log('Step 2/3', 'Compiling native Rust desktop & engine binaries (release)...');
  try {
    const cargoBinDir = path.join(require('node:os').homedir(), '.cargo', 'bin');
    const envWithCargo = {
      ...process.env,
      PATH: `${process.env.PATH || ''}${path.delimiter}${cargoBinDir}`,
    };
    execSync('cargo build --release -p arunaki-desktop -p arunaki-engine -p arunaki-docs', {
      cwd: rootDir,
      env: envWithCargo,
      stdio: 'inherit',
    });
    const tauriDesktopExe = path.join(targetReleaseDir, 'arunaki-desktop.exe');
    if (fs.existsSync(tauriDesktopExe)) {
      fs.copyFileSync(tauriDesktopExe, desktopExePath);
      // tauriDesktopExe is already built with Windows GUI subsystem and embedded Tauri icon
    } else if (fs.existsSync(engineExePath)) {
      fs.copyFileSync(engineExePath, desktopExePath);
      setPeSubsystem(desktopExePath, 2);
      injectIcon(desktopExePath, mainIco);
    }

    if (fs.existsSync(engineExePath)) {
      // arunaki-engine.exe is the Console Daemon (Subsystem = 3) with the mechanical gear icon
      setPeSubsystem(engineExePath, 3);
      injectIcon(engineExePath, gearIco);
    }
    if (fs.existsSync(docsExePath)) {
      // arunaki-docs.exe is the Document Sidecar (Subsystem = 3) with the doc sheet + key icon
      setPeSubsystem(docsExePath, 3);
      injectIcon(docsExePath, docsIco);
    }
  } catch (err) {
    error('Step 2/3', `Failed to compile Rust binaries: ${err.message}`);
    process.exit(1);
  }

  // Step 3: Verify Integrity
  log('Step 3/3', 'Verifying standalone native bundle integrity...');
  const checks = [
    { name: 'Web Production Bundle (index.html)', path: path.join(webDistDir, 'index.html') },
    { name: 'Native Desktop Shell (arunaki.exe)', path: desktopExePath },
    { name: 'Native AI Engine (arunaki-engine.exe)', path: engineExePath },
    { name: 'Native Document Sidecar (arunaki-docs.exe)', path: docsExePath },
  ];

  let allOk = true;
  for (const c of checks) {
    const ok = fs.existsSync(c.path);
    if (!ok) allOk = false;
    const stat = ok ? fs.statSync(c.path) : null;
    const sizeInfo = stat ? (stat.isDirectory() ? 'DIR' : `${(stat.size / (1024 * 1024)).toFixed(2)} MB`) : 'MISSING';
    console.log(`  [${ok ? 'OK' : 'FAIL'}] ${c.name.padEnd(42)} (${sizeInfo})`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('====================================================');
  if (allOk) {
    const portableDir = path.join(rootDir, 'dist-portable');
    fs.mkdirSync(portableDir, { recursive: true });

    function safeCopy(src, dest) {
      try {
        fs.copyFileSync(src, dest);
      } catch (err) {
        if (err.code === 'EBUSY') {
          console.warn(`\x1b[33m[prepare-bundle:WARN]\x1b[0m File ${path.basename(dest)} is currently in use/locked. Close the running application to replace it.\x1b[0m`);
        } else {
          throw err;
        }
      }
    }

    safeCopy(desktopExePath, path.join(portableDir, 'arunaki.exe'));

    if (fs.existsSync(engineExePath)) {
      safeCopy(engineExePath, path.join(portableDir, 'arunaki-engine.exe'));
      setPeSubsystem(path.join(portableDir, 'arunaki-engine.exe'), 3);
      injectIcon(path.join(portableDir, 'arunaki-engine.exe'), gearIco);
    }
    if (fs.existsSync(docsExePath)) {
      safeCopy(docsExePath, path.join(portableDir, 'arunaki-docs.exe'));
      setPeSubsystem(path.join(portableDir, 'arunaki-docs.exe'), 3);
      injectIcon(path.join(portableDir, 'arunaki-docs.exe'), docsIco);
    }
    const portableWebDir = path.join(portableDir, 'web');
    fs.rmSync(portableWebDir, { recursive: true, force: true });
    fs.cpSync(webDistDir, portableWebDir, { recursive: true });

    // Refresh Windows Shell icon cache so Explorer updates instantly
    const refreshScript = path.join(rootDir, 'scripts', 'refresh-icon-cache.ps1');
    if (process.platform === 'win32' && fs.existsSync(refreshScript)) {
      try {
        execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${refreshScript}"`, { stdio: 'ignore' });
      } catch {}
    }

    log('Portable', `Assembled standalone portable bundle in: ${portableDir}`);
    console.log(`✨ NATIVE PORTABLE BUNDLE READY IN ${elapsed}s (0 Electron / Pure Native)`);
  } else {
    console.error('❌ BUNDLE VERIFICATION FAILED: Missing required files.');
    process.exit(1);
  }
}

main().catch((err) => {
  error('FATAL', err.message);
  process.exit(1);
});
