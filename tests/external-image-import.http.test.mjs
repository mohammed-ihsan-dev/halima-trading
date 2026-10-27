// The import endpoint through the running app (local server pointed at the fake Supabase Storage and a TEST database).
// Env: TEST_SUPABASE_BASE_URL (app server), TEST_FAKE_SUPABASE_URL, TEST_FAKE_SUPABASE_SECRET, TEST_MONGODB_URI (local), TEST_MONGODB_DB.
// Checks everything that is decided before a download: admin only, request validation, URL / SSRF rules, no secret exposed.
// (The download itself is refused for local hosts by design, so successful imports are covered in external-image-import.unit.)
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
let client, db, cookie;

before(async () => {
  if (skip) return;
  client = await new MongoClient(uri).connect();
  db = client.db(dbName);
  const seed = require("node:fs").readFileSync(new URL("../lib/repositories/users.ts", import.meta.url), "utf8").match(/rawPassword: "([^"]+)"/)[1];
  const res = await fetch(`${BASE}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@halimatrading.com", password: seed }) });
  assert.equal(res.status, 200);
  cookie = res.headers.get("set-cookie").split(";")[0];
});
after(async () => { if (!skip) await client.close(); });

const post = (body, auth = true) => fetch(`${BASE}/api/admin/uploads/import-url`, { method: "POST", headers: { ...(auth ? { cookie } : {}), "Content-Type": "application/json" }, body: JSON.stringify(body) });
const objects = async () => (await (await fetch(`${FAKE}/__objects`)).json());

test("admin only: no session or a forged session is refused", { skip }, async () => {
  assert.equal((await post({ url: "https://cdn.brand.example/a.jpg" }, false)).status, 401);
  const forged = await fetch(`${BASE}/api/admin/uploads/import-url`, { method: "POST", headers: { cookie: "admin_session=forged.token", "Content-Type": "application/json" }, body: "{}" });
  assert.equal(forged.status, 401);
});

test("no confirmation step is required; malformed bodies are refused", { skip }, async () => {
  const r = await post({ url: "https://localhost/a.jpg", productRef: "SKU-1" });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /cannot be imported/, "the request reaches the URL rules without any extra confirmation field");
  assert.equal((await post({})).status, 400);
  assert.equal((await post({ url: "https://cdn.brand.example/a.jpg", productRef: { $ne: 1 } })).status, 400);
  const bad = await fetch(`${BASE}/api/admin/uploads/import-url`, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: "not json" });
  assert.equal(bad.status, 400);
});

test("internal, private and non-https URLs are refused by the server; nothing is stored or logged", { skip }, async () => {
  const before = await objects();
  const logBefore = await db.collection("product_image_imports").countDocuments();
  for (const url of ["http://cdn.brand.example/a.jpg", "https://localhost/a.jpg", "https://127.0.0.1/x.jpg", "https://169.254.169.254/latest/meta-data/",
    "https://10.0.0.8/a.jpg", "https://[::1]/a.jpg", "https://intranet/a.jpg", "https://user:pw@cdn.brand.example/a.jpg", "javascript:alert(1)", `${FAKE}/storage/v1/object/public/product-images/x.jpg`]) {
    const r = await post({ url, productRef: "SKU-1" });
    assert.equal(r.status, 400, url);
    const body = await r.json();
    assert.match(body.error, /cannot be imported/, url);
    assert.ok(!JSON.stringify(body).includes(SECRET));
  }
  assert.deepEqual(await objects(), before);
  assert.equal(await db.collection("product_image_imports").countDocuments(), logBefore);
});

test("upload config exposes the public storage base URL (for the gallery) but never the secret", { skip }, async () => {
  const res = await fetch(`${BASE}/api/admin/uploads/config`, { headers: { cookie } });
  const text = await res.text();
  const data = JSON.parse(text);
  assert.equal(data.enabled, true);
  assert.equal(data.publicBaseUrl, `${FAKE}/storage/v1/object/public/product-images`);
  assert.ok(!text.includes(SECRET));
});
