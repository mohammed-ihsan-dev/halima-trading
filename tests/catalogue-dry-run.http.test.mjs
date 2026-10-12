// HTTP tests for POST /api/admin/products/import/catalogue-dry-run against running servers
// backed by an ISOLATED local MongoDB. Required env:
//   TEST_BASE_URL       server connected to TEST_MONGODB_URI / TEST_MONGODB_DB
//   TEST_MONGODB_URI    local MongoDB (mongodb://127.0.0.1:<port>)
//   TEST_MONGODB_DB     database name that server uses (a throwaway test database)
// Optional:
//   TEST_DOWN_BASE_URL  server whose MONGODB_URI points at nothing (MongoDB unavailable)
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";

const require = createRequire(import.meta.url);
const { MongoClient } = require("mongodb");

const BASE = process.env.TEST_BASE_URL;
const DOWN = process.env.TEST_DOWN_BASE_URL;
const uri = process.env.TEST_MONGODB_URI;
const dbName = process.env.TEST_MONGODB_DB;
const local = !!uri && /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(uri) && /test/i.test(dbName ?? "");
const skip = !(BASE && local) && "set TEST_BASE_URL, TEST_MONGODB_URI (local) and TEST_MONGODB_DB (a *test* database)";
const ENDPOINT = "/api/admin/products/import/catalogue-dry-run";

let client, products, adminCookie;

const catalogue = {
  database: "halima",
  collection: "products",
  productCount: 3,
  products: [
    { id: "new-1", slug: "new-product-1", sku: "NEW-1", name: "New Product 1", brand: "LG", model: "GN100X", category: "Refrigeration", price: 0, currency: "AED", images: [], inStock: true, stockCount: 1, deliveryRate: 75, status: "active" },
    { id: "new-2", slug: "new-product-2", sku: "ht-ai-113", name: "Clashing SKU", brand: "LG", model: "GN200X", category: "Refrigeration", price: 0, currency: "AED", images: [], inStock: true, stockCount: 1, deliveryRate: 75, status: "active" },
    { id: "new-3", slug: "new-product-3", sku: "NEW-3", name: "Unmapped category", brand: "Aftron", model: "GN300X", category: "Fans", price: 0, currency: "AED", images: [], inStock: true, stockCount: 1, deliveryRate: 75, status: "active" },
  ],
};

const post = (base, { cookie, body = JSON.stringify(catalogue), name = "catalogue.json" } = {}) => {
  const fd = new FormData();
  fd.append("file", new File([body], name, { type: "application/json" }));
  return fetch(base + ENDPOINT, { method: "POST", body: fd, headers: cookie ? { cookie } : {} });
};
const writes = async () => (await products.aggregate([{ $collStats: { latencyStats: {} } }]).toArray())[0].latencyStats.writes.ops;
const snapshot = async () => JSON.stringify(await products.find({}).sort({ _id: 1 }).toArray());

before(async () => {
  if (skip) return;
  client = await new MongoClient(uri).connect();
  products = client.db(dbName).collection("products");
  await products.deleteMany({});
  await products.insertOne({
    id: "p-existing-1", slug: "o-general-1-5-ton-window-ac", sku: "HT-AI-113", name: "O GENERAL 1.5 Ton Window Ac",
    brand: "O General", category: "Air Conditioning", price: 2000, stockCount: 4, status: "active",
    images: ["/featured/hisense-window-ac.png"], createdAt: new Date(), updatedAt: new Date(),
  });
  const login = await fetch(`${BASE}/api/admin/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@halimatrading.com", password: "HalimaAdmin2026!" }),
  });
  assert.equal(login.status, 200, "admin login on the test server failed");
  adminCookie = login.headers.get("set-cookie").split(";")[0];
});

after(async () => {
  if (skip) return;
  await client.db(dbName).dropDatabase();
  await client.close();
});

test("11. unauthenticated and non-admin requests are refused (401) and nothing is read or written", { skip }, async () => {
  const w = await writes();
  assert.equal((await post(BASE)).status, 401);
  const customer = `halima_admin_session=${Buffer.from(JSON.stringify({ email: "c@example.com", role: "customer" })).toString("base64")}`;
  assert.equal((await post(BASE, { cookie: customer })).status, 401);
  assert.equal(await writes(), w);
});

test("admin dry run returns the full report and leaves the database untouched", { skip }, async () => {
  const before = await snapshot();
  const w = await writes();
  const res = await post(BASE, { cookie: adminCookie });
  const data = await res.json();
  assert.equal(res.status, 200, JSON.stringify(data));
  const { report } = data;
  assert.equal(report.dryRun, true);
  assert.equal(report.database.name, dbName);
  assert.equal(report.database.unchanged, true);
  assert.deepEqual(report.rows.map((r) => r.group), ["SAFE_TO_IMPORT", "SKIP_SKU_EXISTS", "INVALID"]);
  assert.equal(report.rows[1].conflicts[0].existing.id, "p-existing-1");
  assert.equal(await writes(), w, "a write reached the products collection");
  assert.equal(await snapshot(), before);
});

test("bad uploads are rejected with clear errors", { skip }, async () => {
  assert.equal((await post(BASE, { cookie: adminCookie, body: "{broken" })).status, 422);
  assert.equal((await post(BASE, { cookie: adminCookie, name: "catalogue.csv" })).status, 400);
  assert.equal((await post(BASE, { cookie: adminCookie, body: '{"products":[]}' })).status, 422);
});

test("10. MongoDB unavailable → refused (401 from the account check, or 503), never a report", { skip: skip || (!DOWN && "set TEST_DOWN_BASE_URL"), timeout: 90_000 }, async () => {
  const res = await post(DOWN, { cookie: adminCookie });
  const data = await res.json();
  // The admin account is now re-checked in MongoDB on every request, so with the database down
  // the request is refused before the dry run starts. Either way: an error, and no report.
  assert.ok([401, 503].includes(res.status), `status ${res.status}`);
  assert.ok(data.error);
  assert.equal(data.report, undefined);
});
