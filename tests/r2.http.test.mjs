// R2 upload routes and product image rules over HTTP, on local servers with an ISOLATED test DB.
// Env: TEST_BASE_URL (server WITHOUT R2 variables), TEST_R2_BASE_URL (server with FAKE R2 variables),
//      TEST_MONGODB_URI (local), TEST_MONGODB_DB (test database shared by both servers).
// No request in this file reaches Cloudflare.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";

const require = createRequire(import.meta.url);
const { MongoClient } = require("mongodb");
const PLAIN = process.env.TEST_BASE_URL;
const WITH_R2 = process.env.TEST_R2_BASE_URL;
const uri = process.env.TEST_MONGODB_URI;
const dbName = process.env.TEST_MONGODB_DB;
const skip = !(PLAIN && WITH_R2 && uri && /^mongodb:\/\/(127\.0\.0\.1|localhost)/.test(uri) && /test/i.test(dbName ?? "")) &&
  "set TEST_BASE_URL, TEST_R2_BASE_URL, TEST_MONGODB_URI (local) and TEST_MONGODB_DB (a test database)";
const FAKE_SECRET = "fake-secret-value-should-never-appear"; // the value the TEST_R2 server was started with
const DATA_URI = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
let client, db, cookie;

before(async () => {
  if (skip) return;
  client = await new MongoClient(uri).connect();
  db = client.db(dbName);
  const seed = require("node:fs").readFileSync(new URL("../lib/repositories/users.ts", import.meta.url), "utf8").match(/rawPassword: "([^"]+)"/)[1];
  const res = await fetch(`${PLAIN}/api/admin/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@halimatrading.com", password: seed }),
  });
  assert.equal(res.status, 200);
  cookie = res.headers.get("set-cookie").split(";")[0];
  await db.collection("products").deleteMany({ sku: /^R2T-/ });
  await db.collection("products").insertOne({
    id: "r2t-1", slug: "r2t-legacy-image", sku: "R2T-1", name: "Legacy Image Product", brand: "LG", model: "R2T100X",
    category: "Refrigeration", price: 1000, images: [DATA_URI], stockCount: 1, inStock: true, status: "active",
    createdAt: new Date(), updatedAt: new Date(),
  });
});
after(async () => {
  if (skip) return;
  await db.collection("products").deleteMany({ sku: /^R2T-/ });
  await client.close();
});

const call = (base, path, { method = "GET", body, auth = true, rawBody } = {}) =>
  fetch(base + path, {
    method,
    headers: { ...(auth ? { cookie } : {}), ...(body || rawBody ? { "Content-Type": "application/json" } : {}) },
    body: rawBody ?? (body ? JSON.stringify(body) : undefined),
  });
const forged = `halima_admin_session=${Buffer.from(JSON.stringify({ email: "x@example.com", role: "super_admin" })).toString("base64")}`;

test("upload routes refuse unauthenticated and forged sessions", { skip }, async () => {
  for (const [path, method] of [["/api/admin/uploads/config", "GET"], ["/api/admin/uploads/presign", "POST"], ["/api/admin/uploads/complete", "POST"]]) {
    assert.equal((await call(WITH_R2, path, { method, auth: false, body: method === "POST" ? {} : undefined })).status, 401, path);
    const res = await fetch(WITH_R2 + path, { method, headers: { cookie: forged, "Content-Type": "application/json" }, body: method === "POST" ? "{}" : undefined });
    assert.equal(res.status, 401, `${path} forged`);
  }
});

test("without R2 configuration, uploads are disabled and only variable names are reported", { skip }, async () => {
  const config = await (await call(PLAIN, "/api/admin/uploads/config")).json();
  assert.equal(config.enabled, false);
  assert.deepEqual(config.missing, ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE_URL"]);
  const res = await call(PLAIN, "/api/admin/uploads/presign", { method: "POST", body: { files: [{ contentType: "image/png", size: 100 }] } });
  assert.equal(res.status, 503);
});

test("with R2 configured, the config endpoint enables uploads and exposes no secrets", { skip }, async () => {
  const text = await (await call(WITH_R2, "/api/admin/uploads/config")).text();
  const config = JSON.parse(text);
  assert.equal(config.enabled, true);
  assert.deepEqual(config.allowedTypes, ["image/jpeg", "image/png", "image/webp"]);
  assert.ok(!text.includes(FAKE_SECRET) && !text.includes("FAKE-ACCESS-KEY") && !text.includes("0123456789abcdef"));
});

test("presign returns short-lived, server-keyed upload URLs and never the secret", { skip }, async () => {
  const res = await call(WITH_R2, "/api/admin/uploads/presign", {
    method: "POST", body: { files: [{ contentType: "image/png", size: 2048 }, { contentType: "image/webp", size: 4096 }] },
  });
  const text = await res.text();
  assert.equal(res.status, 200, text);
  assert.ok(!text.includes(FAKE_SECRET));
  const { uploads } = JSON.parse(text);
  assert.equal(uploads.length, 2);
  for (const u of uploads) {
    assert.match(u.key, /^products\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(png|webp)$/);
    const url = new URL(u.uploadUrl);
    assert.equal(url.searchParams.get("X-Amz-Expires"), "300");
    assert.equal(u.method, "PUT");
    assert.equal(u.headers["Cache-Control"], "public, max-age=31536000, immutable");
    assert.equal(u.publicUrl, `https://images.example.test/${u.key}`);
  }
});

test("presign rejects unsupported types, oversized files, too many files and bad bodies", { skip }, async () => {
  const post = (body, rawBody) => call(WITH_R2, "/api/admin/uploads/presign", { method: "POST", body, rawBody });
  assert.equal((await post({ files: [{ contentType: "image/svg+xml", size: 100 }] })).status, 400);
  assert.equal((await post({ files: [{ contentType: "image/png", size: 6 * 1024 * 1024 }] })).status, 400);
  assert.equal((await post({ files: Array(11).fill({ contentType: "image/png", size: 100 }) })).status, 400);
  assert.equal((await post({ files: [] })).status, 400);
  assert.equal((await post(undefined, "{not json")).status, 400);
});

test("complete only accepts keys the app generates (no arbitrary object access)", { skip }, async () => {
  for (const keys of [["products/other/important.png"], ["../secret"], [], Array(11).fill("x")]) {
    assert.equal((await call(WITH_R2, "/api/admin/uploads/complete", { method: "POST", body: { keys } })).status, 400, JSON.stringify(keys).slice(0, 40));
  }
});

test("with R2 configured, new embedded images are refused but existing ones stay editable", { skip }, async () => {
  const put = (base, images) => call(base, "/api/admin/products", { method: "PUT", body: { id: "r2t-1", images } });
  assert.equal((await put(WITH_R2, [DATA_URI, "https://images.example.test/products/2026/10/a.png"])).status, 200, "stored data URI + R2 URL");
  const res = await put(WITH_R2, ["data:image/png;base64,iVBORw0KGgo="]);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /uploaded to image storage/);
  assert.equal((await put(WITH_R2, ["http://insecure.example/a.png"])).status, 400);
  assert.equal((await put(PLAIN, ["data:image/png;base64,iVBORw0KGgo="])).status, 200, "without R2 the existing upload behaviour is unchanged");
});
