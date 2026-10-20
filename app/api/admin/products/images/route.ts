import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { invalidateProductPages } from "@/lib/catalogue-cache";
import { getImageStorage, imageRuleStorageContext } from "@/lib/image-storage";
import { releaseUnreferencedImages } from "@/lib/image-storage-cleanup";
import { MAX_PRODUCT_IMAGES, validateProductImages } from "@/lib/product-images";
import { realImages } from "@/lib/admin-gallery";
import { setProductImagesIfUnchanged } from "@/lib/repositories/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

const isStringList = (v: unknown, max: number): v is string[] =>
  Array.isArray(v) && v.length <= max && v.every((x) => typeof x === "string");

/**
 * POST { id, expectedImages, images } — replaces ONLY the product's `images` field, and only if
 * it still equals `expectedImages` (409 otherwise, so a concurrent edit is never overwritten).
 * Used by Bulk Image Upload. Every other product field is left untouched.
 */
export async function POST(request: Request) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized access" }, { status: 401, headers: noStore });

  let body: { id?: unknown; expectedImages?: unknown; images?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body: { id, expectedImages, images }." }, { status: 400, headers: noStore });
  }
  const { id, expectedImages } = body;
  // "No images" is stored as an empty list — the display placeholder is never saved as a product image.
  const images = Array.isArray(body.images) ? realImages(body.images) : body.images;
  if (typeof id !== "string" || !id.trim() || id.length > 200) {
    return NextResponse.json({ error: "Product id is required." }, { status: 400, headers: noStore });
  }
  if (!isStringList(expectedImages, MAX_PRODUCT_IMAGES) || !isStringList(images, MAX_PRODUCT_IMAGES)) {
    return NextResponse.json({ error: "expectedImages and images must be lists of image URLs." }, { status: 400, headers: noStore });
  }
  const problem = validateProductImages(images, { ...imageRuleStorageContext(), storedImages: expectedImages });
  if (problem) return NextResponse.json({ error: problem }, { status: 400, headers: noStore });

  const result = await setProductImagesIfUnchanged(id, expectedImages, images);
  if (result === null) return NextResponse.json({ error: "Product not found." }, { status: 404, headers: noStore });
  if (result === "changed") {
    return NextResponse.json(
      { error: "This product's images changed since the upload started. Nothing was changed — reload and try again." },
      { status: 409, headers: noStore }
    );
  }
  invalidateProductPages(result.slug);

  const removed = expectedImages.filter((url) => !images.includes(url));
  const configured = getImageStorage();
  if (removed.length && configured.ok) await releaseUnreferencedImages(removed, configured.storage);

  return NextResponse.json({ success: true, id, images }, { headers: noStore });
}
