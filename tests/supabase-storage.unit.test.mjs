// Supabase Storage configuration, provider choice, object keys, bulk file matching, and the
// Supabase store itself (real supabase-js client) against a local fake of the Storage API.
// No request reaches Supabase.
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { startFakeSupabase } from "./support/fake-supabase-storage.mjs";

const sb = await import("@/lib/supabase-storage");
const { getImageStorage } = await import("@/lib/image-storage");
const r2 = await import("@/lib/r2");
const { planBulkImages, normalizeKey, plannedImages } = await import("@/lib/bulk-image-match");

const SECRET = "sb_secret_fake-value-should-never-appear";
const FAKE_R2 = {
  R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef", R2_ACCESS_KEY_ID: "FAKE-ACCESS-KEY-ID-123",
  R2_SECRET_ACCESS_KEY: "fake-r2-secret", R2_BUCKET: "halima-product-images", R2_PUBLIC_BASE_URL: "https://images.example.test",
};

/* Configuration and provider choice */

test("Supabase config reports variable names only and never the secret", () => {
  assert.deepEqual(sb.getSupabaseStorageConfig({}), { ok: false, missing: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"], invalid: [] });
  const bad = sb.getSupabaseStorageConfig({ NEXT_PUBLIC_SUPABASE_URL: "http://evil.example", SUPABASE_SECRET_KEY: "sb_publishable_abc", SUPABASE_STORAGE_BUCKET: "Bad Bucket!" });
  assert.deepEqual(bad.invalid.sort(), ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_STORAGE_BUCKET"]);
  assert.ok(!JSON.stringify(bad).includes("sb_publishable_abc"));
  const ok = sb.getSupabaseStorageConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://xaujatpichfxrzwyyksj.supabase.co/", SUPABASE_SECRET_KEY: SECRET });
  assert.equal(ok.ok, true);
  assert.equal(ok.config.bucket, "product-images");
  assert.equal(ok.config.publicBaseUrl, "https://xaujatpichfxrzwyyksj.supabase.co/storage/v1/object/public/product-images");
});

test("provider: Supabase when configured; half-configured Supabase is reported, never silently replaced by R2", () => {
  const both = getImageStorage({ ...FAKE_R2, NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", SUPABASE_SECRET_KEY: SECRET });
  assert.equal(both.storage.provider, "supabase");
  const half = getImageStorage({ ...FAKE_R2, NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" });
  assert.deepEqual(half, { ok: false, missing: ["SUPABASE_SECRET_KEY"], invalid: [] });
  assert.equal(getImageStorage(FAKE_R2).storage.provider, "r2", "R2 alone still works");
  assert.deepEqual(getImageStorage({}).missing, ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"]);
  // Each provider only claims its own URLs.
  const s = both.storage;
  const key = r2.createImageKey("image/jpeg", undefined, undefined, "SGR186E");
  assert.equal(s.keyFromPublicUrl(s.publicUrlForKey(key)), key);
  assert.equal(s.keyFromPublicUrl(`https://images.example.test/${key}`), null, "R2 URLs are never treated as Supabase objects");
});

/* Object keys */

test("keys: products/<sku-or-id>/<uuid>.<ext>; old dated keys stay valid; nothing else is accepted", () => {
  const key = r2.createImageKey("image/png", undefined, undefined, "BD-HX230T-B5");
  assert.match(key, /^products\/bd-hx230t-b5\/[0-9a-f-]{36}\.png$/);
  assert.ok(r2.isValidImageKey(key));
  assert.ok(r2.isValidImageKey(r2.createImageKey("image/jpeg", new Date("2026-10-01"))), "dated R2 keys");
  assert.equal(r2.productKeySegment("HSU-18LPA03/T2(T3&T4)"), "hsu-18lpa03-t2-t3-t4");
  assert.equal(r2.productKeySegment("2026"), "p-2026", "a folder never looks like a year");
  assert.equal(r2.productKeySegment("../../etc"), "etc");
  assert.equal(r2.productKeySegment("***"), "");
  for (const bad of ["products/../x/" + key.slice(-40), "products/-a/" + key.slice(-40), "products/A/" + key.slice(-40), `products/${"a".repeat(65)}/${key.slice(-40)}`, "products/a/b/" + key.slice(-40)]) {
    assert.equal(r2.isValidImageKey(bad), false, bad);
  }
});

/* Bulk file matching */

const P = (id, sku, model, images = []) => ({ id, sku, model, name: `Product ${id}`, brand: "X", images });
const F = (name, type = "image/jpeg", size = 1000) => ({ name, type, size });
const products = [
  P("p1", "SGR186E", "SGR186E"),
  P("p2", "SGW1056N", "SGW 1056N"),
  P("p3", "MWM31000BK", "MWM31.000BK", ["https://x.supabase.co/storage/v1/object/public/product-images/products/a/1.jpg"]),
  P("p4", "HT-AI-113", "AXG18 AE", ["/featured/hisense-window-ac.png"]),
  P("p5", "DUP-1", "SAME-MODEL"),
  P("p6", "DUP-2", "SAME-MODEL"),
];

test("bulk matching: by SKU, model or id, ignoring case and punctuation; numbered extras in order", () => {
  const plan = planBulkImages([F("sgr186e.JPG"), F("SGR186E-2.webp", "image/webp"), F("SGW 1056N.png", "image/png"), F("axg18-ae.jpg")], products);
  const p1 = plan.products.find((p) => p.product.id === "p1");
  assert.deepEqual(p1.fileIndexes, [0, 1]);
  assert.equal(p1.action, "set");
  assert.equal(plan.products.find((p) => p.product.id === "p2").action, "set");
  const p4 = plan.products.find((p) => p.product.id === "p4");
  assert.equal(p4.action, "set", "a product showing only the placeholder counts as having no image");
  assert.deepEqual(plannedImages(p4, ["u"]), ["u"], "the placeholder is replaced");
  assert.equal(normalizeKey("MWM31.000BK"), "MWM31000BK");
});

test("bulk matching: unmatched, ambiguous, duplicate and invalid files are reported and never used", () => {
  const plan = planBulkImages(
    [F("NOPE123.jpg"), F("same-model.jpg"), F("SGR186E.jpg"), F("SGR186E (1).jpg"), F("SGW1056N.gif", "image/gif"), F("SGW1056N.jpg", "image/jpeg", 0)],
    products
  );
  const problem = (name) => plan.files.find((f) => f.file.name === name).problem;
  assert.equal(problem("NOPE123.jpg"), "unmatched");
  assert.equal(problem("same-model.jpg"), "ambiguous");
  assert.equal(problem("SGR186E.jpg"), "duplicate");
  assert.equal(problem("SGR186E (1).jpg"), "duplicate");
  assert.equal(problem("SGW1056N.gif"), "invalid-file");
  assert.equal(problem("SGW1056N.jpg"), "invalid-file");
  assert.equal(plan.products.find((p) => p.product.id === "p1").action, "skip");
  assert.equal(plan.summary.productsToUpdate, 0);
});

test("bulk modes: products with real images are skipped unless Add or Replace is chosen", () => {
  const files = [F("MWM31000BK.jpg")];
  assert.equal(planBulkImages(files, products).products[0].action, "skip");
  const add = planBulkImages(files, products, "add").products[0];
  assert.equal(add.action, "add");
  assert.deepEqual(plannedImages(add, ["new"]), [products[2].images[0], "new"]);
  const replace = planBulkImages(files, products, "replace").products[0];
  assert.deepEqual(plannedImages(replace, ["new"]), ["new"]);
  assert.deepEqual(replace.expectedImages, products[2].images, "the update is conditional on the images read");
});

/* The Supabase store against the fake Storage API */

let fake, config;
before(async () => {
  fake = await startFakeSupabase({ secret: SECRET });
  config = sb.getSupabaseStorageConfig({ NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${fake.port}`, SUPABASE_SECRET_KEY: SECRET }).config;
});
after(() => fake.server.close());

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);

test("store: signed upload (no key in the browser) → verify → public URL → delete", async () => {
  const store = sb.createSupabaseStore(config);
  const key = r2.createImageKey("image/jpeg", undefined, undefined, "SGR186E");
  const signed = await store.presignPut(key, "image/jpeg", JPEG.length);
  assert.ok(!signed.includes(SECRET), "the signed URL never contains the secret");
  const put = await fetch(signed, { method: "PUT", headers: store.uploadHeaders("image/jpeg"), body: JPEG });
  assert.equal(put.status, 200);
  assert.deepEqual(await r2.verifyUploadedImage(store, key), { ok: true, contentType: "image/jpeg", size: JPEG.length });
  const pub = await fetch(`${config.publicBaseUrl}/${key}`);
  assert.equal(pub.status, 200);
  assert.equal((await fetch(signed, { method: "PUT", headers: store.uploadHeaders("image/jpeg"), body: JPEG })).status, 400, "a signed URL works only once");
  const listed = await sb.listSupabaseObjects(config);
  assert.deepEqual(listed.map((o) => o.key), [key]);
  await store.delete(key);
  assert.equal(await store.head(key), null);
});

test("store: a disguised upload is rejected and deleted; the secret key is required for privileged calls", async () => {
  const store = sb.createSupabaseStore(config);
  const key = r2.createImageKey("image/png", undefined, undefined, "x1");
  await fetch(await store.presignPut(key, "image/png", 30), { method: "PUT", headers: store.uploadHeaders("image/png"), body: new TextEncoder().encode("<html><script>alert(1)</script>") });
  assert.equal((await r2.verifyUploadedImage(store, key)).ok, false);
  assert.equal(await store.head(key), null, "deleted after failing verification");
  const wrongKey = sb.createSupabaseStore({ ...config, secretKey: "sb_publishable_not-the-secret" });
  await assert.rejects(() => wrongKey.presignPut(r2.createImageKey("image/png"), "image/png", 10), (e) => !String(e.message).includes("sb_publishable"));
});
