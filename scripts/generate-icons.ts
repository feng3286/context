import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Jimp } from 'jimp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ASSETS = join(ROOT, 'src/assets/images/emdash');
const SOURCE = join(ROOT, 'Gemini_Generated_Image_6zntsi6zntsi6znt.png');

const DARK_BG = { r: 0x1a, g: 0x1a, b: 0x2e, a: 0xff };
const WHITE_BG = { r: 0xff, g: 0xff, b: 0xff, a: 0xff };

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

  // Make white background transparent
  const srcData = source.bitmap.data;
  for (let i = 0; i < srcData.length; i += 4) {
    if (srcData[i] > 240 && srcData[i + 1] > 240 && srcData[i + 2] > 240) {
      srcData[i + 3] = 0; // transparent
    }
  }

  const srcW = source.width;
  const srcH = source.height;

  function makeIcon(size: number, bgColor: typeof DARK_BG) {
    const padding = size * 0.05;
    const fitSize = size - padding * 2;
    const logo = source.clone().scaleToFit({ w: Math.round(fitSize), h: Math.round(fitSize) });
    const canvas = new Jimp({ width: size, height: size });
    fillColor(canvas, bgColor);
    const ox = Math.round((size - logo.width) / 2);
    const oy = Math.round((size - logo.height) / 2);
    canvas.composite(logo, ox, oy);
    return canvas;
  }

  // 1. app-icon-beta.png
  const appIcon = makeIcon(1024, DARK_BG);
  await appIcon.write(join(ASSETS, 'app-icon-beta.png'));
  console.log('  app-icon-beta.png ✓');

  // 2. icon-dock.png
  await appIcon.clone().write(join(ASSETS, 'icon-dock.png'));
  console.log('  icon-dock.png ✓');

  // 3. icon-light.png
  await makeIcon(1024, DARK_BG).write(join(ASSETS, 'icon-light.png'));
  console.log('  icon-light.png ✓');

  // 4. icon-dark.png
  await makeIcon(1024, WHITE_BG).write(join(ASSETS, 'icon-dark.png'));
  console.log('  icon-dark.png ✓');

  // 4b. emdash_logo.png (window icon, dev mode)
  await makeIcon(256, WHITE_BG).write(join(ASSETS, 'emdash_logo.png'));
  console.log('  emdash_logo.png ✓');

  // 5. iconset
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
    await makeIcon(s, DARK_BG).write(join(iconsetDir, name));
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
