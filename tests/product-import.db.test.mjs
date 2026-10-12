// CSV/Excel importer is create-only. Runs against an ISOLATED local MongoDB only.
// Requires TEST_MONGODB_URI=mongodb://127.0.0.1:<port>
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";

const uri = process.env.TEST_MONGODB_URI;
const skip = !(uri && /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(uri)) && "set TEST_MONGODB_URI to a local MongoDB";
const dbName = `halima_csv_import_test_${process.pid}`;
let products, getMongoClient, parseImportFile, planImport, executeImport;

before(async () => {
  if (skip) return;
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB = dbName;
  ({ getMongoClient } = await import("@/lib/mongodb"));
  ({ parseImportFile, planImport, executeImport } = await import("@/lib/product-import"));
  products = (await getMongoClient()).db(dbName).collection("products");
});
after(async () => {
  if (skip) return;
  const client = await getMongoClient();
  await client.db(dbName).dropDatabase();
  await client.close();
});

const HEADER = "SKU,Product Name,Category,Brand,Model,Price (AED),Stock,Delivery Rate (AED)";
const csv = (...rows) => new TextEncoder().encode([HEADER, ...rows].join("\n"));
const existing = () => ({
  id: "p-existing-1", sku: "HT-AI-113", slug: "o-general-1-5-ton-window-ac", name: "O GENERAL 1.5 Ton Window Ac",
  brand: "O General", category: "Air Conditioning", price: 2000, stockCount: 4, deliveryRate: 75, status: "active",
  images: ["/featured/hisense-window-ac.png"], createdAt: new Date("2026-09-21T12:35:28Z"), updatedAt: new Date("2026-09-24T00:37:12Z"),
});
const writes = async () => (await products.aggregate([{ $collStats: { latencyStats: {} } }]).toArray())[0]?.latencyStats.writes.ops ?? 0;

test("an existing SKU (any capitalisation) is skipped and the stored product stays byte-identical", { skip }, async () => {
  await products.deleteMany({});
  await products.insertOne(existing());
  const before = await products.findOne({ sku: "HT-AI-113" });

  const sheet = await parseImportFile("p.csv", csv(
    "ht-ai-113,Overwrite attempt,Air Conditioning,O General,AXG18 AE,1,99,0",
    "NEW-001,LG Front Load Washer,Washing Machines,LG,F4V5EYLYP,1999,3,0"
  ));
  const writesBefore = await writes();
  const plan = await planImport(sheet, { allowNewBrands: false });
  assert.equal(await writes(), writesBefore, "planning must not write");

  assert.equal(plan.rows[0].status, "skipped");
  assert.match(plan.rows[0].warnings.join(" "), /never change existing products/);
  assert.equal(plan.rows[1].status, "new");
  assert.equal(plan.summary.toCreate, 1);
  assert.equal(plan.summary.skippedExisting, 1);

  const result = await executeImport(plan);
  assert.equal(result.created, 1);
  assert.deepEqual(await products.findOne({ sku: "HT-AI-113" }), before);
  const created = await products.findOne({ sku: "NEW-001" });
  assert.equal(created.category, "Laundry Appliances", "alias resolved to the store category");
  assert.equal(await products.countDocuments(), 2);
});

test("unmapped categories are rejected instead of being guessed", { skip }, async () => {
  const plan = await planImport(await parseImportFile("p.csv", csv("NEW-002,Some Product,Fans,LG,ABC123X,10,1,0")), { allowNewBrands: false });
  assert.equal(plan.rows[0].status, "error");
  assert.match(plan.rows[0].errors.join(" "), /no approved mapping/);
});

test("two confirms of the same file at once never duplicate a product", { skip }, async () => {
  await products.deleteMany({});
  const file = csv(...[1, 2, 3].map((n) => `RACE-00${n},Race Product ${n},Refrigeration,LG,GR${n}00X,100,1,0`));
  const [planA, planB] = await Promise.all([1, 2].map(async () => planImport(await parseImportFile("r.csv", file), { allowNewBrands: false })));
  const [a, b] = await Promise.all([executeImport(planA), executeImport(planB)]);
  assert.equal(a.created + b.created, 3);
  for (const n of [1, 2, 3]) assert.equal(await products.countDocuments({ sku: `RACE-00${n}` }), 1);
  for (const f of [...a.failed, ...b.failed]) assert.match(f.message, /already exists/);
});

test("the importer source has no update, replace or upsert path left", async () => {
  const source = (await readFile(new URL("../lib/product-import.ts", import.meta.url), "utf8")).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.doesNotMatch(source, /\b(updateOne|updateMany|replaceOne|bulkWrite|findOneAndUpdate|findOneAndReplace|upsert|\$set)\b/);
});
