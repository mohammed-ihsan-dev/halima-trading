/**
 * Deleting stored product images safely (server-only).
 *
 * An object is deleted only when ALL of these hold:
 *   - its URL is served by the CURRENT upload provider's public base (R2 objects are never
 *     touched while Supabase is the provider, and external or site URLs never are);
 *   - its key has the shape this app generates (products/…/<uuid>.<ext>);
 *   - no product — of any status, including deleted ones — still references the URL.
 * Failures are logged and reported, never thrown: a leftover object is harmless.
 */
import { countProductsReferencingImage } from "@/lib/repositories/products";
import type { ImageStorage } from "@/lib/image-storage";

export interface ReleaseResult {
  deleted: string[];
  kept: { url: string; reason: string }[];
}

export async function releaseUnreferencedImages(urls: readonly string[], storage: ImageStorage): Promise<ReleaseResult> {
  const result: ReleaseResult = { deleted: [], kept: [] };
  for (const url of new Set(urls)) {
    const key = storage.keyFromPublicUrl(url);
    if (!key) {
      result.kept.push({ url, reason: "not an object of the current image storage" });
      continue;
    }
    try {
      const refs = await countProductsReferencingImage(url);
      if (refs > 0) {
        result.kept.push({ url, reason: `still used by ${refs} product(s)` });
        continue;
      }
      await storage.store.delete(key);
      result.deleted.push(url);
    } catch (error) {
      console.warn(`Could not release stored image (${storage.provider}):`, (error as Error).name);
      result.kept.push({ url, reason: "delete failed — left in storage for later cleanup" });
    }
  }
  return result;
}
