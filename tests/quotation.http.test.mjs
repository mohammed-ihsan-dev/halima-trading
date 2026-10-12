// Storefront quotation experience and checkout protection over HTTP.
// Running server + ISOLATED local DB. Env: TEST_BASE_URL, TEST_MONGODB_URI (local), TEST_MONGODB_DB (test database).
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
let client, db;

const base = (over) => ({
  brand: "LG", category: "Refrigeration", categorySlug: "refrigeration", description: "Test product", features: [],
  specifications: {}, images: ["/featured/hisense-window-ac.png"], stockCount: 5, inStock: true, featured: false,
  deliveryRate: 0, createdAt: new Date(), updatedAt: new Date(), ...over,
});

before(async () => {
  if (skip) return;
  client = await new MongoClient(uri).connect();
  db = client.db(dbName);
  await db.collection("products").deleteMany({ sku: /^QT-/ });
  await db.collection("products").insertMany([
    base({ id: "qt-quote", slug: "qt-quote-fridge", sku: "QT-QUOTE-1", name: "Quote Only Fridge", model: "GRQ100X", price: 0, priceLabel: "Contact for Price", status: "active" }),
    base({ id: "qt-paid", slug: "qt-paid-fridge", sku: "QT-PAID-1", name: "Priced Fridge", model: "GRP200X", price: 2499, priceLabel: "2499 AED", status: "active" }),
    base({ id: "qt-draft", slug: "qt-draft-fridge", sku: "QT-DRAFT-1", name: "Draft Fridge", model: "GRD300X", price: 999, status: "draft" }),
  ]);
});
after(async () => {
  if (skip) return;
  await db.collection("products").deleteMany({ sku: /^QT-/ });
  await client.close();
});

const page = async (path) => {
  const res = await fetch(BASE + path);
  return { status: res.status, html: await res.text() };
};
const jsonLd = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

test("a zero-priced product page shows Contact for Price and a WhatsApp request, never AED 0 or a cart", { skip }, async () => {
  const { status, html } = await page("/shop/qt-quote-fridge");
  assert.equal(status, 200);
  assert.match(html, /Contact for Price/);
  assert.doesNotMatch(html, /AED\s*0(?![\d.,])/, "AED 0 shown as a price");
  // The product's own action row (related-product cards further down may be purchasable).
  const actions = html.slice(html.indexOf('class="buy-row'), html.indexOf('class="detail-actions'));
  assert.ok(actions.length > 0, "action row not found");
  assert.doesNotMatch(actions, /Add to Cart|Buy Now/);
  const link = html.match(/href="(https:\/\/wa\.me\/971565685090\?text=[^"]+)"/);
  assert.ok(link, "WhatsApp quotation link missing");
  const message = decodeURIComponent(link[1].split("?text=")[1].replace(/&amp;/g, "&"));
  for (const part of ["Product: Quote Only Fridge", "Brand: LG", "Model: GRQ100X", "SKU: QT-QUOTE-1", "/shop/qt-quote-fridge"]) {
    assert.ok(message.includes(part), part);
  }
  assert.match(html, /Request Price on WhatsApp/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test("structured data advertises no price for a Contact for Price product (no invented AED 1899)", { skip }, async () => {
  const product = jsonLd((await page("/shop/qt-quote-fridge")).html).find((d) => d["@type"] === "Product");
  assert.ok(product);
  assert.equal(product.offers, undefined);
});

test("a priced product page is unchanged: price, Add to Cart, Buy Now and a real Offer", { skip }, async () => {
  const { html } = await page("/shop/qt-paid-fridge");
  assert.match(html, /AED\s*2,499/);
  assert.match(html, /Add to Cart/);
  assert.match(html, /Buy Now/);
  const product = jsonLd(html).find((d) => d["@type"] === "Product");
  assert.equal(product.offers.price, 2499);
});

test("the shop listing shows Contact for Price for the quote-only product and hides the draft", { skip }, async () => {
  // /shop is regenerated in the background (ISR): retry briefly until the fresh render is served.
  let html = "";
  for (let i = 0; i < 10 && !html.includes("Quote Only Fridge"); i++) {
    if (i) await new Promise((r) => setTimeout(r, 1000));
    html = (await page("/shop")).html;
  }
  // Shop cards render in the browser; the server sends the product data, which must
  // include the quote-only product and never the draft.
  assert.match(html, /Quote Only Fridge/);
  assert.doesNotMatch(html, /Draft Fridge/);
  assert.equal((await page("/shop/qt-draft-fridge")).status, 404);
});

const checkout = (items) =>
  fetch(`${BASE}/api/checkout/create-session`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items, customerName: "T", customerEmail: "t@example.com", customerPhone: "+971500000000",
      shippingAddress: { address: "1 St", city: "Abu Dhabi", emirate: "Abu Dhabi", country: "UAE" },
    }),
  });

test("calling checkout directly with a zero-priced product and a browser-supplied price is rejected, with no side effects", { skip }, async () => {
  const counts = async () => ({
    orders: await db.collection("orders").countDocuments(),
    payments: await db.collection("payments").countDocuments(),
    stock: (await db.collection("products").findOne({ sku: "QT-PAID-1" })).stockCount,
  });
  const before = await counts();
  const res = await checkout([{ productId: "qt-paid", quantity: 1, price: 1 }, { productId: "qt-quote", quantity: 1, price: 999, unitPrice: 999 }]);
  const body = await res.json();
  assert.equal(res.status, 400, JSON.stringify(body));
  assert.match(body.error, /priced on request/);
  assert.deepEqual(await counts(), before, "no order, payment or stock change");
});

test("draft products cannot be bought through a direct API call", { skip }, async () => {
  const res = await checkout([{ productId: "qt-draft", quantity: 1 }]);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /not available/);
});
