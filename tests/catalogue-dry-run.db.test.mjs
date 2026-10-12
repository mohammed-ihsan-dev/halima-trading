// Integration tests against a real but ISOLATED MongoDB (never Atlas, never production data).
// Requires TEST_MONGODB_URI pointing at a local server, e.g. mongodb://127.0.0.1:27199
// Each run creates its own throwaway database and drops it afterwards.
import assert from "node:assert/strict";
import test, { after, before } from "node:test";

const uri = process.env.TEST_MONGODB_URI;
const isLocal = !!uri && /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(uri);
const skip = !isLocal && "set TEST_MONGODB_URI to a local MongoDB (mongodb://127.0.0.1:<port>) to run these tests";
const dbName = `halima_catalogue_test_${process.pid}`;

let products, getMongoClient, runCatalogueDryRun, importSafeCatalogueRecords, insertProductsWithoutOverwrite, buildProductDocument;

before(async () => {
  if (skip) return;
  // The app reads its connection from these, so the modules under test talk to the throwaway DB.
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB = dbName;
  ({ getMongoClient } = await import("@/lib/mongodb"));
  ({ runCatalogueDryRun } = await import("@/lib/catalogue-dry-run"));
  ({ importSafeCatalogueRecords } = await import("@/lib/catalogue-import"));
  ({ insertProductsWithoutOverwrite, buildProductDocument } = await import("@/lib/repositories/products"));
  const client = await getMongoClient();
  products = client.db(dbName).collection("products");
  await products.createIndex({ sku: 1 }, { unique: true });
  await products.createIndex({ slug: 1 }, { unique: true });
});

after(async () => {
  if (skip) return;
  const client = await getMongoClient();
  await client.db(dbName).dropDatabase(); // only ever this test's own database
  await client.close();
});

const existingDoc = () => ({
  ...buildProductDocument({
    id: "p-existing-1", slug: "o-general-1-5-ton-window-ac", sku: "HT-AI-113", name: "O GENERAL 1.5 Ton Window Ac",
    brand: "O General", model: "AXG18 AE", category: "Air Conditioning", price: 2000, stockCount: 4, deliveryRate: 75,
    images: ["/featured/hisense-window-ac.png"],
  }),
  createdAt: new Date("2026-09-21T12:35:28.355Z"),
  updatedAt: new Date("2026-09-24T00:37:12.927Z"),
});

const incoming = (n, overrides = {}) => ({
  id: `lg-import-${n}`, slug: `lg-import-product-${n}`, sku: `LG-IMP-${n}`, name: `LG Import Product ${n}`,
  brand: "LG", model: `LGM${String(n).padStart(3, "0")}X`, category: "Refrigeration", description: "Imported", price: 0, currency: "AED",
  images: [], inStock: true, stockCount: 1, featured: false, deliveryRate: 75, status: "active", ...overrides,
});

const collectionWrites = async () => {
  const [stats] = await products.aggregate([{ $collStats: { latencyStats: {} } }]).toArray();
  return stats.latencyStats.writes.ops;
};
const snapshot = async () => (await products.find({}).sort({ _id: 1 }).toArray()).map((d) => ({ ...d, _id: String(d._id) }));

test("12/13. real dry run: zero write operations on the collection, every document byte-identical", { skip }, async () => {
  await products.deleteMany({});
  await products.insertOne(existingDoc());
  const docsBefore = await snapshot();
  const writesBefore = await collectionWrites();

  const report = await runCatalogueDryRun(
    [incoming(1), incoming(2, { sku: "ht-ai-113" }), incoming(3, { slug: "o-general-1-5-ton-window-ac" })],
    { fileName: "catalogue.json" }
  );

  assert.equal(await collectionWrites(), writesBefore, "MongoDB recorded a write on products during the dry run");
  assert.deepEqual(await snapshot(), docsBefore, "a stored document changed");
  assert.equal(report.database.name, dbName);
  assert.equal(report.database.existingCountBefore, 1);
  assert.equal(report.database.unchanged, true);
  assert.deepEqual(report.rows.map((r) => r.group), ["SAFE_TO_IMPORT", "SKIP_SKU_EXISTS", "SKIP_SLUG_EXISTS"]);
  assert.equal(report.rows[1].conflicts[0].existing.id, "p-existing-1");
});

test("14. a future import never overwrites an existing product", { skip }, async () => {
  await products.deleteMany({});
  await products.insertOne(existingDoc());
  const before = await products.findOne({ sku: "HT-AI-113" });

  const result = await importSafeCatalogueRecords(
    [incoming(10, { sku: "HT-AI-113", name: "SHOULD NOT OVERWRITE", price: 1 }), incoming(11, { category: "Refrigerators & Freezers" })],
    { fileName: "catalogue.json", confirm: true }
  );
  assert.equal(result.check.rows[0].group, "SKIP_SKU_EXISTS");
  assert.deepEqual(result.write.inserted.map((i) => i.sku), ["LG-IMP-11"]);
  const inserted = await products.findOne({ sku: "LG-IMP-11" });
  assert.equal(inserted.category, "Refrigeration", "the store category is saved, not the supplier label");
  assert.equal(inserted.categorySlug, "refrigeration");
  assert.deepEqual(inserted.images, [], "no placeholder image is invented");
  assert.equal(inserted.status, "draft", "imports never publish");
  assert.deepEqual(await products.findOne({ sku: "HT-AI-113" }), before, "existing product was modified");
  assert.equal(await products.countDocuments(), 2);

  // Even if a conflicting document reached the writer directly, it is rejected rather than merged.
  const direct = await insertProductsWithoutOverwrite([{ ...existingDoc(), name: "OVERWRITE ATTEMPT", slug: "new-slug" }]);
  assert.equal(direct.inserted.length, 0);
  assert.match(direct.rejected[0].reason, /already exists/);
  assert.deepEqual(await products.findOne({ sku: "HT-AI-113" }), before);

  await assert.rejects(() => importSafeCatalogueRecords([incoming(12)], { fileName: "x.json", confirm: false }), /confirmation/);
});

test("15. duplicate-key errors from concurrent imports are handled, not thrown, and nothing duplicates", { skip }, async () => {
  await products.deleteMany({});
  // Deterministic: a record that passed its check but was inserted by someone else in the meantime.
  const raced = buildProductDocument({ ...incoming(20), images: [] });
  await products.insertOne({ ...raced });
  const res = await insertProductsWithoutOverwrite([raced, buildProductDocument(incoming(21))]);
  assert.deepEqual(res.inserted.map((i) => i.sku), ["LG-IMP-21"], "ordered:false must still insert the other record");
  assert.equal(res.rejected[0].sku, "LG-IMP-20");
  assert.match(res.rejected[0].reason, /SKU already exists/);

  // Two imports of the same file at the same moment.
  const file = [22, 23, 24, 25].map((n) => incoming(n));
  const [a, b] = await Promise.all([
    importSafeCatalogueRecords(file, { fileName: "a.json", confirm: true }),
    importSafeCatalogueRecords(file, { fileName: "b.json", confirm: true }),
  ]);
  assert.equal(a.write.inserted.length + b.write.inserted.length, 4, "each product inserted exactly once");
  for (const n of [22, 23, 24, 25]) assert.equal(await products.countDocuments({ sku: `LG-IMP-${n}` }), 1);
  for (const r of [...a.write.rejected, ...b.write.rejected]) assert.match(r.reason, /already exists/);
});

test("10. MongoDB unreachable → dry run rejects with DryRunDatabaseError", { skip }, async () => {
  const { DryRunDatabaseError } = await import("@/lib/catalogue-dry-run");
  const dead = { find: () => ({ toArray: () => Promise.reject(new Error("ECONNREFUSED")) }), aggregate: () => ({ toArray: () => Promise.reject(new Error("ECONNREFUSED")) }), countDocuments: () => Promise.reject(new Error("ECONNREFUSED")) };
  await assert.rejects(() => runCatalogueDryRun([incoming(1)], { fileName: "x.json", products: dead }), DryRunDatabaseError);
});
