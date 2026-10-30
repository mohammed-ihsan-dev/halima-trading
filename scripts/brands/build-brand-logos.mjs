// Builds public/brands/logos/<slug>.(svg|png) for the Brands page from downloaded original logo files.
// Sources and per-logo notes: scripts/brands/brand-logo-sources.json (download each "file" into <originals>/<slug>.<ext>).
//
// Processing never redraws or recolours a logo:
//   SVG    -> active content stripped (scripts, event handlers, foreignObject, metadata, comments); the root viewBox is
//             tightened to the drawn content (measured by rendering), so every logo fills its card the same way.
//   raster -> transparent/white margins trimmed; written as lossless PNG at the original resolution (never upscaled).
//   "hideRect" [x, y, w, h] (SVG viewBox units) hides a separate tagline with a clip path — the logo's own shapes are
//   untouched; "keepLeftUntilGap" drops a separate badge to the right of a raster logo (see the manifest notes).
// Run: node scripts/brands/build-brand-logos.mjs <originals-dir>
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const ORIG = process.argv[2];
if (!ORIG) throw new Error("usage: build-brand-logos.mjs <originals-dir>");
const OUT = "public/brands/logos";
const manifest = JSON.parse(readFileSync("scripts/brands/brand-logo-sources.json", "utf8")).logos;
mkdirSync(OUT, { recursive: true });

/** Rows/columns that contain ink (alpha > 8, or darker than near-white when there is no alpha). */
async function inkMap(input, density) {
  const { data, info } = await sharp(input, density ? { density } : {}).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const ink = (x, y) => { const i = (y * w + x) * 4; return data[i + 3] > 8 && Math.min(data[i], data[i + 1], data[i + 2]) < 245; };
  const rows = Array.from({ length: h }, (_, y) => { for (let x = 0; x < w; x++) if (ink(x, y)) return true; return false; });
  const cols = Array.from({ length: w }, (_, x) => { for (let y = 0; y < h; y++) if (ink(x, y)) return true; return false; });
  return { w, h, rows, cols };
}
const bands = (flags, minGap) => {
  const out = []; let start = -1, last = -1;
  flags.forEach((v, i) => { if (!v) return; if (start < 0) start = i; else if (i - last > minGap) { out.push([start, last]); start = i; } last = i; });
  if (start >= 0) out.push([start, last]);
  return out;
};
function contentBox(m, opts) {
  const rowBands = bands(m.rows, Math.round(m.h * 0.04));
  let colBands = bands(m.cols, Math.round(m.w * (opts.keepLeftUntilGap ?? 0.5)));
  if (opts.keepLeftUntilGap) colBands = colBands.slice(0, 1);
  return { x0: colBands[0][0], x1: colBands.at(-1)[1], y0: rowBands[0][0], y1: rowBands.at(-1)[1] };
}

async function buildSvg(slug, src, opts) {
  let svg = readFileSync(src, "utf8")
    .replace(/<\?xml[^>]*>/g, "").replace(/<!DOCTYPE[^>]*>/gi, "").replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, "").replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "").trim();
  let root = svg.match(/<svg\b[^>]*>/i)[0];
  if (opts.hideRect) {
    const [x, y, w, h] = opts.hideRect;
    const keep = `<defs><clipPath id="logo-keep"><path clip-rule="evenodd" d="M-1e5 -1e5H1e5V1e5H-1e5Z M${x} ${y}h${w}v${h}h${-w}Z"/></clipPath></defs><g clip-path="url(#logo-keep)">`;
    svg = svg.replace(root, root + keep).replace(/<\/svg>\s*$/i, "</g></svg>");
    root = svg.match(/<svg\b[^>]*>/i)[0];
  }
  const attr = (n) => root.match(new RegExp(`\\s${n}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];
  const num = (v) => (v == null ? null : parseFloat(v));
  let vb = attr("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (!vb) vb = [0, 0, num(attr("width")), num(attr("height"))];
  if (!vb.every(Number.isFinite)) throw new Error(`${slug}: cannot determine the SVG viewBox`);
  // Render with the viewBox as the canvas (width/height removed) so pixel -> viewBox mapping is exact.
  const bare = svg.replace(root, root.replace(/\s(width|height|viewBox|preserveAspectRatio)\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/<svg\b/i, `<svg viewBox="${vb.join(" ")}" width="${2000}" height="${Math.round((2000 * vb[3]) / vb[2])}" preserveAspectRatio="xMidYMid meet"`));
  const m = await inkMap(Buffer.from(bare));
  const box = contentBox(m, opts);
  const s = vb[2] / m.w, pad = Math.max(box.x1 - box.x0, box.y1 - box.y0) * 0.01;
  const nb = [vb[0] + (box.x0 - pad) * s, vb[1] + (box.y0 - pad) * s, (box.x1 - box.x0 + 1 + 2 * pad) * s, (box.y1 - box.y0 + 1 + 2 * pad) * s].map((v) => +v.toFixed(3));
  const k = 400 / Math.max(nb[2], nb[3]);
  const out = bare.replace(/<svg\b[^>]*>/i, (tag) => tag.replace(/\s(width|height|viewBox|preserveAspectRatio)\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/<svg\b/i, `<svg viewBox="${nb.join(" ")}" width="${Math.round(nb[2] * k)}" height="${Math.round(nb[3] * k)}"`));
  writeFileSync(`${OUT}/${slug}.svg`, out + "\n");
  return `svg ${Math.round(nb[2] * k)}x${Math.round(nb[3] * k)} (vector)`;
}

async function buildRaster(slug, src, opts) {
  const base = sharp(src).ensureAlpha();
  const flat = await base.clone().png().toBuffer();
  const m = await inkMap(flat);
  const box = contentBox(m, opts);
  const pad = Math.round(Math.max(box.x1 - box.x0, box.y1 - box.y0) * 0.01);
  const left = Math.max(0, box.x0 - pad), top = Math.max(0, box.y0 - pad);
  const width = Math.min(m.w, box.x1 + pad + 1) - left, height = Math.min(m.h, box.y1 + pad + 1) - top;
  const info = await sharp(flat).extract({ left, top, width, height }).png({ compressionLevel: 9 }).toFile(`${OUT}/${slug}.png`);
  return `png ${info.width}x${info.height}`;
}

const files = readdirSync(ORIG);
for (const f of readdirSync(OUT)) rmSync(`${OUT}/${f}`); // rebuilt from scratch: no stale logos left behind
for (const [slug, opts] of Object.entries(manifest)) {
  const src = files.find((f) => f.replace(/\.[^.]+$/, "") === slug);
  if (!src) { console.log(`MISSING original for ${slug}`); continue; }
  const path = `${ORIG}/${src}`;
  const res = src.endsWith(".svg") ? await buildSvg(slug, path, opts) : await buildRaster(slug, path, opts);
  console.log(`${slug.padEnd(20)} ${res}`);
}
console.log(existsSync(OUT) ? readdirSync(OUT).length : 0, "logo files written");
