// Drafts stay hidden and zero-priced products cannot be bought. ISOLATED local MongoDB only.
// Requires TEST_MONGODB_URI=mongodb://127.0.0.1:<port>
import assert from "node:assert/strict";
import test, { after, before } from "node:test";

const uri = process.env.TEST_MONGODB_URI;
const skip = !(uri && /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(uri)) && "set TEST_MONGODB_URI to a local MongoDB";
const dbName = `halima_publication_test_${process.pid}`;
let db, products, repo, orders, csv, catalogueImport;

const doc = (over) => ({
  id: over.sku.toLowerCase(), slug: over.sku.toLowerCase(), name: over.sku, brand: "LG", model: `${over.sku}X`,
  category: "Refrigeration", categorySlug: "refrigeration", price: 1500, stockCount: 5, inStock: true, featured: true,
  images: ["https://cdn.example.com/a.jpg"], deliveryRate: 0, createdAt: new Date(), updatedAt: new Date(), ...over,
});
const customer = {
  customerName: "Test Customer", customerEmail: "test@example.com", customerPhone: "+971500000000",
  shippingAddress: { address: "1 Test St", city: "Abu Dhabi", emirate: "Abu Dhabi", country: "UAE" },
};

before(async () => {
  if (skip) return;
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB = dbName;
  const { getMongoClient } = await import("@/lib/mongodb");
  repo = await import("@/lib/repositories/products");
  orders = await import("@/lib/repositories/orders");
  csv = await import("@/lib/product-import");
  catalogueImport = await import("@/lib/catalogue-import");
  db = (await getMongoClient()).db(dbName);
  products = db.collection("products");
  await products.insertMany([
    doc({ sku: "LIVE-1", status: "active" }),
    doc({ sku: "LEGACY-1" }), // no status field: must still count as active
    doc({ sku: "DRAFT-1", status: "draft" }),
    doc({ sku: "INACTIVE-1", status: "inactive" }),
    doc({ sku: "DELETED-1", status: "deleted" }),
    doc({ sku: "ZERO-1", status: "active", price: 0, priceLabel: "Contact for Price" }),
  ]);
});
after(async () => {
  if (skip) return;
  const { getMongoClient } = await import("@/lib/mongodb");
  await db.dropDatabase();
  await (await getMongoClient()).close();
});

test("public reads hide draft, inactive and deleted products; documents without status stay visible", { skip }, async () => {
  const skus = (list) => list.map((p) => p.sku).sort();
  assert.deepEqual(skus(await repo.getMongoProducts()), ["LEGACY-1", "LIVE-1", "ZERO-1"]);
  assert.deepEqual(skus(await repo.getMongoFeaturedProducts()), ["LEGACY-1", "LIVE-1", "ZERO-1"]);
  assert.deepEqual(skus(await repo.getMongoProductsByCategory("Refrigeration")), ["LEGACY-1", "LIVE-1", "ZERO-1"]);
  assert.equal(await repo.getMongoProductByIdOrSlug("draft-1"), null);
  assert.equal(await repo.getMongoProductByIdOrSlug("inactive-1"), null);
});

test("admin reads include drafts and inactive products but never deleted ones", { skip }, async () => {
  const all = (await repo.getMongoProducts({ includeUnpublished: true })).map((p) => p.sku).sort();
  assert.deepEqual(all, ["DRAFT-1", "INACTIVE-1", "LEGACY-1", "LIVE-1", "ZERO-1"]);
  assert.equal((await repo.getMongoProductByIdOrSlug("draft-1", { includeUnpublished: true })).status, "draft");
});

test("checkout refuses a zero-priced product and touches no stock or orders", { skip }, async () => {
  await orders.ensureOrdersSeeded(); // an empty orders collection gets sample orders on first use
  const stockBefore = (await products.findOne({ sku: "LIVE-1" })).stockCount;
  const ordersBefore = await db.collection("orders").countDocuments();
  await assert.rejects(
    () => orders.createMongoOrder({ ...customer, items: [{ productId: "live-1", quantity: 1 }, { productId: "zero-1", quantity: 1 }] }),
    (err) => err instanceof orders.CheckoutValidationError && /priced on request/.test(err.message)
  );
  assert.equal((await products.findOne({ sku: "LIVE-1" })).stockCount, stockBefore, "earlier item's stock must not move");
  assert.equal(await db.collection("orders").countDocuments(), ordersBefore);
});

test("checkout refuses draft and inactive products as unavailable", { skip }, async () => {
  for (const id of ["draft-1", "inactive-1", "deleted-1"]) {
    await assert.rejects(
      () => orders.createMongoOrder({ ...customer, items: [{ productId: id, quantity: 1 }] }),
      (err) => err instanceof orders.CheckoutValidationError && /not available/.test(err.message),
      id
    );
  }
});

test("checkout still accepts a normally priced active product", { skip }, async () => {
  const order = await orders.createMongoOrder({ ...customer, items: [{ productId: "live-1", quantity: 2 }] });
  assert.equal(order.items[0].unitPrice, 1500);
  assert.equal((await products.findOne({ sku: "LIVE-1" })).stockCount, 3);
});

test("JSON catalogue imports are always created as drafts", { skip }, async () => {
  const record = {
    id: "imp-1", slug: "imported-fridge-1", sku: "IMP-FRIDGE-1", name: "Imported Fridge", brand: "LG", model: "GRX267CQ",
    category: "Refrigeration", price: 0, currency: "AED", images: [], inStock: true, stockCount: 1, deliveryRate: 75, status: "active",
  };
  const { write } = await catalogueImport.importSafeCatalogueRecords([record], { fileName: "x.json", confirm: true });
  assert.equal(write.inserted.length, 1);
  assert.equal((await products.findOne({ sku: "IMP-FRIDGE-1" })).status, "draft");
  assert.equal(await repo.getMongoProductByIdOrSlug("imported-fridge-1"), null, "not visible publicly");
});

test("CSV imports go live only with a price and an image; otherwise they are drafts", { skip }, async () => {
  const file = new TextEncoder().encode([
    "SKU,Product Name,Category,Brand,Model,Price (AED),Stock,Primary Image URL",
    "CSV-LIVE,Csv Live,Refrigeration,LG,GR100X,999,2,https://cdn.example.com/x.jpg",
    "CSV-NOPRICE,Csv No Price,Refrigeration,LG,GR200X,0,2,https://cdn.example.com/y.jpg",
    "CSV-NOIMG,Csv No Image,Refrigeration,LG,GR300X,999,2,",
  ].join("\n"));
  const plan = await csv.planImport(await csv.parseImportFile("p.csv", file), { allowNewBrands: false });
  assert.match(plan.rows[1].warnings.join(" "), /draft/);
  await csv.executeImport(plan);
  const status = async (sku) => (await products.findOne({ sku })).status;
  assert.equal(await status("CSV-LIVE"), "active");
  assert.equal(await status("CSV-NOPRICE"), "draft");
  assert.equal(await status("CSV-NOIMG"), "draft");
});
