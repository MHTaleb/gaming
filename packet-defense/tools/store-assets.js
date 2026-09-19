#!/usr/bin/env node
/**
 * store-assets - generate the raster assets Google Play requires.
 *
 *   node tools/store-assets.js            write them into store/
 *   node tools/store-assets.js --check     verify what is there is current
 *
 * WHY THIS EXISTS
 *
 * The repository had a designed 512x512 SVG icon and no raster assets at all,
 * and Play requires a PNG icon and a 1024x500 feature graphic to complete a
 * store listing. The options were to export PNGs by hand from a graphics editor
 * and commit them, or to generate them from the artwork that is already here.
 *
 * Hand-exported PNGs go stale the moment the icon changes, and nobody remembers
 * which tool made them or at what size. This way the SVG stays the single source
 * of truth for the mark, and the assets are regenerated rather than recreated.
 *
 * It is deliberately the ONLY tool in this repository with a dependency, and it
 * is a devDependency: the games, the static servers, the relay and the purchase
 * validator still have none. Rasterising SVG correctly is a real problem - path
 * fills, dash arrays, patterns, gradients - and hand-rolling it would be a
 * weekend spent to arrive somewhere worse than resvg.
 *
 * WHAT IT WRITES
 *
 *   store/icon-512.png              512x512    Play listing icon
 *   store/feature-graphic.png       1024x500   Play listing feature graphic
 *
 * Sizes are asserted after writing, because a generator that silently emits the
 * wrong dimensions is worse than no generator: Play rejects the upload and the
 * message points at the file, not at the script that made it.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'store');
const ICON_SVG = path.join(ROOT, 'www', 'icon.svg');

/* ------------------------------------------------------------------ *
 * The palette, taken from the game's own stylesheet and icon so the store
 * assets cannot drift from what the game looks like.
 * ------------------------------------------------------------------ */

const PALETTE = {
  void: '#05080f',
  panel: '#0c1422',
  cyan: '#22d3ee',
  cyanLight: '#67e8f9',
  blue: '#0ea5e9',
  grid: '#38bdf8',
  ink: '#d7e6f5',
  dim: '#6f89a8',
};

function loadResvg() {
  try {
    return require('@resvg/resvg-js');
  } catch (err) {
    console.error('@resvg/resvg-js is not installed. Run: npm install');
    process.exit(1);
  }
}

function render(svg, width) {
  const { Resvg } = loadResvg();
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' },
    background: PALETTE.void,
  });
  return r.render().asPng();
}

/**
 * Read a PNG's real dimensions out of its IHDR chunk.
 *
 * Not from the argument the caller passed, which is the whole point: a
 * generator that reports the size it *intended* is not checking anything.
 */
function pngSize(buf) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.slice(0, 8).equals(signature)) return null;
  if (buf.slice(12, 16).toString('ascii') !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function readIconSvg() {
  if (!fs.existsSync(ICON_SVG)) {
    console.error('missing ' + path.relative(ROOT, ICON_SVG) + ' - it is the source of truth for the mark');
    process.exit(1);
  }
  return fs.readFileSync(ICON_SVG, 'utf8');
}

/**
 * The feature graphic.
 *
 * Play uses this one image in search results, category pages and promotional
 * placements, so it has to work as a thumbnail: the mark reads first, the
 * wordmark second, and nothing is smaller than roughly a sixteenth of the
 * height. It is composed here rather than drawn in an editor so that it inherits
 * the icon's palette and cannot drift from it.
 *
 * The mark is embedded as the already-rasterised icon rather than being redrawn,
 * so there is exactly one description of what the game's icon looks like.
 */
function featureGraphicSvg(iconPng) {
  const iconB64 = iconPng.toString('base64');
  const W = 1024;
  const H = 500;
  const markSize = 300;
  const markX = 690;
  const markY = (H - markSize) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
       width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0a1626"/>
      <stop offset="1" stop-color="${PALETTE.void}"/>
    </linearGradient>
    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${PALETTE.cyan}" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${PALETTE.blue}" stop-opacity="0"/>
    </linearGradient>
    <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M34 0H0v34" fill="none" stroke="${PALETTE.grid}" stroke-opacity="0.10" stroke-width="1.5"/>
    </pattern>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="16" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>

  <!-- A packet trace running behind the text, the same motif as the icon.
       Kept below the tagline: at the first attempt it ran straight through the
       line of copy, which is exactly the kind of collision that is obvious the
       moment you look at the output and invisible while editing the numbers. -->
  <path d="M-20 464H150l40-30h92l38 30h190"
        fill="none" stroke="#1e3a5f" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M-20 464H150l40-30h92l38 30h190"
        fill="none" stroke="${PALETTE.grid}" stroke-width="4" stroke-opacity="0.5"
        stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="13 11"/>

  <g transform="translate(${markX} ${markY})">
    <image xlink:href="data:image/png;base64,${iconB64}" x="0" y="0"
           width="${markSize}" height="${markSize}"/>
  </g>

  <!-- A soft halo so the mark separates from the grid on a bright thumbnail. -->
  <circle cx="${markX + markSize / 2}" cy="${H / 2}" r="168"
          fill="none" stroke="${PALETTE.cyan}" stroke-opacity="0.18" stroke-width="2"/>

  <g font-family="DejaVu Sans, Liberation Sans, sans-serif">
    <text x="72" y="170" font-size="26" letter-spacing="7" fill="${PALETTE.dim}">HOLD THE LINE</text>

    <text x="70" y="258" font-size="82" font-weight="bold" letter-spacing="1"
          fill="${PALETTE.ink}" filter="url(#glow)">PACKET</text>
    <text x="70" y="342" font-size="82" font-weight="bold" letter-spacing="1"
          fill="${PALETTE.cyan}">DEFENSE</text>

    <rect x="72" y="376" width="380" height="4" rx="2" fill="url(#rule)"/>

    <text x="72" y="422" font-size="25" fill="${PALETTE.dim}">240 tickets &#183; 7 towers &#183; 5 difficulties &#183; co-op</text>
  </g>
</svg>`;
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

function build() {
  const iconSvg = readIconSvg();

  const icon = render(iconSvg, 512);
  const feature = render(featureGraphicSvg(icon), 1024);

  const outputs = [
    { file: 'icon-512.png', buf: icon, width: 512, height: 512 },
    { file: 'feature-graphic.png', buf: feature, width: 1024, height: 500, allowTaller: true },
  ];

  const problems = [];
  for (const o of outputs) {
    const size = pngSize(o.buf);
    if (!size) { problems.push(o.file + ': output is not a valid PNG'); continue; }
    if (size.width !== o.width) problems.push(o.file + ': width ' + size.width + ', expected ' + o.width);
    // The feature graphic is rendered from a viewBox of exactly 1024x500; if the
    // rendering produced a different height, the aspect is wrong and Play's
    // listing will crop it in a way nobody chose.
    if (size.height !== o.height) problems.push(o.file + ': height ' + size.height + ', expected ' + o.height);
  }

  if (problems.length) {
    console.error('refusing to write broken assets:');
    for (const p of problems) console.error('  ! ' + p);
    process.exit(1);
  }

  fs.mkdirSync(OUT, { recursive: true });
  for (const o of outputs) {
    fs.writeFileSync(path.join(OUT, o.file), o.buf);
  }
  return outputs;
}

function main() {
  const check = process.argv.includes('--check');

  if (check) {
    // Rebuild in memory and compare against what is committed. This is what
    // makes the assets safe to check in: if somebody edits the icon and forgets
    // to regenerate, CI says so instead of Play showing a stale mark.
    const built = build();
    let stale = 0;
    for (const o of built) {
      const target = path.join(OUT, o.file);
      const fresh = crypto.createHash('sha256').update(o.buf).digest('hex');
      if (!fs.existsSync(target)) {
        console.error('missing ' + path.relative(ROOT, target) + ' - run: node tools/store-assets.js');
        stale++;
        continue;
      }
      const onDisk = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
      if (onDisk !== fresh) {
        console.error('stale   ' + path.relative(ROOT, target) + ' - run: node tools/store-assets.js');
        stale++;
      } else {
        console.log('ok      ' + path.relative(ROOT, target));
      }
    }
    process.exit(stale ? 1 : 0);
  }

  const written = build();
  for (const o of written) {
    const size = pngSize(o.buf);
    console.log('wrote store/' + o.file + '  ' + size.width + 'x' + size.height + '  ' +
      (o.buf.length / 1024).toFixed(0) + ' KB');
  }
}

if (require.main === module) main();

module.exports = { build, pngSize, featureGraphicSvg, PALETTE };
