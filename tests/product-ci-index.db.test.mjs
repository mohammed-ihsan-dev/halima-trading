// Case-insensitive SKU/slug uniqueness migration, against an ISOLATED local MongoDB only.
// Requires TEST_MONGODB_URI=mongodb://127.0.0.1:<port>
import assert from "node:assert/strict";
import test, { after, before } from "node:test";

const uri = process.env.TEST_MONGODB_URI;
const skip = !(uri && /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(uri)) && "set TEST_MONGODB_URI to a local MongoDB";
const dbName = `halima_ci_index_test_${process.pid}`;
let products, getMongoClient, insertProductsWithoutOverwrite, migration;

const doc = (sku, slug) => ({ id: `p-${sku}`, sku, slug, name: sku, brand: "LG", category: "Refrigeration", price: 0, stockCount: 1, status: "active" });

before(async () => {
  if (skip) return;
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB = dbName;
  ({ getMongoClient } = await import("@/lib/mongodb"));
  ({ insertProductsWithoutOverwrite } = await import("@/lib/repositories/products"));
  migration = await import("../scripts/product-ci-unique-indexes.mjs");
  products = (await getMongoClient()).db(dbName).collection("products");
  // Same indexes production has today.
  await products.createIndex({ sku: 1 }, { unique: true });
  await products.createIndex({ slug: 1 }, { unique: true });
});
after(async () => {
  if (skip) return;
  const client = await getMongoClient();
  await client.db(dbName).dropDatabase();
  await client.close();
});

test("check is read-only and refuses to apply when case-variant duplicates exist", { skip }, async () => {
  await products.deleteMany({});
  await products.insertMany([doc("AB-1", "ab-one"), doc("ab-1", "ab-one-lower")]);
  const check = await migration.checkCaseInsensitiveUniqueness(products);
  assert.equal(check.ready, false);
  assert.match(check.blockers[0], /"AB-1" \/ "ab-1"/);
  await assert.rejects(() => migration.applyCaseInsensitiveUniqueIndexes(products), /Not applied/);
  assert.ok(!(await products.indexes()).some((i) => i.name === "sku_unique_ci"));
  assert.equal(await products.countDocuments(), 2, "no document was touched");
});

test("preflight also blocks on surrounding spaces, which a case-insensitive collation does not ignore", { skip }, async () => {
  await products.deleteMany({});
  await products.insertMany([doc("WS-1", "ws-one"), doc(" ws-1 ", "ws-one-spaced")]);
  const check = await migration.checkCaseInsensitiveUniqueness(products);
  assert.equal(check.ready, false);
  assert.equal(check.valuesWithSurroundingSpaces.sku, 1);
  assert.ok(check.blockers.some((b) => /surrounding spaces/.test(b)), check.blockers.join(" | "));
  await products.deleteMany({});
});

test("without the migration, a case-variant SKU that raced past the app check is still accepted (the open gap)", { skip }, async () => {
  await products.deleteMany({});
  await products.insertOne(doc("CI-1", "ci-one"));
  const res = await insertProductsWithoutOverwrite([doc("ci-1", "ci-one-b")]);
  assert.equal(res.inserted.length, 1, "case-sensitive indexes alone cannot stop this");
});

test("after applying, case variants are rejected by the database and reported cleanly", { skip }, async () => {
  await products.deleteMany({});
  await products.insertOne(doc("CI-1", "ci-one"));
  const applied = await migration.applyCaseInsensitiveUniqueIndexes(products);
  assert.deepEqual(applied.created, ["sku_unique_ci", "slug_unique_ci"]);

  const names = (await products.indexes()).map((i) => i.name);
  for (const n of ["sku_1", "slug_1", "sku_unique_ci", "slug_unique_ci"]) assert.ok(names.includes(n), `${n} missing`);

  const res = await insertProductsWithoutOverwrite([doc("ci-1", "ci-one-b"), doc("CI-2", "CI-ONE"), doc("CI-3", "ci-three")]);
  assert.deepEqual(res.inserted.map((r) => r.sku), ["CI-3"]);
  assert.match(res.rejected.find((r) => r.sku === "ci-1").reason, /SKU already exists/);
  assert.match(res.rejected.find((r) => r.sku === "CI-2").reason, /slug already exists/);

  // Exact-case queries still use the original index, unchanged.
  assert.equal((await products.findOne({ sku: "CI-1" })).slug, "ci-one");
  // Re-applying is a no-op.
  assert.deepEqual((await migration.applyCaseInsensitiveUniqueIndexes(products)).created, []);
});

test("concurrent case-variant imports produce exactly one product once the index exists", { skip }, async () => {
  await products.deleteMany({});
  const results = await Promise.all([
    insertProductsWithoutOverwrite([doc("RACE-X", "race-x-a")]),
    insertProductsWithoutOverwrite([doc("race-x", "race-x-b")]),
  ]);
  assert.equal(results.reduce((n, r) => n + r.inserted.length, 0), 1);
  assert.equal(await products.countDocuments({}, { collation: migration.CI_COLLATION }), 1);
});

test("rollback drops only the two indexes the migration created", { skip }, async () => {
  const { dropped } = await migration.rollbackCaseInsensitiveUniqueIndexes(products);
  assert.deepEqual(dropped, ["sku_unique_ci", "slug_unique_ci"]);
  const names = (await products.indexes()).map((i) => i.name);
  assert.ok(names.includes("sku_1") && names.includes("slug_1"));
  assert.ok(!names.includes("sku_unique_ci") && !names.includes("slug_unique_ci"));
});
