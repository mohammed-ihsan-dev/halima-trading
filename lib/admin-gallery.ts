/**
 * Pure helpers for the admin product gallery (Add / Edit Product). No browser or server APIs.
 *
 * The product schema stores images as `images: string[]` of permanent URLs or site paths; the first
 * entry is the primary image. The generic placeholder is a display fallback only — it is never a
 * gallery item and is never saved as a product image.
 */
export const PLACEHOLDER_IMAGE_PATH = "/featured/hisense-window-ac.png";

/** The product's real images: non-empty strings other than the display placeholder. */
export function realImages(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images.filter((img): img is string => typeof img === "string" && img.trim() !== "" && img !== PLACEHOLDER_IMAGE_PATH);
}

/**
 * A value that may be stored as a product image. Rejects browser-only references (blob:/file: URLs,
 * "C:\fakepath\..." values from file inputs, Windows paths) that would break after a reload.
 */
export function permanentImageProblem(value: string): string | null {
  const v = value.trim();
  if (!v) return "The image address is empty.";
  if (/^(blob|file|filesystem):/i.test(v)) return "That is a temporary browser address, not a permanent image URL.";
  if (/fakepath/i.test(v) || /^[a-z]:[\\/]/i.test(v) || v.startsWith("\\\\")) return "That is a file path on a computer, not an image URL. Upload the file instead.";
  if (v.startsWith("/") && !v.startsWith("//")) return /\s/.test(v) ? "Site paths cannot contain spaces." : null;
  if (/^https:\/\//i.test(v)) return null;
  return "Use an https:// image URL or a site path starting with /.";
}

/** Appends newly uploaded URLs (no duplicates); returns the list and the URL to show in the main preview. */
export function appendImages(current: readonly string[], added: readonly string[]): { images: string[]; select: string | null } {
  const images = realImages(current);
  const fresh = realImages(added).filter((url, i, arr) => !images.includes(url) && arr.indexOf(url) === i);
  return { images: [...images, ...fresh], select: fresh[0] ?? images[0] ?? null };
}

/** Moves one image to the front (primary) without dropping or duplicating any other image. */
export function makePrimary(current: readonly string[], url: string): string[] {
  const images = realImages(current);
  if (!images.includes(url)) return images;
  return [url, ...images.filter((img) => img !== url)];
}

/** Removes one image; returns the list and which image the main preview should show next. */
export function removeImage(current: readonly string[], url: string): { images: string[]; select: string | null } {
  const images = realImages(current);
  const at = images.indexOf(url);
  const next = images.filter((img) => img !== url);
  return { images: next, select: next[Math.min(Math.max(at, 0), next.length - 1)] ?? null };
}

/**
 * Replaces one image with another IN PLACE (same position, so a primary image stays primary). Every other image is
 * kept. If `newUrl` is already in the gallery, the old entry is dropped instead of creating a duplicate. Unknown
 * `oldUrl` → the list is returned unchanged.
 */
export function replaceImageInPlace(current: readonly string[], oldUrl: string, newUrl: string): string[] {
  const images = realImages(current);
  if (!images.includes(oldUrl) || oldUrl === newUrl) return images;
  if (images.includes(newUrl)) return images.filter((img) => img !== oldUrl);
  return images.map((img) => (img === oldUrl ? newUrl : img));
}

/** An https image hosted outside the configured image storage (a candidate for "Import to storage"). */
export function isExternalImage(url: string, storageBaseUrl: string | null | undefined): boolean {
  if (!/^https:\/\//i.test(url)) return false;
  return !(storageBaseUrl && url.startsWith(`${storageBaseUrl}/`));
}
