// Product image uploads to Supabase Storage through the app's admin API, on a local server whose
// NEXT_PUBLIC_SUPABASE_URL points at tests/support/fake-supabase-storage.mjs. ISOLATED test DB.
// Env: TEST_SUPABASE_BASE_URL (app server), TEST_FAKE_SUPABASE_URL (the fake it uses),
//      TEST_FAKE_SUPABASE_SECRET (the secret both were started with), TEST_MONGODB_URI, TEST_MONGODB_DB.
// No request reaches Supabase.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";

const require = createRequire(import.meta.url);
const { MongoClient } = require("mongodb");
const BASE = process.env.TEST_SUPABASE_BASE_URL;
const FAKE = process.env.TEST_FAKE_SUPABASE_URL;
const SECRET = process.env.TEST_FAKE_SUPABASE_SECRET;
const uri = process.env.TEST_MONGODB_URI;
const dbName = process.env.TEST_MONGODB_DB;
const skip = !(BASE && FAKE && SECRET && uri && /^mongodb:\/\/(127\.0\.0\.1|localhost)/.test(uri) && /test/i.test(dbName ?? "")) &&
  "set TEST_SUPABASE_BASE_URL, TEST_FAKE_SUPABASE_URL, TEST_FAKE_SUPABASE_SECRET, TEST_MONGODB_URI (local) and TEST_MONGODB_DB (a test database)";

const PUBLIC_BASE = `${FAKE}/storage/v1/object/public/product-images`;
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
let client, db, cookie;

before(async () => {
  if (skip) return;
  client = await new MongoClient(uri).connect();
  db = client.db(dbName);
  const seed = require("node:fs").readFileSync(new URL("../lib/repositories/users.ts", import.meta.url), "utf8").match(/rawPassword: "([^"]+)"/)[1];
  const res = await fetch(`${BASE}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@halimatrading.com", password: seed }) });
  assert.equal(res.status, 200);
  cookie = res.headers.get("set-cookie").split(";")[0];
  await db.collection("products").deleteMany({ sku: /^SBT-/ });
  const doc = (n, images) => ({
    id: `sbt-${n}`, slug: `sbt-${n}`, sku: `SBT-${n}`, name: `Supabase Test ${n}`, brand: "LG", model: `SBT${n}X`, category: "Refrigeration",
    categorySlug: "refrigeration", price: 0, images, stockCount: 1, inStock: true, status: "draft", createdAt: new Date(), updatedAt: new Date(),
  });
  await db.collection("products").insertMany([doc(1, []), doc(2, ["/featured/hisense-window-ac.png"]), doc(3, ["https://images.example.test/products/2026/10/old-r2.jpg"])]);
});
after(async () => {
  if (skip) return;
  await db.collection("products").deleteMany({ sku: /^SBT-/ });
  await client.close();
});

const api = (path, body, auth = true) =>
  fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(auth ? { cookie } : {}), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const objects = async () => (await (await fetch(`${FAKE}/__objects`)).json()).map((id) => id.replace(/^product-images\//, ""));

/** Full browser-style upload: presign → PUT to the signed URL → complete. Returns the public URL. */
async function upload(productRef, bytes = JPEG, contentType = "image/jpeg") {
  const presign = await (await api("/api/admin/uploads/presign", { files: [{ contentType, size: bytes.length }], productRef })).json();
  const u = presign.uploads[0];
  const put = await fetch(u.uploadUrl, { method: "PUT", headers: u.headers, body: bytes });
  assert.equal(put.status, 200);
  const done = await (await api("/api/admin/uploads/complete", { keys: [u.key] })).json();
  return { key: u.key, result: done.results[0], presign };
}

test("admin-only: every upload and image endpoint refuses unauthenticated and forged sessions", { skip }, async () => {
  const forged = `halima_admin_session=${Buffer.from(JSON.stringify({ email: "x@example.com", role: "super_admin" })).toString("base64")}`;
  for (const [path, body] of [["/api/admin/uploads/config"], ["/api/admin/uploads/presign", { files: [{ contentType: "image/jpeg", size: 10 }] }], ["/api/admin/uploads/complete", { keys: [] }], ["/api/admin/uploads/discard", { urls: ["x"] }], ["/api/admin/products/images", { id: "sbt-1", expectedImages: [], images: [] }]]) {
    assert.equal((await api(path, body, false)).status, 401, path);
    const res = await fetch(BASE + path, { method: body ? "POST" : "GET", headers: { cookie: forged, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    assert.equal(res.status, 401, `${path} forged`);
  }
});

test("config reports Supabase as the provider and exposes no secret", { skip }, async () => {
  const text = await (await api("/api/admin/uploads/config")).text();
  assert.deepEqual(JSON.parse(text).enabled, true);
  assert.equal(JSON.parse(text).provider, "supabase");
  assert.ok(!text.includes(SECRET));
});

test("upload: product folder, one-time signed URL, verified public URL; the secret never reaches the browser", { skip }, async () => {
  const { key, result, presign } = await upload("SBT-1");
  assert.match(key, /^products\/sbt-1\/[0-9a-f-]{36}\.jpg$/);
  assert.ok(!JSON.stringify(presign).includes(SECRET));
  assert.equal(new URL(presign.uploads[0].uploadUrl).origin, FAKE);
  assert.equal(presign.uploads[0].headers["x-upsert"], "false");
  assert.deepEqual(result, { key, ok: true, url: `${PUBLIC_BASE}/${key}` });
  assert.equal((await fetch(result.url)).status, 200, "public URL serves the image");
  assert.ok((await objects()).includes(key));
  await api("/api/admin/uploads/discard", { urls: [result.url] });
});

test("validation: wrong types, oversized, too many, bad productRef; a disguised file is rejected and deleted", { skip }, async () => {
  const presign = (body) => api("/api/admin/uploads/presign", body);
  assert.equal((await presign({ files: [{ contentType: "image/svg+xml", size: 100 }] })).status, 400);
  assert.equal((await presign({ files: [{ contentType: "image/png", size: 6 * 1024 * 1024 }] })).status, 400);
  assert.equal((await presign({ files: [{ contentType: "image/png", size: 0 }] })).status, 400);
  assert.equal((await presign({ files: Array(11).fill({ contentType: "image/png", size: 100 }) })).status, 400);
  assert.equal((await presign({ files: [{ contentType: "image/png", size: 100 }], productRef: { $ne: 1 } })).status, 400);
  const { key, result } = await upload("SBT-1", new TextEncoder().encode("<html><script>alert(1)</script></html>"), "image/png");
  assert.equal(result.ok, false);
  assert.ok(!(await objects()).includes(key), "the disguised upload was deleted");
});

test("bulk endpoint: sets images only if unchanged since read; other fields untouched", { skip }, async () => {
  const before = await db.collection("products").findOne({ id: "sbt-2" });
  const { result } = await upload("SBT-2");
  const set = await api("/api/admin/products/images", { id: "sbt-2", expectedImages: ["/featured/hisense-window-ac.png"], images: [result.url] });
  assert.equal(set.status, 200, await set.clone().text());
  const after = await db.collection("products").findOne({ id: "sbt-2" });
  assert.deepEqual(after.images, [result.url]);
  for (const k of ["name", "sku", "price", "status", "stockCount", "category", "createdAt"]) assert.deepEqual(after[k], before[k], k);
  // Stale expectation → 409 and nothing changes.
  const stale = await api("/api/admin/products/images", { id: "sbt-2", expectedImages: [], images: ["https://elsewhere.example/x.jpg"] });
  assert.equal(stale.status, 409);
  assert.deepEqual((await db.collection("products").findOne({ id: "sbt-2" })).images, [result.url]);
  assert.equal((await api("/api/admin/products/images", { id: "nope", expectedImages: [], images: [] })).status, 404);
  // A product with no stored images is listed to the admin with the placeholder: either form matches.
  const viaPlaceholder = await api("/api/admin/products/images", { id: "sbt-1", expectedImages: ["/featured/hisense-window-ac.png"], images: [] });
  assert.equal(viaPlaceholder.status, 200, "expected placeholder matches a product stored with no images");
  assert.equal((await api("/api/admin/products/images", { id: "sbt-1", expectedImages: [], images: ["data:image/png;base64,iVBORw0KGgo="] })).status, 400, "no new embedded images");
  assert.equal((await api("/api/admin/products/images", { id: "sbt-1", expectedImages: [], images: ["http://insecure.example/a.jpg"] })).status, 400);
});

test("replacing an image deletes the old object only when no product references it; R2 objects are never touched", { skip }, async () => {
  const a = (await upload("SBT-1")).result.url;
  const b = (await upload("SBT-1")).result.url;
  const put = (id, images) => fetch(`${BASE}/api/admin/products`, { method: "PUT", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify({ id, images }) });
  assert.equal((await put("sbt-1", [a])).status, 200);
  // Another product also uses `a`: replacing it on sbt-1 must keep the object.
  await db.collection("products").updateOne({ id: "sbt-3" }, { $push: { images: a } });
  assert.equal((await put("sbt-1", [b])).status, 200);
  assert.ok((await objects()).includes(a.slice(PUBLIC_BASE.length + 1)), "still referenced by sbt-3 → kept");
  // Now nobody uses `a` after sbt-3 drops it (keeping its R2 image) → deleted; the R2 URL is untouched.
  assert.equal((await put("sbt-3", ["https://images.example.test/products/2026/10/old-r2.jpg"])).status, 200);
  assert.ok(!(await objects()).includes(a.slice(PUBLIC_BASE.length + 1)), "unreferenced → deleted");
  assert.ok((await objects()).includes(b.slice(PUBLIC_BASE.length + 1)), "the current image is kept");
});

test("discard (upload compensation) never deletes a referenced image or anything outside the app's storage", { skip }, async () => {
  const current = (await db.collection("products").findOne({ id: "sbt-1" })).images[0];
  const res = await (await api("/api/admin/uploads/discard", { urls: [current, "https://images.example.test/products/2026/10/old-r2.jpg", `${PUBLIC_BASE}/../../secret`] })).json();
  assert.deepEqual(res.deleted, []);
  assert.equal(res.kept.length, 3);
  const orphan = (await upload("SBT-1")).result.url;
  assert.deepEqual((await (await api("/api/admin/uploads/discard", { urls: [orphan] })).json()).deleted, [orphan]);
});

test("an upload whose public URL is refused (e.g. HTTP 401) is reported as failed, removed, and never returned as a URL", { skip }, async () => {
  await fetch(`${FAKE}/__fail-public?count=1`, { method: "POST" });
  const { key, result } = await upload("SBT-1");
  assert.equal(result.ok, false);
  assert.equal(result.url, undefined, "no URL is handed out");
  assert.match(result.error, /public URL answers HTTP 401/);
  assert.ok(!(await objects()).includes(key), "the unusable object was removed");
  const ok = (await upload("SBT-1")).result;
  assert.equal(ok.ok, true, "a normal upload afterwards still succeeds");
});
