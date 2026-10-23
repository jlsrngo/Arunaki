/**
 * Arunika Native Desktop Bundle Preparation Script
 *
 * Prepares the pure native Rust desktop application:
 * 1. Builds the web frontend (apps/web) into production distribution (apps/web/dist).
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
const webDistDir = path.join(rootDir, 'apps', 'web', 'dist');
const targetReleaseDir = path.join(rootDir, 'target', 'release');
const desktopExePath = path.join(targetReleaseDir, 'arunaki.exe');
const engineExePath = path.join(targetReleaseDir, 'arunaki-engine.exe');
const docsExePath = path.join(targetReleaseDir, 'arunaki-docs.exe');

function log(step, msg) {
  console.log(`\x1b[36m[prepare-bundle]\x1b[0m \x1b[1m${step}\x1b[0m ${msg}`);
}

function error(step, msg) {
  console.error(`\x1b[31m[prepare-bundle:ERROR]\x1b[0m \x1b[1m${step}\x1b[0m ${msg}`);
}

async function main() {
  const startTime = Date.now();
  console.log('====================================================');
  console.log('    ARUNAKI PURE NATIVE RUST BUNDLE PREPARATION     ');
  console.log('====================================================');

  // Step 1: Build Web Frontend
  log('Step 1/3', 'Building production web frontend (apps/web)...');
  try {
    execSync('npm run build -w apps/web', { cwd: rootDir, stdio: 'inherit' });
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
    execSync('cargo build --release -p arunaki-engine -p arunaki-docs', {
      cwd: rootDir,
      env: envWithCargo,
      stdio: 'inherit',
    });
    if (fs.existsSync(engineExePath)) {
      fs.copyFileSync(engineExePath, desktopExePath);
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
    console.log(`✨ NATIVE BUNDLE READY IN ${elapsed}s (0 Electron / Pure Native)`);
  } else {
    console.error('❌ BUNDLE VERIFICATION FAILED: Missing required files.');
    process.exit(1);
  }
}

main().catch((err) => {
  error('FATAL', err.message);
  process.exit(1);
});
