// Replacement review end to end on an ISOLATED local MongoDB and the in-process fake Supabase Storage:
// opt-in only, local-file candidates with previews, catalogue crops for included products, permission enforcement,
// --execute enforcement, failed upload / failed conditional update keep the old image, replace + rollback.
// Requires TEST_MONGODB_URI=mongodb://127.0.0.1:<port>. Nothing reaches Supabase or the live database.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
const dbName = `halima_image_replacement_test_${process.pid}`;
const SECRET = "sb_secret_test_only";
const THUMB = "https://encrypted-tbn0.gstatic.com/images?q=tbn:rep1";
const BROKEN = "https://gone.example/rep1-old.jpg";
let client, db, products, reviews, fake, fakeUrl, state, repo, work;

const doc = (over) => ({ slug: over.id, name: `Test ${over.id}`, brand: "Gree", model: `${over.id.toUpperCase()}M`, sku: over.id.toUpperCase(), category: "Air Conditioning", categorySlug: "air-conditioning",
  price: 2499, stockCount: 4, inStock: true, status: "active", images: [], createdAt: new Date("2026-10-01"), updatedAt: new Date("2026-10-02"), ...over });
const auth = { type: "client_supplied", grantedBy: "Gree UAE distributor (test)", reference: "permission-evidence/test-grant.pdf" };

async function cli(...args) {
  const env = { ...process.env, MONGODB_URI: uri, MONGODB_DB: dbName, NEXT_PUBLIC_SUPABASE_URL: fakeUrl, SUPABASE_SECRET_KEY: SECRET, PIPELINE_STATE_DIR: state,
    IMAGE_SEARCH_PROVIDER: "none", IMAGE_VISION_PROVIDER: "none", SERPAPI_API_KEY: "", ANTHROPIC_API_KEY: "", ICECAT_API_TOKEN: "", ICECAT_CONTENT_TOKEN: "", R2_ACCOUNT_ID: "", CATALOGUE_OCR: "0" };
  try {
    const r = await run(process.execPath, ["--import", "./tests/support/register-ts.mjs", "scripts/product-images/pipeline.mjs", ...args], { env, cwd: process.cwd(), timeout: 180_000 });
    return { code: 0, out: r.stdout + r.stderr };
  } catch (e) {
    return { code: e.code ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}
const lastJson = (out) => JSON.parse(out.trim().split("\n").filter((l) => l.startsWith("{")).at(-1));
const objects = async () => (await (await fetch(`${fakeUrl}/__objects`)).json());
const snapshot = async () => JSON.stringify(await products.find({}, { projection: { _id: 0 } }).sort({ id: 1 }).toArray());
const loadState = (n) => JSON.parse(readFileSync(path.join(state, n), "utf8"));
const ext = (ref, w, h, valid = true) => ({ ref, type: "external", valid, width: w, height: h });
const INCLUDE = ["--include-classes=EXTERNAL_NEEDS_VERIFICATION", "--only=rep-1,rep-2"];

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
  state = mkdtempSync(path.join(tmpdir(), "replacement-state-"));
  work = mkdtempSync(path.join(process.cwd(), "tests/.tmp-replacement-")); // local files must sit under the project root
  await products.insertMany([
    doc({ id: "rep-1", images: [THUMB, BROKEN] }), // only a Google thumbnail (+ a broken reference that existing rules keep)
    doc({ id: "rep-2", images: [THUMB.replace("rep1", "rep2"), "https://brand.example/rep-2-big.jpg"] }), // also has a usable image → not replaceable
    doc({ id: "def-1", images: [], status: "draft" }), // default target
  ]);
  const audit = { auditedAt: new Date().toISOString(), storage: { objects: 0, bytes: 0 }, products: [
    { id: "rep-1", brand: "Gree", model: "REP-1M", sku: "REP-1", imageClass: "EXTERNAL_NEEDS_VERIFICATION", images: [THUMB, BROKEN], singleModel: true, refs: [ext(THUMB, 225, 225), ext(BROKEN, null, null, false)] },
    { id: "rep-2", brand: "Gree", model: "REP-2M", sku: "REP-2", imageClass: "EXTERNAL_NEEDS_VERIFICATION", images: [THUMB.replace("rep1", "rep2"), "https://brand.example/rep-2-big.jpg"], singleModel: true,
      refs: [ext(THUMB.replace("rep1", "rep2"), 225, 225), ext("https://brand.example/rep-2-big.jpg", 1200, 1200)] },
    { id: "def-1", brand: "Gree", model: "DEF-1M", sku: "DEF-1", imageClass: "NO_IMAGE", images: [], singleModel: true, refs: [] },
  ] };
  writeFileSync(path.join(state, "audit.json"), JSON.stringify(audit));
  writeFileSync(path.join(state, "permissions.json"), JSON.stringify({ holders: {} }));
  const sharp = require("sharp");
  const raw = Buffer.from(Array.from({ length: 1000 * 700 * 3 }, (_, i) => (i * 37) % 251)); // generated test pattern, not a product photo
  writeFileSync(path.join(work, "rep-1m.jpg"), await sharp(raw, { raw: { width: 1000, height: 700, channels: 3 } }).jpeg().toBuffer());
  writeFileSync(path.join(work, "rep-2m.jpg"), await sharp(raw, { raw: { width: 1000, height: 700, channels: 3 } }).png().toBuffer());
  writeFileSync(path.join(state, "local-candidates.json"), JSON.stringify({ products: {
    "rep-1": [{ file: path.relative(process.cwd(), path.join(work, "rep-1m.jpg")), sourceType: "client-supplied file", sourcePage: "catalogues-source/rep-1m.jpg" }],
    "rep-2": [{ file: path.relative(process.cwd(), path.join(work, "rep-2m.jpg")), sourceType: "client-supplied file" }],
  } }));
});

after(async () => {
  if (skip) return;
  await db.dropDatabase();
  await client.close();
  fake.server.close();
  require("node:fs").rmSync(work, { recursive: true, force: true });
});

test("default workflow unchanged: without the opt-in, replaceable products are not targets", { skip }, async () => {
  const pre = lastJson((await cli("review-import")).out);
  assert.equal(pre.products, 1, "only the default target (def-1)");
  const pilot = await cli("pilot", "--only=rep-1,rep-2,def-1");
  assert.deepEqual(loadState("pilot.json").ids, ["def-1"], pilot.out);
  const refused = await cli("review-import", "--include-classes=EXTERNAL_NEEDS_VERIFICATION");
  assert.notEqual(refused.code, 0);
  assert.match(refused.out, /requires an explicit product selection/);
  assert.match((await cli("review-import", "--include-classes=EMBEDDED_PRESERVED", "--only=rep-1")).out, /accepts only/);
});

test("opt-in: local candidates are discovered, verified with a reviewable preview, and imported as a replacement review", { skip }, async () => {
  const before = await snapshot();
  let r = await cli("discover", "--source=local", ...INCLUDE);
  assert.equal(r.code, 0, r.out);
  const cands = loadState("candidates.json");
  assert.equal(cands["rep-1"].candidates[0].adapter, "local-file");
  assert.equal(cands["rep-2"], undefined, "a product with a usable image is not a replacement target");
  r = await cli("verify", "--no-vision", ...INCLUDE);
  assert.equal(r.code, 0, r.out);
  const v = loadState("verify.json")["rep-1"].results[0];
  assert.equal(v.confidence, "UNCERTAIN", "a local file is never HIGH");
  assert.match(v.localPreview, /^catalogue\/local\/previews\/[0-9a-f]{24}\.webp$/);
  assert.ok(existsSync(path.join(state, v.localPreview)));
  r = await cli("review-import", "--execute", ...INCLUDE);
  assert.equal(r.code, 0, r.out);
  const rec = await reviews.findOne({ productId: "rep-1" });
  assert.equal(rec.state, "needs_manual_verification");
  assert.deepEqual(rec.candidate.replaces.refs, [THUMB], "only the thumbnail; the broken reference is not listed");
  assert.equal(rec.candidate.localPreview, v.localPreview);
  assert.equal(await reviews.countDocuments({ productId: "rep-2" }), 0);
  assert.equal(await snapshot(), before, "discover, verify and review-import never touch products");
});

test("permission enforcement and --execute: nothing is planned or written without an approved, authorized review", { skip }, async () => {
  const before = await snapshot();
  const rec = await reviews.findOne({ productId: "rep-1" });
  assert.equal((await cli("dry-run", ...INCLUDE)).code, 0);
  assert.ok(!loadState("plan.json").items.some((i) => i.id === "rep-1" && i.action === "UPLOAD_AND_SET"), "unapproved → not planned");
  assert.equal((await repo.decideReview(reviews, rec.reviewId, rec.version, { type: "approve", exactModelConfirmed: true, authorization: { ...auth, reference: "" } }, "admin@test")).status, 400);
  assert.equal((await repo.decideReview(reviews, rec.reviewId, rec.version, { type: "approve", exactModelConfirmed: false, authorization: auth }, "admin@test")).status, 400);
  assert.equal((await repo.decideReview(reviews, rec.reviewId, rec.version, { type: "approve", exactModelConfirmed: true, authorization: auth }, "admin@test")).record.state, "approved");
  const r = await cli("dry-run", ...INCLUDE);
  assert.equal(r.code, 0, r.out);
  const item = loadState("plan.json").items.find((i) => i.id === "rep-1");
  assert.equal(item.action, "UPLOAD_AND_SET");
  assert.deepEqual(item.before, [THUMB, BROKEN]);
  assert.deepEqual(item.after, [item.url, BROKEN], "thumbnail replaced; the other reference is kept");
  assert.deepEqual(item.replacement.removeRefs, [THUMB]);
  assert.notEqual((await cli("upload")).code, 0, "upload refuses without --execute");
  assert.notEqual((await cli("apply")).code, 0, "apply refuses without --execute");
  assert.deepEqual(await objects(), []);
  assert.equal(await snapshot(), before);
});

test("failed upload, then failed conditional update: the product keeps its previous image", { skip }, async () => {
  await fetch(`${fakeUrl}/__fail-puts?count=1`, { method: "POST" });
  assert.match((await cli("upload", "--execute", "--only=rep-1")).out, /FAILED upload rep-1/);
  await cli("apply", "--execute", "--only=rep-1");
  assert.deepEqual((await products.findOne({ id: "rep-1" })).images, [THUMB, BROKEN], "nothing removed after a failed upload");

  assert.match((await cli("upload", "--execute", "--only=rep-1")).out, /uploaded rep-1/);
  await products.updateOne({ id: "rep-1" }, { $set: { updatedAt: new Date("2026-10-20") } }); // edited after the plan (same images)
  const r = await cli("apply", "--execute", "--only=rep-1");
  assert.match(r.out, /SKIPPED \(changed\)/);
  assert.deepEqual((await products.findOne({ id: "rep-1" })).images, [THUMB, BROKEN], "a failed conditional update removes nothing");
  await products.updateOne({ id: "rep-1" }, { $set: { updatedAt: new Date("2026-10-02") } }); // restore for the next test
});

test("approved replacement: thumbnail replaced after a verified upload, other fields intact, backup kept, rollback restores it", { skip }, async () => {
  const beforeDoc = await products.findOne({ id: "rep-1" });
  const r = await cli("apply", "--execute", "--only=rep-1");
  assert.match(r.out, /applied rep-1/, r.out);
  const afterDoc = await products.findOne({ id: "rep-1" });
  const item = loadState("plan.json").items.find((i) => i.id === "rep-1");
  assert.deepEqual(afterDoc.images, [item.url, BROKEN]);
  assert.ok(!afterDoc.images.includes(THUMB));
  for (const k of ["price", "status", "name", "sku", "category", "stockCount", "updatedAt"]) assert.deepEqual(afterDoc[k], beforeDoc[k], k);
  const st = loadState("progress.json")["rep-1"];
  assert.deepEqual(st.backup.images, [THUMB, BROKEN], "previous references recorded before the write");
  assert.ok(st.apply.manifest.startsWith("backups/apply-"));
  assert.ok(loadState(st.apply.manifest).items[0].before.includes(THUMB), "apply manifest records the replacement");
  assert.equal((await reviews.findOne({ productId: "rep-1" })).state, "uploaded");

  assert.match((await cli("rollback")).out, /would restore rep-1/);
  assert.match((await cli("rollback", "--execute")).out, /restored rep-1/);
  assert.deepEqual((await products.findOne({ id: "rep-1" })).images, [THUMB, BROKEN], "rollback restores the original thumbnail");
  assert.equal((await products.findOne({ id: "rep-1" })).status, "active");
});

test("catalogue crops: only explicitly included replacement products get crops", { skip }, async () => {
  const sharp = require("sharp");
  const dir = mkdtempSync(path.join(tmpdir(), "rep-cat-"));
  writeFileSync(path.join(dir, "photo.png"), await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#2266cc" } }).png().toBuffer());
  const pdf = path.join(dir, "gree-rep.pdf");
  await run("python3", ["-c", `
import fitz,sys
d=fitz.open();p=d.new_page(width=595,height=842)
p.insert_image(fitz.Rect(50,100,290,260),filename=sys.argv[1]+"/photo.png")
p.insert_text((320,270),"REP-1M",fontsize=14)
d.save(sys.argv[2])`, dir, pdf]);
  const before = await snapshot(), objectsBefore = await objects();
  let r = await cli("catalogue", `--pdf=${pdf}`, "--brand=Gree");
  assert.equal(r.code, 0, r.out);
  assert.equal(loadState("catalogue-candidates.json").products["rep-1"], undefined, "default: no crop for a non-target");
  r = await cli("catalogue", `--pdf=${pdf}`, "--brand=Gree", ...INCLUDE);
  assert.equal(r.code, 0, r.out);
  const c = loadState("catalogue-candidates.json").products["rep-1"]?.[0];
  assert.ok(c, r.out);
  assert.equal(c.evidence.text, "REP-1M");
  assert.ok(existsSync(path.join(state, c.extracted)) && existsSync(path.join(state, c.preview)) && existsSync(path.join(state, c.highlight)), "crop, preview and page highlight written to the state directory");
  assert.equal(await snapshot(), before);
  assert.deepEqual(await objects(), objectsBefore);
  // The crop feeds discovery from this (rehearsal) state directory.
  r = await cli("discover", "--source=local", ...INCLUDE);
  assert.ok(loadState("candidates.json")["rep-1"].candidates.some((x) => x.adapter === "catalogue-pdf"), r.out);
});
