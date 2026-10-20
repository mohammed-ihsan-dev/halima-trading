// Checkout pricing, tampering, stock exposure and admin protection over HTTP, on a local server with an ISOLATED test DB.
// Env: TEST_BASE_URL (server), TEST_MONGODB_URI (local), TEST_MONGODB_DB (the test database that server uses).
// The server must run without Stripe keys (orders are created, no payment session is opened).
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

const RUN = `pr${process.pid}`;
let client, db;
const product = (n, fields) => ({
  id: `${RUN}-${n}`, slug: `${RUN}-${n}`, sku: `${RUN.toUpperCase()}-${n}`, name: `${RUN} Product ${n}`, brand: "LG", model: `${RUN.toUpperCase()}${n}`,
  category: "Refrigeration", categorySlug: "refrigeration", images: [`https://cdn.example.com/${RUN}-${n}.jpg`], inStock: true, featured: false,
  status: "active", createdAt: new Date(), updatedAt: new Date(), ...fields,
});
const customer = {
  customerName: "Test Customer", customerEmail: "customer@example.com", customerPhone: "+971501234567",
  shippingAddress: { address: "Street 1", city: "Abu Dhabi", emirate: "Abu Dhabi", country: "UAE" },
};
const checkout = (body) => fetch(`${BASE}/api/checkout/create-session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...customer, ...body }) });
const order = (id) => db.collection("orders").findOne({ id });
const stock = async (n) => (await db.collection("products").findOne({ id: `${RUN}-${n}` })).stockCount;

before(async () => {
  if (skip) return;
  client = await new MongoClient(uri).connect();
  db = client.db(dbName);
  await db.collection("products").insertMany([
    product("a", { price: 1490, priceLabel: "1490 AED", stockCount: 10, deliveryRate: 0 }),   // old "free delivery" product
    product("b", { price: 899, priceLabel: "899 AED", stockCount: 10, deliveryRate: 150 }),   // old per-product rate
    product("one", { price: 500, priceLabel: "500 AED", stockCount: 1, deliveryRate: 75 }),
    product("quote", { price: 0, priceLabel: "Contact for Price", stockCount: 5 }),
    product("draft", { price: 700, priceLabel: "700 AED", stockCount: 5, status: "draft" }),
  ]);
});
after(async () => {
  if (skip) return;
  await db.collection("products").deleteMany({ id: { $regex: `^${RUN}-` } });
  await db.collection("orders").deleteMany({ "items.productId": { $regex: `^${RUN}-` } });
  await client.close();
});

test("delivery is one fixed AED 75 per order, whatever the products' old delivery rates and quantities", { skip }, async () => {
  const res = await checkout({ items: [{ productId: `${RUN}-a`, quantity: 3 }, { productId: `${RUN}-b`, quantity: 2 }] });
  assert.equal(res.status, 200, await res.clone().text());
  const body = await res.json();
  const o = await order(body.orderId);
  const subtotal = 3 * 1490 + 2 * 899;
  assert.equal(o.subtotal, subtotal);
  assert.equal(o.shipping, 75);
  assert.equal(o.vat, Math.round(subtotal * 0.05 * 100) / 100);
  assert.equal(o.totalAmount, subtotal + 75 + o.vat);
  assert.equal(body.totalAmount, o.totalAmount);
  assert.deepEqual(o.items.map((i) => i.unitPrice), [1490, 899]);
});

test("amounts sent by the browser are ignored: delivery, prices and totals come from the server", { skip }, async () => {
  const res = await checkout({
    items: [{ productId: `${RUN}-a`, quantity: 1, unitPrice: 1, price: 1, deliveryRate: 0 }],
    shipping: 0, deliveryFee: 0, delivery: 0, subtotal: 1, vat: 0, totalAmount: 1, total: 1,
  });
  assert.equal(res.status, 200);
  const o = await order((await res.json()).orderId);
  assert.equal(o.items[0].unitPrice, 1490);
  assert.equal(o.shipping, 75);
  assert.equal(o.totalAmount, 1490 + 75 + 74.5);
});

test("invalid quantities, empty carts, unpublished and price-on-request products are refused with 400", { skip }, async () => {
  for (const quantity of [0, -1, 1.5, "2", null]) {
    const res = await checkout({ items: [{ productId: `${RUN}-a`, quantity }] });
    assert.equal(res.status, 400, `quantity ${JSON.stringify(quantity)}`);
  }
  assert.equal((await checkout({ items: [] })).status, 400);
  assert.equal((await checkout({})).status, 400);
  assert.equal((await checkout({ items: [{ productId: `${RUN}-draft`, quantity: 1 }] })).status, 400, "draft product");
  assert.equal((await checkout({ items: [{ productId: `${RUN}-quote`, quantity: 1 }] })).status, 400, "price on request");
  assert.equal((await checkout({ items: [{ productId: `${RUN}-missing`, quantity: 1 }] })).status, 400, "unknown product");
});

test("stock is reserved atomically: simultaneous orders cannot both buy the last unit", { skip }, async () => {
  const results = await Promise.all([1, 2, 3].map(() => checkout({ items: [{ productId: `${RUN}-one`, quantity: 1 }] })));
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses, [200, 400, 400], "exactly one order succeeds; the others get a clear 400, not a server error");
  assert.equal(await stock("one"), 0);
  assert.equal((await db.collection("products").findOne({ id: `${RUN}-one` })).inStock, false);
});

test("a failed later item gives back the stock reserved for earlier items", { skip }, async () => {
  const before = await stock("b");
  const res = await checkout({ items: [{ productId: `${RUN}-b`, quantity: 2 }, { productId: `${RUN}-a`, quantity: 999 }] });
  assert.equal(res.status, 400);
  assert.equal(await stock("b"), before);
});

test("order numbers are unique even for simultaneous orders", { skip }, async () => {
  const results = await Promise.all([1, 2, 3, 4].map(() => checkout({ items: [{ productId: `${RUN}-a`, quantity: 1 }] })));
  const numbers = await Promise.all(results.map(async (r) => (await r.json()).orderNumber));
  assert.equal(new Set(numbers).size, 4, numbers.join(","));
});

test("customer-facing product APIs never include stock quantities", { skip }, async () => {
  const one = await (await fetch(`${BASE}/api/products?id=${RUN}-a`)).json();
  assert.equal(one.product.inStock, true);
  assert.equal("stockCount" in one.product, false);
  assert.equal("deliveryRate" in one.product, false);
  for (const url of [`/api/products?page=1&q=${RUN}`, "/api/products", "/api/products?featured=true", "/api/products?category=Refrigeration"]) {
    const text = await (await fetch(`${BASE}${url}`)).text();
    assert.equal(/stockCount/.test(text), false, url);
  }
  const soldOut = await (await fetch(`${BASE}/api/products?id=${RUN}-one`)).json();
  assert.equal(soldOut.product.inStock, false, "sold out is shown as not in stock, without a number");
});

test("product pages show the fixed delivery charge and no stock quantity", { skip }, async () => {
  const html = (await (await fetch(`${BASE}/shop/${RUN}-a`)).text()).replaceAll("<!-- -->", "");
  assert.match(html, /Delivery: AED\s?75 per order/);
  assert.doesNotMatch(html, /FREE DELIVERY/);
  assert.doesNotMatch(html, /stockCount/);
  assert.doesNotMatch(html, /\b\d+\s+(items?|units?)\s+(in stock|left|available)/i);
});

test("admin APIs and diagnostics refuse unauthenticated requests", { skip }, async () => {
  for (const [method, path] of [["GET", "/api/admin/products"], ["GET", "/api/admin/orders"], ["GET", "/api/admin/users"], ["GET", "/api/admin/stats"],
    ["GET", "/api/admin/payments"], ["POST", "/api/admin/orders/create"], ["POST", "/api/admin/uploads/presign"], ["GET", "/api/test-mongodb"]]) {
    const res = await fetch(`${BASE}${path}`, { method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? "{}" : undefined });
    assert.equal(res.status, 401, `${method} ${path}`);
  }
});

test("the admin login page ships no credentials", { skip }, async () => {
  const html = await (await fetch(`${BASE}/admin/login`)).text();
  const seed = require("node:fs").readFileSync(new URL("../lib/repositories/users.ts", import.meta.url), "utf8").match(/rawPassword: "([^"]+)"/)[1];
  assert.equal(html.includes(seed), false);
  assert.equal(html.includes("admin@halimatrading.com"), false);
  // The page's client JavaScript must not contain them either.
  const scripts = [...html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1]);
  assert.ok(scripts.length > 0);
  for (const src of scripts) {
    const js = await (await fetch(`${BASE}${src}`)).text();
    assert.equal(js.includes(seed), false, src);
  }
});
