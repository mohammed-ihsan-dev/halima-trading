// Publish rules, account checks and checkout over HTTP. Running server + ISOLATED local DB.
// Required env: TEST_BASE_URL, TEST_MONGODB_URI (local), TEST_MONGODB_DB (a *test* database used by that server).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";

const require = createRequire(import.meta.url);
const { MongoClient } = require("mongodb");
const BASE = process.env.TEST_BASE_URL;
const uri = process.env.TEST_MONGODB_URI;
const dbName = process.env.TEST_MONGODB_DB;
const skip = !(BASE && uri && /^mongodb:\/\/(127\.0\.0\.1|localhost)/.test(uri) && /test/i.test(dbName ?? "")) &&
  "set TEST_BASE_URL, TEST_MONGODB_URI (local) and TEST_MONGODB_DB (a test database)";
let client, db, cookie;

const login = async (email, password) =>
  fetch(`${BASE}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
const put = (body) =>
  fetch(`${BASE}/api/admin/products`, { method: "PUT", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) });

before(async () => {
  if (skip) return;
  client = await new MongoClient(uri).connect();
  db = client.db(dbName);
  const res = await login("admin@halimatrading.com", "HalimaAdmin2026!");
  assert.equal(res.status, 200);
  cookie = res.headers.get("set-cookie").split(";")[0];
  await db.collection("products").deleteMany({ sku: /^PUB-/ });
  await db.collection("products").insertMany([
    { id: "pub-draft", slug: "pub-draft", sku: "PUB-DRAFT", name: "Draft Fridge", brand: "LG", model: "GR1X", category: "Refrigeration",
      price: 0, images: [], stockCount: 1, inStock: true, status: "draft", createdAt: new Date(), updatedAt: new Date() },
    { id: "pub-live-zero", slug: "pub-live-zero", sku: "PUB-LIVE-ZERO", name: "Existing Contact For Price", brand: "LG", model: "GR2X",
      category: "Refrigeration", price: 0, images: [], stockCount: 3, inStock: true, status: "active", createdAt: new Date(), updatedAt: new Date() },
  ]);
});
after(async () => {
  if (skip) return;
  await db.collection("products").deleteMany({ sku: /^PUB-/ });
  await db.collection("users").updateOne({ email: "admin@halimatrading.com" }, { $set: { status: "ACTIVE", role: "super_admin" } });
  await db.collection("users").deleteMany({ email: "nohash-admin@example.com" });
  await client.close();
});

test("the Edit page's admin lookup returns a draft that the public API hides", { skip }, async () => {
  assert.equal((await fetch(`${BASE}/api/products?slug=pub-draft`)).status, 404, "public API must not expose drafts");
  const admin = await (await fetch(`${BASE}/api/admin/products?id=pub-draft`, { headers: { cookie } })).json();
  assert.equal(admin.product.status, "draft");
});

test("a draft cannot be published without a price and a real image", { skip }, async () => {
  let res = await put({ id: "pub-draft", status: "active" });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /price above AED 0 and at least one product image/);

  res = await put({ id: "pub-draft", status: "active", price: 1200, images: ["/featured/hisense-window-ac.png"] });
  assert.equal(res.status, 400, "the placeholder image does not count");
  assert.match((await res.json()).error, /image/);

  res = await put({ id: "pub-draft", status: "active", price: 1200, images: ["https://cdn.example.com/fridge.jpg"] });
  assert.equal(res.status, 200);
  assert.equal((await db.collection("products").findOne({ sku: "PUB-DRAFT" })).status, "active");
});

test("existing active products keep working: editing one with price 0 is not blocked", { skip }, async () => {
  const res = await put({ id: "pub-live-zero", status: "active", name: "Existing Contact For Price (edited)" });
  assert.equal(res.status, 200);
  assert.equal((await db.collection("products").findOne({ sku: "PUB-LIVE-ZERO" })).status, "active");
});

test("invalid status values are rejected", { skip }, async () => {
  const res = await put({ id: "pub-live-zero", status: "deleted" });
  assert.equal(res.status, 400);
});

test("checkout of a zero-priced product returns 400 with a clear message", { skip }, async () => {
  const res = await fetch(`${BASE}/api/checkout/create-session`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ productId: "pub-live-zero", quantity: 1 }],
      customerName: "T", customerEmail: "t@example.com", customerPhone: "+971500000000",
      shippingAddress: { address: "1 St", city: "Abu Dhabi", emirate: "Abu Dhabi", country: "UAE" },
    }),
  });
  const body = await res.json();
  assert.equal(res.status, 400, JSON.stringify(body));
  assert.match(body.error, /priced on request/);
});

test("an admin with no stored password cannot log in with the old default password", { skip }, async () => {
  await db.collection("users").insertOne({ id: "u-nohash", email: "nohash-admin@example.com", name: "No Hash", role: "admin", status: "ACTIVE" });
  for (const password of ["HalimaAdmin2026!", "", "anything"]) {
    const res = await login("nohash-admin@example.com", password);
    assert.ok(res.status === 401 || res.status === 400, `password ${JSON.stringify(password)} → ${res.status}`);
    assert.equal(res.headers.get("set-cookie"), null, "no session issued");
  }
});

test("suspending or demoting an admin ends their existing session immediately", { skip }, async () => {
  assert.equal((await fetch(`${BASE}/api/admin/session`, { headers: { cookie } })).status, 200);
  await db.collection("users").updateOne({ email: "admin@halimatrading.com" }, { $set: { status: "SUSPENDED" } });
  assert.equal((await fetch(`${BASE}/api/admin/products`, { headers: { cookie } })).status, 401);
  await db.collection("users").updateOne({ email: "admin@halimatrading.com" }, { $set: { status: "ACTIVE", role: "customer" } });
  assert.equal((await fetch(`${BASE}/api/admin/products`, { headers: { cookie } })).status, 401);
  await db.collection("users").updateOne({ email: "admin@halimatrading.com" }, { $set: { role: "super_admin" } });
  assert.equal((await fetch(`${BASE}/api/admin/products`, { headers: { cookie } })).status, 200, "restored account works again");
});
