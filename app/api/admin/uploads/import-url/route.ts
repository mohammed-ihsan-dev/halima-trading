import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { getImageStorage } from "@/lib/image-storage";
import { IMPORT_LIMITS, importExternalImage } from "@/lib/external-image-import";
import { findPreviousImageImport, recordImageImport } from "@/lib/repositories/product-image-imports";
import { takeUploadQuota } from "@/lib/upload-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const noStore = { "Cache-Control": "no-store" };

/**
 * POST { url, productRef? } → imports an external image into image storage and
 * returns its public URL. The server downloads the image (SSRF-safe); credentials never reach the browser. This does
 * NOT change any product: the admin gallery adds the URL through its normal save.
 */
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized access" }, { status: 401, headers: noStore });

  const configured = getImageStorage();
  if (!configured.ok) {
    return NextResponse.json({ error: "Image storage is not configured.", missing: configured.missing, invalid: configured.invalid }, { status: 503, headers: noStore });
  }

  let body: { url?: unknown; productRef?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body: { url, productRef }." }, { status: 400, headers: noStore });
  }
  if (typeof body.url !== "string" || !body.url.trim() || body.url.length > IMPORT_LIMITS.maxUrlLength) {
    return NextResponse.json({ error: "Paste a complete image URL (https://…)." }, { status: 400, headers: noStore });
  }
  if (body.productRef !== undefined && body.productRef !== null && (typeof body.productRef !== "string" || body.productRef.length > 200)) {
    return NextResponse.json({ error: "productRef must be a product SKU or id." }, { status: 400, headers: noStore });
  }
  if (!takeUploadQuota(session.email, 1)) {
    return NextResponse.json({ error: "Too many uploads in a short time. Please wait a few minutes." }, { status: 429, headers: noStore });
  }

  try {
    const result = await importExternalImage(body.url, (body.productRef as string | undefined) ?? undefined, {
      storage: configured.storage,
      importedBy: session.email,
      findPrevious: findPreviousImageImport,
      record: recordImageImport,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status, headers: noStore });
    return NextResponse.json(result, { headers: noStore });
  } catch (error) {
    console.error("External image import failed:", (error as Error).name);
    return NextResponse.json({ error: "The image could not be imported. Nothing was changed." }, { status: 500, headers: noStore });
  }
}
