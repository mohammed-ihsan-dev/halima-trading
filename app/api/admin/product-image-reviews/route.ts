import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { getImageStorage } from "@/lib/image-storage";
import { getMongoDb } from "@/lib/mongodb";
import { AUTHORIZATION_TYPES, REVIEW_STATES, type AuthorizationEvidence, type ReviewAction, type ReviewState } from "@/lib/product-image-review";
import { isValidImageKey, verifyUploadedImage } from "@/lib/r2";
import {
  addClientSuppliedImage,
  decideReview,
  ensureReviewIndexes,
  listReviewQueue,
  requestMoreCandidates,
  reviewCollection,
} from "@/lib/repositories/product-image-reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: noStore });

const str = (v: unknown, max = 500) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);

function parseAuthorization(v: unknown): AuthorizationEvidence | null {
  if (!v || typeof v !== "object") return null;
  const a = v as Record<string, unknown>;
  const type = AUTHORIZATION_TYPES.find((t) => t === a.type);
  const grantedBy = str(a.grantedBy, 200), reference = str(a.reference, 1000);
  if (!type || !grantedBy || !reference) return null;
  return { type, grantedBy, reference, conditionsMet: a.conditionsMet === true, ...(str(a.note, 1000) ? { note: str(a.note, 1000)! } : {}) };
}

/** GET ?state=pending_review,needs_manual_verification&productId=… — the review queue (read-only). */
export async function GET(request: Request) {
  if (!(await getAdminSession())) return bad("Unauthorized access", 401);
  const params = new URL(request.url).searchParams;
  const states = (params.get("state") ?? "").split(",").filter((s): s is ReviewState => (REVIEW_STATES as readonly string[]).includes(s));
  const productId = str(params.get("productId"), 200) ?? undefined;
  const queue = await listReviewQueue(await getMongoDb(), { states, productId, limit: 1000 });
  return NextResponse.json(queue, { headers: noStore });
}

/**
 * POST — one review action. Only the review record changes; the product is never modified here (no status,
 * price or image change — approved images are linked later by the pipeline's backed-up apply stage).
 *   { action: "approve", reviewId, expectedVersion, exactModelConfirmed: true, authorization: {...} }
 *   { action: "reject", reviewId, expectedVersion, reason }
 *   { action: "needs_manual_verification" | "needs_manual_source", reviewId, expectedVersion, note? }
 *   { action: "request_more", productId }
 *   { action: "client_image", productId, storageUrl, authorization }
 */
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return bad("Unauthorized access", 401);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return bad("Send a JSON body.");
  }
  const by = session.email;
  const db = await getMongoDb();
  const col = await reviewCollection(db);
  await ensureReviewIndexes(col).catch(() => undefined);

  if (body.action === "request_more") {
    const productId = str(body.productId, 200);
    if (!productId) return bad("productId is required.");
    const n = await requestMoreCandidates(col, productId, by);
    return n ? NextResponse.json({ success: true, flagged: n }, { headers: noStore }) : bad("No open reviews for this product.", 404);
  }

  if (body.action === "client_image") {
    const productId = str(body.productId, 200), storageUrl = str(body.storageUrl, 1000), authorization = parseAuthorization(body.authorization);
    if (!productId || !storageUrl) return bad("productId and storageUrl are required.");
    if (!authorization) return bad("Record who authorized the image and where the evidence is kept.");
    const configured = getImageStorage();
    if (!configured.ok) return bad("Image storage is not configured.", 503);
    const key = configured.storage.keyFromPublicUrl(storageUrl);
    if (!key || !isValidImageKey(key)) return bad("The image must be uploaded through the admin upload first.");
    const verdict = await verifyUploadedImage(configured.storage.store, key);
    if (!verdict.ok) return bad(`Uploaded file failed verification: ${verdict.reason}`);
    const p = await db.collection("products").findOne({ id: productId, status: { $ne: "deleted" } }, { projection: { _id: 0, name: 1, brand: 1, model: 1, sku: 1, category: 1, status: 1, images: 1 } });
    if (!p) return bad("Product not found.", 404);
    const record = await addClientSuppliedImage(col, {
      productId, storageUrl, authorization, by, fingerprint: createHash("sha256").update(key).digest("hex"),
      product: { name: String(p.name ?? ""), brand: String(p.brand ?? ""), model: String(p.model ?? ""), sku: p.sku, category: p.category, status: p.status ?? null, images: Array.isArray(p.images) ? p.images : [] },
    });
    return NextResponse.json({ success: true, record }, { headers: noStore });
  }

  const reviewId = str(body.reviewId, 400);
  const expectedVersion = typeof body.expectedVersion === "number" && Number.isInteger(body.expectedVersion) ? body.expectedVersion : null;
  if (!reviewId || expectedVersion === null) return bad("reviewId and expectedVersion are required.");
  let action: ReviewAction;
  switch (body.action) {
    case "approve": {
      const authorization = parseAuthorization(body.authorization);
      if (!authorization) return bad("Commercial-use authorization is required: type, who granted it and where the evidence is kept.");
      action = { type: "approve", exactModelConfirmed: body.exactModelConfirmed === true, authorization };
      break;
    }
    case "reject":
      action = { type: "reject", reason: str(body.reason, 1000) ?? "" };
      break;
    case "needs_manual_verification":
    case "needs_manual_source":
      action = { type: body.action, note: str(body.note, 1000) ?? undefined };
      break;
    default:
      return bad("Unknown action.");
  }
  const result = await decideReview(col, reviewId, expectedVersion, action, by);
  if ("error" in result) return bad(result.error, result.status);
  return NextResponse.json({ success: true, record: result.record }, { headers: noStore });
}
