// Offline tests for R2 image storage helpers and the product image rules. No network.
import assert from "node:assert/strict";
import test from "node:test";

const r2 = await import("@/lib/r2");
const { validateProductImages } = await import("@/lib/product-images");
const { takeUploadQuota } = await import("@/lib/upload-rate-limit");

const FAKE = {
  R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  R2_ACCESS_KEY_ID: "FAKE-ACCESS-KEY-ID-123",
  R2_SECRET_ACCESS_KEY: "fake-secret-value-should-never-appear",
  R2_BUCKET: "halima-product-images",
  R2_PUBLIC_BASE_URL: "https://images.example.test/",
};

/* Configuration */

test("missing configuration reports variable names only", () => {
  const res = r2.getR2Config({});
  assert.equal(res.ok, false);
  assert.deepEqual(res.missing, ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE_URL"]);
});

test("malformed values are reported by name, never echoed", () => {
  const res = r2.getR2Config({ ...FAKE, R2_ACCOUNT_ID: "not-an-account", R2_PUBLIC_BASE_URL: "http://insecure.example", R2_BUCKET: "Bad_Bucket" });
  assert.equal(res.ok, false);
  assert.deepEqual(res.invalid.sort(), ["R2_ACCOUNT_ID", "R2_BUCKET", "R2_PUBLIC_BASE_URL"]);
  assert.ok(!JSON.stringify(res).includes(FAKE.R2_SECRET_ACCESS_KEY));
});

test("valid configuration normalises the public URL", () => {
  const res = r2.getR2Config(FAKE);
  assert.equal(res.ok, true);
  assert.equal(res.config.publicBaseUrl, "https://images.example.test");
  assert.equal(r2.isR2UploadConfigured(FAKE), true);
  assert.equal(r2.isR2UploadConfigured({ ...FAKE, R2_PUBLIC_BASE_URL: "" }), false, "uploads stay off until the public URL exists");
});

/* Keys and URLs */

test("object keys are server-generated, dated and typed — never from a file name", () => {
  const key = r2.createImageKey("image/png", new Date("2026-03-09T00:00:00Z"));
  assert.match(key, /^products\/2026\/03\/[0-9a-f-]{36}\.png$/);
  assert.ok(r2.isValidImageKey(key));
  for (const bad of ["../etc/passwd", "products/2026/03/evil.png", "products/2026/13/" + key.slice(17), key.replace(".png", ".svg"), `${key}/x`, "", null]) {
    assert.equal(r2.isValidImageKey(bad), false, String(bad));
  }
  assert.equal(r2.contentTypeForKey(key), "image/png");
});

test("public URLs map back to keys only for this bucket's domain", () => {
  const key = r2.createImageKey("image/webp");
  const url = r2.publicUrlForKey("https://images.example.test", key);
  assert.equal(r2.keyFromPublicUrl("https://images.example.test", url), key);
  assert.equal(r2.keyFromPublicUrl("https://images.example.test", `https://other.example/${key}`), null);
  assert.equal(r2.keyFromPublicUrl("https://images.example.test", "https://images.example.test/products/x.png"), null);
});

/* Upload request validation */

test("only JPEG, PNG and WebP up to 5 MB are accepted for upload", () => {
  assert.equal(r2.validateUploadRequest({ contentType: "image/jpeg", size: 1000 }), null);
  assert.equal(r2.validateUploadRequest({ contentType: "image/webp", size: 5 * 1024 * 1024 }), null);
  for (const bad of [
    { contentType: "image/svg+xml", size: 100 }, { contentType: "image/gif", size: 100 }, { contentType: "application/pdf", size: 100 },
    { contentType: "image/png", size: 0 }, { contentType: "image/png", size: 5 * 1024 * 1024 + 1 }, { contentType: "image/png", size: 1.5 }, {},
  ]) {
    assert.notEqual(r2.validateUploadRequest(bad), null, JSON.stringify(bad));
  }
});

test("file signatures identify real images regardless of claimed type", () => {
  assert.equal(r2.detectImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(r2.detectImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(r2.detectImageType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
  assert.equal(r2.detectImageType(new TextEncoder().encode("<svg xmlns=")), null);
  assert.equal(r2.detectImageType(new TextEncoder().encode("MZ\x90\x00 exe")), null);
});

/* Presigned URLs (signed locally — no request is sent) */

test("presigned uploads are short-lived, path-style and sign type, length and cache headers", async () => {
  const store = r2.createR2Store(r2.getR2Config(FAKE).config);
  const key = r2.createImageKey("image/jpeg");
  const url = new URL(await store.presignPut(key, "image/jpeg", 4321));
  assert.equal(url.host, `${FAKE.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
  assert.equal(url.pathname, `/${FAKE.R2_BUCKET}/${key}`);
  assert.equal(url.searchParams.get("X-Amz-Expires"), "300");
  assert.equal(url.searchParams.get("X-Amz-SignedHeaders"), "cache-control;content-length;content-type;host");
  assert.ok(![...url.searchParams.keys()].some((k) => /checksum/i.test(k)), "no checksum parameter for the browser to satisfy");
  assert.ok(!url.href.includes(FAKE.R2_SECRET_ACCESS_KEY), "secret never appears in the URL");
});

/* Verification against a fake store */

function fakeStore(object) {
  const deleted = [];
  return {
    deleted,
    store: {
      presignPut: async () => "unused",
      head: async () => (object ? { size: object.size, contentType: object.contentType } : null),
      readPrefix: async () => object.bytes,
      delete: async (key) => deleted.push(key),
    },
  };
}
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
const pngKey = () => r2.createImageKey("image/png");

test("a genuine upload verifies and is kept", async () => {
  const { store, deleted } = fakeStore({ size: 2048, contentType: "image/png", bytes: PNG });
  const res = await r2.verifyUploadedImage(store, pngKey());
  assert.deepEqual(res, { ok: true, contentType: "image/png", size: 2048 });
  assert.equal(deleted.length, 0);
});

test("missing, oversized, mistyped or disguised uploads are rejected and deleted", async () => {
  assert.equal((await r2.verifyUploadedImage(fakeStore(null).store, pngKey())).ok, false);
  for (const object of [
    { size: 6 * 1024 * 1024, contentType: "image/png", bytes: PNG },
    { size: 0, contentType: "image/png", bytes: PNG },
    { size: 2048, contentType: "image/svg+xml", bytes: PNG },
    { size: 2048, contentType: "image/png", bytes: new TextEncoder().encode("<html><script>alert(1)</script>") },
  ]) {
    const { store, deleted } = fakeStore(object);
    const key = pngKey();
    const res = await r2.verifyUploadedImage(store, key);
    assert.equal(res.ok, false, JSON.stringify(object).slice(0, 80));
    assert.deepEqual(deleted, [key], "rejected object is deleted");
  }
});

test("verification never touches keys the app did not generate", async () => {
  const { store, deleted } = fakeStore({ size: 10, contentType: "image/png", bytes: PNG });
  const res = await r2.verifyUploadedImage(store, "products/other/important-file.png");
  assert.equal(res.ok, false);
  assert.deepEqual(deleted, []);
});

/* Product image rules */

const DATA_URI = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
test("product images: https URLs, site paths and R2 URLs are accepted; unsafe values are not", () => {
  const ctx = { r2Enabled: true };
  assert.equal(validateProductImages(["https://images.example.test/products/2026/10/x.png", "/featured/a.png"], ctx), null);
  for (const bad of [["http://insecure.example/a.png"], ["javascript:alert(1)"], ["//evil.example/a.png"], ["/has space.png"], [""], ["x".repeat(3000)], "not-a-list"]) {
    assert.notEqual(validateProductImages(bad, ctx), null, JSON.stringify(bad).slice(0, 60));
  }
  assert.notEqual(validateProductImages(Array(21).fill("/a.png"), ctx), null);
});

test("with R2 configured, new embedded images are refused but already-stored ones are kept", () => {
  assert.match(validateProductImages([DATA_URI], { r2Enabled: true }), /uploaded to image storage/);
  assert.equal(validateProductImages([DATA_URI, "https://images.example.test/a.png"], { r2Enabled: true, storedImages: [DATA_URI] }), null);
  assert.equal(validateProductImages([DATA_URI], { r2Enabled: false }), null, "without R2 the existing behaviour is unchanged");
  assert.notEqual(validateProductImages(["data:text/html;base64,PHNjcmlwdD4="], { r2Enabled: false }), null);
});

test("upload rate limit caps files per admin per window", () => {
  const now = 1_000_000;
  assert.equal(takeUploadQuota("a@x", 60, now), true);
  assert.equal(takeUploadQuota("a@x", 40, now + 1), true);
  assert.equal(takeUploadQuota("a@x", 1, now + 2), false);
  assert.equal(takeUploadQuota("b@x", 10, now + 2), true, "per admin");
  assert.equal(takeUploadQuota("a@x", 10, now + 11 * 60 * 1000), true, "window expires");
});
