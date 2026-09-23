/**
 * Regenerates the hero showcase images in public/images/hero.
 *
 * Source: the same brand product photography the category cards use
 * (public/images/categories/*-transparent.png, ~1MB each). Those are far too
 * heavy for an above-the-fold loop, so each one is trimmed of its transparent
 * margin and re-encoded to WebP at two widths — 900px for tablet/desktop and
 * 520px for phones.
 *
 * Run with:  node scripts/build-hero-assets.mjs
 */
import sharp from "sharp";
import path from "node:path";
import { mkdir, stat } from "node:fs/promises";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "public/images/categories");
const OUT = path.join(ROOT, "public/images/hero");

const ITEMS = [
  ["televisions-transparent.png", "tv"],
  ["air-conditioning-transparent.png", "air-conditioning"],
  ["refrigeration-transparent.png", "refrigeration"],
  ["laundry-appliances-transparent.png", "laundry"],
  ["kitchen-appliances-transparent.png", "kitchen"],
];

await mkdir(OUT, { recursive: true });

for (const [file, slug] of ITEMS) {
  const base = sharp(path.join(SRC, file)).trim({ threshold: 1 });
  for (const width of [900, 520]) {
    const out = path.join(OUT, `${slug}${width === 520 ? "-sm" : ""}.webp`);
    const info = await base
      .clone()
      .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 6, alphaQuality: 90 })
      .toFile(out);
    const { size } = await stat(out);
    console.log(
      `${path.basename(out).padEnd(28)} ${info.width}x${info.height}  ${(size / 1024).toFixed(1)} KB`
    );
  }
}
