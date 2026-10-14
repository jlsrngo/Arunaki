/**
 * Arunika Desktop Bundle Preparation Script
 *
 * Prepares the desktop application for standalone packaging:
 * 1. Builds the web frontend (apps/web) into production distribution.
 * 2. Copies the built web bundle into apps/desktop/web.
 * 3. Compiles the AI engine backend into standalone native executable (apps/desktop/resources/engine.exe).
 * 4. Ensures app icon is present in apps/desktop/resources/icon.png.
 * 5. Verifies all packaging requirements are met.
 */
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.join(__dirname, '..');
const desktopDir = path.join(rootDir, 'apps', 'desktop');
const webDistDir = path.join(rootDir, 'apps', 'web', 'dist');
const desktopWebDir = path.join(desktopDir, 'web');
const desktopResourcesDir = path.join(desktopDir, 'resources');
const engineExePath = path.join(desktopResourcesDir, 'engine.exe');
const iconPath = path.join(desktopResourcesDir, 'icon.png');

function log(step, msg) {
  console.log(`\x1b[36m[prepare-bundle]\x1b[0m \x1b[1m${step}\x1b[0m ${msg}`);
}

function error(step, msg) {
  console.error(`\x1b[31m[prepare-bundle:ERROR]\x1b[0m \x1b[1m${step}\x1b[0m ${msg}`);
}

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursiveSync(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

async function main() {
  const startTime = Date.now();
  console.log('====================================================');
  console.log('       ARUNAKI DESKTOP BUNDLE PREPARATION           ');
  console.log('====================================================');

  // Step 1: Build Web Frontend
  log('Step 1/4', 'Building production web frontend (apps/web)...');
  try {
    execSync('npm run build -w apps/web', { cwd: rootDir, stdio: 'inherit' });
  } catch (err) {
    error('Step 1/4', 'Web build failed.');
    process.exit(1);
  }

  // Step 2: Sync Web Bundle to apps/desktop/web
  log('Step 2/4', 'Syncing built assets to apps/desktop/web...');
  try {
    if (fs.existsSync(desktopWebDir)) {
      fs.rmSync(desktopWebDir, { recursive: true, force: true });
    }
    fs.mkdirSync(desktopWebDir, { recursive: true });
    copyRecursiveSync(webDistDir, desktopWebDir);
    const indexCheck = path.join(desktopWebDir, 'index.html');
    if (!fs.existsSync(indexCheck)) {
      throw new Error('index.html not found in synced web bundle');
    }
    log('Step 2/4', `Synced web bundle successfully (${fs.readdirSync(desktopWebDir).length} top-level entries).`);
  } catch (err) {
    error('Step 2/4', `Failed to sync web bundle: ${err.message}`);
    process.exit(1);
  }

  // Step 3: Compile AI Engine into Standalone Executable
  log('Step 3/4', 'Compiling AI engine into standalone native binary (Bun)...');
  try {
    fs.mkdirSync(desktopResourcesDir, { recursive: true });
    const engineEntry = path.join(rootDir, 'packages', 'engine', 'engine', 'src', 'serve-only.ts');
    execSync(`bun build --compile "${engineEntry}" --outfile "${engineExePath}"`, {
      cwd: rootDir,
      stdio: 'inherit',
    });
    if (!fs.existsSync(engineExePath)) {
      throw new Error('engine.exe was not created');
    }
    const stat = fs.statSync(engineExePath);
    const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
    log('Step 3/4', `Successfully compiled engine.exe (${sizeMb} MB) to apps/desktop/resources/engine.exe`);
  } catch (err) {
    error('Step 3/4', `Failed to compile engine binary: ${err.message}`);
    process.exit(1);
  }

  // Step 4: Ensure App Icon
  log('Step 4/4', 'Verifying application icon...');
  if (!fs.existsSync(iconPath)) {
    try {
      execSync('node scripts/generate-icon.cjs', { cwd: rootDir, stdio: 'inherit' });
    } catch (err) {
      console.warn('[prepare-bundle] Warning: Could not generate icon, proceeding with defaults.');
    }
  }
  if (fs.existsSync(iconPath)) {
    log('Step 4/4', 'Icon verified at apps/desktop/resources/icon.png');
  }

  // Final Verification
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('----------------------------------------------------');
  console.log('             BUNDLE INTEGRITY CHECK                 ');
  console.log('----------------------------------------------------');
  const checks = [
    { name: 'Desktop Main Process', path: path.join(desktopDir, 'main.cjs') },
    { name: 'Desktop Preload Script', path: path.join(desktopDir, 'preload.cjs') },
    { name: 'Desktop Web Bundle (index.html)', path: path.join(desktopWebDir, 'index.html') },
    { name: 'Desktop Engine Executable (engine.exe)', path: engineExePath },
    { name: 'Desktop Icon (icon.png)', path: iconPath },
  ];

  let allOk = true;
  for (const c of checks) {
    const ok = fs.existsSync(c.path);
    if (!ok) allOk = false;
    const stat = ok ? fs.statSync(c.path) : null;
    const sizeInfo = stat ? (stat.isDirectory() ? 'DIR' : `${(stat.size / 1024).toFixed(1)} KB`) : 'MISSING';
    console.log(`  [${ok ? 'OK' : 'FAIL'}] ${c.name.padEnd(38)} (${sizeInfo})`);
  }

  console.log('====================================================');
  if (allOk) {
    console.log(`✨ BUNDLE PREPARATION COMPLETE (${elapsed}s)`);
    console.log('Arunaki desktop is now fully self-contained and ready for packaging!');
  } else {
    console.error('❌ BUNDLE PREPARATION INCOMPLETE: Missing required files.');
    process.exit(1);
  }
}

main().catch((err) => {
  error('FATAL', err.message);
  process.exit(1);
});
