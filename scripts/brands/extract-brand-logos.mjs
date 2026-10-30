// Cuts individual brand logos out of the existing brand strips (public/brands/brand-strip-0N.png, the artwork used by
// the homepage carousel) into public/brands/logos/<slug>.png for the Brands page. Each strip holds 5 logos side by
// side on a near-white background: columns are segmented by content, each logo is trimmed with a small margin and
// written at its original resolution (never upscaled). The strips themselves are not changed.
// Run: node scripts/brands/extract-brand-logos.mjs
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const OUT = "public/brands/logos";
// Position of each logo in its strip (left to right). Logos of brands not on the Brands page are skipped.
const STRIPS = {
  1: ["o-general", "mitsubishi-electric", "lg", "samsung", "panasonic"],
  2: ["midea", "carrier", "gree", "haier", "hitachi"],
  3: ["hisense", "toshiba", "tcl", null, null],
  4: [null, "akai", "nikai", null, null],
  5: ["prestige", null, "kenwood", null, null],
  6: [null, "afra", null, null, null],
};
const MIN_GAP = 40; // px of empty columns between two logos
const MARGIN = 6;

mkdirSync(OUT, { recursive: true });
for (const [n, slugs] of Object.entries(STRIPS)) {
  const file = `public/brands/brand-strip-0${n}.png`;
  const { data, info } = await sharp(file).flatten({ background: "#ffffff" }).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const ink = (x, y) => { const i = (y * width + x) * channels; return Math.min(data[i], data[i + 1], data[i + 2]) < 225; };
  const colHasInk = Array.from({ length: width }, (_, x) => { for (let y = 0; y < height; y++) if (ink(x, y)) return true; return false; });
  const runs = []; let start = -1, lastInk = -1;
  for (let x = 0; x < width; x++) {
    if (!colHasInk[x]) continue;
    if (start < 0) start = x; else if (x - lastInk > MIN_GAP) { runs.push([start, lastInk]); start = x; }
    lastInk = x;
  }
  if (start >= 0) runs.push([start, lastInk]);
  if (runs.length !== slugs.length) throw new Error(`${file}: found ${runs.length} logos, expected ${slugs.length}`);
  for (const [i, [x0, x1]] of runs.entries()) {
    const slug = slugs[i];
    if (!slug) continue;
    let y0 = height, y1 = -1;
    for (let y = 0; y < height; y++) for (let x = x0; x <= x1; x++) if (ink(x, y)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); break; }
    const left = Math.max(0, x0 - MARGIN), top = Math.max(0, y0 - MARGIN);
    const w = Math.min(width, x1 + MARGIN + 1) - left, h = Math.min(height, y1 + MARGIN + 1) - top;
    // The strips sit on an off-white (#fdfdfd) background; make near-white pixels pure white so the logo blends into
    // the white cards instead of showing a faint box.
    const crop = await sharp(file).extract({ left, top, width: w, height: h }).flatten({ background: "#ffffff" }).raw().toBuffer({ resolveWithObject: true });
    const px = crop.data;
    for (let p = 0; p < px.length; p += crop.info.channels) if (px[p] > 246 && px[p + 1] > 246 && px[p + 2] > 246) px[p] = px[p + 1] = px[p + 2] = 255;
    await sharp(px, { raw: crop.info }).png({ compressionLevel: 9 }).toFile(`${OUT}/${slug}.png`);
    console.log(`${slug}.png ${w}x${h}`);
  }
}
