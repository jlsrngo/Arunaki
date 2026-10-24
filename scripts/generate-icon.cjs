const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');

async function generate() {
  const rootDir = path.join(__dirname, '..');
  const svgPath = path.join(rootDir, 'apps', 'web', 'public', 'arunakiLogo.svg');
  const outPath = path.join(rootDir, 'apps', 'web', 'public', 'icon.png');

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

  await browser.close();

  console.log('[icon] Icon successfully generated at:', outPath);
}

generate().catch((err) => {
  console.error('[icon] Failed to generate icon:', err);
  process.exit(1);
});
