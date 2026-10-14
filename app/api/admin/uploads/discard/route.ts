import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { IMAGE_UPLOAD } from "@/lib/r2";
import { getImageStorage } from "@/lib/image-storage";
import { releaseUnreferencedImages } from "@/lib/image-storage-cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

/**
 * POST { urls } — clean-up for uploads that were never attached to a product (for example the
 * product could not be updated). Deletes an object only if it belongs to the current image
 * storage, has an app-generated key, and NO product references it; anything else is kept.
 */
export async function POST(request: Request) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized access" }, { status: 401, headers: noStore });
  const configured = getImageStorage();
  if (!configured.ok) return NextResponse.json({ error: "Image storage is not configured." }, { status: 503, headers: noStore });

  let urls: unknown;
  try {
    urls = (await request.json()).urls;
  } catch {
    return NextResponse.json({ error: "Send a JSON body: { urls: [...] }." }, { status: 400, headers: noStore });
  }
  if (!Array.isArray(urls) || urls.length === 0 || urls.length > IMAGE_UPLOAD.maxFilesPerRequest || !urls.every((u) => typeof u === "string")) {
    return NextResponse.json({ error: `Send between 1 and ${IMAGE_UPLOAD.maxFilesPerRequest} image URLs.` }, { status: 400, headers: noStore });
  }
  const result = await releaseUnreferencedImages(urls as string[], configured.storage);
  return NextResponse.json(result, { headers: noStore });
}
