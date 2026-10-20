/**
 * Product-image review records (collection `product_image_reviews`).
 *
 * Every decision is a conditional update on the record's `version`, so two admins (or an admin and the
 * pipeline) can never overwrite each other's decision. Nothing here reads or writes the `products`
 * collection except a read-only lookup of product facts for the queue — approving never publishes,
 * never changes status, price or any product field. Linking an approved image to a product is done by
 * the pipeline's separate upload/apply stage.
 */
import type { Collection, Db } from "mongodb";
import { getMongoDb } from "@/lib/mongodb";
import {
  applyReviewAction,
  REVIEW_STATES,
  type AuthorizationEvidence,
  type ReviewAction,
  type ReviewRecord,
  type ReviewState,
} from "@/lib/product-image-review";

export const REVIEW_COLLECTION = "product_image_reviews";
const UNDECIDED: ReviewState[] = ["discovered", "needs_manual_verification", "needs_manual_source", "pending_review"];

export async function reviewCollection(db?: Db): Promise<Collection<ReviewRecord>> {
  return (db ?? (await getMongoDb())).collection<ReviewRecord>(REVIEW_COLLECTION);
}

export async function ensureReviewIndexes(col: Collection<ReviewRecord>) {
  await col.createIndex({ reviewId: 1 }, { unique: true });
  await col.createIndex({ productId: 1, state: 1 });
  await col.createIndex({ state: 1, updatedAt: -1 });
}

export type DecisionResult = { record: ReviewRecord } | { error: string; status: 400 | 404 | 409 };

/** Applies an admin decision if the record is still at `expectedVersion`. */
export async function decideReview(
  col: Collection<ReviewRecord>,
  reviewId: string,
  expectedVersion: number,
  action: ReviewAction,
  by: string,
  now = new Date().toISOString()
): Promise<DecisionResult> {
  const current = await col.findOne({ reviewId }, { projection: { _id: 0 } });
  if (!current) return { error: "Review not found.", status: 404 };
  if (current.version !== expectedVersion) return { error: "This review changed since it was loaded. Reload and try again.", status: 409 };
  const result = applyReviewAction(current, action, by, now);
  if ("error" in result) return { error: result.error, status: 400 };
  const { record } = result;
  const set: Partial<ReviewRecord> = {
    state: record.state, version: record.version, updatedAt: record.updatedAt, history: record.history,
    exactModelConfirmed: record.exactModelConfirmed ?? false, authorization: record.authorization ?? null,
    decidedBy: record.decidedBy ?? null, decidedAt: record.decidedAt ?? null, rejectionReason: record.rejectionReason ?? null,
    uploadedUrl: record.uploadedUrl ?? null,
  };
  const res = await col.updateOne({ reviewId, version: expectedVersion, state: current.state }, { $set: set });
  if (res.matchedCount !== 1) return { error: "This review changed since it was loaded. Reload and try again.", status: 409 };
  return { record };
}

/** Flags a product for another discovery round (picked up by `pipeline.mjs discover --requested`). */
export async function requestMoreCandidates(col: Collection<ReviewRecord>, productId: string, by: string, now = new Date().toISOString()) {
  const res = await col.updateMany(
    { productId, state: { $in: [...UNDECIDED, "rejected"] } },
    { $set: { moreCandidatesRequestedAt: now, updatedAt: now }, $push: { history: { at: now, by, from: "pending_review", to: "pending_review", note: "more candidates requested" } } as never }
  );
  return res.matchedCount;
}

/**
 * Records an image the client supplied (already uploaded to our storage through the admin upload flow).
 * It starts in `pending_review` with the proposed authorization attached; an explicit approval with
 * exact-model confirmation is still required.
 */
export async function addClientSuppliedImage(
  col: Collection<ReviewRecord>,
  input: { productId: string; product: ReviewRecord["product"]; storageUrl: string; authorization: AuthorizationEvidence; by: string; fingerprint: string },
  now = new Date().toISOString()
): Promise<ReviewRecord> {
  const record: ReviewRecord = {
    reviewId: `${input.productId}:client:${input.fingerprint.slice(0, 32)}`,
    productId: input.productId,
    product: input.product,
    state: "pending_review",
    version: 1,
    rank: 0,
    candidate: {
      storageUrl: input.storageUrl, sourceType: "client_supplied", sourcePage: input.authorization.reference,
      technicallyValid: true, modelEvidence: "supplied by the client for this product", discoveredAt: now,
      permissionStatus: "client_supplied", checks: ["uploaded through the admin upload flow (type, size and file signature verified)"],
    },
    authorization: input.authorization,
    exactModelConfirmed: false,
    createdAt: now,
    updatedAt: now,
    history: [{ at: now, by: input.by, from: "pending_review", to: "pending_review", note: "client-supplied image added" }],
  };
  await col.updateOne({ reviewId: record.reviewId }, { $setOnInsert: record }, { upsert: true });
  return (await col.findOne({ reviewId: record.reviewId }, { projection: { _id: 0 } })) as ReviewRecord;
}

/**
 * Pipeline import: inserts new records; refreshes only technical/AI fields of records nobody has decided yet,
 * and only when they actually changed (an unchanged re-run bumps no version, so open admin forms stay valid).
 * Decided records (approved, rejected, uploaded) are never changed by an import. When a product now has real
 * candidates, its undecided "no source found" placeholder (`<productId>:source`) is removed.
 * `importRun` tags inserted records so one import can be undone with `removeImportRun`.
 */
export async function importDiscoveredReviews(col: Collection<ReviewRecord>, records: ReviewRecord[], now = new Date().toISOString(), importRun?: string) {
  let inserted = 0, refreshed = 0, untouched = 0, placeholdersRemoved = 0;
  // The driver stores undefined fields as null, so compare with undefined → null on both sides.
  const norm = (v: unknown) => JSON.stringify(v ?? null, (_k, x) => (x === undefined ? null : x));
  const same = (a: unknown, b: unknown) => norm(a) === norm(b);
  for (const r of records) {
    const ins = await col.updateOne({ reviewId: r.reviewId }, { $setOnInsert: { ...r, createdAt: now, updatedAt: now, ...(importRun ? { importRun } : {}) } }, { upsert: true });
    if (ins.upsertedCount) { inserted++; continue; }
    const cur = await col.findOne({ reviewId: r.reviewId }, { projection: { _id: 0 } });
    if (!cur || !UNDECIDED.includes(cur.state) || (same(cur.candidate, r.candidate) && same(cur.product, r.product) && cur.rank === r.rank)) { untouched++; continue; }
    const upd = await col.updateOne(
      { reviewId: r.reviewId, version: cur.version, state: { $in: UNDECIDED } }, // never races an admin decision
      { $set: { candidate: r.candidate, product: r.product, rank: r.rank, moreCandidatesRequestedAt: null, updatedAt: now }, $inc: { version: 1 } }
    );
    if (upd.modifiedCount) refreshed++; else untouched++;
  }
  const withCandidates = [...new Set(records.filter((r) => !r.reviewId.endsWith(":source")).map((r) => r.productId))];
  if (withCandidates.length) {
    const del = await col.deleteMany({ reviewId: { $in: withCandidates.map((id) => `${id}:source`) }, state: { $in: ["needs_manual_source", "discovered"] } });
    placeholdersRemoved = del.deletedCount;
  }
  return { inserted, refreshed, untouched, placeholdersRemoved };
}

/**
 * Undo one import: deletes the records that import inserted, but only those nobody has acted on since
 * (still version 1, still undecided). Records an admin touched are kept and reported.
 */
export async function removeImportRun(col: Collection<ReviewRecord>, importRun: string, execute: boolean) {
  const filter = { importRun, version: 1, state: { $in: UNDECIDED } };
  const removable = await col.countDocuments(filter);
  const kept = await col.countDocuments({ importRun, $nor: [filter] });
  if (!execute) return { removable, kept, deleted: 0 };
  const del = await col.deleteMany(filter);
  return { removable, kept, deleted: del.deletedCount };
}

/** Pipeline apply: approved → uploaded, only if nobody changed the record since it was planned. */
export async function markReviewUploaded(col: Collection<ReviewRecord>, reviewId: string, expectedVersion: number, uploadedUrl: string, by: string, now = new Date().toISOString()) {
  return decideReview(col, reviewId, expectedVersion, { type: "mark_uploaded", uploadedUrl }, by, now);
}

/** Pipeline rollback: the product's images were restored, so the record goes back to the queue. */
export async function markReviewRolledBack(col: Collection<ReviewRecord>, reviewId: string, by: string, now = new Date().toISOString()) {
  const res = await col.updateOne(
    { reviewId, state: "uploaded" },
    {
      $set: { state: "pending_review", rolledBackAt: now, updatedAt: now, uploadedUrl: null, exactModelConfirmed: false },
      $inc: { version: 1 },
      $push: { history: { at: now, by, from: "uploaded", to: "pending_review", note: "rolled back: product images restored from backup" } } as never,
    }
  );
  return res.modifiedCount === 1;
}

export interface QueueQuery { states?: ReviewState[]; productId?: string; limit?: number }

/** Review records grouped by product, with the product's current (read-only) facts. */
export async function listReviewQueue(db: Db, query: QueueQuery = {}) {
  const col = await reviewCollection(db);
  const states = (query.states ?? []).filter((s) => (REVIEW_STATES as readonly string[]).includes(s));
  const filter: Record<string, unknown> = {};
  if (states.length) filter.state = { $in: states };
  if (query.productId) filter.productId = query.productId;
  const records = await col.find(filter, { projection: { _id: 0 } }).sort({ productId: 1, rank: 1 }).limit(Math.min(query.limit ?? 500, 2000)).toArray();
  const ids = [...new Set(records.map((r) => r.productId))];
  const products = await db.collection("products")
    .find({ id: { $in: ids } }, { projection: { _id: 0, id: 1, slug: 1, name: 1, brand: 1, model: 1, sku: 1, category: 1, status: 1, images: 1 } })
    .toArray();
  const byId = new Map(products.map((p) => [p.id as string, p]));
  const groups = ids.map((id) => ({ productId: id, product: byId.get(id) ?? null, reviews: records.filter((r) => r.productId === id) }));
  const counts = Object.fromEntries(
    (await col.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$state", n: { $sum: 1 } } }]).toArray()).map((c) => [c._id, c.n])
  );
  return { groups, counts };
}
