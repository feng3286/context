import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Jimp } from 'jimp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ASSETS = join(ROOT, 'src/assets/images/emdash');
const SOURCE = join(ROOT, 'Gemini_Generated_Image_6zntsi6zntsi6znt.png');

const DARK_BG = { r: 0x1a, g: 0x1a, b: 0x2e, a: 0xff };

function fillColor(image: Jimp, c: typeof DARK_BG) {
  const d = image.bitmap.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = c.r;
    d[i + 1] = c.g;
    d[i + 2] = c.b;
    d[i + 3] = c.a;
  }
}

async function main() {
  console.log('Reading source logo...');
  const sourceBuffer = readFileSync(SOURCE);
  const source = await Jimp.read(sourceBuffer);

  // Make white background transparent, then auto-crop to logo bounds
  const srcData = source.bitmap.data;
  for (let i = 0; i < srcData.length; i += 4) {
    if (srcData[i] > 240 && srcData[i + 1] > 240 && srcData[i + 2] > 240) {
      srcData[i + 3] = 0; // transparent
    }
  }

  // Find bounding box of non-transparent pixels
  const w = source.width;
  const h = source.height;
  let minX = w,
    minY = h,
    maxX = 0,
    maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (srcData[idx + 3] > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  const cropped = source.clone().crop({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });

  function makeIcon(size: number, transparent: boolean) {
    const padding = size * 0.02;
    const fitSize = size - padding * 2;
    const logo = cropped.clone().scaleToFit({ w: Math.round(fitSize), h: Math.round(fitSize) });
    const canvas = new Jimp({ width: size, height: size });
    if (!transparent) fillColor(canvas, DARK_BG);
    const ox = Math.round((size - logo.width) / 2);
    const oy = Math.round((size - logo.height) / 2);
    canvas.composite(logo, ox, oy);
    return canvas;
  }

  // 1. app-icon-beta.png (transparent)
  const appIcon = makeIcon(1024, true);
  await appIcon.write(join(ASSETS, 'app-icon-beta.png'));
  console.log('  app-icon-beta.png ✓');

  // 2. icon-dock.png (transparent)
  await appIcon.clone().write(join(ASSETS, 'icon-dock.png'));
  console.log('  icon-dock.png ✓');

  // 3. icon-light.png (transparent)
  await makeIcon(1024, true).write(join(ASSETS, 'icon-light.png'));
  console.log('  icon-light.png ✓');

  // 4. icon-dark.png (transparent)
  await makeIcon(1024, true).write(join(ASSETS, 'icon-dark.png'));
  console.log('  icon-dark.png ✓');

  // 4b. emdash_logo.png (transparent)
  await makeIcon(256, true).write(join(ASSETS, 'emdash_logo.png'));
  console.log('  emdash_logo.png ✓');

  // 5. iconset (macOS iconset needs solid bg)
  const iconsetDir = join(ASSETS, 'emdash-beta.iconset');
  if (!existsSync(iconsetDir)) mkdirSync(iconsetDir, { recursive: true });

  const specs: [string, number][] = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024],
  ];

  for (const [name, s] of specs) {
    await makeIcon(s, false).write(join(iconsetDir, name));
    console.log(`  ${name} ✓`);
  }

  console.log(
    '\n.icns: Run on macOS: iconutil -c icns src/assets/images/emdash/emdash-beta.iconset -o src/assets/images/emdash/emdash-beta.icns'
  );
  console.log('Done!');
}

function roundCorners(image: Jimp, r: number) {
  const w = image.width;
  const h = image.height;
  const blank = 0x00000000;

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let inCorner = false;
      if (x < r && y < r) {
        inCorner = Math.hypot(x - r, y - r) > r;
      } else if (x >= w - r && y < r) {
        inCorner = Math.hypot(x - (w - r), y - r) > r;
      } else if (x < r && y >= h - r) {
        inCorner = Math.hypot(x - r, y - (h - r)) > r;
      } else if (x >= w - r && y >= h - r) {
        inCorner = Math.hypot(x - (w - r), y - (h - r)) > r;
      }
      if (inCorner) {
        image.setPixelColor(blank, x, y);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
