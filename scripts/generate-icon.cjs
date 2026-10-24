const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');

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

async function generate() {
  const rootDir = path.join(__dirname, '..');
  const svgPath = path.join(rootDir, 'apps', 'web', 'public', 'arunakiLogo.svg');
  const outPath = path.join(rootDir, 'apps', 'web', 'public', 'icon.png');
  const icoPath = path.join(rootDir, 'crates', 'arunaki-engine', 'arunaki.ico');
  const icoDocsPath = path.join(rootDir, 'crates', 'arunaki-docs', 'arunaki.ico');

  if (!fs.existsSync(svgPath)) {
    console.error('[icon] arunakiLogo.svg not found at:', svgPath);
    process.exit(1);
  }

  const svg = fs.readFileSync(svgPath, 'utf8');
  console.log('[icon] Generating high-resolution icon from arunakiLogo.svg...');

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 1 });

  const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      width: 512px;
      height: 512px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
    }
    .squircle {
      width: 480px;
      height: 480px;
      background: radial-gradient(circle at 30% 30%, #1e1e24, #0d0d10);
      border: 2px solid #2a2a32;
      border-radius: 110px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
    }
    svg {
      width: 320px;
      height: 320px;
      fill: #e59344 !important;
      filter: drop-shadow(0 6px 16px rgba(229, 147, 68, 0.4));
    }
    path {
      fill: #e59344 !important;
    }
  </style>
</head>
<body>
  <div class="squircle">
    ${svg}
  </div>
</body>
</html>`;

  const rgbaPath = path.join(rootDir, 'crates', 'arunaki-engine', 'src', 'icon_64x64.rgba');

  await page.setContent(html);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await page.screenshot({ path: outPath, omitBackground: true });

  // Generate 64x64 raw RGBA for Tao Window Icon
  const page64 = await browser.newPage();
  await page64.setViewport({ width: 64, height: 64 });
  const html64 = `<!DOCTYPE html><html><body style="margin:0;background:transparent;"><canvas id="c" width="64" height="64"></canvas><script>
    const img = new Image();
    img.onload = () => {
      const c = document.getElementById('c');
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 2, 2, 60, 60);
      window.rgba = Array.from(ctx.getImageData(0, 0, 64, 64).data);
    };
    img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(${JSON.stringify(svg)});
  </script></body></html>`;
  await page64.setContent(html64);
  await page64.waitForFunction('window.rgba && window.rgba.length === 64*64*4');
  const rgba = await page64.evaluate(() => window.rgba);
  fs.writeFileSync(rgbaPath, Buffer.from(rgba));
  console.log('[icon] RGBA icon generated at:', rgbaPath);

  // Generate multi-size ICO for Windows File Explorer & Taskbar
  const sizes = [256, 128, 64, 48, 32, 16];
  const pngBuffers = [];
  const icoPage = await browser.newPage();
  for (const s of sizes) {
    await icoPage.setViewport({ width: s, height: s, deviceScaleFactor: 1 });
    const padding = Math.max(1, Math.round(s * 0.08));
    const iconSize = s - (padding * 2);
    const htmlIco = `<!DOCTYPE html><html><body style="margin:0;width:${s}px;height:${s}px;display:flex;align-items:center;justify-content:center;background:transparent;"><div style="width:${iconSize}px;height:${iconSize}px;display:flex;align-items:center;justify-content:center;">${svg}</div></body></html>`;
    await icoPage.setContent(htmlIco);
    const buf = await icoPage.screenshot({ omitBackground: true });
    pngBuffers.push({ size: s, buffer: buf });
  }
  const icoBuf = createIco(pngBuffers);
  fs.writeFileSync(icoPath, icoBuf);
  fs.writeFileSync(icoDocsPath, icoBuf);
  console.log('[icon] Windows .ico generated at:', icoPath);

  await browser.close();

  console.log('[icon] Icon successfully generated at:', outPath);
}

generate().catch((err) => {
  console.error('[icon] Failed to generate icon:', err);
  process.exit(1);
});
