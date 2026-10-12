import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { IMAGE_UPLOAD, createR2Store, getR2Config, isValidImageKey, publicUrlForKey, verifyUploadedImage } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

/**
 * POST { keys: string[] } → verifies each uploaded object (exists, size, content type, file
 * signature) and returns its public URL. Objects that fail verification are deleted.
 */
export async function POST(request: Request) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized access" }, { status: 401, headers: noStore });

  const r2 = getR2Config();
  if (!r2.ok) {
    return NextResponse.json({ error: "Image storage is not configured.", missing: r2.missing, invalid: r2.invalid }, { status: 503, headers: noStore });
  }

  let keys: unknown;
  try {
    keys = (await request.json()).keys;
  } catch {
    return NextResponse.json({ error: "Send a JSON body: { keys: [...] }." }, { status: 400, headers: noStore });
  }
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > IMAGE_UPLOAD.maxFilesPerRequest) {
    return NextResponse.json({ error: `Send between 1 and ${IMAGE_UPLOAD.maxFilesPerRequest} upload keys.` }, { status: 400, headers: noStore });
  }
  // Only keys this application generates can be checked (or deleted) — never arbitrary objects.
  if (!keys.every(isValidImageKey)) {
    return NextResponse.json({ error: "Invalid upload key." }, { status: 400, headers: noStore });
  }

  try {
    const store = createR2Store(r2.config);
    const results = await Promise.all(
      (keys as string[]).map(async (key) => {
        const verdict = await verifyUploadedImage(store, key);
        return verdict.ok
          ? { key, ok: true as const, url: publicUrlForKey(r2.config.publicBaseUrl, key) }
          : { key, ok: false as const, error: verdict.reason };
      })
    );
    return NextResponse.json({ results }, { headers: noStore });
  } catch (error) {
    console.error("R2 verification failed:", (error as Error).name);
    return NextResponse.json({ error: "Could not verify the upload. Please try again." }, { status: 502, headers: noStore });
  }
}
