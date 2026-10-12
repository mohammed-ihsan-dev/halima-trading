import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import {
  IMAGE_UPLOAD,
  createImageKey,
  createR2Store,
  getR2Config,
  publicUrlForKey,
  validateUploadRequest,
  type AllowedImageType,
} from "@/lib/r2";
import { takeUploadQuota } from "@/lib/upload-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

/**
 * POST { files: [{ contentType, size }] } → short-lived presigned PUT URLs.
 * The server chooses every object key; the browser never names objects.
 */
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized access" }, { status: 401, headers: noStore });

  const r2 = getR2Config();
  if (!r2.ok) {
    return NextResponse.json(
      { error: "Image storage is not configured.", missing: r2.missing, invalid: r2.invalid },
      { status: 503, headers: noStore }
    );
  }

  let body: { files?: unknown };
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
  if (!takeUploadQuota(session.email, files.length)) {
    return NextResponse.json({ error: "Too many uploads in a short time. Please wait a few minutes." }, { status: 429, headers: noStore });
  }

  try {
    const store = createR2Store(r2.config);
    const uploads = await Promise.all(
      (files as { contentType: AllowedImageType; size: number }[]).map(async (file) => {
        const key = createImageKey(file.contentType);
        return {
          key,
          uploadUrl: await store.presignPut(key, file.contentType, file.size),
          method: "PUT",
          // The browser must send exactly these headers — they are part of the signature.
          headers: { "Content-Type": file.contentType, "Cache-Control": IMAGE_UPLOAD.cacheControl },
          publicUrl: publicUrlForKey(r2.config.publicBaseUrl, key),
          expiresInSeconds: IMAGE_UPLOAD.presignExpirySeconds,
        };
      })
    );
    return NextResponse.json({ uploads }, { headers: noStore });
  } catch (error) {
    console.error("R2 presign failed:", (error as Error).name);
    return NextResponse.json({ error: "Could not prepare the upload. Please try again." }, { status: 502, headers: noStore });
  }
}
