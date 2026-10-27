import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { ALLOWED_IMAGE_TYPES, IMAGE_UPLOAD } from "@/lib/r2";
import { getImageStorage } from "@/lib/image-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tells the admin image upload screens whether storage uploads are available. Variable names only, never values. */
export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
  }
  const storage = getImageStorage();
  return NextResponse.json(
    {
      enabled: storage.ok,
      // The public base URL is not a secret (it is part of every stored image URL); the gallery uses it to tell
      // storage images from external links.
      ...(storage.ok ? { provider: storage.storage.provider, publicBaseUrl: storage.storage.publicBaseUrl } : {}),
      maxBytes: IMAGE_UPLOAD.maxBytes,
      maxFilesPerRequest: IMAGE_UPLOAD.maxFilesPerRequest,
      allowedTypes: Object.keys(ALLOWED_IMAGE_TYPES),
      ...(storage.ok ? {} : { missing: storage.missing, invalid: storage.invalid }),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
