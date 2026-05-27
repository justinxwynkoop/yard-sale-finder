#!/usr/bin/env node
// Generate all Trove icon + splash PNG assets from inline SVG.
// Run with: npm run icons:generate
//
// Why inline SVG: keeps the brand mark editable in this one file, no
// design tool needed for tweaks. Source of truth for icon + adaptive
// foreground + splash glyph + favicon.

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = resolve(__dirname, '..', 'assets');

const BRAND = '#F97316'; // orange-500
const BRAND_LIGHT = '#FFEDD5'; // orange-50

// Ionicons-inspired pricetag glyph centered on the canvas, white-on-brand.
// viewBox 1024×1024 so we can render at any size cleanly.
function tagGlyph({
  size = 1024,
  bg = BRAND,
  tagFill = '#FFFFFF',
  holeFill = BRAND,
  /**
   * How much of the canvas the glyph fills (0..1). The pricetag path
   * has internal padding, so 0.85 still leaves some breathing room.
   */
  fill = 0.7,
  rotate = -12,
}) {
  const outer = 1024;
  // Path's natural bounding box inside its 512 viewBox: roughly
  // x: 29..414 (width 385), y: 46..427 (height 381). Average dim 383.
  const pathBoxSize = 383;
  const pathCenterX = (29 + 414) / 2; // 221.5
  const pathCenterY = (46 + 427) / 2; // 236.5
  const targetSize = outer * fill;
  const scale = targetSize / pathBoxSize;
  // Translate so the path's natural center maps to the canvas center.
  const tx = outer / 2 - pathCenterX * scale;
  const ty = outer / 2 - pathCenterY * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${outer} ${outer}">
  ${bg ? `<rect width="${outer}" height="${outer}" fill="${bg}"/>` : ''}
  <g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)}) rotate(${rotate} ${pathCenterX} ${pathCenterY})">
    <path d="M403.16 92.83a32.07 32.07 0 0 0-14.05-14.06l-32-16A32.09 32.09 0 0 0 344.78 46H184a23.94 23.94 0 0 0-17 7L29 191a40 40 0 0 0 11 46.65L218.34 416A40.07 40.07 0 0 0 265 427L407 289a23.94 23.94 0 0 0 7-17V103.22A31.85 31.85 0 0 0 403.16 92.83Z"
          fill="${tagFill}"
          stroke="${tagFill}"
          stroke-width="8"
          stroke-linejoin="round"/>
    <circle cx="296" cy="152" r="32" fill="${holeFill}"/>
  </g>
</svg>`;
}

// iOS icon — opaque, full-bleed brand. No transparency, no rounded corners.
const ICON_SVG = tagGlyph({ bg: BRAND, fill: 0.62 });

// Android adaptive icon foreground — transparent bg, glyph at ~55% so
// Android's circular / squircle mask doesn't crop it. Background color
// comes from app.json android.adaptiveIcon.backgroundColor.
const ADAPTIVE_FG_SVG = tagGlyph({
  bg: null,
  tagFill: BRAND,
  holeFill: BRAND_LIGHT,
  fill: 0.55,
});

// Splash glyph — brand-orange tag on the brand-light splash bg
// (configured in app.json's expo-splash-screen plugin).
const SPLASH_SVG = tagGlyph({
  bg: null,
  tagFill: BRAND,
  holeFill: BRAND_LIGHT,
  fill: 0.9,
});

// Favicon — single-color brand mark.
const FAVICON_SVG = tagGlyph({ bg: BRAND, fill: 0.7 });

async function render(svg, file, width, height = width) {
  const out = resolve(assetsDir, file);
  await sharp(Buffer.from(svg), { density: 384 })
    .resize(width, height)
    .png()
    .toFile(out);
  console.log(`wrote ${file} (${width}x${height})`);
}

async function main() {
  await render(ICON_SVG, 'icon.png', 1024);
  await render(ADAPTIVE_FG_SVG, 'adaptive-icon.png', 1024);
  await render(SPLASH_SVG, 'splash-icon.png', 400);
  await render(FAVICON_SVG, 'favicon.png', 48);
  console.log('done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
