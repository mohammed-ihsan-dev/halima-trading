import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { IMAGE_UPLOAD, createImageKey, productKeySegment, validateUploadRequest, type AllowedImageType } from "@/lib/r2";
import { getImageStorage } from "@/lib/image-storage";
import { takeUploadQuota } from "@/lib/upload-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

/**
 * POST { files: [{ contentType, size }], productRef? } → short-lived signed upload URLs.
 * The server chooses every object key (products/<sku-or-id>/<uuid>.<ext> when productRef is a
 * usable SKU or id); the browser never names objects and cannot overwrite existing ones.
 */
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized access" }, { status: 401, headers: noStore });

  const configured = getImageStorage();
  if (!configured.ok) {
    return NextResponse.json(
      { error: "Image storage is not configured.", missing: configured.missing, invalid: configured.invalid },
      { status: 503, headers: noStore }
    );
  }
  const { storage } = configured;

  let body: { files?: unknown; productRef?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body: { files: [{ contentType, size }] }." }, { status: 400, headers: noStore });
  }
  const files = body.files;
  if (!Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: "No files to upload." }, { status: 400, headers: noStore });
  }
  if (files.length > IMAGE_UPLOAD.maxFilesPerRequest) {
    return NextResponse.json({ error: `Upload at most ${IMAGE_UPLOAD.maxFilesPerRequest} images at a time.` }, { status: 400, headers: noStore });
  }
  for (const [i, file] of files.entries()) {
    const problem = validateUploadRequest(file ?? {});
    if (problem) return NextResponse.json({ error: `File ${i + 1}: ${problem}` }, { status: 400, headers: noStore });
  }
  if (body.productRef !== undefined && (typeof body.productRef !== "string" || body.productRef.length > 200)) {
    return NextResponse.json({ error: "productRef must be a product SKU or id." }, { status: 400, headers: noStore });
  }
  const productRef = productKeySegment(body.productRef) || undefined;
  if (!takeUploadQuota(session.email, files.length)) {
    return NextResponse.json({ error: "Too many uploads in a short time. Please wait a few minutes." }, { status: 429, headers: noStore });
  }

  try {
    const uploads = await Promise.all(
      (files as { contentType: AllowedImageType; size: number }[]).map(async (file) => {
        const key = createImageKey(file.contentType, undefined, undefined, productRef);
        return {
          key,
          uploadUrl: await storage.store.presignPut(key, file.contentType, file.size),
          method: "PUT",
          headers: storage.store.uploadHeaders(file.contentType),
          publicUrl: storage.publicUrlForKey(key),
          expiresInSeconds: IMAGE_UPLOAD.presignExpirySeconds,
        };
      })
    );
    return NextResponse.json({ uploads }, { headers: noStore });
  } catch (error) {
    console.error(`Image upload signing failed (${storage.provider}):`, (error as Error).name);
    return NextResponse.json({ error: "Could not prepare the upload. Please try again." }, { status: 502, headers: noStore });
  }
}
