// Image-replacement review (pure): products whose ONLY usable images are unsuitable — Google search thumbnails, images
// below the product-page minimum, brand logos, app-store icons or generic placeholders — can be brought into the review workflow, but only when an operator names them
// explicitly (--include-classes=… together with --only=… or --pilot). An approved replacement removes exactly the
// unsuitable references recorded at review-import time; every other image is kept. Nothing here writes anything.
import { PLACEHOLDER } from "./audit-classes.mjs";
import { MIN_LONGEST_SIDE } from "./images.mjs";

/**
 * Audit classes that may enter the replacement workflow (the default targets NO_IMAGE / PLACEHOLDER / BROKEN are unaffected).
 * VALID_VERIFIED qualifies only through the rule below: every usable image must be unsuitable (for Supabase uploads that
 * means undersized), so a product with a good verified image never enters. EMBEDDED_PRESERVED is never replaceable.
 */
export const REPLACEABLE_CLASSES = new Set(["EXTERNAL_NEEDS_VERIFICATION", "SUPABASE_UNREVIEWED", "VALID_VERIFIED"]);
const GOOGLE_THUMBNAIL = /^encrypted-tbn\d*\.gstatic\.com$/i;
// Conservative, URL-only rules: a host whose whole purpose is logos / app icons / placeholder images, or a file that is
// explicitly named as a placeholder. Image content is never inspected, so a product photo that shows a brand name is
// never flagged; neither is a shop or brand site whose path merely contains the word "logo".
const LOGO_LIBRARY = /(^|\.)(seeklogo\.com|logos-world\.net|1000logos\.net|worldvectorlogo\.com|logowik\.com|logo\.wine|brandslogos\.com|freelogovectors\.net|logolook\.net)$/i;
const STOCK_WITH_LOGO_FILE = /(^|\.)vectorstock\.com$/i; // stock vectors: only when the file itself is named as a logo
const APP_ICON = (host, pathname) => /^play-lh\.googleusercontent\.com$/i.test(host) || (/^is\d+-ssl\.mzstatic\.com$/i.test(host) && /\/image\/thumb\/Purple/i.test(pathname));
const PLACEHOLDER_HOST = /^(via\.placeholder\.com|placehold\.co|placehold\.it|placeholder\.com|dummyimage\.com)$/i;
const PLACEHOLDER_FILE = /^(placeholder|no[-_ ]?image|image[-_ ]?not[-_ ]?(available|found)|no[-_ ]?photo|default[-_ ]?(product|image)|coming[-_ ]?soon)([-_ ]?\d+)?\.(png|jpe?g|webp|gif|svg|avif)$/i;

/** Why one audited reference is unsuitable as a product image, or null when it is usable. */
export function unsuitableReason(ref) {
  if (!ref || ref.type === "placeholder" || !ref.valid) return null; // broken references are not "usable"; existing rules keep them
  let host = "", pathname = "";
  try { ({ hostname: host, pathname } = new URL(ref.ref)); } catch { /* site path or data URI */ }
  const file = decodeURIComponent(pathname.split("/").pop() ?? "");
  if (GOOGLE_THUMBNAIL.test(host)) return "Google search thumbnail";
  if (LOGO_LIBRARY.test(host)) return `brand logo (logo library ${host})`;
  if (STOCK_WITH_LOGO_FILE.test(host) && /(^|[-_])logo([-_.]|$)/i.test(file)) return `logo graphic (stock image "${file}")`;
  if (APP_ICON(host, pathname)) return `app store icon (${host})`;
  if (PLACEHOLDER_HOST.test(host) || PLACEHOLDER_FILE.test(file)) return `generic placeholder image (${file || host})`;
  const longest = Math.max(ref.width ?? 0, ref.height ?? 0);
  if (ref.tooSmall || (longest > 0 && longest < MIN_LONGEST_SIDE)) return `undersized (${ref.width}x${ref.height}, minimum ${MIN_LONGEST_SIDE}px)`;
  return null;
}

/**
 * Whether an audited product may enter the replacement review: its class is replaceable and EVERY usable image is
 * unsuitable (so it has no usable image today). Returns the exact references an approved replacement would remove.
 */
export function replacementEligibility(p) {
  if (!REPLACEABLE_CLASSES.has(p?.imageClass)) return { eligible: false, reason: `class ${p?.imageClass} is not replaceable`, removeRefs: [], reasons: [] };
  const usable = (p.refs ?? []).filter((r) => r.type !== "placeholder" && r.valid);
  const unsuitable = usable.map((r) => ({ ref: r.ref, reason: unsuitableReason(r) })).filter((x) => x.reason);
  if (!usable.length) return { eligible: false, reason: "no usable image to replace", removeRefs: [], reasons: [] };
  if (unsuitable.length !== usable.length) return { eligible: false, reason: "has a usable image that is not a thumbnail or undersized", removeRefs: [], reasons: [] };
  return { eligible: true, reason: null, removeRefs: unsuitable.map((x) => x.ref), reasons: unsuitable.map((x) => `${x.reason}: ${x.ref}`) };
}

/** Parses --include-classes. Only replaceable classes, and only for explicitly selected products (--only / --pilot). */
export function parseIncludeClasses(value, selectedIds) {
  if (!value) return new Set();
  const classes = value.split(",").map((s) => s.trim()).filter(Boolean);
  const bad = classes.filter((c) => !REPLACEABLE_CLASSES.has(c));
  if (bad.length) throw new Error(`--include-classes accepts only ${[...REPLACEABLE_CLASSES].join(", ")} (got ${bad.join(", ")})`);
  if (!selectedIds.length) throw new Error("--include-classes requires an explicit product selection (--only=… or --pilot)");
  return new Set(classes);
}

/**
 * The images list after an approved replacement: the new image first, then every existing reference except the
 * placeholder and the references the reviewer approved for removal. Returns null when a reference to remove is no
 * longer present (the product changed since the review), so nothing is planned.
 */
export function replacedImages(before, newUrl, removeRefs = []) {
  if (removeRefs.some((r) => !before.includes(r))) return null;
  return [newUrl, ...before.filter((i) => i !== PLACEHOLDER && !removeRefs.includes(i) && i !== newUrl)];
}
