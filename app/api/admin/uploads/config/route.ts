import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { ALLOWED_IMAGE_TYPES, IMAGE_UPLOAD, getR2Config } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tells the Add/Edit Product pages whether R2 uploads are available. Variable names only, never values. */
export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
  }
  const r2 = getR2Config();
  return NextResponse.json(
    {
      enabled: r2.ok,
      maxBytes: IMAGE_UPLOAD.maxBytes,
      maxFilesPerRequest: IMAGE_UPLOAD.maxFilesPerRequest,
      allowedTypes: Object.keys(ALLOWED_IMAGE_TYPES),
      ...(r2.ok ? {} : { missing: r2.missing, invalid: r2.invalid }),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
