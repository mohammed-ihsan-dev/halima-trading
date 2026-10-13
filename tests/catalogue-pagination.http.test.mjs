// Paginated shop page and product APIs over HTTP, on a local server with an ISOLATED test DB.
// Env: TEST_BASE_URL (server), TEST_MONGODB_URI (local), TEST_MONGODB_DB (the test database that server uses).
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

const RUN = `zp${process.pid}`; // unique search word, so cached shop pages from earlier runs never match
const COUNT = 30;
let client, db, cookie;

before(async () => {
  if (skip) return;
  client = await new MongoClient(uri).connect();
  db = client.db(dbName);
  const base = new Date("2026-02-01T00:00:00Z").getTime();
  const docs = Array.from({ length: COUNT }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return {
      id: `${RUN}-${n}`, slug: `${RUN}-${n}`, sku: `${RUN.toUpperCase()}-${n}`, name: `${RUN} Pager Fridge ${n}`, brand: "LG",
      model: `${RUN.toUpperCase()}${n}X`, category: "Refrigeration", categorySlug: "refrigeration", price: 1000 + i, priceLabel: `${1000 + i} AED`,
      images: [`https://cdn.example.com/${RUN}-${n}.jpg`], stockCount: 2, inStock: true, featured: false, status: "active",
      createdAt: new Date(base + i * 1000), updatedAt: new Date(),
    };
  });
  docs.push({ ...docs[0], id: `${RUN}-draft`, slug: `${RUN}-draft`, sku: `${RUN.toUpperCase()}-DRAFT`, name: `${RUN} Pager Draft`, status: "draft", createdAt: new Date(base + 99_000) });
  await db.collection("products").insertMany(docs);

  const seed = require("node:fs").readFileSync(new URL("../lib/repositories/users.ts", import.meta.url), "utf8").match(/rawPassword: "([^"]+)"/)[1];
  const res = await fetch(`${BASE}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@halimatrading.com", password: seed }) });
  assert.equal(res.status, 200);
  cookie = res.headers.get("set-cookie").split(";")[0];
});
after(async () => {
  if (skip) return;
  await db.collection("products").deleteMany({ id: { $regex: `^${RUN}-` } });
  await client.close();
});

const names = (html) => [...html.matchAll(new RegExp(`${RUN} Pager Fridge (\\d\\d)`, "g"))].map((m) => m[1]);

test("public API: ?page returns one page with pagination metadata and never drafts", { skip }, async () => {
  const res = await fetch(`${BASE}/api/products?page=2&limit=12&q=${RUN}`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.data.length, 12);
  assert.deepEqual(
    { ...body.pagination },
    { currentPage: 2, pageSize: 12, totalProducts: COUNT, totalPages: 3, hasNextPage: true, hasPreviousPage: true }
  );
  assert.equal(body.total, COUNT);
  assert.deepEqual(body.data.map((p) => p.name.slice(-2)), ["18", "17", "16", "15", "14", "13", "12", "11", "10", "09", "08", "07"]);
  assert.ok(!body.data.some((p) => p.status === "draft"));
  assert.match(res.headers.get("cache-control") ?? "", /no-store/);
  const capped = await (await fetch(`${BASE}/api/products?page=1&limit=100000&q=${RUN}`)).json();
  assert.equal(capped.pagination.pageSize, 12, "page size is capped to an allowed value");
});

test("public API without ?page keeps its previous response shape", { skip }, async () => {
  const body = await (await fetch(`${BASE}/api/products`)).json();
  assert.equal(body.success, true);
  assert.ok(Array.isArray(body.data));
  assert.equal(body.total, body.data.length);
  assert.equal(body.pagination, undefined);
});

test("admin API: pagination requires a valid admin session and includes drafts", { skip }, async () => {
  assert.equal((await fetch(`${BASE}/api/admin/products?page=1&q=${RUN}`)).status, 401);
  const forged = `halima_admin_session=${Buffer.from(JSON.stringify({ email: "x@example.com", role: "super_admin" })).toString("base64")}`;
  assert.equal((await fetch(`${BASE}/api/admin/products?page=1&q=${RUN}`, { headers: { cookie: forged } })).status, 401);
  const body = await (await fetch(`${BASE}/api/admin/products?page=1&q=${RUN}`, { headers: { cookie } })).json();
  assert.equal(body.pagination.totalProducts, COUNT + 1);
  assert.equal(body.data[0].name, `${RUN} Pager Draft`);
  assert.equal(body.data.length, 12);
});

test("shop: the URL selects the page and filters, rendered on the server", { skip }, async () => {
  const res = await fetch(`${BASE}/shop?q=${RUN}&category=Refrigeration&page=2`);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.deepEqual(names(html).filter((v, i, a) => a.indexOf(v) === i), ["18", "17", "16", "15", "14", "13", "12", "11", "10", "09", "08", "07"]);
  assert.match(html, /page <!-- -->2<!-- --> of <!-- -->3/);
  assert.match(html, /aria-current="page"[^>]*>2</);
  assert.ok(!html.includes(`${RUN} Pager Draft`), "drafts never reach the shop");
  // Detail links carry the validated return path for this exact listing.
  assert.ok(html.includes(`/shop/${RUN}-18?from=${encodeURIComponent(`/shop?q=${RUN}&category=Refrigeration&page=2`)}`));
  const bySlug = names(await (await fetch(`${BASE}/shop?q=${RUN}&category=refrigeration&sort=az`)).text());
  assert.equal(bySlug[0], "01", "category slug from the home page tiles works, alphabetical sort");
});

test("shop: out-of-range page redirects to the last page; invalid parameters fall back", { skip }, async () => {
  const res = await fetch(`${BASE}/shop?q=${RUN}&page=99`, { redirect: "manual" });
  assert.ok([303, 307, 308].includes(res.status), String(res.status));
  assert.equal(new URL(res.headers.get("location"), BASE).search, `?q=${RUN}&page=3`);
  const invalid = await fetch(`${BASE}/shop?q=${RUN}&page=-4&limit=9999&sort=$where`);
  assert.equal(invalid.status, 200);
  assert.equal(names(await invalid.text())[0], "30");
});

test("product page: works directly and never links to an unsafe return path", { skip }, async () => {
  const direct = await fetch(`${BASE}/shop/${RUN}-05`);
  assert.equal(direct.status, 200);
  const html = await (await fetch(`${BASE}/shop/${RUN}-05?from=${encodeURIComponent("https://evil.example/shop")}`)).text();
  assert.ok(!html.includes("evil.example\""), "the server-rendered breadcrumb never uses the from value");
  assert.match(html, /<a href="\/shop">Shop<\/a>/);
  assert.equal((await fetch(`${BASE}/shop/${RUN}-draft`)).status, 404, "draft product pages stay hidden");
});

test("shop filters: availability and price apply on the server and stay in the URL", { skip }, async () => {
  // Fixtures 01–05: marked in stock but none left (checkout refuses them) → "On request".
  await db.collection("products").updateMany({ id: { $in: ["01", "02", "03", "04", "05"].map((n) => `${RUN}-${n}`) } }, { $set: { stockCount: 0 } });
  const onRequest = await (await fetch(`${BASE}/shop?q=${RUN}&availability=on-request`)).text();
  assert.deepEqual(names(onRequest).filter((v, i, a) => a.indexOf(v) === i), ["05", "04", "03", "02", "01"]);
  assert.match(onRequest, /<option value="on-request" selected="">/);
  const inStock = await (await fetch(`${BASE}/api/products?page=1&limit=48&q=${RUN}&availability=in-stock`)).json();
  assert.equal(inStock.pagination.totalProducts, COUNT - 5);
  // Fixture prices are 1000–1029: all inside "1000-3000", none under 1000 or over 3000.
  const ranged = await (await fetch(`${BASE}/api/products?page=1&limit=48&q=${RUN}&price=1000-3000&availability=in-stock`)).json();
  assert.equal(ranged.pagination.totalProducts, COUNT - 5);
  assert.equal((await (await fetch(`${BASE}/api/products?page=1&q=${RUN}&price=under-1000`)).json()).pagination.totalProducts, 0);
  const html = await (await fetch(`${BASE}/shop?q=${RUN}&price=1000-3000&page=2`)).text();
  assert.ok(html.includes(`from=${encodeURIComponent(`/shop?q=${RUN}&price=1000-3000&page=2`)}`), "detail links keep the filters");
});

test("cache: an admin edit is visible on cached shop pages immediately, including filtered URLs", { skip }, async () => {
  const url = `${BASE}/shop?q=${RUN}&price=1000-3000&sort=low`;
  const first = names(await (await fetch(url)).text())[0];
  assert.equal(first, "01");
  assert.equal(names(await (await fetch(url)).text())[0], "01", "served from the cache");
  const put = (body) => fetch(`${BASE}/api/admin/products`, { method: "PUT", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await put({ id: `${RUN}-30`, price: 1000 - 1 + 0.5 + 500 })).status, 200); // 1499.5: still in range, now not the cheapest
  assert.equal((await put({ id: `${RUN}-01`, status: "draft" })).status, 200); // unpublish the cheapest
  const after = names(await (await fetch(url)).text());
  assert.ok(!after.includes("01"), "an unpublished product disappears from the cached page at once");
  assert.equal(after[0], "02");
  const outOfRange = await put({ id: `${RUN}-02`, price: 3500 });
  assert.equal(outOfRange.status, 200);
  assert.ok(!names(await (await fetch(url)).text()).includes("02"), "a price change moves the product out of the range at once");
});

test("cache: buying the last units removes a product from cached \"In stock\" pages at once", { skip }, async () => {
  // Needs a server without Stripe keys: the order is created and stock reserved, no payment session.
  const url = `${BASE}/shop?q=${RUN}&availability=in-stock&limit=48`;
  assert.ok(names(await (await fetch(url)).text()).includes("10"), "cached with fixture 10 in stock");
  const res = await fetch(`${BASE}/api/checkout/create-session`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ productId: `${RUN}-10`, quantity: 2 }],
      customerName: "T", customerEmail: "t@example.com", customerPhone: "+971500000000",
      shippingAddress: { address: "1 St", city: "Abu Dhabi", emirate: "Abu Dhabi", country: "UAE" },
    }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.ok(!String(body.url).includes("stripe.com") && /Stripe keys missing/.test(body.message), "no Stripe session in this test");
  const stored = await db.collection("products").findOne({ id: `${RUN}-10` });
  assert.deepEqual([stored.stockCount, stored.inStock], [0, false]);
  assert.ok(!names(await (await fetch(url)).text()).includes("10"), "no longer listed as in stock");
  assert.ok(names(await (await fetch(`${BASE}/shop?q=${RUN}&availability=on-request`)).text()).includes("10"));
  await db.collection("orders").deleteMany({ "items.productId": `${RUN}-10` });
  await db.collection("payments").deleteMany({ customerEmail: "t@example.com", customerName: "T" });
});
