import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only the preview files the catalogue step generates: catalogue/<brand>/(previews|highlights)/<hex>.(webp|jpg)
const PREVIEW_PATH = /^catalogue\/[a-z0-9-]{1,60}\/(previews|highlights)\/[0-9a-f]{16,64}\.(webp|jpg)$/;

/**
 * GET ?path=… — a catalogue preview image for the admin review queue. The files live in the image pipeline's local
 * state directory, so they are available where the pipeline ran (e.g. a local admin session), not on deployments.
 */
export async function GET(request: Request) {
  if (!(await getAdminSession())) return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
  const rel = new URL(request.url).searchParams.get("path") ?? "";
  if (!PREVIEW_PATH.test(rel)) return NextResponse.json({ error: "Invalid preview path." }, { status: 400 });
  const root = path.resolve(process.env.PIPELINE_STATE_DIR || path.join(process.cwd(), "work/product-image-pipeline"));
  const full = path.resolve(root, rel);
  if (!full.startsWith(root + path.sep)) return NextResponse.json({ error: "Invalid preview path." }, { status: 400 });
  try {
    const body = await readFile(full);
    return new NextResponse(new Uint8Array(body), { headers: { "Content-Type": rel.endsWith(".webp") ? "image/webp" : "image/jpeg", "Cache-Control": "private, max-age=3600" } });
  } catch {
    return NextResponse.json({ error: "Preview not available here (catalogue previews exist only where the image pipeline ran)." }, { status: 404 });
  }
}
