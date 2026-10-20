// Image validation, optimisation (no generative changes: decode → orient → downscale → re-encode)
// and deterministic storage keys for the product-image pipeline.
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp"); // installed with Next.js (next → sharp); used only by this offline pipeline

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

export function sniff(b) {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  if (/^ftyp(avif|avis)/.test(b.subarray(4, 12).toString("latin1"))) return "avif";
  if (b.subarray(0, 4).toString("latin1") === "GIF8") return "gif";
  if (/^\s*<(!doctype|html|\?xml|svg)/i.test(b.subarray(0, 100).toString("latin1"))) return "markup";
  return null;
}

export const MIN_LONGEST_SIDE = 400; // below this an image is too small for a product page
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

/** Validates downloaded bytes: real raster image, decodable, sensible size. */
export async function inspect(buf, servedType = "") {
  const kind = sniff(buf);
  if (!kind) return { ok: false, reason: "not a recognised image file" };
  if (kind === "markup") return { ok: false, reason: "HTML/SVG/XML returned instead of a raster image" };
  if (kind === "gif") return { ok: false, reason: "GIF is not accepted for product photos" };
  if (buf.length > MAX_SOURCE_BYTES) return { ok: false, reason: `source file too large (${buf.length} bytes)` };
  let meta, stats;
  try {
    meta = await sharp(buf).metadata();
    stats = await sharp(buf).stats();
  } catch (e) {
    return { ok: false, reason: `image does not decode (${e.message.slice(0, 80)})` };
  }
  const w = meta.autoOrient?.width ?? meta.width, h = meta.autoOrient?.height ?? meta.height;
  if (!w || !h) return { ok: false, reason: "no dimensions" };
  const longest = Math.max(w, h);
  const servedOk = !servedType || servedType.startsWith(`image/${kind === "jpeg" ? "jpeg" : kind}`) || servedType.startsWith("image/jpg");
  // Near-uniform images (blank/placeholder) have almost no variation in every channel.
  const flat = stats.channels.slice(0, 3).every((c) => c.stdev < 4);
  return { ok: longest >= MIN_LONGEST_SIDE && !flat, reason: longest < MIN_LONGEST_SIDE ? `too small (${w}x${h})` : flat ? "blank / uniform image" : null,
    kind, width: w, height: h, bytes: buf.length, hasAlpha: !!meta.hasAlpha, servedTypeMatches: servedOk, sha256: sha256(buf) };
}

export const OUTPUT_SIZE = Math.min(2000, Math.max(200, Number(process.env.IMAGE_OUTPUT_SIZE) || 800));

/**
 * Normalise to an OUTPUT_SIZE square WebP (default 800×800): downscale to fit (never upscale, aspect ratio kept),
 * flatten transparency onto white and centre on a white canvas — product cards get uniform tiles without cropping.
 */
export async function optimise(buf, size = OUTPUT_SIZE) {
  const fitted = await sharp(buf).rotate().resize({ width: size, height: size, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = fitted.info;
  const left = Math.floor((size - w) / 2), top = Math.floor((size - h) / 2);
  const out = await sharp(fitted.data).extend({ left, right: size - w - left, top, bottom: size - h - top, background: "#ffffff" }).webp({ quality: 82, effort: 5 }).toBuffer();
  const meta = await sharp(out).metadata();
  return { buffer: out, contentType: "image/webp", ext: "webp", width: meta.width, height: meta.height, bytes: out.length, sha256: sha256(out), fittedWidth: w, fittedHeight: h };
}

/**
 * Deterministic UUID (RFC 4122 v4 layout, as the storage key rules require) from the product id and
 * the optimised bytes: the same image for the same product always maps to the same object key, so a
 * re-run never uploads a second copy.
 */
export function deterministicUuid(productId, contentSha) {
  const h = createHash("sha256").update(`${productId}\n${contentSha}`).digest("hex").slice(0, 32).split("");
  h[12] = "4";
  h[16] = "89ab"[parseInt(h[16], 16) % 4];
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}
