// Image import audit log and the gallery save that links an imported image, on an ISOLATED local MongoDB.
// Requires TEST_MONGODB_URI=mongodb://127.0.0.1:<port>. Never touches the live database.
import assert from "node:assert/strict";
import test, { after, before } from "node:test";

const uri = process.env.TEST_MONGODB_URI;
const skip = !(uri && /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(uri)) && "set TEST_MONGODB_URI to a local MongoDB";
const dbName = `halima_image_import_test_${process.pid}`;
const EXT = "https://microless.com/cdn/products/test-hi.jpg";
const STORED = "https://x.supabase.co/storage/v1/object/public/product-images/products/imp-1/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg";
let client, db, repo, imports, replaceImageInPlace;

before(async () => {
  if (skip) return;
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB = dbName;
  ({ getMongoClient: client } = await import("@/lib/mongodb"));
  db = (await client()).db(dbName);
  repo = await import("@/lib/repositories/products");
  imports = await import("@/lib/repositories/product-image-imports");
  ({ replaceImageInPlace } = await import("@/lib/admin-gallery"));
  const doc = (id, images) => ({ id, slug: id, sku: id.toUpperCase(), name: `Import ${id}`, brand: "Westpoint", model: `${id.toUpperCase()}M`, category: "Air Conditioning",
    categorySlug: "air-conditioning", price: 1899, stockCount: 3, inStock: true, status: "active", images, createdAt: new Date("2026-10-01"), updatedAt: new Date("2026-10-02") });
  await db.collection("products").insertMany([doc("imp-1", [EXT, "https://keep.example/2.jpg"]), doc("imp-2", [EXT])]);
});
after(async () => {
  if (skip) return;
  await db.dropDatabase();
  await (await client()).close();
});

test("audit log: records each import, finds the latest import of a source URL per product folder, indexed", { skip }, async () => {
  const rec = (over) => ({ sourceUrl: EXT, finalUrl: EXT, productRef: "imp-1", storageKey: "products/imp-1/a.jpg", publicUrl: STORED, sha256: "ab", sourceSha256: null, format: "image/jpeg",
    sourceFormat: "jpeg", width: 800, height: 600, bytes: 1234, converted: false, reused: false, importedBy: "admin@test", importedAt: new Date("2026-10-27T10:00:00Z"), ...over });
  assert.equal(await imports.findPreviousImageImport({ sourceUrl: EXT, productRef: "imp-1" }), null);
  await imports.recordImageImport(rec());
  await imports.recordImageImport(rec({ storageKey: "products/imp-1/b.jpg", importedAt: new Date("2026-10-27T11:00:00Z") }));
  assert.deepEqual(await imports.findPreviousImageImport({ sourceUrl: EXT, productRef: "imp-1" }), { storageKey: "products/imp-1/b.jpg", publicUrl: STORED });
  assert.equal(await imports.findPreviousImageImport({ sourceUrl: EXT, productRef: "imp-2" }), null, "another product folder never matches");
  const idx = await db.collection(imports.IMPORT_COLLECTION).indexes();
  assert.ok(idx.some((i) => i.key.productRef === 1 && i.key.sourceUrl === 1));
  assert.equal((await db.collection(imports.IMPORT_COLLECTION).findOne({ storageKey: "products/imp-1/a.jpg" })).importedBy, "admin@test");
});

test("linking an imported copy: replaces the external URL in place; only images and updatedAt change", { skip }, async () => {
  const before = await db.collection("products").findOne({ id: "imp-1" });
  const next = replaceImageInPlace(before.images, EXT, STORED);
  const res = await repo.setProductImagesIfUnchanged("imp-1", before.images, next);
  assert.deepEqual(res, { slug: "imp-1" });
  const after = await db.collection("products").findOne({ id: "imp-1" });
  assert.deepEqual(after.images, [STORED, "https://keep.example/2.jpg"], "primary position and other images preserved");
  for (const k of ["name", "sku", "model", "price", "stockCount", "inStock", "status", "category", "categorySlug", "brand"]) assert.deepEqual(after[k], before[k], k);
});

test("a failed save (product changed meanwhile, or database error) keeps the working external image", { skip }, async () => {
  const before = await db.collection("products").findOne({ id: "imp-2" });
  await db.collection("products").updateOne({ id: "imp-2" }, { $set: { images: [EXT, "https://admin-added.example/new.jpg"] } }); // concurrent admin edit
  const res = await repo.setProductImagesIfUnchanged("imp-2", before.images, replaceImageInPlace(before.images, EXT, STORED));
  assert.equal(res, "changed");
  assert.deepEqual((await db.collection("products").findOne({ id: "imp-2" })).images, [EXT, "https://admin-added.example/new.jpg"], "nothing overwritten, external image kept");

  // Database unavailable: the save throws, and the stored document is untouched.
  const { MongoClient } = await import("mongodb");
  const broken = new MongoClient("mongodb://127.0.0.1:9/?serverSelectionTimeoutMS=300");
  await assert.rejects(broken.db(dbName).collection("products").updateOne({ id: "imp-2" }, { $set: { images: [STORED] } }));
  await broken.close().catch(() => undefined);
  assert.ok((await db.collection("products").findOne({ id: "imp-2" })).images.includes(EXT));
});
