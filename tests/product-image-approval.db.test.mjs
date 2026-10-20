// Approval pipeline end to end on an ISOLATED local MongoDB and the in-process fake Supabase Storage:
// review decisions, dry-run immutability, upload failures, conditional apply, idempotency, rollback, cleanup.
// Requires TEST_MONGODB_URI=mongodb://127.0.0.1:<port>. Nothing reaches Supabase or the live database.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { promisify } from "node:util";
import { startFakeSupabase } from "./support/fake-supabase-storage.mjs";

const require = createRequire(import.meta.url);
const run = promisify(execFile);
const uri = process.env.TEST_MONGODB_URI;
const skip = !(uri && /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(uri)) && "set TEST_MONGODB_URI to a local MongoDB";
const dbName = `halima_image_approval_test_${process.pid}`;
const SECRET = "sb_secret_test_only";
let client, db, products, reviews, fake, fakeUrl, state, repo;

const doc = (over) => ({
  id: over.sku.toLowerCase(), slug: over.sku.toLowerCase(), name: `Test ${over.sku}`, brand: "Gree", model: `${over.sku}M`, category: "Air Conditioners",
  categorySlug: "air-conditioners", price: 1999, stockCount: 3, inStock: true, status: "draft", images: [], createdAt: new Date("2026-10-01"), updatedAt: new Date("2026-10-02"), ...over,
});
const auth = { type: "written_permission", grantedBy: "Gree UAE Distributor", reference: "permission-evidence/gree-2026-10-19.pdf" };

async function cli(...args) { return cliEnv({}, ...args); }
async function cliEnv(extra, ...args) {
  const env = { ...process.env, MONGODB_URI: uri, MONGODB_DB: dbName, NEXT_PUBLIC_SUPABASE_URL: fakeUrl, SUPABASE_SECRET_KEY: SECRET, PIPELINE_STATE_DIR: state,
    IMAGE_SEARCH_PROVIDER: "none", IMAGE_VISION_PROVIDER: "none", SERPAPI_API_KEY: "", ANTHROPIC_API_KEY: "", R2_ACCOUNT_ID: "", ...extra };
  try {
    const r = await run(process.execPath, ["--import", "./tests/support/register-ts.mjs", "scripts/product-images/pipeline.mjs", ...args], { env, cwd: process.cwd(), timeout: 120_000 });
    return { code: 0, out: r.stdout + r.stderr };
  } catch (e) {
    return { code: e.code ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}
const objects = async () => (await (await fetch(`${fakeUrl}/__objects`)).json());
const snapshot = async () => JSON.stringify(await products.find({}, { projection: { _id: 0 } }).sort({ id: 1 }).toArray());
const loadState = (n) => JSON.parse(readFileSync(path.join(state, n), "utf8"));

before(async () => {
  if (skip) return;
  const { MongoClient } = require("mongodb");
  client = await new MongoClient(uri).connect();
  db = client.db(dbName);
  products = db.collection("products");
  reviews = db.collection("product_image_reviews");
  repo = await import("@/lib/repositories/product-image-reviews");
  fake = await startFakeSupabase({ secret: SECRET });
  fakeUrl = `http://127.0.0.1:${fake.port}`;
  state = mkdtempSync(path.join(tmpdir(), "approval-state-"));

  await products.insertMany([doc({ sku: "IMG-1" }), doc({ sku: "IMG-2", images: ["/featured/hisense-window-ac.png"], status: "draft" }), doc({ sku: "IMG-3", status: "active" })]);
  // A verified source image in the pipeline cache (generated test pattern — no real product photo).
  const sharp = require("sharp");
  const raw = Buffer.from(Array.from({ length: 900 * 600 * 3 }, (_, i) => (i * 31) % 253));
  const src = await sharp(raw, { raw: { width: 900, height: 600, channels: 3 } }).jpeg().toBuffer();
  const cacheFile = path.join(state, "source-img1.jpg");
  writeFileSync(cacheFile, src);
  const { sha256 } = await import("../scripts/product-images/images.mjs");
  const audit = { auditedAt: new Date().toISOString(), storage: { objects: 0, bytes: 0 }, products: ["IMG-1", "IMG-2", "IMG-3"].map((s) => ({ id: s.toLowerCase(), brand: "Gree", model: `${s}M`, imageClass: s === "IMG-2" ? "PLACEHOLDER" : "NO_IMAGE", images: s === "IMG-2" ? ["/featured/hisense-window-ac.png"] : [], singleModel: true })) };
  writeFileSync(path.join(state, "audit.json"), JSON.stringify(audit));
  writeFileSync(path.join(state, "verify.json"), "{}");
  writeFileSync(path.join(state, "permissions.json"), JSON.stringify({ holders: {} }));
  const base = (id, n, candidate) => ({ reviewId: `${id}:${n}`, productId: id, state: "pending_review", version: 1, rank: 0, history: [], candidate,
    product: { name: id, brand: "Gree", model: `${id.toUpperCase()}M`, images: [] } });
  await repo.ensureReviewIndexes(reviews);
  await repo.importDiscoveredReviews(reviews, [
    base("img-1", "a", { url: "https://www.gree.com/img/img-1m.jpg", sourcePage: "https://www.gree.com/p/img-1m", sourceType: "manufacturer", technicallyValid: true, modelEvidence: "exact model in title", permissionStatus: "permission_pending", cacheFile, sha256: sha256(src), width: 900, height: 600, format: "jpeg" }),
    base("img-2", "a", { url: "https://shop.example/img-2.jpg", sourcePage: "https://shop.example/p", sourceType: "other", technicallyValid: true, modelEvidence: "exact model in title", permissionStatus: "permission_pending", cacheFile, sha256: sha256(src) }),
    base("img-3", "a", { url: "https://shop.example/img-3.jpg", technicallyValid: true, permissionStatus: "permission_pending" }),
  ]);
});

after(async () => {
  if (skip) return;
  await db.dropDatabase();
  await client.close();
  fake.server.close();
});

test("review decisions: version-checked; approval needs exact model + authorization; products are never touched", { skip }, async () => {
  const before = await snapshot();
  const noAuth = await repo.decideReview(reviews, "img-1:a", 1, { type: "approve", exactModelConfirmed: true, authorization: null }, "admin@test");
  assert.equal(noAuth.status, 400);
  const notExact = await repo.decideReview(reviews, "img-1:a", 1, { type: "approve", exactModelConfirmed: false, authorization: auth }, "admin@test");
  assert.equal(notExact.status, 400);
  const ok = await repo.decideReview(reviews, "img-1:a", 1, { type: "approve", exactModelConfirmed: true, authorization: auth }, "admin@test");
  assert.equal(ok.record.state, "approved");
  const stale = await repo.decideReview(reviews, "img-1:a", 1, { type: "reject", reason: "x" }, "other-admin@test");
  assert.equal(stale.status, 409, "a decision on an outdated version is refused");
  assert.equal((await repo.decideReview(reviews, "img-2:a", 1, { type: "reject", reason: "watermarked" }, "admin@test")).record.state, "rejected");
  assert.equal(await repo.requestMoreCandidates(reviews, "img-2", "admin@test"), 1);
  assert.equal(await snapshot(), before, "approval, rejection and re-search requests never modify products");
  // Import never overwrites a decided record.
  const again = await repo.importDiscoveredReviews(reviews, [{ reviewId: "img-1:a", productId: "img-1", state: "pending_review", version: 1, history: [], candidate: { url: "https://changed.example/x.jpg" } }]);
  assert.deepEqual(again, { inserted: 0, refreshed: 0, untouched: 1, placeholdersRemoved: 0 });
  assert.equal((await reviews.findOne({ reviewId: "img-1:a" })).candidate.url, "https://www.gree.com/img/img-1m.jpg");
});

test("dry-run plans only the approved image and writes nothing", { skip }, async () => {
  const before = await snapshot();
  const r = await cli("dry-run");
  assert.equal(r.code, 0, r.out);
  const plan = loadState("plan.json");
  const item = plan.items.find((i) => i.id === "img-1");
  assert.equal(item.action, "UPLOAD_AND_SET");
  assert.equal(item.origin, "review");
  assert.equal(item.optimised.width, 800);
  assert.equal(item.optimised.height, 800);
  assert.match(item.key, /^products\/img-1\/[0-9a-f-]{36}\.webp$/);
  assert.ok(!plan.items.some((i) => i.id === "img-2" || i.id === "img-3"), "rejected and undecided reviews are not planned");
  assert.equal(await snapshot(), before, "no product changed");
  assert.deepEqual(await objects(), [], "no object uploaded");
  assert.equal((await cli("upload")).code !== 0, true, "upload refuses to run without --execute");
  assert.equal((await cli("apply")).code !== 0, true, "apply refuses to run without --execute");
  assert.equal(await snapshot(), before);
});

test("storage failure: nothing is linked; retry uploads once; apply sets only images; status unchanged; idempotent", { skip }, async () => {
  await fetch(`${fakeUrl}/__fail-puts?count=1`, { method: "POST" });
  let r = await cli("upload", "--execute");
  assert.match(r.out, /FAILED upload img-1/);
  assert.deepEqual(await objects(), []);
  r = await cli("apply", "--execute");
  assert.equal((await products.findOne({ id: "img-1" })).images.length, 0, "a failed upload is never linked");

  r = await cli("upload", "--execute");
  assert.match(r.out, /uploaded img-1/);
  assert.equal((await objects()).length, 1);
  const beforeDoc = await products.findOne({ id: "img-1" });
  r = await cli("apply", "--execute");
  assert.match(r.out, /applied img-1/, r.out);
  const afterDoc = await products.findOne({ id: "img-1" });
  assert.equal(afterDoc.images.length, 1);
  assert.match(afterDoc.images[0], /\/storage\/v1\/object\/public\/product-images\/products\/img-1\//);
  assert.equal(afterDoc.status, "draft", "approval and apply never publish");
  for (const k of ["price", "name", "sku", "category", "stockCount", "updatedAt"]) assert.deepEqual(afterDoc[k], beforeDoc[k], k);
  const review = await reviews.findOne({ reviewId: "img-1:a" });
  assert.equal(review.state, "uploaded");
  assert.equal(review.uploadedUrl, afterDoc.images[0]);
  assert.ok(loadState("progress.json")["img-1"].apply.manifest.startsWith("backups/apply-"), "backup manifest written before the write");
  writeFileSync(path.join(state, "plan-with-img-1.json"), readFileSync(path.join(state, "plan.json"))); // replayed after the rollback

  r = await cli("upload", "--execute");
  assert.match(r.out, /skip \(already uploaded\)|no longer the approved version/);
  r = await cli("apply", "--execute");
  assert.equal((await products.findOne({ id: "img-1" })).images.length, 1, "re-running apply adds nothing");
  assert.equal((await objects()).length, 1, "re-running upload stores nothing new");
});

test("conditional update: a product edited after the plan is not overwritten", { skip }, async () => {
  await repo.importDiscoveredReviews(reviews, [{ reviewId: "img-3:b", productId: "img-3", state: "pending_review", version: 1, rank: 1, history: [],
    candidate: { ...(await reviews.findOne({ reviewId: "img-1:a" })).candidate, url: "https://www.gree.com/img/img-3m.jpg" } }]);
  assert.ok("record" in (await repo.decideReview(reviews, "img-3:b", 1, { type: "approve", exactModelConfirmed: true, authorization: auth }, "admin@test")));
  assert.equal((await cli("dry-run")).code, 0);
  assert.equal((await cli("upload", "--execute", "--only=img-3")).code, 0);
  await products.updateOne({ id: "img-3" }, { $set: { images: ["https://admin-added.example/new.jpg"], updatedAt: new Date() } }); // concurrent admin edit
  const r = await cli("apply", "--execute", "--only=img-3");
  assert.match(r.out, /SKIPPED \(changed\)/);
  assert.deepEqual((await products.findOne({ id: "img-3" })).images, ["https://admin-added.example/new.jpg"]);
  assert.equal((await products.findOne({ id: "img-3" })).status, "active");
  assert.equal((await reviews.findOne({ reviewId: "img-3:b" })).state, "approved", "not marked uploaded when nothing was linked");
});

test("rollback restores the backup and returns the review to the queue; cleanup removes only unreferenced uploads", { skip }, async () => {
  const preview = await cli("rollback");
  assert.match(preview.out, /would restore img-1/);
  assert.equal((await products.findOne({ id: "img-1" })).images.length, 1, "preview changes nothing");
  const r = await cli("rollback", "--execute");
  assert.match(r.out, /restored img-1/);
  assert.deepEqual((await products.findOne({ id: "img-1" })).images, []);
  assert.equal((await products.findOne({ id: "img-1" })).status, "draft");
  assert.equal((await reviews.findOne({ reviewId: "img-1:a" })).state, "pending_review");
  writeFileSync(path.join(state, "plan.json"), readFileSync(path.join(state, "plan-with-img-1.json")));
  assert.match((await cli("apply", "--execute", "--only=img-1")).out, /rolled back after this plan/, "an old plan cannot re-apply a rolled-back image");
  assert.deepEqual((await products.findOne({ id: "img-1" })).images, []);

  const objs = await objects();
  assert.equal(objs.length, 2, "img-1 (rolled back) and img-3 (not linked) objects");
  assert.match((await cli("cleanup")).out, /would delete/);
  assert.equal((await objects()).length, 2, "cleanup preview deletes nothing");
  await cli("cleanup", "--execute");
  assert.deepEqual(await objects(), [], "both unreferenced pipeline uploads removed");
});

test("review-import: one record per target, products untouched, indexes, idempotent re-run, placeholder superseded, rollback", { skip }, async () => {
  await reviews.deleteMany({});
  for (const f of ["candidates.json", "verify.json"]) writeFileSync(path.join(state, f), "{}");
  const before = await snapshot();
  const preview = await cli("review-import");
  assert.match(preview.out, /"records":3/);
  assert.equal(await reviews.countDocuments(), 0, "preview writes nothing");

  const first = await cli("review-import", "--execute");
  assert.equal(first.code, 0, first.out);
  const out = JSON.parse(first.out.trim().split("\n").at(-1));
  assert.deepEqual([out.imported.inserted, out.imported.productsUnchanged], [3, true]);
  assert.equal(await snapshot(), before, "no product field changed (images, status, price, stock, updatedAt)");
  const recs = await reviews.find().toArray();
  assert.deepEqual(recs.map((r) => r.reviewId).sort(), ["img-1:source", "img-2:source", "img-3:source"]);
  assert.ok(recs.every((r) => r.state === "needs_manual_source" && r.importRun === out.run));
  const idx = await reviews.indexes();
  assert.ok(idx.some((i) => i.key.reviewId === 1 && i.unique), "unique reviewId index");
  assert.ok(idx.some((i) => i.key.productId === 1 && i.key.state === 1));
  assert.ok(readFileSync(path.join(state, "plan.json")) && JSON.parse(readFileSync(path.join(state, require("node:fs").readdirSync(path.join(state, "backups")).filter((f) => f.startsWith("review-import-")).map((f) => `backups/${f}`)[0]))).reviewsBefore.length === 0, "pre-import snapshot saved");

  const again = JSON.parse((await cli("review-import", "--execute")).out.trim().split("\n").at(-1));
  assert.deepEqual([again.imported.inserted, again.imported.refreshed, again.imported.untouched], [0, 0, 3], "re-run changes nothing");
  assert.ok((await reviews.find().toArray()).every((r) => r.version === 1), "no version bump on an unchanged re-run");

  // Later discovery finds a candidate for img-2: its placeholder is replaced by the real candidate.
  writeFileSync(path.join(state, "candidates.json"), JSON.stringify({ "img-2": { candidates: [{}], notes: [] } }));
  writeFileSync(path.join(state, "verify.json"), JSON.stringify({ "img-2": { results: [{ adapter: "serpapi", sourceType: "other", sourcePage: "https://shop.example/p", image: { url: "https://shop.example/img-2m.jpg" }, inspection: { ok: true, width: 900, height: 900, kind: "jpeg", sha256: "ab" }, confidence: "UNCERTAIN", exactModel: true, matchEvidence: "exact model in the result title", reasons: [] }] } }));
  const third = JSON.parse((await cli("review-import", "--execute")).out.trim().split("\n").at(-1));
  assert.equal(third.imported.placeholdersRemoved, 1);
  assert.equal(await reviews.countDocuments({ reviewId: "img-2:source" }), 0);
  assert.equal((await reviews.findOne({ productId: "img-2" })).state, "pending_review");

  // Rollback of the first run: removes untouched records only; an admin-touched record stays.
  await repo.decideReview(reviews, "img-1:source", 1, { type: "reject", reason: "discontinued model" }, "admin@test");
  const pre = JSON.parse((await cli("review-rollback", `--run=${out.run}`)).out.trim().split("\n").at(-1));
  assert.deepEqual([pre.removable, pre.kept, pre.deleted], [1, 1, 0]);
  const done = JSON.parse((await cli("review-rollback", `--run=${out.run}`, "--execute")).out.trim().split("\n").at(-1));
  assert.equal(done.deleted, 1);
  assert.deepEqual((await reviews.find().toArray()).map((r) => r.reviewId).sort(), ["img-1:source", (await reviews.findOne({ productId: "img-2" })).reviewId].sort());
  assert.equal(await snapshot(), before, "still no product change");
});

test("catalogue: extraction, matching and previews write nothing to products, reviews or storage", { skip }, async () => {
  const sharp = require("sharp");
  const dir = mkdtempSync(path.join(tmpdir(), "cat-db-"));
  writeFileSync(path.join(dir, "photo.png"), await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#cc2222" } }).png().toBuffer());
  const pdf = path.join(dir, "gree-test.pdf");
  await run("python3", ["-c", `
import fitz,sys
d=fitz.open();p=d.new_page(width=595,height=842)
p.insert_image(fitz.Rect(50,100,290,260),filename=sys.argv[1]+"/photo.png")
p.insert_text((320,270),"IMG-1M",fontsize=14)
d.save(sys.argv[2])`, dir, pdf]);
  const before = await snapshot(), reviewsBefore = await reviews.countDocuments(), objectsBefore = await objects();
  const env = { CATALOGUE_OCR: "0" };
  const r = await cliEnv(env, "catalogue", `--pdf=${pdf}`, "--brand=Gree");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /"databaseWrites": 0/);
  const cands = loadState("catalogue-candidates.json");
  assert.equal(cands.products["img-1"][0].evidence.text, "IMG-1M");
  assert.equal(await snapshot(), before, "no product changed");
  assert.equal(await reviews.countDocuments(), reviewsBefore, "no review record created");
  assert.deepEqual(await objects(), objectsBefore, "no storage object");
  const again = await cliEnv(env, "catalogue", `--pdf=${pdf}`, "--brand=Gree");
  assert.match(again.out, /"cached": true/);
  assert.deepEqual(loadState("catalogue-candidates.json").products, cands.products, "re-run gives the same candidates");
});
