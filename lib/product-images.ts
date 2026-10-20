/**
 * Server-side rules for the product `images: string[]` field (Add / Edit Product API).
 *
 * Accepted: site paths ("/featured/x.png"), https URLs (Supabase Storage, R2 or other hosts),
 * and — only for backward compatibility — inline data:image URIs. When image storage uploads are
 * configured, NEW data URIs are refused (images should be uploaded to storage), but data URIs
 * already stored on the product are kept as-is so existing products remain editable.
 */
export const MAX_PRODUCT_IMAGES = 20;
const MAX_URL_LENGTH = 2048;
const DATA_IMAGE = /^data:image\/(jpeg|png|webp|gif|svg\+xml);base64,[A-Za-z0-9+/]+=*$/;

export interface ImageRuleContext {
  /** Image storage uploads (Supabase or R2) are configured. */
  storageEnabled: boolean;
  /** Public URL base of the configured image storage (its own URLs are always accepted). */
  storageBaseUrl?: string;
  /** Images currently stored on the product (empty when creating). */
  storedImages?: readonly string[];
}

/** Returns the first problem found, or null when every image is acceptable. */
export function validateProductImages(images: unknown, ctx: ImageRuleContext): string | null {
  if (!Array.isArray(images)) return "images must be a list.";
  if (images.length > MAX_PRODUCT_IMAGES) return `A product can have at most ${MAX_PRODUCT_IMAGES} images.`;
  const stored = new Set(ctx.storedImages ?? []);
  for (const [i, img] of images.entries()) {
    const label = `Image ${i + 1}`;
    if (typeof img !== "string" || !img.trim()) return `${label} is empty.`;
    // Browser-only references break after a reload: blob:/file: URLs and "C:\fakepath\…" values from file inputs.
    if (/^(blob|file|filesystem):/i.test(img) || /fakepath/i.test(img) || /^[a-z]:[\\/]/i.test(img) || img.startsWith("\\\\")) {
      return `${label} is a temporary or local file reference, not a permanent image URL. Upload the file to image storage instead.`;
    }
    if (img.startsWith("data:")) {
      if (!DATA_IMAGE.test(img)) return `${label} is not a valid embedded image.`;
      if (ctx.storageEnabled && !stored.has(img)) return `${label} must be uploaded to image storage, not embedded. Please re-upload it.`;
      continue;
    }
    if (img.length > MAX_URL_LENGTH) return `${label} URL is too long.`;
    if (img.startsWith("/") && !img.startsWith("//")) {
      if (/\s/.test(img)) return `${label} path contains spaces.`;
      continue;
    }
    // The configured storage's own URLs (https in production; plain http only for a local test server).
    if (ctx.storageBaseUrl && img.startsWith(`${ctx.storageBaseUrl}/`)) continue;
    let url: URL;
    try {
      url = new URL(img);
    } catch {
      return `${label} is not a valid URL or site path.`;
    }
    if (url.protocol !== "https:") return `${label} must use https.`;
  }
  return null;
}
