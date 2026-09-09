/**
 * Generates every PWA icon in `public/icons/` from one mark defined here.
 *
 * Run on demand, not during the build:
 *
 *     node apps/web/scripts/generate-icons.mjs
 *
 * The PNGs are checked in. Rasterising at build time would put an image
 * pipeline (and a native dependency) on the critical path of `next build` to
 * produce six files that change roughly never, and installability would then
 * depend on that pipeline succeeding on every deployment target.
 *
 * `sharp` is resolved from the workspace install — Next ships it for image
 * optimisation — and is deliberately *not* a declared dependency of the app: no
 * application code imports it. If the resolution ever fails, install it once
 * with `pnpm dlx` rather than adding it to `apps/web/package.json`.
 *
 * Two shapes, because the two are read differently:
 *
 * - `purpose: "any"` is drawn as-is by the platform, so it carries its own
 *   rounded-square plate.
 * - `purpose: "maskable"` is cropped by the platform to a shape it chooses, so
 *   it is full-bleed and keeps the mark inside the 80%-diameter safe circle the
 *   spec guarantees (a 280px mark on a 512px canvas: its corners sit 198px from
 *   centre, inside the 205px radius).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

/** `--primary` in the light theme, as sRGB. See packages/ui/src/styles/globals.css. */
const PLATE = "#545cdf";
const MARK = "#ffffff";

/**
 * A line rising through two steps, in a 100×100 box. Momentum is progress over
 * a week; the mark is that, and nothing else. Round caps and joins so it stays
 * a single continuous gesture at 16px.
 */
function mark(size) {
  const scale = size / 100;
  return `
    <g transform="scale(${scale})" fill="none" stroke="${MARK}"
       stroke-width="13" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10 76 L38 48 L56 66 L90 26" />
      <path d="M66 26 L90 26 L90 50" />
    </g>`;
}

/** The mark centred on a canvas of `canvas`px, at `size`px. */
function centred(canvas, size) {
  const offset = (canvas - size) / 2;
  return `<g transform="translate(${offset} ${offset})">${mark(size)}</g>`;
}

function anySvg(canvas = 512) {
  // 22.5% corner radius: the plate reads as an app tile without becoming a pill.
  const radius = canvas * 0.225;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">
  <rect width="${canvas}" height="${canvas}" rx="${radius}" ry="${radius}" fill="${PLATE}"/>
  ${centred(canvas, canvas * 0.586)}
</svg>`;
}

function maskableSvg(canvas = 512) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">
  <rect width="${canvas}" height="${canvas}" fill="${PLATE}"/>
  ${centred(canvas, canvas * 0.547)}
</svg>`;
}

/**
 * iOS applies its own corner radius and never a circular mask, so the tile is
 * full-bleed like the maskable one but may use the larger mark.
 */
function appleSvg(canvas = 180) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">
  <rect width="${canvas}" height="${canvas}" fill="${PLATE}"/>
  ${centred(canvas, canvas * 0.586)}
</svg>`;
}

const targets = [
  { file: "icon-96.png", svg: anySvg(), size: 96 },
  { file: "icon-192.png", svg: anySvg(), size: 192 },
  { file: "icon-512.png", svg: anySvg(), size: 512 },
  { file: "icon-maskable-192.png", svg: maskableSvg(), size: 192 },
  { file: "icon-maskable-512.png", svg: maskableSvg(), size: 512 },
  { file: "apple-touch-icon.png", svg: appleSvg(), size: 180 },
];

await mkdir(OUT, { recursive: true });

// The vector source ships too: Safari's pinned-tab and any future size come
// from this file rather than from an upscaled PNG.
await writeFile(join(OUT, "icon.svg"), `${anySvg()}\n`, "utf8");
await writeFile(join(OUT, "icon-maskable.svg"), `${maskableSvg()}\n`, "utf8");

for (const { file, svg, size } of targets) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, file));
  console.log(`wrote icons/${file} (${size}×${size})`);
}
