// Generate the iOS dark + tinted app-icon variants (iOS 18 appearance
// icons) from the transparent Trove artwork (assets/splash-icon.png).
// Run with: node scripts/generate-dark-icon.mjs
//
// Wired in app.json under ios.icon = { light, dark, tinted }. The light
// icon is assets/icon.png (artwork on the bone background). Changing the
// artwork? Re-run this to refresh the dark/tinted variants.
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = resolve(__dirname, '..', 'assets');
const SIZE = 1024;
const ART_RATIO = 0.78; // matches the light icon's breathing room
const art = resolve(assetsDir, 'splash-icon.png');

async function placed(buf) {
  const meta = await sharp(buf).metadata();
  return {
    input: buf,
    left: Math.round((SIZE - meta.width) / 2),
    top: Math.round((SIZE - meta.height) / 2),
  };
}

async function main() {
  const targetW = Math.round(SIZE * ART_RATIO);

  // Dark: artwork on warm near-black. The green wordmark and warm
  // furniture both read clearly against #1A1714.
  const artBuf = await sharp(art).resize({ width: targetW }).toBuffer();
  await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: '#1A1714' },
  })
    .composite([await placed(artBuf)])
    .png()
    .toFile(resolve(assetsDir, 'icon-dark.png'));
  console.log('wrote icon-dark.png');

  // Tinted: grayscale artwork on black; iOS recolors by luminance.
  const grayBuf = await sharp(art)
    .resize({ width: targetW })
    .grayscale()
    .modulate({ brightness: 1.25 })
    .toBuffer();
  await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: '#000000' },
  })
    .composite([await placed(grayBuf)])
    .png()
    .toFile(resolve(assetsDir, 'icon-tinted.png'));
  console.log('wrote icon-tinted.png');
  console.log('done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
