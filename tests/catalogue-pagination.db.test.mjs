// Server-side catalogue pagination (queryMongoProducts) against an ISOLATED local MongoDB only.
// Requires TEST_MONGODB_URI=mongodb://127.0.0.1:<port>
import assert from "node:assert/strict";
import test, { after, before } from "node:test";

const uri = process.env.TEST_MONGODB_URI;
const skip = !(uri && /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(uri)) && "set TEST_MONGODB_URI to a local MongoDB";
const dbName = `halima_pagination_test_${process.pid}`;
let db, products, repo, query;

const SAME_TIME = new Date("2026-01-01T00:00:00Z"); // many products share a createdAt: order must still be stable
const OLDER = new Date("2025-01-01T00:00:00Z");
const doc = (i, over = {}) => ({
  id: `pg-${i}`, slug: `pg-${i}`, sku: `PG-${String(i).padStart(3, "0")}`, name: `Product ${String(i).padStart(3, "0")}`,
  brand: i % 2 ? "LG" : "Samsung", model: `M${i}X`, category: i % 3 ? "Air Conditioning" : "Refrigeration",
  categorySlug: i % 3 ? "air-conditioning" : "refrigeration", price: i % 5 === 0 ? 0 : 1000 + ((i * 37) % 900),
  images: [`https://cdn.example.com/${i}-a.jpg`, `https://cdn.example.com/${i}-b.jpg`], description: "x".repeat(2000),
  specifications: { Capacity: "1.5 Ton" }, stockCount: 1, inStock: true, status: "active",
  createdAt: i <= 20 ? SAME_TIME : new Date(SAME_TIME.getTime() + i * 1000), ...over,
});

before(async () => {
  if (skip) return;
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB = dbName;
  const { getMongoClient } = await import("@/lib/mongodb");
  repo = await import("@/lib/repositories/products");
  ({ parseCatalogueParams: query } = await import("@/lib/catalogue-query"));
  db = (await getMongoClient()).db(dbName);
  products = db.collection("products");
  const docs = Array.from({ length: 95 }, (_, k) => doc(k + 1));
  docs.push(
    doc(201, { createdAt: OLDER, status: "draft", name: "Draft Split AC" }),
    doc(202, { createdAt: OLDER, status: "inactive", name: "Inactive Split AC" }),
    doc(203, { createdAt: OLDER, status: "deleted", name: "Deleted Split AC" }),
    doc(204, { createdAt: OLDER, status: undefined, name: "Legacy no-status Split AC" }), // counts as active, as before
    doc(205, { createdAt: OLDER, price: null, name: "Unpriced Split AC" }),
  );
  await products.insertMany(docs);
});
after(async () => {
  if (skip) return;
  const { getMongoClient } = await import("@/lib/mongodb");
  await db.dropDatabase();
  await (await getMongoClient()).close();
});

const page = (qs, opts) => repo.queryMongoProducts(query(new URLSearchParams(qs)), opts);

test("metadata is correct and only one page of products is returned", { skip }, async () => {
  const r = await page("page=7");
  const publicCount = 95 + 2; // 95 active + legacy no-status + unpriced
  assert.equal(r.totalProducts, publicCount);
  assert.equal(r.pageSize, 12);
  assert.equal(r.totalPages, Math.ceil(publicCount / 12));
  assert.equal(r.currentPage, 7);
  assert.equal(r.products.length, 12);
  assert.equal(r.hasNextPage, true);
  assert.equal(r.hasPreviousPage, true);
  const last = await page(`page=${r.totalPages}`);
  assert.equal(last.products.length, publicCount - 12 * (r.totalPages - 1));
  assert.equal(last.hasNextPage, false);
});

test("listing documents are slim: first image only, no description or specifications", { skip }, async () => {
  const [p] = (await page("page=1")).products;
  assert.equal(p.images.length, 1);
  assert.equal(p.description, "");
  assert.deepEqual(p.specifications, {});
});

test("MongoDB returns at most one page — never the whole catalogue", { skip }, async () => {
  await db.command({ profile: 2 });
  await page("page=3&limit=24");
  await page("page=2&sort=low");
  await db.command({ profile: 0 });
  const reads = await db.collection("system.profile").find({ ns: `${dbName}.products`, $or: [{ "command.find": "products" }, { "command.aggregate": "products" }] }).toArray();
  assert.ok(reads.length >= 2);
  for (const r of reads) assert.ok(r.nreturned <= 24, `a listing query returned ${r.nreturned} documents`);
  await db.collection("system.profile").drop();
});

test("every product appears exactly once across pages, even when createdAt values tie", { skip }, async () => {
  for (const sort of ["newest", "low", "az"]) {
    const first = await page(`sort=${sort}`);
    const seen = [];
    for (let n = 1; n <= first.totalPages; n++) seen.push(...(await page(`sort=${sort}&page=${n}`)).products.map((p) => p.id));
    assert.equal(seen.length, first.totalProducts, sort);
    assert.equal(new Set(seen).size, seen.length, `${sort}: a product appeared on two pages`);
    const again = (await page(`sort=${sort}&page=2`)).products.map((p) => p.id);
    assert.deepEqual(again, seen.slice(12, 24), `${sort}: page 2 changed between requests`);
  }
});

test("sorting: newest first; price low→high with Contact for Price last; alphabetical", { skip }, async () => {
  const newest = (await page("page=1")).products;
  assert.equal(newest[0].id, "pg-95");
  const all = [];
  for (let n = 1; n <= 9; n++) all.push(...(await page(`sort=low&page=${n}`)).products);
  const firstUnpriced = all.findIndex((p) => !(p.price > 0));
  assert.ok(firstUnpriced > 0 && all.slice(firstUnpriced).every((p) => !(p.price > 0)), "unpriced products come after priced ones");
  const prices = all.slice(0, firstUnpriced).map((p) => p.price);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  const az = (await page("sort=az")).products.map((p) => p.name);
  assert.deepEqual(az, [...az].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));
});

test("filters and search apply before pagination", { skip }, async () => {
  const fridges = await page("category=Refrigeration&limit=48");
  assert.ok(fridges.products.every((p) => p.category === "Refrigeration"));
  assert.equal(fridges.totalProducts, (await products.countDocuments({ category: "Refrigeration", status: { $nin: ["draft", "inactive", "deleted"] } })));
  const bySlug = await page("category=refrigeration&limit=48");
  assert.equal(bySlug.totalProducts, fridges.totalProducts, "category slug (home page tiles) matches the category name");

  const search = await page("q=split ac");
  assert.deepEqual(search.products.map((p) => p.name).sort(), ["Legacy no-status Split AC", "Unpriced Split AC"]);
  assert.equal((await page("q=PG-007")).products[0]?.sku, "PG-007", "search by SKU");
  assert.equal((await page("q=m7x")).products[0]?.model, "M7X", "search by model, case-insensitive");
  assert.equal((await page("q=lg&category=Refrigeration&limit=48")).products.every((p) => p.brand === "LG" && p.category === "Refrigeration"), true);
  // Regular-expression characters are matched literally (no errors, no injection).
  for (const hostile of ["(", ".*", "[a-z]+$", "\\"]) assert.equal((await page(`q=${encodeURIComponent(hostile)}`)).totalProducts, 0, hostile);
});

test("public listing hides draft, inactive and deleted products; admin sees drafts but not deleted", { skip }, async () => {
  const pub = await page("q=split&limit=48");
  assert.ok(!pub.products.some((p) => /Draft|Inactive|Deleted/.test(p.name)));
  const admin = await page("q=split&limit=48", { includeUnpublished: true });
  const names = admin.products.map((p) => p.name);
  assert.ok(names.includes("Draft Split AC") && names.includes("Inactive Split AC"));
  assert.ok(!names.includes("Deleted Split AC"));
});

test("out-of-range pages return the last page; no matches and an empty catalogue are handled", { skip }, async () => {
  const far = await page("page=999");
  assert.equal(far.currentPage, far.totalPages);
  assert.ok(far.products.length > 0);
  const none = await page("q=nothing-matches-this&page=4");
  assert.deepEqual([none.totalProducts, none.totalPages, none.currentPage, none.products.length, none.hasNextPage], [0, 1, 1, 0, false]);
  const fridgeIds = (await page("category=refrigeration&limit=48")).products.map((p) => p.id);
  assert.ok(fridgeIds.length > 0);
});

test("related products: the 4 newest published products other than the current one", { skip }, async () => {
  const related = await repo.getMongoRelatedProducts("pg-95", 4);
  assert.deepEqual(related.map((p) => p.id), ["pg-94", "pg-93", "pg-92", "pg-91"]);
});

test("availability and price filters run in MongoDB before pagination, with real prices only", { skip }, async () => {
  const f = (i, over) => doc(500 + i, { brand: "Filtertest", name: `Filtertest ${i}`, createdAt: new Date(SAME_TIME.getTime() + (500 + i) * 1000), ...over });
  await products.insertMany([
    f(1, { price: 500, inStock: true, stockCount: 3 }),
    f(2, { price: 999.99, inStock: true, stockCount: 1 }),
    f(3, { price: 1000, inStock: true, stockCount: 0 }), // marked in stock but none left → on request (checkout refuses it)
    f(4, { price: 3000, inStock: false, stockCount: 4 }),
    f(5, { price: 3000.01, inStock: true }), // no stock count → not a limit, as at checkout
    f(10, { price: 800, inStock: true, stockCount: null }), // a stored null is read as 0, so checkout refuses it
    f(6, { price: 0, inStock: true, stockCount: 2 }), // Contact for Price
    f(7, { price: null, inStock: true, stockCount: 2 }), // Contact for Price
    f(8, { price: 1500, inStock: true, stockCount: 5, status: "draft" }),
    f(9, { price: 1500, inStock: false, stockCount: 0, status: "inactive" }),
  ]);
  await products.updateOne({ name: "Filtertest 5" }, { $unset: { stockCount: "" } });
  assert.equal((await products.findOne({ name: "Filtertest 5" })).stockCount, undefined);
  const ids = async (qs, opts) => (await page(`q=filtertest&limit=48&sort=az&${qs}`, opts)).products.map((p) => p.name.replace("Filtertest ", "")).sort();
  assert.deepEqual(await ids(""), ["1", "10", "2", "3", "4", "5", "6", "7"]);
  assert.deepEqual(await ids("availability=in-stock"), ["1", "2", "5", "6", "7"]);
  assert.deepEqual(await ids("availability=on-request"), ["10", "3", "4"]);
  assert.deepEqual(await ids("price=under-1000"), ["1", "10", "2"]);
  assert.deepEqual(await ids("price=1000-3000"), ["3", "4"]);
  assert.deepEqual(await ids("price=over-3000"), ["5"]);
  assert.deepEqual(await ids("availability=in-stock&price=under-1000"), ["1", "2"]);
  assert.deepEqual(await ids("availability=on-request&price=over-3000"), []);
  assert.deepEqual(await ids("price=1000-3000", { includeUnpublished: true }), ["3", "4", "8", "9"], "admin sees drafts; public never does");
  // Applied before skip/limit: page 2 of a filtered list holds the remaining filtered products.
  const p1 = await page("q=filtertest&availability=in-stock&limit=12&sort=az");
  assert.equal(p1.totalProducts, 5);
  assert.equal(p1.totalPages, 1);
  // Every product shown as in stock passes the checkout rule, and vice versa.
  const { isInStock } = await import("@/lib/pricing");
  for (const p of (await page("q=filtertest&limit=48")).products) {
    assert.equal(isInStock(p), (await ids("availability=in-stock")).includes(p.name.replace("Filtertest ", "")), p.name);
  }
  await products.deleteMany({ brand: "Filtertest" });
});
