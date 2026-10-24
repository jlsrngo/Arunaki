const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');

const ACCENT_COLOR = '#cf6613'; // Darker, rich warm burnt orange
const GLOW_COLOR = 'rgba(207, 102, 19, 0.45)';

function createIco(pngBuffers) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type icon
  header.writeUInt16LE(count, 4);

  let offset = 6 + (16 * count);
  const entries = [];
  for (const item of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(item.size >= 256 ? 0 : item.size, 0);
    entry.writeUInt8(item.size >= 256 ? 0 : item.size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(item.buffer.length, 8); // size
    entry.writeUInt32LE(offset, 12); // offset
    entries.push(entry);
    offset += item.buffer.length;
  }

  return Buffer.concat([header, ...entries, ...pngBuffers.map(p => p.buffer)]);
}

async function renderIcoFromSvg(browser, svgInner, isStroke, outPath) {
  const sizes = [256, 128, 64, 48, 32, 16];
  const pngBuffers = [];
  const page = await browser.newPage();

  for (const s of sizes) {
    await page.setViewport({ width: s, height: s, deviceScaleFactor: 1 });
    const padding = Math.max(1, Math.round(s * 0.06));
    const iconSize = s - (padding * 2);
    const squircleRadius = Math.round(s * 0.22);
    const borderWidth = Math.max(1, Math.round(s * 0.015));

    const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: ${s}px;
      height: ${s}px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
    }
    .squircle {
      width: ${iconSize}px;
      height: ${iconSize}px;
      background: radial-gradient(circle at 32% 28%, #202028, #0c0c10);
      border: ${borderWidth}px solid #2e2e38;
      box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.08);
      border-radius: ${squircleRadius}px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .inner {
      width: ${Math.round(iconSize * 0.62)}px;
      height: ${Math.round(iconSize * 0.62)}px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    svg {
      width: 100%;
      height: 100%;
      ${isStroke ? `stroke: ${ACCENT_COLOR} !important;` : `fill: ${ACCENT_COLOR} !important;`}
      filter: drop-shadow(0 ${Math.max(1, Math.round(s * 0.015))}px ${Math.max(2, Math.round(s * 0.04))}px ${GLOW_COLOR});
    }
    path, circle {
      ${isStroke ? `stroke: ${ACCENT_COLOR} !important;` : `fill: ${ACCENT_COLOR} !important;`}
    }
  </style>
</head>
<body>
  <div class="squircle">
    <div class="inner">
      ${svgInner}
    </div>
  </div>
</body>
</html>`;

    await page.setContent(html);
    const buf = await page.screenshot({ omitBackground: true });
    pngBuffers.push({ size: s, buffer: buf });
  }

  await page.close();
  const icoBuf = createIco(pngBuffers);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, icoBuf);
  console.log('[icon] Generated:', outPath);
}

async function generate() {
  const rootDir = path.join(__dirname, '..');
  const svgPath = path.join(rootDir, 'apps', 'public', 'arunakiLogo.svg');
  const outPngPath = path.join(rootDir, 'apps', 'public', 'icon.png');
  const mainIcoPath = path.join(rootDir, 'core', 'arunaki-engine', 'arunaki.ico');
  const gearIcoPath = path.join(rootDir, 'core', 'arunaki-engine', 'gear.ico');
  const docsIcoPath = path.join(rootDir, 'core', 'arunaki-docs', 'arunaki.ico');

  if (!fs.existsSync(svgPath)) {
    console.error('[icon] arunakiLogo.svg not found at:', svgPath);
    process.exit(1);
  }

  const brandSvg = fs.readFileSync(svgPath, 'utf8');

  // Mechanical Engine Gear SVG for backend daemon
  const gearSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${ACCENT_COLOR}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
    <circle cx="12" cy="12" r="3.2"/>
  </svg>`;

  // Document File Sheet + Key SVG for Docs sidecar
  const docKeySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${ACCENT_COLOR}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <path d="M14 2v6h6"/>
    <circle cx="10" cy="15" r="2.2"/>
    <path d="m11.6 13.4 3.9-3.9"/>
    <path d="m14.2 10.8 1.2 1.2"/>
    <path d="m12.7 12.3 1.2 1.2"/>
  </svg>`;

  console.log('[icon] Launching browser to generate macOS squircle icons with darker orange (#cf6613)...');
  const browser = await puppeteer.launch({ headless: true });

  // 1. High-res 512x512 PNG for Window and UI
  const page512 = await browser.newPage();
  await page512.setViewport({ width: 512, height: 512, deviceScaleFactor: 1 });
  const html512 = `<!DOCTYPE html><html><head><style>
    * { box-sizing: border-box; margin:0; padding:0; }
    body { width: 512px; height: 512px; display: flex; align-items: center; justify-content: center; background: transparent; }
    .squircle { width: 480px; height: 480px; background: radial-gradient(circle at 32% 28%, #202028, #0c0c10); border: 4px solid #2e2e38; border-radius: 108px; display: flex; align-items: center; justify-content: center; box-shadow: 0 20px 48px rgba(0,0,0,0.6), inset 0 2px 2px rgba(255,255,255,0.08); }
    svg { width: 310px; height: 310px; fill: ${ACCENT_COLOR} !important; filter: drop-shadow(0 6px 18px ${GLOW_COLOR}); }
    path { fill: ${ACCENT_COLOR} !important; }
  </style></head><body><div class="squircle">${brandSvg}</div></body></html>`;
  await page512.setContent(html512);
  await page512.screenshot({ path: outPngPath, omitBackground: true });
  await page512.close();

  // 64x64 RGBA for Tao Window
  const page64 = await browser.newPage();
  await page64.setViewport({ width: 64, height: 64 });
  const html64 = `<!DOCTYPE html><html><body style="margin:0;background:transparent;"><canvas id="c" width="64" height="64"></canvas><script>
    const img = new Image();
    img.onload = () => {
      const c = document.getElementById('c');
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, 64, 64);
      window.rgba = Array.from(ctx.getImageData(0, 0, 64, 64).data);
    };
    img.src = 'data:image/png;base64,' + ${JSON.stringify(fs.readFileSync(outPngPath).toString('base64'))};
  </script></body></html>`;
  await page64.setContent(html64);
  await page64.waitForFunction('window.rgba && window.rgba.length === 64*64*4');
  const rgba = await page64.evaluate(() => window.rgba);
  const rgbaPath = path.join(rootDir, 'core', 'arunaki-engine', 'src', 'icon_64x64.rgba');
  fs.writeFileSync(rgbaPath, Buffer.from(rgba));
  await page64.close();

  // 2. Main App Icon (Arunaki Brand Logo in macOS dark squircle)
  console.log('[icon] Generating arunaki.ico (Main App Desktop)...');
  await renderIcoFromSvg(browser, brandSvg, false, mainIcoPath);

  // 3. Engine Daemon Icon (Mechanical Gear in macOS dark squircle)
  console.log('[icon] Generating gear.ico (Backend Engine CLI)...');
  await renderIcoFromSvg(browser, gearSvg, true, gearIcoPath);

  // 4. Docs Sidecar Icon (Document Sheet + Key in macOS dark squircle)
  console.log('[icon] Generating arunaki-docs.ico (Document Extraction Sidecar)...');
  await renderIcoFromSvg(browser, docKeySvg, true, docsIcoPath);

  await browser.close();
  console.log('✨ All 3 distinct macOS-style squircle icons generated successfully!');
}

generate().catch((err) => {
  console.error('[icon] Generation error:', err);
  process.exit(1);
});
